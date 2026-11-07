import { randomBytes } from 'node:crypto';
import { getDb } from '../db';
import { getPassynClient } from '../passyn/client';
import { updatePassynUserId } from '../auth';
import type { PassType } from '../passyn/types';

export interface BookPlanRecord {
  id: string;
  book_slug: string;
  passyn_pass_id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_hours: number;
  pass_type: PassType;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  book_slug: string;
  plan_id: string;
  passyn_access_id: string | null;
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'REVOKED';
  activated_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
  plan_name?: string;
  plan_price?: number;
  plan_currency?: string;
  duration_hours?: number;
  user_name?: string;
  user_email?: string;
}

export async function listPlansForBook(bookSlug: string): Promise<BookPlanRecord[]> {
  const db = getDb();
  return await db.query<BookPlanRecord>(
    `SELECT * FROM book_plans WHERE book_slug = ? AND is_active = 1 ORDER BY price ASC`,
    [bookSlug]
  );
}

export async function listAllPlans(): Promise<BookPlanRecord[]> {
  const db = getDb();
  return await db.query<BookPlanRecord>(`SELECT * FROM book_plans ORDER BY book_slug, price ASC`);
}

export async function getPlanById(planId: string): Promise<BookPlanRecord | null> {
  const db = getDb();
  return await db.queryOne<BookPlanRecord>(`SELECT * FROM book_plans WHERE id = ? LIMIT 1`, [planId]);
}

export async function createPlan(input: {
  bookSlug: string;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  durationHours: number;
  passType?: PassType;
  isActive?: boolean;
}): Promise<BookPlanRecord> {
  const db = getDb();
  const client = getPassynClient();
  const currency = (input.currency || 'USD').toUpperCase();
  const passType = input.passType || 'DAY';
  const isActive = input.isActive ?? true;

  let passynPassId = '';

  // Synchronize with Passyn Developer API if configured
  if (client.isConfigured) {
    try {
      const createdPass = await client.passes.create({
        name: `${input.name} (${input.bookSlug})`,
        description: input.description,
        price: input.price,
        currency,
        durationHours: input.durationHours,
        type: passType,
        isActive,
      });
      passynPassId = createdPass.id;
    } catch (err) {
      console.error('Failed to create pass in Passyn API:', err);
      throw err;
    }
  } else {
    // Generate synthetic pass ID if Passyn is in local offline / test mode
    passynPassId = `pass_mock_${randomBytes(8).toString('hex')}`;
  }

  const id = `plan_${randomBytes(12).toString('hex')}`;
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO book_plans (
      id, book_slug, passyn_pass_id, name, description,
      price, currency, duration_hours, pass_type, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.bookSlug,
      passynPassId,
      input.name,
      input.description || null,
      input.price,
      currency,
      input.durationHours,
      passType,
      isActive ? 1 : 0,
      now,
      now,
    ]
  );

  return {
    id,
    book_slug: input.bookSlug,
    passyn_pass_id: passynPassId,
    name: input.name,
    description: input.description || null,
    price: input.price,
    currency,
    duration_hours: input.durationHours,
    pass_type: passType,
    is_active: isActive ? 1 : 0,
    created_at: now,
    updated_at: now,
  };
}

export async function togglePlanActive(planId: string, isActive: boolean): Promise<void> {
  const db = getDb();
  const plan = await getPlanById(planId);
  if (!plan) throw new Error('Plan not found');

  const client = getPassynClient();
  if (client.isConfigured && !plan.passyn_pass_id.startsWith('pass_mock_')) {
    try {
      await client.passes.update(plan.passyn_pass_id, { isActive });
    } catch (err) {
      console.warn('Could not sync pass status to Passyn:', err);
    }
  }

  await db.execute(
    `UPDATE book_plans SET is_active = ?, updated_at = datetime('now') WHERE id = ?`,
    [isActive ? 1 : 0, planId]
  );
}

export async function archivePlan(planId: string): Promise<void> {
  const db = getDb();
  const plan = await getPlanById(planId);
  if (!plan) throw new Error('Plan not found');

  const client = getPassynClient();
  if (client.isConfigured && !plan.passyn_pass_id.startsWith('pass_mock_')) {
    try {
      await client.passes.archive(plan.passyn_pass_id);
    } catch (err) {
      console.warn('Could not archive pass in Passyn:', err);
    }
  }

  await db.execute(`UPDATE book_plans SET is_active = 0, updated_at = datetime('now') WHERE id = ?`, [planId]);
}

// ── Subscriptions ──────────────────────────────────────────────────

export async function getUserActiveSubscription(
  userId: string,
  bookSlug: string
): Promise<SubscriptionRecord | null> {
  const db = getDb();
  const now = new Date().toISOString();

  const sub = await db.queryOne<SubscriptionRecord>(
    `SELECT s.*, p.name as plan_name, p.price as plan_price, p.currency as plan_currency, p.duration_hours
     FROM subscriptions s
     JOIN book_plans p ON s.plan_id = p.id
     WHERE s.user_id = ?
       AND s.book_slug = ?
       AND s.status = 'ACTIVE'
       AND (s.expires_at IS NULL OR s.expires_at > ?)
     ORDER BY s.expires_at DESC
     LIMIT 1`,
    [userId, bookSlug, now]
  );

  return sub || null;
}

