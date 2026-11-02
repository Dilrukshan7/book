import type { APIRoute } from 'astro';
import { handlePassynWebhook } from '../../../lib/passyn/webhook';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = process.env.PASSYN_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'not_configured', message: 'PASSYN_WEBHOOK_SECRET is not configured on server' },
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const signatureHeader = request.headers.get('passyn-signature');
  const rawBody = await request.text();

  const result = await handlePassynWebhook(rawBody, signatureHeader, webhookSecret);

  if (result.status === 'invalid_signature') {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'invalid_signature', message: result.message },
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (result.status === 'error') {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'processing_error', message: result.message },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        status: result.status,
        eventId: result.eventId,
        eventType: result.eventType,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
