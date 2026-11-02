import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../../lib/auth';
import { createPlan, listAllPlans } from '../../../../lib/subscriptions';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== 'ADMIN') {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'forbidden', message: 'Admin access required' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const plans = listAllPlans();
  return new Response(
    JSON.stringify({ success: true, data: { plans } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const POST: APIRoute = async ({ request }) => {
  const user = getCurrentUser(request);
  if (!user || user.role !== 'ADMIN') {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'forbidden', message: 'Admin access required' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { bookSlug, name, description, price, currency, durationHours, passType, isActive } = body;

    if (!bookSlug || !name || price === undefined || !durationHours) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { message: 'bookSlug, name, price, and durationHours are required' },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const plan = await createPlan({
      bookSlug,
      name,
      description,
      price: Number(price),
      currency,
      durationHours: Number(durationHours),
      passType,
      isActive: isActive !== false,
    });

    return new Response(
      JSON.stringify({ success: true, data: { plan } }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, error: { message: msg } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
