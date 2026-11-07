import type { SessionUser } from '../auth';
import {
  getUserActiveSubscription,
  syncSubscriptionWithPassyn,
  type SubscriptionRecord,
} from '../subscriptions';

export interface AccessCheckResult {
  hasAccess: boolean;
  reason?: 'ADMIN_ACCESS' | 'ACTIVE_SUBSCRIPTION' | 'UNAUTHENTICATED' | 'NO_SUBSCRIPTION' | 'EXPIRED' | 'REVOKED';
  subscription?: SubscriptionRecord;
}

export async function checkBookAccess(
  user: SessionUser | null,
  bookSlug: string,
  syncWithPassyn = true
): Promise<AccessCheckResult> {
  // 1. Unauthenticated users have no access to restricted content
  if (!user) {
    return { hasAccess: false, reason: 'UNAUTHENTICATED' };
  }

  // 2. Administrators have bypass access for administrative review
  if (user.role === 'ADMIN') {
    return { hasAccess: true, reason: 'ADMIN_ACCESS' };
  }

  // 3. Look up active subscription in local database
  const subscription = await getUserActiveSubscription(user.id, bookSlug);
  if (!subscription) {
    return { hasAccess: false, reason: 'NO_SUBSCRIPTION' };
  }

  // 4. Optionally verify real-time state with Passyn Developer API
  if (syncWithPassyn) {
    const isValid = await syncSubscriptionWithPassyn(subscription.id);
    if (!isValid) {
      return { hasAccess: false, reason: 'EXPIRED' };
    }
  }

  return {
    hasAccess: true,
    reason: 'ACTIVE_SUBSCRIPTION',
    subscription,
  };
}
