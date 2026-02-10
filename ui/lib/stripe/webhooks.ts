import Stripe from 'stripe';
import { stripe } from './client';
import { syncSubscription, getUserIdFromSubscription, linkStripeCustomer } from './sync';
import { getUserByStripeCustomerId, updateUserStripeCustomerId } from '@/lib/auth/db';

/**
 * Verify and construct Stripe webhook event
 */
export function constructWebhookEvent(
  body: string | Buffer,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!
  );
}

/**
 * Handle checkout.session.completed event
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout completed:', session.id);

  // Get user ID from metadata
  const userId = session.metadata?.userId
    ? parseInt(session.metadata.userId, 10)
    : null;

  if (!userId) {
    console.error('No userId in checkout session metadata');
    return;
  }

  // Link Stripe customer to user if not already linked
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id;

  if (customerId) {
    linkStripeCustomer(userId, customerId);
  }

  // Subscription is handled by subscription.created event
}

/**
 * Handle customer.subscription.created event
 */
export async function handleSubscriptionCreated(
  subscription: Stripe.Subscription
) {
  console.log('Subscription created:', subscription.id);

  const userId = getUserIdFromSubscription(subscription);

  if (!userId) {
    console.error('Could not find user for subscription:', subscription.id);
    return;
  }

  syncSubscription(subscription, userId);
}

/**
 * Handle customer.subscription.updated event
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
) {
  console.log('Subscription updated:', subscription.id);

  const userId = getUserIdFromSubscription(subscription);

  if (!userId) {
    console.error('Could not find user for subscription:', subscription.id);
    return;
  }

  syncSubscription(subscription, userId);
}

/**
 * Handle customer.subscription.deleted event
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
) {
  console.log('Subscription deleted:', subscription.id);

  const userId = getUserIdFromSubscription(subscription);

  if (!userId) {
    console.error('Could not find user for subscription:', subscription.id);
    return;
  }

  // Sync with canceled status
  syncSubscription(subscription, userId);
}

/**
 * Process a Stripe webhook event
 */
export async function processWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case 'customer.subscription.created':
      await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    default:
      console.log('Unhandled webhook event:', event.type);
  }
}
