import type { APIRoute } from 'astro';
import { createSession, createSessionCookie, registerUser } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: { message: 'Name must be at least 2 characters' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, error: { message: 'Valid email is required' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: { message: 'Password must be at least 6 characters' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = registerUser(name, email, password);
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
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader,
        },
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isConflict = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('already exists');
    return new Response(
      JSON.stringify({
        success: false,
        error: { message: isConflict ? 'Email address is already registered' : msg },
      }),
      { status: isConflict ? 409 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
