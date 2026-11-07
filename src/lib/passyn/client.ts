import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CreatePassInput,
  Envelope,
  PassynAccess,
  PassynPass,
  PassynUser,
  PassynVerifyResult,
} from './types';

export class PassynError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PassynError';
  }
}

export interface PassynClientOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

function normalizeBaseUrl(raw?: string): string {
  let url = (raw || process.env.PASSYN_API_URL || process.env.PASSYN_BASE_URL || 'https://sub.blansyn.com/api').trim().replace(/\/+$/, '');
  if (url.endsWith('/api/v1')) return url.slice(0, -3);
  if (url.endsWith('/v1')) return url.replace(/\/v1$/, '/api');
  if (url.endsWith('/api')) return url;
  return `${url}/api`;
}

export class PassynClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(options: PassynClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey || process.env.PASSYN_API_KEY || '';
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('pk_'));
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<Envelope<T>> {
    if (!this.apiKey) {
      throw new PassynError(
        'unauthorized',
        'Passyn API key is missing. Set PASSYN_API_KEY in environment.',
        401
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'BookPlatform/1.0.0 (Passyn-Integration)',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      throw new PassynError('network_error', `Passyn API request failed: ${errorMsg}`, 503);
    } finally {
      clearTimeout(timer);
    }

    let json: Envelope<T>;
    try {
      json = (await response.json()) as Envelope<T>;
    } catch {
      throw new PassynError(
        'invalid_response',
        `Passyn returned non-JSON response with HTTP ${response.status}`,
        response.status
      );
    }

    if (!json.success) {
      throw new PassynError(
        json.error?.code ?? 'unknown_error',
        json.error?.message ?? `Request failed with status ${response.status}`,
        response.status,
        json.error?.details
      );
    }

    return json;
  }

  // ── passes ────────────────────────────────────────────────────────
  passes = {
    create: async (input: CreatePassInput): Promise<PassynPass> =>
      (await this.request<PassynPass>('POST', '/v1/passes', input)).data,

    list: async (
      query: { type?: string; active?: boolean; merchantId?: string; limit?: number; offset?: number } = {}
    ): Promise<{ passes: PassynPass[]; total: number }> => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value));
      });
      const result = await this.request<PassynPass[]>(
        'GET',
        `/v1/passes${params.size ? `?${params}` : ''}`
      );
      return { passes: result.data, total: Number(result.meta.total ?? result.data.length) };
    },

    get: async (id: string): Promise<PassynPass> =>
      (await this.request<PassynPass>('GET', `/v1/passes/${id}`)).data,

    update: async (id: string, input: Partial<CreatePassInput>): Promise<PassynPass> =>
      (await this.request<PassynPass>('PATCH', `/v1/passes/${id}`, input)).data,

    archive: async (id: string): Promise<{ id: string; archived: boolean }> =>
      (await this.request<{ id: string; archived: boolean }>('DELETE', `/v1/passes/${id}`)).data,
  };

  // ── access ────────────────────────────────────────────────────────
  access = {
    activate: async (
      input: { accessId: string } | { userId: string; passId: string }
    ): Promise<PassynAccess> =>
      (await this.request<PassynAccess>('POST', '/v1/access/activate', input)).data,

    verify: async (input: {
      accessId?: string;
      userId?: string;
      passId?: string;
      consume?: boolean;
    }): Promise<PassynVerifyResult> => {
      const params = new URLSearchParams();
      Object.entries(input).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value));
      });
      return (await this.request<PassynVerifyResult>('GET', `/v1/access/verify?${params}`)).data;
    },

    revoke: async (input: { accessId: string; reason?: string }): Promise<PassynAccess> =>
      (await this.request<PassynAccess>('POST', '/v1/access/revoke', input)).data,

    history: async (
      userId: string,
      query: { limit?: number; offset?: number } = {}
    ): Promise<PassynAccess[]> => {
      const params = new URLSearchParams({ userId });
      if (query.limit) params.set('limit', String(query.limit));
      if (query.offset) params.set('offset', String(query.offset));
      return (await this.request<PassynAccess[]>('GET', `/v1/access/history?${params}`)).data;
    },
  };

  // ── users ─────────────────────────────────────────────────────────
  users = {
    create: async (input: {
      name: string;
      email: string;
    }): Promise<PassynUser> =>
      (await this.request<PassynUser>('POST', '/v1/users', input)).data,

    me: async (): Promise<{
      keyId: string;
      mode: 'TEST' | 'LIVE';
      context: 'merchant' | 'developer';
      permissions: string[];
      rateLimit: number;
    }> => (await this.request<never>('GET', '/v1/users/me')).data,
  };

  // ── webhooks ──────────────────────────────────────────────────────
  webhooks = {
    create: async (input: { url: string; events: string[] }) =>
      (await this.request<{ id: string; url: string; secret: string }>('POST', '/v1/webhooks', input)).data,
    list: async () =>
      (await this.request<Array<Record<string, unknown>>>('GET', '/v1/webhooks')).data,
    delete: async (id: string) =>
      (await this.request<{ id: string; deleted: boolean }>('DELETE', `/v1/webhooks/${id}`)).data,
  };

  /**
   * Verify a `Passyn-Signature` header (`t=…,v1=…`) against the raw request
   * body using the webhook signing secret.
   */
  static verifyWebhookSignature(
    body: string,
    header: string | null | undefined,
    secret: string,
    toleranceSeconds = 300
  ): boolean {
    if (!header || !secret) return false;
    const parts: Record<string, string> = {};
    for (const item of header.split(',')) {
      const [k, v] = item.split('=');
      if (k && v) parts[k.trim()] = v.trim();
    }
    const t = Number(parts['t']);
    const v1 = parts['v1'];
    if (!t || !v1) return false;

    // Check tolerance against replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - t) > toleranceSeconds) {
      return false;
    }

    const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
    } catch {
      return false;
    }
  }
}

// Singleton helper
let defaultClient: PassynClient | null = null;
export function getPassynClient(): PassynClient {
  if (!defaultClient) {
    defaultClient = new PassynClient();
  }
  return defaultClient;
}
