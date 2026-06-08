import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthDb } from '@/lib/auth';
import { createUser, getUserByEmail, updateUserManualPremium, updateUserEmailVerified } from '@/lib/auth/db';
import { sendWelcomeEmail } from '@/lib/auth/email';
import { requireAdminApi } from '@/lib/security/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireAdminApi(request);
  if (!guard.ok) {
    return guard.response;
  }

  try {
    // Check admin authentication
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    const db = getAuthDb();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users';
    let countParams: string[] = [];

    if (search) {
      countQuery += ' WHERE email LIKE ?';
      countParams = [`%${search}%`];
    }

    const countResult = db.prepare(countQuery).get(...countParams) as { total: number };
    const total = countResult.total;

    // Get users with subscription info
    let query = `
      SELECT
        u.id,
        u.email,
        u.email_verified,
        u.role,
        u.manual_premium,
        u.created_at,
        u.updated_at,
        s.status as subscription_status,
        s.current_period_end as subscription_end
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trialing')
    `;

    let params: (string | number)[] = [];

    if (search) {
      query += ' WHERE u.email LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = db.prepare(query).all(...params) as Array<{
      id: number;
      email: string;
      email_verified: number;
      role: string;
      manual_premium: number;
      created_at: string;
      updated_at: string;
      subscription_status: string | null;
      subscription_end: string | null;
    }>;

    // Transform to API response
    const transformedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      emailVerified: u.email_verified === 1,
      role: u.role,
      manualPremium: u.manual_premium === 1,
      hasPaidSubscription: u.subscription_status === 'active' || u.subscription_status === 'trialing',
      subscriptionStatus: u.subscription_status,
      subscriptionEnd: u.subscription_end,
      isPremium: u.manual_premium === 1 || u.subscription_status === 'active' || u.subscription_status === 'trialing',
      createdAt: u.created_at,
      updatedAt: u.updated_at
    }));

    return NextResponse.json({
      users: transformedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin users list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Create a new user (admin only)
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { email, grantPremium, sendWelcome, role = 'user' } = body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (role !== 'user' && role !== 'admin') {
      return NextResponse.json({ error: 'Role must be user or admin' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    // Create user (no password - they'll use magic link)
    const newUser = createUser(email, null);

    // Mark email as verified since admin is creating the account
    updateUserEmailVerified(newUser.id);

    const db = getAuthDb();

    if (role === 'admin') {
      db.prepare(`
        UPDATE users
        SET role = 'admin', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newUser.id);
    }

    // Grant premium if requested
    if (grantPremium) {
      updateUserManualPremium(newUser.id, true);
    }

    // Send welcome email if requested
    let emailSent = false;
    let emailError: string | undefined;
    if (sendWelcome) {
      try {
        const result = await sendWelcomeEmail(email);
        emailSent = result.success;
        emailError = result.error;
      } catch (e) {
        emailError = e instanceof Error ? e.message : 'Failed to send email';
      }
    }

    // Fetch the complete user with updated fields
    const user = db.prepare(`
      SELECT
        u.id,
        u.email,
        u.email_verified,
        u.role,
        u.manual_premium,
        u.created_at,
        u.updated_at,
        s.status as subscription_status,
        s.current_period_end as subscription_end
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trialing')
      WHERE u.id = ?
    `).get(newUser.id) as {
      id: number;
      email: string;
      email_verified: number;
      role: string;
      manual_premium: number;
      created_at: string;
      updated_at: string;
      subscription_status: string | null;
      subscription_end: string | null;
    };
    db.close();

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified === 1,
        role: user.role,
        manualPremium: user.manual_premium === 1,
        hasPaidSubscription: false,
        subscriptionStatus: null,
        subscriptionEnd: null,
        isPremium: user.manual_premium === 1,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      emailSent,
      emailError
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
