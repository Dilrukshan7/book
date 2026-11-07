import { randomBytes } from 'node:crypto';
import { getDb } from '../db';
import { PassynClient } from './client';
import type { WebhookEventPayload } from './types';

export interface ProcessWebhookResult {
  status: 'processed' | 'already_processed' | 'invalid_signature' | 'error';
  eventId?: string;
  eventType?: string;
  message?: string;
}

export async function handlePassynWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  webhookSecret: string
): Promise<ProcessWebhookResult> {
  const db = getDb();

  // 1. Verify signature
  const isValid = PassynClient.verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    return {
      status: 'invalid_signature',
      message: 'Passyn-Signature verification failed or signature expired (>5min drift)',
    };
  }

  // 2. Parse payload
  let payload: WebhookEventPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookEventPayload;
  } catch {
    return {
      status: 'error',
      message: 'Invalid JSON payload',
    };
  }

  const eventId = payload.id || `evt_${randomBytes(8).toString('hex')}`;
  const eventType = payload.event;

  // 3. Check idempotency
  const existing = await db.queryOne<{ id: string; status: string }>(
    `SELECT * FROM webhook_events WHERE event_id = ? LIMIT 1`,
    [eventId]
  );

  if (existing && existing.status === 'PROCESSED') {
    return {
      status: 'already_processed',
      eventId,
      eventType,
      message: 'Event previously processed',
    };
  }

  const internalId = existing?.id || `wh_${randomBytes(12).toString('hex')}`;
  const nowIso = new Date().toISOString();

  try {
    // 4. Dispatch event logic
    switch (eventType) {
      case 'pass.activated':
      case 'pass.purchased': {
        const { accessId, expiresAt, userId, passId } = payload.data;
        if (accessId) {
          const sub = await db.queryOne<{ id: string }>(
            `SELECT id FROM subscriptions WHERE passyn_access_id = ?`,
            [accessId]
          );
          if (sub) {
            await db.execute(
              `UPDATE subscriptions
               SET status = 'ACTIVE',
                   activated_at = COALESCE(activated_at, ?),
                   expires_at = COALESCE(?, expires_at),
                   updated_at = ?
               WHERE id = ?`,
              [nowIso, expiresAt || null, nowIso, sub.id]
            );
          } else if (userId && passId) {
            const user = await db.queryOne<{ id: string }>(
              `SELECT id FROM users WHERE passyn_user_id = ?`,
              [userId]
            );
            const plan = await db.queryOne<{ id: string; book_slug: string; duration_hours: number }>(
              `SELECT id, book_slug, duration_hours FROM book_plans WHERE passyn_pass_id = ?`,
              [passId]
            );

            if (user && plan) {
              const newSubId = `sub_${randomBytes(12).toString('hex')}`;
              const calcExpires = expiresAt || new Date(Date.now() + plan.duration_hours * 3600000).toISOString();
              await db.execute(
                `INSERT INTO subscriptions (
                  id, user_id, book_slug, plan_id, passyn_access_id,
                  status, activated_at, expires_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
                [newSubId, user.id, plan.book_slug, plan.id, accessId, nowIso, calcExpires, nowIso, nowIso]
              );
            }
          }
        }
        break;
      }

      case 'pass.expired': {
        const { accessId } = payload.data;
        if (accessId) {
          await db.execute(
            `UPDATE subscriptions
             SET status = 'EXPIRED', updated_at = ?
             WHERE passyn_access_id = ?`,
            [nowIso, accessId]
          );
        }
        break;
      }

      case 'pass.revoked': {
        const { accessId, reason } = payload.data;
        if (accessId) {
          await db.execute(
            `UPDATE subscriptions
             SET status = 'REVOKED', revoked_at = ?, revoke_reason = ?, updated_at = ?
             WHERE passyn_access_id = ?`,
            [nowIso, reason || 'Revoked via Passyn webhook', nowIso, accessId]
          );
        }
        break;
      }

      default:
        break;
    }

    // 5. Record successful processing for idempotency
    if (!existing) {
      await db.execute(
        `INSERT INTO webhook_events (id, event_id, event_type, payload, status, processed_at)
         VALUES (?, ?, ?, ?, 'PROCESSED', ?)`,
        [internalId, eventId, eventType, rawBody, nowIso]
      );
    } else {
      await db.execute(
        `UPDATE webhook_events
         SET status = 'PROCESSED', processed_at = ?
         WHERE id = ?`,
        [nowIso, internalId]
      );
    }

    return {
      status: 'processed',
      eventId,
      eventType,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (!existing) {
      await db.execute(
        `INSERT INTO webhook_events (id, event_id, event_type, payload, status, error_message, processed_at)
         VALUES (?, ?, ?, ?, 'FAILED', ?, ?)`,
        [internalId, eventId, eventType, rawBody, errorMsg, nowIso]
      );
    } else {
      await db.execute(
        `UPDATE webhook_events
         SET status = 'FAILED', error_message = ?, processed_at = ?
         WHERE id = ?`,
        [errorMsg, nowIso, internalId]
      );
    }

    return {
      status: 'error',
      eventId,
      eventType,
      message: errorMsg,
    };
  }
}
