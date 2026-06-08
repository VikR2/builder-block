import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import {
  getActiveSubscriptionByUserId,
  updateSubscription,
} from '@/lib/auth/db';
import { enforceRateLimit, requireSameOrigin } from '@/lib/security/api';
import { getWhopClient, isWhopConfigured, WHOP_PROVIDER } from '@/lib/whop';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimitError = enforceRateLimit(request, {
    scope: 'whop-portal',
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    if (!isWhopConfigured()) {
      return NextResponse.json(
        { error: 'Payment system is not configured' },
        { status: 500 }
      );
    }

    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'You must be logged in' },
        { status: 401 }
      );
    }

    const subscription = getActiveSubscriptionByUserId(user.id);
    if (!subscription || subscription.provider !== WHOP_PROVIDER) {
      return NextResponse.json(
        { error: 'No Whop-managed subscription found' },
        { status: 400 }
      );
    }

    if (subscription.provider_manage_url) {
      return NextResponse.json({ url: subscription.provider_manage_url });
    }

    const membership = await getWhopClient().memberships.retrieve(subscription.stripe_subscription_id);
    if (!membership.manage_url) {
      return NextResponse.json(
        { error: 'No billing portal is available for this subscription' },
        { status: 404 }
      );
    }

    updateSubscription(
      membership.id,
      membership.status,
      subscription.current_period_start,
      subscription.current_period_end,
      membership.cancel_at_period_end,
      undefined,
      WHOP_PROVIDER,
      subscription.provider_latest_payment_id,
      membership.manage_url
    );

    return NextResponse.json({ url: membership.manage_url });
  } catch (error) {
    console.error('Whop portal error:', error);
    return NextResponse.json(
      { error: 'Failed to open billing portal' },
      { status: 500 }
    );
  }
}
