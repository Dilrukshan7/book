/**
 * Cloudflare Pages Function: /api/generate-guide
 *
 * Secure serverless endpoint for AI technical roadmap & study guide generation.
 * Deployed at the edge on Cloudflare Pages.
 */

import { createOpenRouterStream } from '../../src/lib/server/ai-generator';

interface Env {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  SITE_URL?: string;
}

// In-memory sliding rate limiter (5 requests per 10 minutes per IP)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);

  if (rateLimitMap.size > 2000) {
    for (const [k, v] of rateLimitMap.entries()) {
      const valid = v.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (valid.length === 0) rateLimitMap.delete(k);
      else rateLimitMap.set(k, valid);
    }
  }

  return false;
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;

  // 1. IP Rate Limiting
  const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded. You may generate up to 5 roadmaps every 10 minutes.',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '600',
        },
      },
    );
  }

  // 2. Parse payload
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request payload.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = env.OPENROUTER_API_KEY || '';
  const model = env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
  const siteUrl = env.SITE_URL || 'https://readbooks.pages.dev';

  return createOpenRouterStream(body.query ?? '', apiKey, model, siteUrl);
}
