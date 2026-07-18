import type { BillingPeriod } from '@/lib/pricing';
import {
  getAppUrl,
  getWhopClient,
  getWhopPlanId,
  normalizeWhopCheckoutUrl,
} from './client';

interface CreateCheckoutSessionOptions {
  userId: number;
  email: string;
  billingPeriod?: BillingPeriod;
}

export async function createCheckoutSession({
  userId,
  email,
  billingPeriod = 'monthly',
}: CreateCheckoutSessionOptions): Promise<string> {
  const appUrl = getAppUrl();
  const planId = getWhopPlanId(billingPeriod);
  if (!planId) {
    throw new Error(`Whop ${billingPeriod} plan is not configured`);
  }

  const checkout = await getWhopClient().checkoutConfigurations.create({
    plan_id: planId,
    mode: 'payment',
    allow_promo_codes: true,
    redirect_url: `${appUrl}/pricing?success=true&plan=${billingPeriod}`,
    source_url: `${appUrl}/pricing#plans`,
    metadata: {
      userId: String(userId),
      email,
      billingPeriod,
    },
  });

  if (!checkout.purchase_url) {
    throw new Error('Whop checkout response did not include a purchase URL');
  }

  return normalizeWhopCheckoutUrl(checkout.purchase_url);
}
