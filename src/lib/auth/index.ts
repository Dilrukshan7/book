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

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: 'ADMIN' | 'SUBSCRIBER' = 'SUBSCRIBER'
): Promise<UserRecord> {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const id = `usr_${randomBytes(12).toString('hex')}`;
  const password_hash = hashPassword(password);
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, normalizedEmail, name.trim(), password_hash, role, now, now]
  );

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

export async function authenticateUser(email: string, password: string): Promise<UserRecord | null> {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.queryOne<UserRecord>(`SELECT * FROM users WHERE email = ? LIMIT 1`, [normalizedEmail]);
  if (!user) return null;

  if (!verifyPassword(password, user.password_hash)) {
    return null;
  }

  return user;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const id = `ses_${randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await db.execute(
    `INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
    [id, userId, token, expiresAt]
  );

  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  const db = getDb();
  await db.execute(`DELETE FROM sessions WHERE token = ?`, [token]);
}

export async function getUserFromToken(token: string): Promise<SessionUser | null> {
  if (!token) return null;
  const db = getDb();
  const now = new Date().toISOString();

  const user = await db.queryOne<SessionUser>(
    `SELECT u.id, u.email, u.name, u.role, u.passyn_user_id
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > ?
     LIMIT 1`,
    [token, now]
  );
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

export async function getCurrentUser(request: Request): Promise<SessionUser | null> {
  const cookieHeader = request.headers.get('cookie');
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  return await getUserFromToken(token);
}

export function createSessionCookie(token: string, expiresAt: string): string {
  const isSecure = process.env.NODE_ENV === 'production';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${isSecure ? '; Secure' : ''}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export async function updatePassynUserId(userId: string, passynUserId: string): Promise<void> {
  const db = getDb();
  await db.execute(`UPDATE users SET passyn_user_id = ?, updated_at = datetime('now') WHERE id = ?`, [passynUserId, userId]);
}

export async function seedAdminIfMissing(): Promise<void> {
  const db = getDb();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@readbooks.dev').trim().toLowerCase();
  const existing = await db.queryOne<{ id: string }>(`SELECT id FROM users WHERE email = ?`, [adminEmail]);
  if (!existing) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPass123!';
    await registerUser('Platform Admin', adminEmail, adminPassword, 'ADMIN');
  }
}
