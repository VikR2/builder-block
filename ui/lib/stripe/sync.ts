import {
  createSubscription,
  updateSubscription,
  getSubscriptionByStripeId,
  getUserByStripeCustomerId,
  updateUserStripeCustomerId,
  getUserById,
} from '@/lib/auth/db';
import Stripe from 'stripe';

/**
 * Sync a Stripe subscription to the database
 */
export function syncSubscription(
  stripeSubscription: Stripe.Subscription,
  userId: number
) {
  const existingSubscription = getSubscriptionByStripeId(stripeSubscription.id);

  const periodStart = stripeSubscription.current_period_start
    ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
    : null;

  const periodEnd = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
    : null;

  if (existingSubscription) {
    // Update existing subscription
    updateSubscription(
      stripeSubscription.id,
      stripeSubscription.status,
      periodStart,
      periodEnd,
      stripeSubscription.cancel_at_period_end
    );
  } else {
    // Create new subscription
    const priceId = stripeSubscription.items.data[0]?.price.id || '';

    createSubscription(
      userId,
      stripeSubscription.id,
      priceId,
      stripeSubscription.status,
      periodStart,
      periodEnd
    );
  }
}

/**
 * Get user ID from Stripe subscription metadata or customer
 */
export function getUserIdFromSubscription(
  subscription: Stripe.Subscription
): number | null {
  // First try subscription metadata
  const userIdFromMeta = subscription.metadata?.userId;
  if (userIdFromMeta) {
    return parseInt(userIdFromMeta, 10);
  }

  // Then try customer ID
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  if (customerId) {
    const user = getUserByStripeCustomerId(customerId);
    if (user) {
      return user.id;
    }
  }

  return null;
}

/**
 * Link a Stripe customer to a user
 */
export function linkStripeCustomer(
  userId: number,
  customerId: string
) {
  const user = getUserById(userId);
  if (user && !user.stripe_customer_id) {
    updateUserStripeCustomerId(userId, customerId);
  }
}
