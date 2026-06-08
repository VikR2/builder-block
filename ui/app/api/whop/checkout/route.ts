import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserById } from '@/lib/auth/db';
import { enforceRateLimit, requireSameOrigin } from '@/lib/security/api';
import { createCheckoutSession, isWhopConfigured } from '@/lib/whop';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) {
    return originError;
  }

  const rateLimitError = enforceRateLimit(request, {
    scope: 'whop-checkout',
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

    const authUser = await getCurrentUser();

    if (!authUser) {
      return NextResponse.json(
        { error: 'You must be logged in to subscribe' },
        { status: 401 }
      );
    }

    const user = getUserById(authUser.id);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (authUser.isPremium) {
      return NextResponse.json(
        { error: 'You already have an active subscription' },
        { status: 400 }
      );
    }

    const checkoutUrl = await createCheckoutSession({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error('Whop checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
