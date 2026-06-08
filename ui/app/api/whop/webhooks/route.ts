import { NextRequest, NextResponse } from 'next/server';
import { constructWebhookEvent, processWebhookEvent } from '@/lib/whop';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headers = Object.fromEntries(request.headers.entries());

    let event;
    try {
      event = constructWebhookEvent(body, headers);
    } catch (error) {
      console.error('Whop webhook signature verification failed:', error);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    await processWebhookEvent(event);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Whop webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
