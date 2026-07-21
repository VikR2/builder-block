import type { Whop as WhopTypes } from '@whop/sdk';
import {
  claimPaymentWebhookEvent,
  releasePaymentWebhookEvent,
  type PaymentWebhookEventMeta,
} from '@/lib/auth/db';
import { getWhopClient, getWhopWebhookKey, WHOP_PROVIDER } from './client';
import { eventTimestampToPaymentMeta, syncWhopMembership, syncWhopPayment } from './sync';

type WhopWebhookEvent = WhopTypes.UnwrapWebhookEvent;

export function constructWebhookEvent(body: string, headers: Record<string, string>): WhopWebhookEvent {
  const key = getWhopWebhookKey();
  if (!key) {
    throw new Error('WHOP_WEBHOOK_SECRET is not configured');
  }

  return getWhopClient().webhooks.unwrap(body, { headers, key });
}

export async function processWebhookEvent(event: WhopWebhookEvent): Promise<void> {
  const eventMeta: PaymentWebhookEventMeta = {
    provider: WHOP_PROVIDER,
    id: event.id,
    type: event.type,
    created: event.timestamp,
  };

  if (!claimPaymentWebhookEvent(eventMeta)) {
    console.log('Skipping duplicate Whop webhook event:', event.id);
    return;
  }

  try {
    const syncEventMeta = eventTimestampToPaymentMeta(event);

    switch (event.type) {
      case 'payment.succeeded':
        syncWhopPayment(event.data, syncEventMeta);
        break;
      case 'membership.activated':
      case 'membership.deactivated':
      case 'membership.cancel_at_period_end_changed':
        syncWhopMembership(event.data, syncEventMeta);
        break;
      default:
        console.log('Unhandled Whop webhook event type:', event.type);
    }
  } catch (error) {
    releasePaymentWebhookEvent(WHOP_PROVIDER, event.id);
    throw error;
  }
}
