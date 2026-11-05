import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';

let dbInstance: DatabaseSync | null = null;

export function getDatabasePath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  // Default to project root / data / book.sqlite
  return join(process.cwd(), 'data', 'book.sqlite');
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    const dbPath = getDatabasePath();
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
    dbInstance = new DatabaseSync(dbPath);
    // Enable WAL mode and foreign keys for high reliability and performance
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    runMigrations(dbInstance);
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
}

export function runMigrations(db: DatabaseSync): void {
  // 1. Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'SUBSCRIBER', -- 'ADMIN' | 'SUBSCRIBER'
      passyn_user_id TEXT, -- Synced Passyn User ID
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);

  // 2. Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);

  // 3. Subscription Plans (Book Plans linked to Passyn Passes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_plans (
      id TEXT PRIMARY KEY,
      book_slug TEXT NOT NULL,
      passyn_pass_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      duration_hours INTEGER NOT NULL DEFAULT 24,
      pass_type TEXT NOT NULL DEFAULT 'DAY', -- 'DAY' | 'WEEKLY' | 'EXAM' | 'PROJECT' | 'CUSTOM'
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_book_plans_book_slug ON book_plans(book_slug);
    CREATE INDEX IF NOT EXISTS idx_book_plans_passyn_pass_id ON book_plans(passyn_pass_id);
    CREATE INDEX IF NOT EXISTS idx_book_plans_is_active ON book_plans(is_active);
  `);

  // 4. Subscriptions table (User subscriptions linked to Passyn Access)
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_slug TEXT NOT NULL,
      plan_id TEXT NOT NULL REFERENCES book_plans(id) ON DELETE RESTRICT,
      passyn_access_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'REVOKED'
      activated_at TEXT,
      expires_at TEXT,
      revoked_at TEXT,
      revoke_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_book ON subscriptions(user_id, book_slug);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_passyn_access ON subscriptions(passyn_access_id);
  `);

  // 5. Webhook Events table (for idempotency and audit trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      event_id TEXT UNIQUE NOT NULL, -- Idempotency key from Passyn event
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PROCESSED', -- 'PROCESSED' | 'FAILED' | 'DUPLICATE'
      error_message TEXT,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
  `);

  // 6. Audit & Access Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  `);

  // 7. Seed default platform admin account if missing
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@readbooks.dev').trim().toLowerCase();
  const existingAdmin = db.prepare(`SELECT id FROM users WHERE email = ?`).get(adminEmail);
  if (!existingAdmin) {
    const salt = randomBytes(16).toString('hex');
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
    const hash = scryptSync(adminPassword, salt, 64).toString('hex');
    const passwordHash = `${salt}:${hash}`;
    const id = `usr_admin_${randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
      VALUES (?, ?, 'Platform Admin', ?, 'ADMIN', ?, ?)
    `).run(id, adminEmail, passwordHash, now, now);
  }

  // 8. Seed default subscription plans if missing
  const planCount = db.prepare(`SELECT COUNT(*) as count FROM book_plans`).get() as { count: number };
  if (planCount.count === 0) {
    const defaultPlans = [
      {
        bookSlug: 'introduction-to-linear-algebra',
        name: '24-Hour Intensive Pass',
        description: 'Full unmetered access to all study guides, video notes, and roadmap milestones for 24 hours.',
        price: 4.99,
        durationHours: 24,
        passType: 'DAY',
      },
      {
        bookSlug: 'introduction-to-linear-algebra',
        name: '7-Day Study Sprint Pass',
        description: 'One full week of structured access to study guides and problem set breakdowns.',
        price: 14.99,
        durationHours: 168,
        passType: 'WEEKLY',
      },
      {
        bookSlug: 'introduction-to-linear-algebra',
        name: 'Semester Mastery Pass (30 Days)',
        description: '30-day comprehensive access with full interactive progress tracking and study guides.',
        price: 29.99,
        durationHours: 720,
        passType: 'CUSTOM',
      },
      {
        bookSlug: 'linear-algebra-and-learning-from-data',
        name: '24-Hour Sprint Pass',
        description: '24-hour full access to MIT 18.065 deep learning and matrix calculus study guides.',
        price: 5.99,
        durationHours: 24,
        passType: 'DAY',
      },
      {
        bookSlug: 'linear-algebra-and-learning-from-data',
        name: 'Weekly Deep-Dive Pass',
        description: '7-day deep-dive into SVD, PCA, neural networks, and optimization roadmaps.',
        price: 18.99,
        durationHours: 168,
        passType: 'WEEKLY',
      },
      {
        bookSlug: 'linear-algebra-and-learning-from-data',
        name: 'Full Course Pass (30 Days)',
        description: '30 days of comprehensive study guide and deep learning mathematics access.',
        price: 34.99,
        durationHours: 720,
        passType: 'CUSTOM',
      },
    ];

    const now = new Date().toISOString();
    const insertPlan = db.prepare(`
      INSERT INTO book_plans (
        id, book_slug, passyn_pass_id, name, description,
        price, currency, duration_hours, pass_type, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?, ?)
    `);

    for (const p of defaultPlans) {
      const planId = `plan_${randomBytes(8).toString('hex')}`;
      const passynPassId = `pass_mock_${randomBytes(6).toString('hex')}`;
      insertPlan.run(
        planId,
        p.bookSlug,
        passynPassId,
        p.name,
        p.description,
        p.price,
        p.durationHours,
        p.passType,
        now,
        now
      );
    }
  }
}
