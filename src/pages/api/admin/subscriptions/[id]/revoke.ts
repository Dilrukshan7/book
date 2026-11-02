import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../../../lib/auth';
import { cancelSubscription } from '../../../../../lib/subscriptions';

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== 'ADMIN') {
    return new Response(
      JSON.stringify({ success: false, error: { message: 'Admin access required' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { id } = params;
  if (!id) {
    return new Response(
      JSON.stringify({ success: false, error: { message: 'Subscription ID required' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || 'Revoked by administrator';

    await cancelSubscription({
      subscriptionId: id,
      reason,
      isAdmin: true,
    });

    return new Response(
      JSON.stringify({ success: true, data: { subscriptionId: id, status: 'REVOKED' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, error: { message: msg } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
