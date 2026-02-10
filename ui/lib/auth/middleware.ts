import { redirect } from 'next/navigation';
import { getSession, type SessionUser } from './session';
import { getActiveSubscriptionByUserId } from './db';

export interface AuthUser {
  id: number;
  email: string;
  role: 'user' | 'admin';
  isPremium: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
}

/**
 * Get the current authenticated user with premium status
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const { user } = session;

  // Check if user has premium access
  // Premium = manual_premium OR active Stripe subscription
  const hasManualPremium = user.manual_premium === 1;
  const subscription = getActiveSubscriptionByUserId(user.id);
  const hasActiveSubscription = subscription !== undefined;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isPremium: hasManualPremium || hasActiveSubscription,
    isAdmin: user.role === 'admin',
    emailVerified: user.email_verified === 1,
  };
}

/**
 * Require authentication - redirects to login if not authenticated
 */
export async function requireAuth(redirectUrl?: string): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    const loginUrl = redirectUrl
      ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
      : '/login';
    redirect(loginUrl);
  }

  return user;
}

/**
 * Require premium access - redirects to pricing if not premium
 */
export async function requirePremium(redirectUrl?: string): Promise<AuthUser> {
  const user = await requireAuth(redirectUrl);

  if (!user.isPremium) {
    redirect('/pricing');
  }

  return user;
}

/**
 * Require admin access - redirects to home if not admin
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();

  if (!user.isAdmin) {
    redirect('/');
  }

  return user;
}

/**
 * Check if user has premium access (for API routes)
 */
export async function checkPremium(): Promise<{ user: AuthUser | null; isPremium: boolean }> {
  const user = await getCurrentUser();

  return {
    user,
    isPremium: user?.isPremium ?? false,
  };
}

/**
 * Check if user is admin (for API routes)
 */
export async function checkAdmin(): Promise<{ user: AuthUser | null; isAdmin: boolean }> {
  const user = await getCurrentUser();

  return {
    user,
    isAdmin: user?.isAdmin ?? false,
  };
}
