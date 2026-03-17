import { NextRequest, NextResponse } from 'next/server';
import {
  validateToken,
  consumeToken,
  getUserById,
  updateUserEmailVerified,
  createSession,
} from '@/lib/auth';
import { getSafeRedirectPath } from '@/lib/auth/redirects';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
    }

    // Validate token
    const authToken = validateToken(token, 'magic_link');

    if (!authToken) {
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
    }

    // Get user
    const user = getUserById(authToken.user_id);

    if (!user) {
      return NextResponse.redirect(new URL('/login?error=user_not_found', request.url));
    }

    // Mark token as used
    consumeToken(token);

    // Mark email as verified (since they clicked the link in their email)
    if (user.email_verified === 0) {
      updateUserEmailVerified(user.id);
    }

    // Create session
    await createSession(user.id);

    // Redirect to home or intended destination
    const redirect = getSafeRedirectPath(searchParams.get('redirect'), '/');
    return NextResponse.redirect(new URL(redirect, request.url));
  } catch (error) {
    console.error('Magic link verify error:', error);
    return NextResponse.redirect(new URL('/login?error=verification_failed', request.url));
  }
}
