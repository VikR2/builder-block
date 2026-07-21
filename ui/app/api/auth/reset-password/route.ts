import { NextRequest, NextResponse } from 'next/server';
import {
  getUserByEmail,
  createAuthToken,
  buildPasswordResetUrl,
  sendPasswordResetEmail,
  validateEmail,
} from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }

    // Get user (don't reveal if user exists or not)
    const user = getUserByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'If an account exists, you will receive a password reset email',
      });
    }

    // Create reset token
    const token = createAuthToken(user.id, 'password_reset');

    // Build URL and send email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetUrl = buildPasswordResetUrl(token.token, baseUrl);
    await sendPasswordResetEmail(email, resetUrl);

    return NextResponse.json({
      success: true,
      message: 'If an account exists, you will receive a password reset email',
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
