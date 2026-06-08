import { getAppUrl, getWhopClient, normalizeWhopCheckoutUrl } from './client';

interface CreateCheckoutSessionOptions {
  userId: number;
  email: string;
}

export async function createCheckoutSession({
  userId,
  email,
}: CreateCheckoutSessionOptions): Promise<string> {
  const appUrl = getAppUrl();
  const planId = process.env.WHOP_PLAN_ID;
  if (!planId) {
    throw new Error('WHOP_PLAN_ID is not configured');
  }

  const checkout = await getWhopClient().checkoutConfigurations.create({
    plan_id: planId,
    mode: 'payment',
    allow_promo_codes: true,
    redirect_url: `${appUrl}/pricing?success=true`,
    source_url: `${appUrl}/pricing`,
    metadata: {
      userId: String(userId),
      email,
    },
  });

  if (!checkout.purchase_url) {
    throw new Error('Whop checkout response did not include a purchase URL');
  }

  return normalizeWhopCheckoutUrl(checkout.purchase_url);
}
