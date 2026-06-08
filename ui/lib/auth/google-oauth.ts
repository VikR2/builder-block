import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { type NextRequest, NextResponse } from 'next/server';
import {
  createUser,
  getUserByEmail,
  getUserByGoogleSubject,
  getUserById,
  linkUserToGoogle,
  updateUserEmailVerified,
  type User,
} from './db';
import { validateEmail } from './password';
import { getSafeRedirectPath } from './redirects';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_SCOPE = 'openid email profile';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

export const GOOGLE_OAUTH_STATE_COOKIE = 'tcm_google_oauth_state';
export const GOOGLE_OAUTH_NONCE_COOKIE = 'tcm_google_oauth_nonce';
export const GOOGLE_OAUTH_REDIRECT_COOKIE = 'tcm_google_oauth_redirect';

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

interface GoogleOAuthStart {
  authorizationUrl: URL;
  state: string;
  nonce: string;
  redirectPath: string;
}

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleOAuthProfile {
  subject: string;
  email: string;
}

export class GoogleOAuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new GoogleOAuthError(
      'google_not_configured',
      'Google OAuth client ID and secret are not configured.'
    );
  }

  return { clientId, clientSecret };
}

function getAppBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;
}

export function buildAppUrl(request: NextRequest, path: string): URL {
  return new URL(path, getAppBaseUrl(request));
}

function getGoogleRedirectUri(request: NextRequest): string {
  return buildAppUrl(request, '/api/auth/google/callback').toString();
}

function randomOAuthValue(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function buildGoogleOAuthStart(
  request: NextRequest,
  redirectCandidate: string | null
): GoogleOAuthStart {
  const config = getGoogleOAuthConfig();
  const state = randomOAuthValue();
  const nonce = randomOAuthValue();
  const redirectPath = getSafeRedirectPath(redirectCandidate, '/pricing');
  const authorizationUrl = new URL(GOOGLE_AUTH_URL);

  authorizationUrl.searchParams.set('client_id', config.clientId);
  authorizationUrl.searchParams.set('redirect_uri', getGoogleRedirectUri(request));
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', GOOGLE_SCOPE);
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('nonce', nonce);
  authorizationUrl.searchParams.set('prompt', 'select_account');

  return { authorizationUrl, state, nonce, redirectPath };
}

export function setGoogleOAuthCookies(
  response: NextResponse,
  start: Pick<GoogleOAuthStart, 'state' | 'nonce' | 'redirectPath'>
): void {
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    path: '/api/auth/google',
  };

  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, start.state, common);
  response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, start.nonce, common);
  response.cookies.set(GOOGLE_OAUTH_REDIRECT_COOKIE, start.redirectPath, common);
}

export function clearGoogleOAuthCookies(response: NextResponse): void {
  const common = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/api/auth/google',
  };

  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, '', common);
  response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, '', common);
  response.cookies.set(GOOGLE_OAUTH_REDIRECT_COOKIE, '', common);
}

export function buildLoginErrorRedirect(
  request: NextRequest,
  errorCode: string
): NextResponse {
  const url = buildAppUrl(request, '/login');
  url.searchParams.set('error', errorCode);
  const response = NextResponse.redirect(url);
  clearGoogleOAuthCookies(response);
  return response;
}

async function exchangeCodeForTokens(
  request: NextRequest,
  code: string
): Promise<GoogleTokenResponse> {
  const config = getGoogleOAuthConfig();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: getGoogleRedirectUri(request),
      grant_type: 'authorization_code',
    }),
  });

  const payload = (await response.json()) as GoogleTokenResponse;

  if (!response.ok) {
    throw new GoogleOAuthError(
      'google_token_exchange_failed',
      payload.error_description || payload.error || 'Google token exchange failed.'
    );
  }

  return payload;
}

export async function verifyGoogleOAuthCode(
  request: NextRequest,
  code: string,
  expectedNonce: string
): Promise<GoogleOAuthProfile> {
  const config = getGoogleOAuthConfig();
  const tokenResponse = await exchangeCodeForTokens(request, code);

  if (!tokenResponse.id_token) {
    throw new GoogleOAuthError('google_missing_id_token', 'Google did not return an ID token.');
  }

  const { payload } = await jwtVerify(tokenResponse.id_token, googleJwks, {
    audience: config.clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });

  if (payload.nonce !== expectedNonce) {
    throw new GoogleOAuthError('google_invalid_nonce', 'Google OAuth nonce did not match.');
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  const subject = typeof payload.sub === 'string' ? payload.sub : '';
  const emailError = validateEmail(email);

  if (!subject) {
    throw new GoogleOAuthError('google_missing_subject', 'Google did not return an account subject.');
  }

  if (emailError) {
    throw new GoogleOAuthError('google_missing_email', emailError);
  }

  if (!emailVerified) {
    throw new GoogleOAuthError('google_email_unverified', 'Google email address is not verified.');
  }

  return { subject, email };
}

export function getOrCreateGoogleUser(profile: GoogleOAuthProfile): User {
  const userBySubject = getUserByGoogleSubject(profile.subject);
  if (userBySubject) {
    if (userBySubject.email_verified === 0) {
      updateUserEmailVerified(userBySubject.id);
      return getUserById(userBySubject.id) || userBySubject;
    }

    return userBySubject;
  }

  let user = getUserByEmail(profile.email);

  if (!user) {
    user = createUser(profile.email, null);
  } else if (user.google_subject && user.google_subject !== profile.subject) {
    throw new GoogleOAuthError(
      'google_account_mismatch',
      'This email is already linked to a different Google account.'
    );
  }

  linkUserToGoogle(user.id, profile.subject);
  return getUserById(user.id) || {
    ...user,
    google_subject: profile.subject,
    email_verified: 1,
  };
}
