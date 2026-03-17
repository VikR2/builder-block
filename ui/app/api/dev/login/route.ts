import { NextResponse } from 'next/server';
import { createSession } from '@/lib/auth/session';
import { getUserByEmail, createUser, updateUserManualPremium } from '@/lib/auth/db';
import { hashPassword } from '@/lib/auth/password';

// Dev-only auto-login endpoint
// Creates a test user if needed and logs them in automatically

const DEV_USER_EMAIL = 'dev@test.com';
const DEV_USER_PASSWORD = 'devpassword123';

export async function POST() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 }
    );
  }

  try {
    // Get or create dev user
    let user = getUserByEmail(DEV_USER_EMAIL);

    if (!user) {
      // Create dev user with premium access
      const passwordHash = await hashPassword(DEV_USER_PASSWORD);
      user = createUser(DEV_USER_EMAIL, passwordHash);

      // Make dev user premium for testing
      updateUserManualPremium(user.id, true);
      console.log('[DEV] Created premium test user:', DEV_USER_EMAIL);
    }

    // Create session
    await createSession(user.id);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isPremium: true,
        hasStripeSubscription: false,
        isAdmin: user.role === 'admin',
        emailVerified: true,
      },
      message: 'Dev login successful',
    });
  } catch (error) {
    console.error('[DEV] Auto-login error:', error);
    return NextResponse.json(
      { error: 'Dev login failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Info endpoint
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  return NextResponse.json({
    endpoint: '/api/dev/login',
    method: 'POST',
    description: 'Auto-login as dev user for testing',
    devUser: DEV_USER_EMAIL,
  });
}
