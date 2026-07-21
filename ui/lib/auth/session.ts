import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import {
  createSession as dbCreateSession,
  getSessionById,
  deleteSession as dbDeleteSession,
  getUserById,
  cleanExpiredSessions,
  type User,
  type Session
} from './db';

const SESSION_COOKIE_NAME = 'tcm_session';
const SESSION_DURATION_DAYS = 30;

export interface SessionUser {
  id: number;
  email: string;
  role: 'user' | 'admin';
  manual_premium: number;
  email_verified: number;
  stripe_customer_id: string | null;
}

/**
 * Create a new session for a user and set the cookie
 */
export async function createSession(userId: number): Promise<string> {
  const sessionId = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS);

  // Create session in database
  dbCreateSession(sessionId, userId, expiresAt);

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  });

  return sessionId;
}

/**
 * Get the current session from cookie
 */
export async function getSession(): Promise<(Session & { user: SessionUser }) | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  const session = getSessionById(sessionId);

  if (!session) {
    return null;
  }

  // Check if session is expired
  if (new Date(session.expires_at) < new Date()) {
    dbDeleteSession(sessionId);
    return null;
  }

  // Get user
  const user = getUserById(session.user_id);

  if (!user) {
    dbDeleteSession(sessionId);
    return null;
  }

  return {
    ...session,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      manual_premium: user.manual_premium,
      email_verified: user.email_verified,
      stripe_customer_id: user.stripe_customer_id,
    },
  };
}

/**
 * Delete the current session
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    dbDeleteSession(sessionId);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Clean up expired sessions (call periodically)
 */
export function cleanupSessions(): void {
  cleanExpiredSessions();
}
