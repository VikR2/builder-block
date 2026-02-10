import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthDb } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check admin authentication
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id, 10);

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const { manualPremium } = body;

    if (typeof manualPremium !== 'boolean') {
      return NextResponse.json({ error: 'manualPremium must be a boolean' }, { status: 400 });
    }

    const db = getAuthDb();

    // Check user exists
    const existingUser = db.prepare('SELECT id, email, manual_premium FROM users WHERE id = ?').get(userId) as {
      id: number;
      email: string;
      manual_premium: number;
    } | undefined;

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update manual premium status
    db.prepare(`
      UPDATE users
      SET manual_premium = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(manualPremium ? 1 : 0, userId);

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: existingUser.email,
        manualPremium
      }
    });
  } catch (error) {
    console.error('Admin toggle premium error:', error);
    return NextResponse.json(
      { error: 'Failed to update premium status' },
      { status: 500 }
    );
  }
}
