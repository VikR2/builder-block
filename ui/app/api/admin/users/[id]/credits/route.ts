import { NextRequest, NextResponse } from 'next/server';
import {
  getCurrentUser,
  getUserById,
  getUserCreditAccount,
  getUserCreditTransactions,
  grantUserCredits,
} from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const userId = parseInt(id, 10);

    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      userId,
      creditAccount: getUserCreditAccount(userId),
      recentTransactions: getUserCreditTransactions(userId, 25),
    });
  } catch (error) {
    console.error('Admin user credits GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user credits' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const userId = parseInt(id, 10);

    if (Number.isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const amount = Number.parseInt(String(body.amount ?? ''), 10);
    const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim()
      : 'admin_grant';

    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'amount must be a positive integer' },
        { status: 400 }
      );
    }

    const account = grantUserCredits(userId, amount, reason, {
      grantedByUserId: currentUser.id
    });

    return NextResponse.json({
      success: true,
      creditAccount: account,
    });
  } catch (error) {
    console.error('Admin user credits POST error:', error);
    return NextResponse.json(
      { error: 'Failed to grant user credits' },
      { status: 500 }
    );
  }
}