export async function listUserSubscriptions(userId: string): Promise<SubscriptionRecord[]> {
  const db = getDb();
  return await db.query<SubscriptionRecord>(
    `SELECT s.*, p.name as plan_name, p.price as plan_price, p.currency as plan_currency, p.duration_hours
     FROM subscriptions s
     JOIN book_plans p ON s.plan_id = p.id
     WHERE s.user_id = ?
     ORDER BY s.created_at DESC`,
    [userId]
  );
}

export async function listAllSubscriptions(): Promise<SubscriptionRecord[]> {
  const db = getDb();
  return await db.query<SubscriptionRecord>(
    `SELECT s.*, p.name as plan_name, p.price as plan_price, p.currency as plan_currency,
            u.name as user_name, u.email as user_email
     FROM subscriptions s
     JOIN book_plans p ON s.plan_id = p.id
     JOIN users u ON s.user_id = u.id
     ORDER BY s.created_at DESC`
  );
}

export async function subscribeUserToPlan(params: {
  userId: string;
  planId: string;
  bookSlug: string;
}): Promise<SubscriptionRecord> {
  const db = getDb();
  const plan = await getPlanById(params.planId);
  if (!plan) throw new Error('Subscription plan not found');
  if (!plan.is_active) throw new Error('Selected plan is not currently active');

  const user = await db.queryOne<{
    id: string;
    email: string;
    name: string;
    passyn_user_id: string | null;
  }>(`SELECT * FROM users WHERE id = ?`, [params.userId]);
  if (!user) throw new Error('User not found');

  const client = getPassynClient();
  let passynUserId = user.passyn_user_id;
  let passynAccessId = `acc_mock_${randomBytes(8).toString('hex')}`;

  const now = new Date();
  let expiresAt = new Date(now.getTime() + plan.duration_hours * 60 * 60 * 1000).toISOString();

  if (client.isConfigured) {
    try {
      // 1. Ensure user exists in Passyn
      if (!passynUserId) {
        const passynUser = await client.users.create({
          name: user.name,
          email: user.email,
        });
        passynUserId = passynUser.id;
        await updatePassynUserId(user.id, passynUserId);
      }

      // 2. Activate Access in Passyn
      const access = await client.access.activate({
        userId: passynUserId,
        passId: plan.passyn_pass_id,
      });

      passynAccessId = access.id;
      if (access.expiresAt) {
        expiresAt = access.expiresAt;
      }
    } catch (err) {
      console.error('Passyn access activation error:', err);
      throw err;
    }
  }

  const subscriptionId = `sub_${randomBytes(12).toString('hex')}`;
  const nowIso = now.toISOString();

  await db.execute(
    `INSERT INTO subscriptions (
      id, user_id, book_slug, plan_id, passyn_access_id,
      status, activated_at, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
    [
      subscriptionId,
      user.id,
      params.bookSlug,
      plan.id,
      passynAccessId,
      nowIso,
      expiresAt,
      nowIso,
      nowIso,
    ]
  );

  // Log audit trail
  await db.execute(
    `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
     VALUES (?, ?, 'subscription.created', 'subscription', ?, ?)`,
    [
      `log_${randomBytes(12).toString('hex')}`,
      user.id,
      subscriptionId,
      JSON.stringify({ planId: plan.id, bookSlug: params.bookSlug, passynAccessId }),
    ]
  );

  return {
    id: subscriptionId,
    user_id: user.id,
    book_slug: params.bookSlug,
    plan_id: plan.id,
    passyn_access_id: passynAccessId,
    status: 'ACTIVE',
    activated_at: nowIso,
    expires_at: expiresAt,
    revoked_at: null,
    revoke_reason: null,
    created_at: nowIso,
    updated_at: nowIso,
    plan_name: plan.name,
    plan_price: plan.price,
    plan_currency: plan.currency,
    duration_hours: plan.duration_hours,
  };
}

export async function cancelSubscription(params: {
  subscriptionId: string;
  userId?: string;
  reason?: string;
  isAdmin?: boolean;
}): Promise<void> {
  const db = getDb();
  const sub = await db.queryOne<SubscriptionRecord>(`SELECT * FROM subscriptions WHERE id = ?`, [params.subscriptionId]);
  if (!sub) throw new Error('Subscription not found');

  if (!params.isAdmin && sub.user_id !== params.userId) {
    throw new Error('Forbidden: you do not own this subscription');
  }

  const client = getPassynClient();
  if (client.isConfigured && sub.passyn_access_id && !sub.passyn_access_id.startsWith('acc_mock_')) {
    try {
      await client.access.revoke({
        accessId: sub.passyn_access_id,
        reason: params.reason || 'Cancelled by user',
      });
    } catch (err) {
      console.warn('Could not revoke access in Passyn:', err);
    }
  }

  const nowIso = new Date().toISOString();
  await db.execute(
    `UPDATE subscriptions
     SET status = 'CANCELLED', revoked_at = ?, revoke_reason = ?, updated_at = ?
     WHERE id = ?`,
    [nowIso, params.reason || 'User requested cancellation', nowIso, sub.id]
  );

  await db.execute(
    `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
     VALUES (?, ?, 'subscription.cancelled', 'subscription', ?, ?)`,
    [
      `log_${randomBytes(12).toString('hex')}`,
      params.userId || null,
      sub.id,
      JSON.stringify({ reason: params.reason }),
    ]
  );
}

export async function syncSubscriptionWithPassyn(subscriptionId: string): Promise<boolean> {
  const db = getDb();
  const sub = await db.queryOne<SubscriptionRecord & {
    passyn_pass_id: string;
    passyn_user_id: string | null;
  }>(
    `SELECT s.*, p.passyn_pass_id, u.passyn_user_id
     FROM subscriptions s
     JOIN book_plans p ON s.plan_id = p.id
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ?`,
    [subscriptionId]
  );

  if (!sub) return false;

  const client = getPassynClient();
  if (!client.isConfigured || !sub.passyn_access_id || sub.passyn_access_id.startsWith('acc_mock_')) {
    if (sub.status === 'ACTIVE' && sub.expires_at && new Date(sub.expires_at) < new Date()) {
      await db.execute(`UPDATE subscriptions SET status = 'EXPIRED', updated_at = datetime('now') WHERE id = ?`, [sub.id]);
      return false;
    }
    return sub.status === 'ACTIVE';
  }

  try {
    const verification = await client.access.verify({
      accessId: sub.passyn_access_id,
    });

    if (!verification.valid) {
      const newStatus = verification.reason?.toLowerCase().includes('revok') ? 'REVOKED' : 'EXPIRED';
      await db.execute(`UPDATE subscriptions SET status = ?, updated_at = datetime('now') WHERE id = ?`, [newStatus, sub.id]);
      return false;
    } else {
      if (verification.status && verification.status !== sub.status) {
        await db.execute(`UPDATE subscriptions SET status = ?, updated_at = datetime('now') WHERE id = ?`, [verification.status, sub.id]);
      }
      return true;
    }
  } catch (err) {
    console.error('Error verifying subscription with Passyn:', err);
    return sub.status === 'ACTIVE';
  }
}

export async function seedDefaultPlansIfMissing(): Promise<void> {
  const db = getDb();
  const countRow = await db.queryOne<{ count: number | string }>(`SELECT COUNT(*) as count FROM book_plans`);
  if (countRow && Number(countRow.count) > 0) return;

  const defaultPlans = [
    {
      bookSlug: 'introduction-to-linear-algebra',
      name: '24-Hour Intensive Pass',
      description: 'Full unmetered access to all study guides, video notes, and roadmap milestones for 24 hours.',
      price: 4.99,
      durationHours: 24,
      passType: 'DAY' as PassType,
    },
    {
      bookSlug: 'introduction-to-linear-algebra',
      name: '7-Day Study Sprint Pass',
      description: 'One full week of structured access to study guides and problem set breakdowns.',
      price: 14.99,
      durationHours: 168,
      passType: 'WEEKLY' as PassType,
    },
    {
      bookSlug: 'introduction-to-linear-algebra',
      name: 'Semester Mastery Pass (30 Days)',
      description: '30-day comprehensive access with full interactive progress tracking and study guides.',
      price: 29.99,
      durationHours: 720,
      passType: 'CUSTOM' as PassType,
    },
    {
      bookSlug: 'linear-algebra-and-learning-from-data',
      name: '24-Hour Sprint Pass',
      description: '24-hour full access to MIT 18.065 deep learning and matrix calculus study guides.',
      price: 5.99,
      durationHours: 24,
      passType: 'DAY' as PassType,
    },
    {
      bookSlug: 'linear-algebra-and-learning-from-data',
      name: 'Weekly Deep-Dive Pass',
      description: '7-day deep-dive into SVD, PCA, neural networks, and optimization roadmaps.',
      price: 18.99,
      durationHours: 168,
      passType: 'WEEKLY' as PassType,
    },
    {
      bookSlug: 'linear-algebra-and-learning-from-data',
      name: 'Full Course Pass (30 Days)',
      description: '30 days of comprehensive study guide and deep learning mathematics access.',
      price: 34.99,
      durationHours: 720,
      passType: 'CUSTOM' as PassType,
    },
  ];

  for (const p of defaultPlans) {
    try {
      await createPlan(p);
    } catch (err) {
      console.warn(`Could not seed plan ${p.name}:`, err);
    }
  }
}
