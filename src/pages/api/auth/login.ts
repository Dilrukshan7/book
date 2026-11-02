import type { APIRoute } from 'astro';
import { authenticateUser, createSession, createSessionCookie } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: { message: 'Email and password are required' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = authenticateUser(email, password);
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: { message: 'Invalid email or password' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { token, expiresAt } = createSession(user.id);
    const cookieHeader = createSessionCookie(token, expiresAt);

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
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader,
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, error: { message: msg } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
