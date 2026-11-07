import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../lib/auth';
import { cancelSubscription } from '../../../lib/subscriptions';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const user = await getCurrentUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'unauthorized', message: 'You must be logged in to manage your subscriptions.' },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { subscriptionId, reason } = body;

    if (!subscriptionId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'bad_request', message: 'subscriptionId is required' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    await cancelSubscription({
      subscriptionId,
      userId: user.id,
      reason,
      isAdmin: user.role === 'ADMIN',
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { message: 'Subscription successfully cancelled' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'cancellation_failed', message: msg },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
