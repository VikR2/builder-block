import { NextRequest, NextResponse } from 'next/server';
import {
  buildGoogleOAuthStart,
  buildLoginErrorRedirect,
  setGoogleOAuthCookies,
  GoogleOAuthError,
} from '@/lib/auth/google-oauth';
import { enforceRateLimit } from '@/lib/security/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const rateLimitError = enforceRateLimit(request, {
    scope: 'auth-google-start',
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const start = buildGoogleOAuthStart(request, request.nextUrl.searchParams.get('redirect'));
    const response = NextResponse.redirect(start.authorizationUrl);
    setGoogleOAuthCookies(response, start);
    return response;
  } catch (error) {
    if (error instanceof GoogleOAuthError) {
      return buildLoginErrorRedirect(request, error.code);
    }

    console.error('Google OAuth start error:', error);
    return buildLoginErrorRedirect(request, 'google_failed');
  }
}
