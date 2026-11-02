import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../lib/auth';
import { getDb } from '../../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== 'ADMIN') {
    return new Response(
      JSON.stringify({ success: false, error: { message: 'Admin access required' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const db = getDb();
  const webhookEvents = db.prepare(`SELECT * FROM webhook_events ORDER BY processed_at DESC LIMIT 50`).all();
  const auditLogs = db.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50`).all();

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        webhookEvents,
        auditLogs,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
