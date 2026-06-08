import Whop from '@whop/sdk';

export const WHOP_PROVIDER = 'whop';
const WHOP_CHECKOUT_ORIGIN = 'https://whop.com';

let whopClient: Whop | null = null;

function normalizeApiKey(apiKey: string): string {
  return apiKey.replace(/^Bearer\s+/i, '').trim();
}

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function isWhopConfigured(): boolean {
  return Boolean(process.env.WHOP_API_KEY && process.env.WHOP_PLAN_ID);
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
