import Whop from '@whop/sdk';
import type { BillingPeriod } from '@/lib/pricing';

export const WHOP_PROVIDER = 'whop';
const WHOP_CHECKOUT_ORIGIN = 'https://whop.com';

let whopClient: Whop | null = null;

function normalizeApiKey(apiKey: string): string {
  return apiKey.replace(/^Bearer\s+/i, '').trim();
}

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function getWhopPlanId(
  billingPeriod: BillingPeriod = 'monthly'
): string | undefined {
  const configuredPlans: Record<BillingPeriod, string | undefined> = {
    monthly: process.env.WHOP_PLAN_ID_MONTHLY || process.env.WHOP_PLAN_ID,
    quarterly: process.env.WHOP_PLAN_ID_QUARTERLY,
    yearly: process.env.WHOP_PLAN_ID_YEARLY,
  };

  return configuredPlans[billingPeriod]?.trim() || undefined;
}

export function isWhopConfigured(
  billingPeriod: BillingPeriod = 'monthly'
): boolean {
  return Boolean(process.env.WHOP_API_KEY && getWhopPlanId(billingPeriod));
}

export function isWhopWebhookConfigured(): boolean {
  return Boolean(process.env.WHOP_API_KEY && process.env.WHOP_WEBHOOK_SECRET);
}

export function getWhopWebhookKey(): string | undefined {
  const secret = process.env.WHOP_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return undefined;
  }

  return Buffer.from(secret).toString('base64');
}

export function getWhopClient(): Whop {
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) {
    throw new Error('WHOP_API_KEY is not configured');
  }

  if (!whopClient) {
    whopClient = new Whop({
      apiKey: normalizeApiKey(apiKey),
      webhookKey: getWhopWebhookKey() ?? null,
    });
  }

  return whopClient;
}

export function normalizeWhopCheckoutUrl(purchaseUrl: string): string {
  return new URL(purchaseUrl, WHOP_CHECKOUT_ORIGIN).toString();
}
