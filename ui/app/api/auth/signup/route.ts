import { NextRequest, NextResponse } from 'next/server';
import {
  createUser,
  getUserByEmail,
  hashPassword,
  validatePassword,
  validateEmail,
  createSession,
  createAuthToken,
  buildEmailVerifyUrl,
  sendEmailVerificationEmail,
} from '@/lib/auth';
import { enforceRateLimit } from '@/lib/security/api';

export async function POST(request: NextRequest) {
  const rateLimitError = enforceRateLimit(request, {
    scope: 'auth-signup',
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate email
    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = createUser(email, passwordHash);

    // Create session
    await createSession(user.id);

    // Create verification token and send email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const token = createAuthToken(user.id, 'email_verify');
    const verifyUrl = buildEmailVerifyUrl(token.token, baseUrl);
    await sendEmailVerificationEmail(email, verifyUrl);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isPremium: false,
        creditBalance: 0,
        hasChatAccess: false,
        hasPaidSubscription: false,
        isAdmin: false,
        emailVerified: false,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'An error occurred during signup. Please try again.' },
      { status: 500 }
    );
  }
}
