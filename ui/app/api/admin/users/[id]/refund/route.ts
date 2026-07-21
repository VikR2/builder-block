import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthDb } from '@/lib/auth';
import { requireAdminApi } from '@/lib/security/api';
import { getWhopClient, isWhopConfigured, WHOP_PROVIDER } from '@/lib/whop';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function findLatestRefundablePaymentId(
  userEmail: string,
  membershipId: string
): Promise<string | null> {
  const companyId = process.env.WHOP_COMPANY_ID;
  if (!companyId) {
    return null;
  }

  const queries = [membershipId, userEmail];
  for (const query of queries) {
    for await (const payment of getWhopClient().payments.list({
      company_id: companyId,
      query,
      statuses: ['paid'],
      order: 'paid_at',
      direction: 'desc',
      first: 10,
    })) {
      if (payment.refundable) {
        return payment.id;
      }
    }
  }

  return null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = await requireAdminApi(request);
  if (!guard.ok) {
    return guard.response;
  }

  try {
    if (!isWhopConfigured()) {
      return NextResponse.json(
        { error: 'Payment system is not configured' },
        { status: 500 }
      );
    }

    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!currentUser.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const db = getAuthDb();

    try {
      const user = db.prepare(`
        SELECT id, email
        FROM users
        WHERE id = ?
      `).get(userId) as {
        id: number;
        email: string;
      } | undefined;

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const subscription = db.prepare(`
        SELECT stripe_subscription_id, provider, provider_latest_payment_id
        FROM subscriptions
        WHERE user_id = ? AND status IN ('active', 'trialing', 'past_due')
        ORDER BY created_at DESC
        LIMIT 1
      `).get(userId) as {
        stripe_subscription_id: string;
        provider: string | null;
        provider_latest_payment_id: string | null;
      } | undefined;

      if (!subscription) {
        return NextResponse.json(
          { error: 'User does not have an active paid subscription' },
          { status: 400 }
        );
      }

      if (subscription.provider !== WHOP_PROVIDER) {
        return NextResponse.json(
          { error: 'Subscription is not managed through Whop' },
          { status: 400 }
        );
      }

      const paymentId =
        subscription.provider_latest_payment_id ||
        await findLatestRefundablePaymentId(user.email, subscription.stripe_subscription_id);

      if (!paymentId) {
        return NextResponse.json(
          { error: 'No Whop payment found to refund' },
          { status: 400 }
        );
      }

      const payment = await getWhopClient().payments.retrieve(paymentId);
      const refundableAmount = Math.max(
        (payment.total ?? payment.settlement_amount ?? 0) - (payment.refunded_amount ?? 0),
        0
      );

      if (!payment.refundable || refundableAmount <= 0) {
        return NextResponse.json(
          { error: 'Latest paid Whop payment has already been fully refunded' },
          { status: 400 }
        );
      }

      const refund = await getWhopClient().payments.refund(paymentId);

      return NextResponse.json({
        success: true,
        refund: {
          id: refund.id,
          status: refund.status,
          amount: refundableAmount,
          currency: refund.currency,
          paymentId,
        },
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Admin refund error:', error);
    return NextResponse.json(
      { error: 'Failed to refund user payment' },
      { status: 500 }
    );
  }
}
