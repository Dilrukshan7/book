import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { getDb, closeDb } from '../src/lib/db';
import { PassynClient, PassynError } from '../src/lib/passyn/client';
import { handlePassynWebhook } from '../src/lib/passyn/webhook';
import { registerUser } from '../src/lib/auth';
import {
  createPlan,
  getPlanById,
  subscribeUserToPlan,
  cancelSubscription,
  getUserActiveSubscription,
} from '../src/lib/subscriptions';
import { checkBookAccess } from '../src/lib/access';

// Use an in-memory SQLite database for test isolation
delete process.env.DATABASE_URL;
process.env.DATABASE_PATH = ':memory:';

describe('Passyn Subscription Management Integration Tests', () => {
  beforeEach(() => {
    // Re-initialize clean in-memory database
    delete process.env.DATABASE_URL;
    process.env.DATABASE_PATH = ':memory:';
    closeDb();
  });

  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
  });

  // 1. Subscription plan creation
  it('1. should create subscription plan and store attributes correctly', async () => {
    const plan = await createPlan({
      bookSlug: 'linear-algebra-and-learning-from-data',
      name: '14-Day Sprint Pass',
      description: 'Two weeks of deep learning linear algebra access',
      price: 19.99,
      durationHours: 336,
      passType: 'CUSTOM',
      isActive: true,
    });

    expect(plan.id).toBeDefined();
    expect(plan.book_slug).toBe('linear-algebra-and-learning-from-data');
    expect(plan.name).toBe('14-Day Sprint Pass');
    expect(plan.price).toBe(19.99);
    expect(plan.duration_hours).toBe(336);
    expect(plan.pass_type).toBe('CUSTOM');
    expect(plan.is_active).toBe(1);
    expect(plan.passyn_pass_id).toBeDefined();

    const fetched = await getPlanById(plan.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe('14-Day Sprint Pass');
  });

  // 2. Subscription initiation & Passyn user provisioning
  it('2. should initiate subscription and provision Passyn user account', async () => {
    const user = await registerUser('Alice Student', 'alice@university.edu', 'SecurePass123!');
    const plan = await createPlan({
      bookSlug: 'introduction-to-linear-algebra',
      name: '24-Hour Pass',
      price: 4.99,
      durationHours: 24,
      passType: 'DAY',
    });

    const sub = await subscribeUserToPlan({
      userId: user.id,
      planId: plan.id,
      bookSlug: plan.book_slug,
    });

    expect(sub.id).toBeDefined();
    expect(sub.user_id).toBe(user.id);
    expect(sub.status).toBe('ACTIVE');
    expect(sub.passyn_access_id).toBeDefined();
    expect(new Date(sub.expires_at!).getTime()).toBeGreaterThan(Date.now());
  });

  // 3. Successful subscription activation
  it('3. should successfully activate subscription and verify active status', async () => {
    const user = await registerUser('Bob Explorer', 'bob@readbooks.dev', 'BobPassword!');
    const plan = await createPlan({
      bookSlug: 'introduction-to-linear-algebra',
      name: 'Weekly Pass',
      price: 12.99,
      durationHours: 168,
      passType: 'WEEKLY',
    });

    await subscribeUserToPlan({
      userId: user.id,
      planId: plan.id,
      bookSlug: plan.book_slug,
    });

    const active = await getUserActiveSubscription(user.id, plan.book_slug);
    expect(active).not.toBeNull();
    expect(active?.status).toBe('ACTIVE');
    expect(active?.book_slug).toBe(plan.book_slug);

    const access = await checkBookAccess(
      { id: user.id, email: user.email, name: user.name, role: user.role, passyn_user_id: null },
      plan.book_slug,
      false
    );
    expect(access.hasAccess).toBe(true);
    expect(access.reason).toBe('ACTIVE_SUBSCRIPTION');
  });

  // 4. Failed subscription activation
  it('4. should reject activation when plan is inactive or does not exist', async () => {
    const user = await registerUser('Carol Reader', 'carol@readbooks.dev', 'PasswordCarol!');
    const plan = await createPlan({
      bookSlug: 'introduction-to-linear-algebra',
      name: 'Disabled Pass',
      price: 9.99,
      durationHours: 24,
      isActive: false,
    });

    await expect(
      subscribeUserToPlan({
        userId: user.id,
        planId: plan.id,
        bookSlug: plan.book_slug,
      })
    ).rejects.toThrow('Selected plan is not currently active');

    await expect(
      subscribeUserToPlan({
        userId: user.id,
        planId: 'plan_non_existent',
        bookSlug: plan.book_slug,
      })
    ).rejects.toThrow('Subscription plan not found');
  });

  // 5. Invalid API credentials handling
  it('5. should reject requests with missing or invalid Passyn credentials', async () => {
    const invalidClient = new PassynClient({
      apiKey: '',
      baseUrl: 'http://localhost:3000/api',
    });

    expect(invalidClient.isConfigured).toBe(false);
    await expect(invalidClient.passes.list()).rejects.toThrow(PassynError);
    await expect(invalidClient.passes.list()).rejects.toThrow('Passyn API key is missing');
  });

  // 6. Invalid webhook signatures & replay attacks
  it('6. should reject invalid webhook signatures and expired timestamps', async () => {
    const secret = 'whsec_test_secret_12345';
    const payload = JSON.stringify({
      id: 'evt_1',
      event: 'pass.activated',
      timestamp: new Date().toISOString(),
      data: { accessId: 'acc_123' },
    });

    // A: Wrong secret signature
    const wrongSig = `t=${Math.floor(Date.now() / 1000)},v1=${createHmac('sha256', 'wrong_secret').update(`${Math.floor(Date.now() / 1000)}.${payload}`).digest('hex')}`;
    const resultWrong = await handlePassynWebhook(payload, wrongSig, secret);
    expect(resultWrong.status).toBe('invalid_signature');

    // B: Replay attack (timestamp older than 300s)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
    const expiredSig = `t=${oldTimestamp},v1=${createHmac('sha256', secret).update(`${oldTimestamp}.${payload}`).digest('hex')}`;
    const resultExpired = await handlePassynWebhook(payload, expiredSig, secret);
    expect(resultExpired.status).toBe('invalid_signature');

    // C: Valid signature succeeds
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const validSig = `t=${currentTimestamp},v1=${createHmac('sha256', secret).update(`${currentTimestamp}.${payload}`).digest('hex')}`;
    const resultValid = await handlePassynWebhook(payload, validSig, secret);
    expect(resultValid.status).toBe('processed');
  });

  // 7. Duplicate webhook events idempotency
  it('7. should process webhook idempotently and avoid duplicate side-effects', async () => {
    const secret = 'whsec_idempotent_test';
    const eventId = 'evt_unique_1001';
    const payload = JSON.stringify({
      id: eventId,
      event: 'pass.activated',
      timestamp: new Date().toISOString(),
      data: { accessId: 'acc_idempotent_99' },
    });

    const now = Math.floor(Date.now() / 1000);
    const sig = `t=${now},v1=${createHmac('sha256', secret).update(`${now}.${payload}`).digest('hex')}`;

    // First delivery
    const firstDelivery = await handlePassynWebhook(payload, sig, secret);
    expect(firstDelivery.status).toBe('processed');

    // Duplicate redelivery
    const duplicateDelivery = await handlePassynWebhook(payload, sig, secret);
    expect(duplicateDelivery.status).toBe('already_processed');
    expect(duplicateDelivery.message).toContain('previously processed');
  });

  // 8. Subscription cancellation
  it('8. should allow customer to cancel subscription and immediately revoke access', async () => {
    const user = await registerUser('Dave Student', 'dave@readbooks.dev', 'DavePassword!');
    const plan = await createPlan({
      bookSlug: 'introduction-to-linear-algebra',
      name: '24-Hour Pass',
      price: 4.99,
      durationHours: 24,
    });

    const sub = await subscribeUserToPlan({
      userId: user.id,
      planId: plan.id,
      bookSlug: plan.book_slug,
    });

    expect(await getUserActiveSubscription(user.id, plan.book_slug)).not.toBeNull();

    await cancelSubscription({
      subscriptionId: sub.id,
      userId: user.id,
      reason: 'No longer needed',
    });

    const afterCancel = await getUserActiveSubscription(user.id, plan.book_slug);
    expect(afterCancel).toBeNull();

    const access = await checkBookAccess(
      { id: user.id, email: user.email, name: user.name, role: user.role, passyn_user_id: null },
      plan.book_slug,
      false
    );
    expect(access.hasAccess).toBe(false);
  });

  // 9. Subscription expiration
  it('9. should deny access when subscription duration has expired', async () => {
    const user = await registerUser('Eve Expired', 'eve@readbooks.dev', 'EvePassword!');
    const plan = await createPlan({
      bookSlug: 'introduction-to-linear-algebra',
      name: 'Expired Test Pass',
      price: 2.99,
      durationHours: 1,
    });

    const sub = await subscribeUserToPlan({
      userId: user.id,
      planId: plan.id,
      bookSlug: plan.book_slug,
    });

    // Manually set expiration date in the past
    const pastDate = new Date(Date.now() - 3600000).toISOString();
    const db = getDb();
    await db.execute(`UPDATE subscriptions SET expires_at = ? WHERE id = ?`, [pastDate, sub.id]);

    const active = await getUserActiveSubscription(user.id, plan.book_slug);
    expect(active).toBeNull();

    const access = await checkBookAccess(
      { id: user.id, email: user.email, name: user.name, role: user.role, passyn_user_id: null },
      plan.book_slug,
      false
    );
    expect(access.hasAccess).toBe(false);
    expect(access.reason).toBe('NO_SUBSCRIPTION');
  });

  // 10. Unauthorized book access
  it('10. should block unauthenticated visitors and users without subscriptions', async () => {
    // Unauthenticated
    const unauthAccess = await checkBookAccess(null, 'introduction-to-linear-algebra', false);
    expect(unauthAccess.hasAccess).toBe(false);
    expect(unauthAccess.reason).toBe('UNAUTHENTICATED');

    // Authenticated user without subscription
    const user = await registerUser('Frank Unsubscribed', 'frank@readbooks.dev', 'FrankPass!');
    const noSubAccess = await checkBookAccess(
      { id: user.id, email: user.email, name: user.name, role: user.role, passyn_user_id: null },
      'introduction-to-linear-algebra',
      false
    );
    expect(noSubAccess.hasAccess).toBe(false);
    expect(noSubAccess.reason).toBe('NO_SUBSCRIPTION');
  });

  // 11. Cross-user subscription access attempts (IDOR prevention)
  it('11. should prevent user A from modifying or cancelling user B subscription', async () => {
    const userA = await registerUser('User A', 'userA@readbooks.dev', 'PassA123!');
    const userB = await registerUser('User B', 'userB@readbooks.dev', 'PassB123!');

    const plan = await createPlan({
      bookSlug: 'introduction-to-linear-algebra',
      name: 'User A Pass',
      price: 4.99,
      durationHours: 24,
    });

    const subA = await subscribeUserToPlan({
      userId: userA.id,
      planId: plan.id,
      bookSlug: plan.book_slug,
    });

    // User B attempts to cancel User A's subscription
    await expect(
      cancelSubscription({
        subscriptionId: subA.id,
        userId: userB.id,
        reason: 'Malicious cancellation',
        isAdmin: false,
      })
    ).rejects.toThrow('Forbidden: you do not own this subscription');

    // Verify User A subscription is still intact and ACTIVE
    const stillActive = await getUserActiveSubscription(userA.id, plan.book_slug);
    expect(stillActive).not.toBeNull();
    expect(stillActive?.id).toBe(subA.id);
  });

  // 12. API failure and recovery scenarios
  it('12. should handle Passyn API network outages gracefully without crashing', async () => {
    const client = new PassynClient({
      apiKey: 'pk_test_unreachable_key',
      baseUrl: 'http://127.0.0.1:59999/api', // non-existent port
      timeoutMs: 500,
    });

    await expect(client.passes.list()).rejects.toThrow();
  });
});
