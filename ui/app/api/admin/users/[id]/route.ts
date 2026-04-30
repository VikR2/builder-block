import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserById, deleteUser } from '@/lib/auth/db';
import { stripe, isStripeConfigured } from '@/lib/stripe';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// DELETE /api/admin/users/[id] - Delete a user (admin only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // Check admin authentication
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

    // Prevent self-deletion
    if (userId === currentUser.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Check if user exists
    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent deleting other admins (safety measure)
    if (user.role === 'admin') {
      return NextResponse.json({ error: 'Cannot delete admin accounts' }, { status: 400 });
    }

    if (user.stripe_customer_id) {
      if (!isStripeConfigured()) {
        return NextResponse.json(
          { error: 'Stripe is not configured; cannot safely delete a Stripe subscriber' },
          { status: 500 }
        );
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        status: 'all',
        limit: 10,
      });

      const activeSubscriptions = subscriptions.data.filter(subscription =>
        ['active', 'trialing', 'past_due', 'unpaid'].includes(subscription.status)
      );

      for (const subscription of activeSubscriptions) {
        await stripe.subscriptions.cancel(subscription.id);
      }
    }

    // Delete the local user after any billable Stripe subscriptions are canceled
    const deleted = deleteUser(userId);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedUserId: userId });
  } catch (error) {
    console.error('Admin delete user error:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
