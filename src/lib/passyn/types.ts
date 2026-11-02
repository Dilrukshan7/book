export type PassType = 'DAY' | 'WEEKEND' | 'WEEKLY' | 'EXAM' | 'PROJECT' | 'CUSTOM';
export type AccessStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

export interface Envelope<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string; details?: unknown } | null;
  meta: Record<string, unknown>;
}

export interface PassynPass {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  type: PassType;
  durationHours: number;
  price: number;
  currency: string;
  maxUses: number | null;
  isActive: boolean;
  color?: string;
  createdAt: string;
}

export interface PassynAccess {
  id: string;
  userId: string;
  passId: string;
  merchantId: string;
  status: AccessStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  usageCount: number;
  createdAt: string;
}

export interface PassynVerifyResult {
  valid: boolean;
  reason?: string;
  accessId?: string;
  status?: AccessStatus;
  expiresAt?: string | null;
  remainingUses?: number | null;
}

export interface CreatePassInput {
  name: string;
  type?: PassType;
  durationHours: number;
  price: number;
  currency?: string;
  maxUses?: number | null;
  isActive?: boolean;
  description?: string;
  color?: string;
}

export interface PassynUser {
  id: string;
  email: string;
  name: string;
  created: boolean;
}

export interface WebhookEventPayload {
  id: string;
  event: 'pass.purchased' | 'pass.activated' | 'pass.expired' | 'pass.revoked' | 'settlement.paid' | string;
  timestamp: string;
  data: {
    accessId?: string;
    passId?: string;
    userId?: string;
    merchantId?: string;
    status?: string;
    expiresAt?: string;
    activatedAt?: string;
    reason?: string;
    [key: string]: unknown;
  };
}
