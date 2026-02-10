import { NextRequest, NextResponse } from 'next/server';
import {
  validateToken,
  consumeToken,
  updateUserEmailVerified,
} from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/login?error=missing_token', request.url));
    }

    // Validate token
    const authToken = validateToken(token, 'email_verify');

    if (!authToken) {
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
    }

    // Mark email as verified
    updateUserEmailVerified(authToken.user_id);

    // Mark token as used
    consumeToken(token);

    // Redirect to login with success message
    return NextResponse.redirect(new URL('/login?verified=true', request.url));
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.redirect(new URL('/login?error=verification_failed', request.url));
  }
}
