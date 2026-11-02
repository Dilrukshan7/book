import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../lib/auth';
import { syncSubscriptionWithPassyn } from '../../../lib/subscriptions';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const user = getCurrentUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'unauthorized', message: 'Not logged in' },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { subscriptionId } = body;

    if (!subscriptionId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'bad_request', message: 'subscriptionId is required' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const isActive = await syncSubscriptionWithPassyn(subscriptionId);

    return new Response(
      JSON.stringify({
        success: true,
        data: { active: isActive },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'sync_failed', message: msg },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
