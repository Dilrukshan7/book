import type { APIRoute } from 'astro';
import { clearSessionCookie, deleteSession, parseCookies } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies['book_session'];
  if (token) {
    await deleteSession(token);
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Logged out successfully' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie(),
      },
    }
  );
};
