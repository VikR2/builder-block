import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthDb } from '@/lib/auth';
import { stripe, isStripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    if (!isStripeConfigured()) {
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
        SELECT id, email, stripe_customer_id
        FROM users
        WHERE id = ?
      `).get(userId) as {
        id: number;
        email: string;
        stripe_customer_id: string | null;
      } | undefined;

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!user.stripe_customer_id) {
        return NextResponse.json(
          { error: 'User does not have a Stripe customer record' },
          { status: 400 }
        );
      }

      const subscription = db.prepare(`
        SELECT stripe_subscription_id
        FROM subscriptions
        WHERE user_id = ? AND status IN ('active', 'trialing', 'past_due')
        ORDER BY created_at DESC
        LIMIT 1
      `).get(userId) as { stripe_subscription_id: string } | undefined;

      if (!subscription) {
        return NextResponse.json(
          { error: 'User does not have an active Stripe subscription' },
          { status: 400 }
        );
      }

      const invoices = await stripe.invoices.list({
        customer: user.stripe_customer_id,
        subscription: subscription.stripe_subscription_id,
        limit: 10,
      });

      const paidInvoice = invoices.data.find(invoice => invoice.status === 'paid' && invoice.amount_paid > 0);

      if (!paidInvoice) {
        return NextResponse.json(
          { error: 'No paid invoice found to refund' },
          { status: 400 }
        );
      }

      const paymentIntentId =
        typeof paidInvoice.payment_intent === 'string'
          ? paidInvoice.payment_intent
          : paidInvoice.payment_intent?.id;

      if (!paymentIntentId) {
        return NextResponse.json(
          { error: 'Paid invoice does not have a refundable payment intent' },
          { status: 400 }
        );
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const chargeId =
        typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id;

      if (!chargeId) {
        return NextResponse.json(
          { error: 'Payment intent does not have a refundable charge' },
          { status: 400 }
        );
      }

      const charge = await stripe.charges.retrieve(chargeId);
      const refundableAmount = charge.amount - charge.amount_refunded;

      if (!charge.paid || refundableAmount <= 0) {
        return NextResponse.json(
          { error: 'Latest paid charge has already been fully refunded' },
          { status: 400 }
        );
      }

      const refund = await stripe.refunds.create({
        charge: charge.id,
        amount: refundableAmount,
        metadata: {
          userId: user.id.toString(),
          adminUserId: currentUser.id.toString(),
          invoiceId: paidInvoice.id,
        },
      });

      return NextResponse.json({
        success: true,
        refund: {
          id: refund.id,
          status: refund.status,
          amount: refund.amount,
          currency: refund.currency,
          chargeId: charge.id,
          invoiceId: paidInvoice.id,
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
