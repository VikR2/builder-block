import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserById, deleteUser, getAuthDb } from '@/lib/auth/db';
import { getWhopClient, isWhopConfigured, WHOP_PROVIDER } from '@/lib/whop';

interface RouteContext {
  params: Promise<{ id: string }>;
}
import { requireAdminApi } from '@/lib/security/api';

// DELETE /api/admin/users/[id] - Delete a user (admin only)
export async function DELETE(request: NextRequest, context: RouteContext) {
  const guard = await requireAdminApi(request);
  if (!guard.ok) {
    return guard.response;
  }

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

    const db = getAuthDb();
    const activeSubscriptions = db.prepare(`
      SELECT stripe_subscription_id, provider
      FROM subscriptions
      WHERE user_id = ? AND status IN ('active', 'trialing', 'past_due', 'unpaid', 'canceling')
    `).all(userId) as Array<{
      stripe_subscription_id: string;
      provider: string | null;
    }>;
    db.close();

    const whopSubscriptions = activeSubscriptions.filter(subscription =>
      subscription.provider === WHOP_PROVIDER
    );

    if (whopSubscriptions.length > 0) {
      if (!isWhopConfigured()) {
        return NextResponse.json(
          { error: 'Whop is not configured; cannot safely delete a Whop subscriber' },
          { status: 500 }
        );
      }

      for (const subscription of whopSubscriptions) {
        await getWhopClient().memberships.cancel(subscription.stripe_subscription_id, {
          cancellation_mode: 'immediate',
        });
      }
    }

    // Delete the local user after any billable Whop memberships are canceled
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
