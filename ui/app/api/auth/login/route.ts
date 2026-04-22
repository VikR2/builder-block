import { NextRequest, NextResponse } from 'next/server';
import {
  getUserByEmail,
  verifyPassword,
  createSession,
  getActiveSubscriptionByUserId,
  getUserCreditBalance,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Get user
    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check password
    if (!user.password_hash) {
      return NextResponse.json(
        { error: 'Please use the magic link to sign in' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Create session
    await createSession(user.id);

    // Check premium status
    const hasManualPremium = user.manual_premium === 1;
    const subscription = getActiveSubscriptionByUserId(user.id);
    const isPremium = hasManualPremium || !!subscription;
    const creditBalance = getUserCreditBalance(user.id);
    const isAdmin = user.role === 'admin';

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isPremium,
        creditBalance,
        hasChatAccess: isAdmin || isPremium || creditBalance > 0,
        hasStripeSubscription: !!subscription,
        isAdmin,
        emailVerified: user.email_verified === 1,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login. Please try again.' },
      { status: 500 }
    );
  }
}
