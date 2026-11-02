import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../../lib/auth';
import { archivePlan, togglePlanActive } from '../../../../lib/subscriptions';

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
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
      JSON.stringify({ success: false, error: { message: 'Plan ID required' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { isActive } = body;
    await togglePlanActive(id, Boolean(isActive));

    return new Response(
      JSON.stringify({ success: true, data: { id, isActive: Boolean(isActive) } }),
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

export const DELETE: APIRoute = async ({ params, request }) => {
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
      JSON.stringify({ success: false, error: { message: 'Plan ID required' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    await archivePlan(id);
    return new Response(
      JSON.stringify({ success: true, data: { id, archived: true } }),
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
