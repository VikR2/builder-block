import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { getSafeRedirectPath } from '@/lib/auth/redirects';
import {
  buildLoginErrorRedirect,
  buildAppUrl,
  clearGoogleOAuthCookies,
  getOrCreateGoogleUser,
  GOOGLE_OAUTH_NONCE_COOKIE,
  GOOGLE_OAUTH_REDIRECT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GoogleOAuthError,
  verifyGoogleOAuthCode,
} from '@/lib/auth/google-oauth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get('error');
  if (error) {
    return buildLoginErrorRedirect(request, 'google_denied');
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const expectedNonce = request.cookies.get(GOOGLE_OAUTH_NONCE_COOKIE)?.value;
  const redirectPath = getSafeRedirectPath(
    request.cookies.get(GOOGLE_OAUTH_REDIRECT_COOKIE)?.value,
    '/pricing'
  );

  if (!code || !state || !expectedState || !expectedNonce || state !== expectedState) {
    return buildLoginErrorRedirect(request, 'google_invalid_state');
  }

  try {
    const profile = await verifyGoogleOAuthCode(request, code, expectedNonce);
    const user = getOrCreateGoogleUser(profile);
    await createSession(user.id);

    const response = NextResponse.redirect(buildAppUrl(request, redirectPath));
    clearGoogleOAuthCookies(response);
    return response;
  } catch (error) {
    if (error instanceof GoogleOAuthError) {
      return buildLoginErrorRedirect(request, error.code);
    }

    console.error('Google OAuth callback error:', error);
    return buildLoginErrorRedirect(request, 'google_failed');
  }
}
