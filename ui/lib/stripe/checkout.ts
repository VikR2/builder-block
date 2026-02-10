import { stripe } from './client';
import { updateUserStripeCustomerId, getUserById } from '@/lib/auth/db';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface CreateCheckoutParams {
  userId: number;
  email: string;
  stripeCustomerId?: string | null;
}

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession({
  userId,
  email,
  stripeCustomerId,
}: CreateCheckoutParams): Promise<string> {
  // Get or create Stripe customer
  let customerId = stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: {
        userId: userId.toString(),
      },
    });
    customerId = customer.id;

    // Save customer ID to user record
    updateUserStripeCustomerId(userId, customerId);
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!,
        quantity: 1,
      },
    ],
    success_url: `${APP_URL}/pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/pricing?canceled=true`,
    metadata: {
      userId: userId.toString(),
    },
    subscription_data: {
      metadata: {
        userId: userId.toString(),
      },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error('Failed to create checkout session');
  }

  return session.url;
}

/**
 * Retrieve a checkout session by ID
 */
export async function getCheckoutSession(sessionId: string) {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });
}
