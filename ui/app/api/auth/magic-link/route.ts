import { NextRequest, NextResponse } from 'next/server';
import {
  getUserByEmail,
  createUser,
  createAuthToken,
  buildMagicLinkUrl,
  sendMagicLinkEmail,
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

    // Get or create user
    let user = getUserByEmail(email);

    if (!user) {
      // Create user without password (magic link only)
      user = createUser(email, null);
    }

    // Create magic link token
    const token = createAuthToken(user.id, 'magic_link');

    // Build URL and send email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const magicLinkUrl = buildMagicLinkUrl(token.token, baseUrl);
    const result = await sendMagicLinkEmail(email, magicLinkUrl);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Check your email for the sign-in link',
    });
  } catch (error) {
    console.error('Magic link error:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
