import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../lib/auth';
import { subscribeUserToPlan } from '../../../lib/subscriptions';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const user = await getCurrentUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'unauthorized', message: 'You must be logged in to purchase or activate a pass.' },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { planId, bookSlug } = body;

    if (!planId || !bookSlug) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'bad_request', message: 'planId and bookSlug are required' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const subscription = await subscribeUserToPlan({
      userId: user.id,
      planId,
      bookSlug,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { subscription },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'subscription_failed', message: msg },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
