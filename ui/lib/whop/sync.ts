import type { Whop as WhopTypes } from '@whop/sdk';
import {
  createSubscription,
  getSubscriptionByProviderId,
  getUserByEmail,
  updateSubscription,
  type PaymentSyncEventMeta,
} from '@/lib/auth/db';
import { WHOP_PROVIDER } from './client';

type WhopMembership = WhopTypes.Membership;
type WhopPayment = WhopTypes.Payment;
type WhopMembershipStatus = WhopTypes.MembershipStatus;

const ACTIVE_STATUSES = new Set<WhopMembershipStatus>(['active', 'trialing']);

export function isActiveWhopStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status as WhopMembershipStatus);
}

export function eventTimestampToPaymentMeta(event: {
  id: string;
  type: string;
  timestamp: string;
}): PaymentSyncEventMeta {
  const parsed = Date.parse(event.timestamp);
  return {
    id: event.id,
    type: event.type,
    created: Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000),
  };
}

function unixTimestampToIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(numericValue * 1000)
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function getStringMetadata(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getUserIdFromMetadata(metadata: Record<string, unknown> | null | undefined): number | null {
  const userId = getStringMetadata(metadata, 'userId');
  if (!userId) {
    return null;
  }

  const parsed = Number.parseInt(userId, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getWhopUserId(
  metadata: Record<string, unknown> | null | undefined,
  email: string | null | undefined
): number | null {
  const metadataUserId = getUserIdFromMetadata(metadata);
  if (metadataUserId) {
    return metadataUserId;
  }

  const metadataEmail = getStringMetadata(metadata, 'email');
  const lookupEmail = metadataEmail || email;
  if (!lookupEmail) {
    return null;
  }

  return getUserByEmail(lookupEmail)?.id ?? null;
}

export function syncWhopMembership(
  membership: WhopMembership,
  eventMeta: PaymentSyncEventMeta,
  latestPaymentId: string | null = null
): void {
  const userId = getWhopUserId(membership.metadata, membership.user?.email ?? null);
  if (!userId) {
    throw new Error(`Could not map Whop membership ${membership.id} to a local user`);
  }

  const priceId = membership.plan?.id || process.env.WHOP_PLAN_ID || '';
  const periodStart = unixTimestampToIso(membership.renewal_period_start);
  const periodEnd = unixTimestampToIso(membership.renewal_period_end);
  const existingSubscription = getSubscriptionByProviderId(membership.id);

  if (
    existingSubscription?.last_stripe_event_created &&
    existingSubscription.last_stripe_event_created > eventMeta.created
  ) {
    console.log('Skipping out-of-order Whop membership event:', eventMeta.id, membership.id);
    return;
  }

  if (existingSubscription) {
    updateSubscription(
      membership.id,
      membership.status,
      periodStart,
      periodEnd,
      membership.cancel_at_period_end,
      eventMeta,
      WHOP_PROVIDER,
      latestPaymentId,
      membership.manage_url
    );
    return;
  }

  createSubscription(
    userId,
    membership.id,
    priceId,
    membership.status,
    periodStart,
    periodEnd,
    eventMeta,
    WHOP_PROVIDER,
    latestPaymentId,
    membership.manage_url
  );
}

export function syncWhopPayment(payment: WhopPayment, eventMeta: PaymentSyncEventMeta): void {
  const membershipId = payment.membership?.id;
  if (!membershipId) {
    throw new Error(`Whop payment ${payment.id} did not include a membership`);
  }

  const userId = getWhopUserId(payment.metadata, payment.user?.email ?? null);
  if (!userId) {
    throw new Error(`Could not map Whop payment ${payment.id} to a local user`);
  }

  const status = payment.membership?.status || (payment.status === 'paid' ? 'active' : 'past_due');
  const priceId = payment.plan?.id || process.env.WHOP_PLAN_ID || '';
  const existingSubscription = getSubscriptionByProviderId(membershipId);

  if (
    existingSubscription?.last_stripe_event_created &&
    existingSubscription.last_stripe_event_created > eventMeta.created
  ) {
    console.log('Skipping out-of-order Whop payment event:', eventMeta.id, payment.id);
    return;
  }

  if (existingSubscription) {
    updateSubscription(
      membershipId,
      status,
      existingSubscription.current_period_start,
      existingSubscription.current_period_end,
      Boolean(existingSubscription.cancel_at_period_end),
      eventMeta,
      WHOP_PROVIDER,
      payment.id,
      existingSubscription.provider_manage_url
    );
    return;
  }

  createSubscription(
    userId,
    membershipId,
    priceId,
    status,
    null,
    null,
    eventMeta,
    WHOP_PROVIDER,
    payment.id,
    null
  );
}
