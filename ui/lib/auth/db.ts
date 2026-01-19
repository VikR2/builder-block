import Database from 'better-sqlite3';
import { join } from 'path';

// Database path (relative to ui folder)
const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');

// Get writable database connection
export function getAuthDb() {
  return new Database(DB_PATH);
}

// User types
export interface User {
  id: number;
  email: string;
  email_verified: number;
  password_hash: string | null;
  role: 'user' | 'admin';
  manual_premium: number;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export interface Subscription {
  id: number;
  user_id: number;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
}

export interface AuthToken {
  id: number;
  user_id: number;
  token: string;
  type: 'password_reset' | 'magic_link' | 'email_verify';
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// User queries
export function createUser(email: string, passwordHash: string | null): User {
  const db = getAuthDb();
  try {
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash)
      VALUES (?, ?)
    `);
    const result = stmt.run(email.toLowerCase().trim(), passwordHash);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
    return user;
  } finally {
    db.close();
  }
}

export function getUserByEmail(email: string): User | undefined {
  const db = getAuthDb();
  try {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as User | undefined;
  } finally {
    db.close();
  }
}

export function getUserById(id: number): User | undefined {
  const db = getAuthDb();
  try {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  } finally {
    db.close();
  }
}

export function updateUserPassword(userId: number, passwordHash: string): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, userId);
  } finally {
    db.close();
  }
}

export function updateUserEmailVerified(userId: number): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE users
      SET email_verified = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);
  } finally {
    db.close();
  }
}

export function updateUserStripeCustomerId(userId: number, stripeCustomerId: string): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE users
      SET stripe_customer_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stripeCustomerId, userId);
  } finally {
    db.close();
  }
}

export function updateUserManualPremium(userId: number, manualPremium: boolean): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE users
      SET manual_premium = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(manualPremium ? 1 : 0, userId);
  } finally {
    db.close();
  }
}

export function getUserByStripeCustomerId(stripeCustomerId: string): User | undefined {
  const db = getAuthDb();
  try {
    return db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?').get(stripeCustomerId) as User | undefined;
  } finally {
    db.close();
  }
}

// Session queries
export function createSession(sessionId: string, userId: number, expiresAt: Date): Session {
  const db = getAuthDb();
  try {
    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(sessionId, userId, expiresAt.toISOString());
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session;
  } finally {
    db.close();
  }
}

export function getSessionById(sessionId: string): Session | undefined {
  const db = getAuthDb();
  try {
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session | undefined;
  } finally {
    db.close();
  }
}

export function deleteSession(sessionId: string): void {
  const db = getAuthDb();
  try {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  } finally {
    db.close();
  }
}

export function deleteUserSessions(userId: number): void {
  const db = getAuthDb();
  try {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  } finally {
    db.close();
  }
}

export function cleanExpiredSessions(): void {
  const db = getAuthDb();
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP').run();
  } finally {
    db.close();
  }
}

// Subscription queries
export function createSubscription(
  userId: number,
  stripeSubscriptionId: string,
  stripePriceId: string,
  status: string,
  currentPeriodStart: string | null,
  currentPeriodEnd: string | null
): Subscription {
  const db = getAuthDb();
  try {
    db.prepare(`
      INSERT INTO subscriptions (user_id, stripe_subscription_id, stripe_price_id, status, current_period_start, current_period_end)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, stripeSubscriptionId, stripePriceId, status, currentPeriodStart, currentPeriodEnd);
    return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSubscriptionId) as Subscription;
  } finally {
    db.close();
  }
}

export function getSubscriptionByStripeId(stripeSubscriptionId: string): Subscription | undefined {
  const db = getAuthDb();
  try {
    return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSubscriptionId) as Subscription | undefined;
  } finally {
    db.close();
  }
}

export function getActiveSubscriptionByUserId(userId: number): Subscription | undefined {
  const db = getAuthDb();
  try {
    return db.prepare(`
      SELECT * FROM subscriptions
      WHERE user_id = ? AND status IN ('active', 'trialing')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId) as Subscription | undefined;
  } finally {
    db.close();
  }
}

export function updateSubscription(
  stripeSubscriptionId: string,
  status: string,
  currentPeriodStart: string | null,
  currentPeriodEnd: string | null,
  cancelAtPeriodEnd: boolean
): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE subscriptions
      SET status = ?, current_period_start = ?, current_period_end = ?,
          cancel_at_period_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE stripe_subscription_id = ?
    `).run(status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd ? 1 : 0, stripeSubscriptionId);
  } finally {
    db.close();
  }
}

// Auth token queries
export function createAuthToken(userId: number, token: string, type: string, expiresAt: Date): AuthToken {
  const db = getAuthDb();
  try {
    db.prepare(`
      INSERT INTO auth_tokens (user_id, token, type, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, token, type, expiresAt.toISOString());
    return db.prepare('SELECT * FROM auth_tokens WHERE token = ?').get(token) as AuthToken;
  } finally {
    db.close();
  }
}

export function getAuthTokenByToken(token: string): AuthToken | undefined {
  const db = getAuthDb();
  try {
    return db.prepare('SELECT * FROM auth_tokens WHERE token = ?').get(token) as AuthToken | undefined;
  } finally {
    db.close();
  }
}

export function markAuthTokenUsed(token: string): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE auth_tokens
      SET used_at = CURRENT_TIMESTAMP
      WHERE token = ?
    `).run(token);
  } finally {
    db.close();
  }
}

export function deleteExpiredAuthTokens(): void {
  const db = getAuthDb();
  try {
    db.prepare('DELETE FROM auth_tokens WHERE expires_at < CURRENT_TIMESTAMP OR used_at IS NOT NULL').run();
  } finally {
    db.close();
  }
}

// Admin queries
export interface UserWithSubscription extends User {
  subscription_status: string | null;
  current_period_end: string | null;
}

export function getAllUsers(limit: number = 50, offset: number = 0): UserWithSubscription[] {
  const db = getAuthDb();
  try {
    return db.prepare(`
      SELECT u.*, s.status as subscription_status, s.current_period_end
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trialing')
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as UserWithSubscription[];
  } finally {
    db.close();
  }
}

export function searchUsers(query: string, limit: number = 50): UserWithSubscription[] {
  const db = getAuthDb();
  try {
    return db.prepare(`
      SELECT u.*, s.status as subscription_status, s.current_period_end
      FROM users u
      LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trialing')
      WHERE u.email LIKE ?
      ORDER BY u.created_at DESC
      LIMIT ?
    `).all(`%${query}%`, limit) as UserWithSubscription[];
  } finally {
    db.close();
  }
}

export function getUserCount(): number {
  const db = getAuthDb();
  try {
    const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return result.count;
  } finally {
    db.close();
  }
}

export function deleteUser(userId: number): boolean {
  const db = getAuthDb();
  try {
    // Sessions, subscriptions, and auth_tokens are deleted via CASCADE
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}
