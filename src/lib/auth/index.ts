import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'ADMIN' | 'SUBSCRIBER';
  passyn_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'SUBSCRIBER';
  passyn_user_id: string | null;
}

const SESSION_COOKIE_NAME = 'book_session';
const SESSION_MAX_AGE_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = scryptSync(password, salt, 64);
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export function registerUser(
  name: string,
  email: string,
  password: string,
  role: 'ADMIN' | 'SUBSCRIBER' = 'SUBSCRIBER'
): UserRecord {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const id = `usr_${randomBytes(12).toString('hex')}`;
  const password_hash = hashPassword(password);
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, normalizedEmail, name.trim(), password_hash, role, now, now);

  return {
    id,
    email: normalizedEmail,
    name: name.trim(),
    password_hash,
    role,
    passyn_user_id: null,
    created_at: now,
    updated_at: now,
  };
}

export function authenticateUser(email: string, password: string): UserRecord | null {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const stmt = db.prepare(`SELECT * FROM users WHERE email = ? LIMIT 1`);
  const user = stmt.get(normalizedEmail) as UserRecord | undefined;
  if (!user) return null;

  if (!verifyPassword(password, user.password_hash)) {
    return null;
  }

  return user;
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const id = `ses_${randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(id, userId, token, expiresAt);

  return { token, expiresAt };
}

export function deleteSession(token: string): void {
  const db = getDb();
  const stmt = db.prepare(`DELETE FROM sessions WHERE token = ?`);
  stmt.run(token);
}

export function getUserFromToken(token: string): SessionUser | null {
  if (!token) return null;
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.passyn_user_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
    LIMIT 1
  `);
  const user = stmt.get(token, now) as SessionUser | undefined;
  return user || null;
}

export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

export function getCurrentUser(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return getUserFromToken(token);
}

export function createSessionCookie(token: string, expiresAt: string): string {
  const isSecure = process.env.NODE_ENV === 'production';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${isSecure ? '; Secure' : ''}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function updatePassynUserId(userId: string, passynUserId: string): void {
  const db = getDb();
  const stmt = db.prepare(`UPDATE users SET passyn_user_id = ?, updated_at = datetime('now') WHERE id = ?`);
  stmt.run(passynUserId, userId);
}

export function seedAdminIfMissing(): void {
  const db = getDb();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@readbooks.dev').trim().toLowerCase();
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(adminEmail);
  if (!existing) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
    registerUser('Platform Admin', adminEmail, adminPassword, 'ADMIN');
  }
}
