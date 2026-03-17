import crypto from 'crypto';
import {
  createAuthToken as dbCreateAuthToken,
  getAuthTokenByToken,
  markAuthTokenUsed,
  deleteExpiredAuthTokens,
  type AuthToken
} from './db';

const TOKEN_EXPIRY_HOURS = {
  magic_link: 1,        // 1 hour
  password_reset: 1,    // 1 hour
  email_verify: 24,     // 24 hours
} as const;

type TokenType = keyof typeof TOKEN_EXPIRY_HOURS;

/**
 * Generate a secure random token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new auth token
 */
export function createAuthToken(userId: number, type: TokenType): AuthToken {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS[type]);

  return dbCreateAuthToken(userId, token, type, expiresAt);
}

/**
 * Validate and consume a token
 * Returns the token if valid, null if invalid/expired/already used
 */
export function validateToken(token: string, expectedType: TokenType): AuthToken | null {
  const authToken = getAuthTokenByToken(token);

  if (!authToken) {
    return null;
  }

  // Check type
  if (authToken.type !== expectedType) {
    return null;
  }

  // Check if already used
  if (authToken.used_at) {
    return null;
  }

  // Check if expired
  if (new Date(authToken.expires_at) < new Date()) {
    return null;
  }

  return authToken;
}

/**
 * Mark a token as used (consumed)
 */
export function consumeToken(token: string): void {
  markAuthTokenUsed(token);
}

/**
 * Clean up expired and used tokens
 */
export function cleanupTokens(): void {
  deleteExpiredAuthTokens();
}

/**
 * Build magic link URL
 */
export function buildMagicLinkUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`;
}

/**
 * Build password reset URL
 */
export function buildPasswordResetUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Build email verification URL
 */
export function buildEmailVerifyUrl(token: string, baseUrl: string): string {
  return `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}
