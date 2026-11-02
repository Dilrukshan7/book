import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

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
}
