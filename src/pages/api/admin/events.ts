import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../lib/auth';
import { getDb } from '../../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = await getCurrentUser(request);
  if (!user || user.role !== 'ADMIN') {
    return new Response(
      JSON.stringify({ success: false, error: { message: 'Admin access required' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const db = getDb();
  const webhookEvents = await db.query(`SELECT * FROM webhook_events ORDER BY processed_at DESC LIMIT 50`);
  const auditLogs = await db.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50`);

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
