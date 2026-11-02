import type { APIRoute } from 'astro';
import { getCurrentUser } from '../../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = getCurrentUser(request);
  if (!user) {
    return new Response(
      JSON.stringify({ success: false, data: null, error: { code: 'unauthorized', message: 'Not logged in' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
