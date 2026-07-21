import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Database path (relative to ui folder)
const DB_PATH = join(process.cwd(), '..', 'data', 'builder.db');
const MIGRATIONS_PATH = join(process.cwd(), '..', 'data', 'migrations');
let authTablesEnsured = false;

function getRawAuthDb() {
  return new Database(DB_PATH);
}

function runMigrationIfExists(db: ReturnType<typeof getRawAuthDb>, filename: string) {
  const migrationPath = join(MIGRATIONS_PATH, filename);
  if (existsSync(migrationPath)) {
    db.exec(readFileSync(migrationPath, 'utf-8'));
  }
}

function ensureColumn(
  db: ReturnType<typeof getRawAuthDb>,
  tableName: string,
  columnName: string,
  definition: string
) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

// Get writable database connection
export function getAuthDb() {
  ensureAuthTables();
  return getRawAuthDb();
}

export function ensureAuthTables() {
  if (authTablesEnsured) {
    return;
  }

  const db = getRawAuthDb();

  try {
    runMigrationIfExists(db, '020_add_auth_tables.sql');
    runMigrationIfExists(db, '021_add_user_credits.sql');
    runMigrationIfExists(db, '022_add_stripe_webhook_events.sql');
    runMigrationIfExists(db, '043_add_whop_payment_metadata.sql');

    ensureColumn(db, 'subscriptions', 'last_stripe_event_created', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'subscriptions', 'last_stripe_event_id', 'TEXT');
    ensureColumn(db, 'subscriptions', 'last_stripe_event_type', 'TEXT');
    ensureColumn(db, 'subscriptions', 'provider', "TEXT DEFAULT 'legacy'");
    ensureColumn(db, 'subscriptions', 'provider_latest_payment_id', 'TEXT');
    ensureColumn(db, 'subscriptions', 'provider_manage_url', 'TEXT');
    ensureColumn(db, 'users', 'google_subject', 'TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_subject ON users(google_subject) WHERE google_subject IS NOT NULL');

    authTablesEnsured = true;
  } finally {
    db.close();
  }
}

// User types
export interface User {
  id: number;
  email: string;
  email_verified: number;
  password_hash: string | null;
  google_subject: string | null;
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
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  last_stripe_event_created: number | null;
  last_stripe_event_id: string | null;
  last_stripe_event_type: string | null;
  provider: string | null;
  provider_latest_payment_id: string | null;
  provider_manage_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCreditAccount {
  user_id: number;
  balance_credits: number;
  created_at: string;
  updated_at: string;
}

export interface UserCreditTransaction {
  id: number;
  user_id: number;
  delta_credits: number;
  reason: string;
  metadata_json: string | null;
  balance_after: number;
  created_at: string;
}

export interface CreditSeedOptions {
  amount: number;
  onlyVerified?: boolean;
  excludePremium?: boolean;
  onlyZeroBalance?: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentSyncEventMeta {
  id: string;
  type: string;
  created: number;
}

export interface PaymentWebhookEventMeta {
  provider: string;
  id: string;
  type: string;
  created: string;
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

export function getUserByGoogleSubject(googleSubject: string): User | undefined {
  const db = getAuthDb();
  try {
    return db.prepare('SELECT * FROM users WHERE google_subject = ?').get(googleSubject) as User | undefined;
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

export function linkUserToGoogle(userId: number, googleSubject: string): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE users
      SET google_subject = ?, email_verified = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(googleSubject, userId);
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

export function promoteUserToAdminOwner(userId: number): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE users
      SET role = 'admin',
          manual_premium = 1,
          email_verified = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);
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
  currentPeriodEnd: string | null,
  eventMeta?: PaymentSyncEventMeta,
  provider: string = 'legacy',
  providerLatestPaymentId: string | null = null,
  providerManageUrl: string | null = null
): Subscription {
  const db = getAuthDb();
  try {
    db.prepare(`
      INSERT INTO subscriptions (
        user_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        current_period_start,
        current_period_end,
        last_stripe_event_created,
        last_stripe_event_id,
        last_stripe_event_type,
        provider,
        provider_latest_payment_id,
        provider_manage_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      stripeSubscriptionId,
      stripePriceId,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      eventMeta?.created ?? 0,
      eventMeta?.id ?? null,
      eventMeta?.type ?? null,
      provider,
      providerLatestPaymentId,
      providerManageUrl
    );
    return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(stripeSubscriptionId) as Subscription;
  } finally {
    db.close();
  }
}

export function getSubscriptionByProviderId(providerSubscriptionId: string): Subscription | undefined {
  const db = getAuthDb();
  try {
    return db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get(providerSubscriptionId) as Subscription | undefined;
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
  cancelAtPeriodEnd: boolean,
  eventMeta?: PaymentSyncEventMeta,
  provider: string = 'legacy',
  providerLatestPaymentId?: string | null,
  providerManageUrl?: string | null
): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      UPDATE subscriptions
      SET status = ?, current_period_start = ?, current_period_end = ?,
          cancel_at_period_end = ?,
          last_stripe_event_created = ?,
          last_stripe_event_id = ?,
          last_stripe_event_type = ?,
          provider = ?,
          provider_latest_payment_id = COALESCE(?, provider_latest_payment_id),
          provider_manage_url = COALESCE(?, provider_manage_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE stripe_subscription_id = ?
    `).run(
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd ? 1 : 0,
      eventMeta?.created ?? 0,
      eventMeta?.id ?? null,
      eventMeta?.type ?? null,
      provider,
      providerLatestPaymentId ?? null,
      providerManageUrl ?? null,
      stripeSubscriptionId
    );
  } finally {
    db.close();
  }
}

export function claimPaymentWebhookEvent(eventMeta: PaymentWebhookEventMeta): boolean {
  const db = getAuthDb();
  try {
    const result = db.prepare(`
      INSERT OR IGNORE INTO payment_webhook_events (provider, id, event_type, event_created)
      VALUES (?, ?, ?, ?)
    `).run(eventMeta.provider, eventMeta.id, eventMeta.type, eventMeta.created);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function releasePaymentWebhookEvent(provider: string, eventId: string): void {
  const db = getAuthDb();
  try {
    db.prepare(`
      DELETE FROM payment_webhook_events
      WHERE provider = ? AND id = ?
    `).run(provider, eventId);
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

function ensureUserCreditAccount(db: ReturnType<typeof getRawAuthDb>, userId: number): void {
  db.prepare(`
    INSERT INTO user_credit_accounts (user_id, balance_credits)
    VALUES (?, 0)
    ON CONFLICT(user_id) DO NOTHING
  `).run(userId);
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

export function getUserCreditAccount(userId: number): UserCreditAccount {
  const db = getAuthDb();
  try {
    ensureUserCreditAccount(db, userId);
    return db.prepare(`
      SELECT * FROM user_credit_accounts WHERE user_id = ?
    `).get(userId) as UserCreditAccount;
  } finally {
    db.close();
  }
}

export function getUserCreditBalance(userId: number): number {
  return getUserCreditAccount(userId).balance_credits;
}

export function grantUserCredits(
  userId: number,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>
): UserCreditAccount {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Credit grant amount must be a positive integer');
  }

  const db = getAuthDb();
  try {
    const runGrant = db.transaction(() => {
      ensureUserCreditAccount(db, userId);
      db.prepare(`
        UPDATE user_credit_accounts
        SET balance_credits = balance_credits + ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(amount, userId);

      const account = db.prepare(`
        SELECT * FROM user_credit_accounts WHERE user_id = ?
      `).get(userId) as UserCreditAccount;

      db.prepare(`
        INSERT INTO user_credit_transactions (
          user_id,
          delta_credits,
          reason,
          metadata_json,
          balance_after
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        amount,
        reason,
        metadata ? JSON.stringify(metadata) : null,
        account.balance_credits
      );

      return account;
    });

    return runGrant();
  } finally {
    db.close();
  }
}

export function consumeUserCredits(
  userId: number,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>
): { success: boolean; balance: number } {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Credit consumption amount must be a positive integer');
  }

  const db = getAuthDb();
  try {
    const runConsumption = db.transaction(() => {
      ensureUserCreditAccount(db, userId);

      const accountBefore = db.prepare(`
        SELECT * FROM user_credit_accounts WHERE user_id = ?
      `).get(userId) as UserCreditAccount;

      if (accountBefore.balance_credits < amount) {
        return {
          success: false,
          balance: accountBefore.balance_credits
        };
      }

      db.prepare(`
        UPDATE user_credit_accounts
        SET balance_credits = balance_credits - ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(amount, userId);

      const accountAfter = db.prepare(`
        SELECT * FROM user_credit_accounts WHERE user_id = ?
      `).get(userId) as UserCreditAccount;

      db.prepare(`
        INSERT INTO user_credit_transactions (
          user_id,
          delta_credits,
          reason,
          metadata_json,
          balance_after
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        -amount,
        reason,
        metadata ? JSON.stringify(metadata) : null,
        accountAfter.balance_credits
      );

      return {
        success: true,
        balance: accountAfter.balance_credits
      };
    });

    return runConsumption();
  } finally {
    db.close();
  }
}

export function getUserCreditTransactions(userId: number, limit: number = 50): UserCreditTransaction[] {
  const db = getAuthDb();
  try {
    ensureUserCreditAccount(db, userId);
    return db.prepare(`
      SELECT *
      FROM user_credit_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(userId, limit) as UserCreditTransaction[];
  } finally {
    db.close();
  }
}

export function seedCreditsForEligibleUsers(options: CreditSeedOptions): {
  seededUserIds: number[];
  count: number;
} {
  const {
    amount,
    onlyVerified = true,
    excludePremium = true,
    onlyZeroBalance = true,
    reason = 'initial_chat_credit_seed',
    metadata,
  } = options;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Seed credit amount must be a positive integer');
  }

  const db = getAuthDb();
  try {
    const runSeed = db.transaction(() => {
      const whereClauses: string[] = [];

      if (onlyVerified) {
        whereClauses.push('u.email_verified = 1');
      }

      if (excludePremium) {
        whereClauses.push("(u.manual_premium = 0 AND s.id IS NULL)");
      }

      if (onlyZeroBalance) {
        whereClauses.push('COALESCE(c.balance_credits, 0) = 0');
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const rows = db.prepare(`
        SELECT DISTINCT u.id
        FROM users u
        LEFT JOIN subscriptions s
          ON u.id = s.user_id AND s.status IN ('active', 'trialing')
        LEFT JOIN user_credit_accounts c
          ON u.id = c.user_id
        ${whereSql}
        ORDER BY u.id ASC
      `).all() as Array<{ id: number }>;

      const seededUserIds: number[] = [];

      for (const row of rows) {
        ensureUserCreditAccount(db, row.id);
        db.prepare(`
          UPDATE user_credit_accounts
          SET balance_credits = balance_credits + ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(amount, row.id);

        const account = db.prepare(`
          SELECT * FROM user_credit_accounts WHERE user_id = ?
        `).get(row.id) as UserCreditAccount;

        db.prepare(`
          INSERT INTO user_credit_transactions (
            user_id,
            delta_credits,
            reason,
            metadata_json,
            balance_after
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          row.id,
          amount,
          reason,
          metadata ? JSON.stringify(metadata) : null,
          account.balance_credits
        );

        seededUserIds.push(row.id);
      }

      return {
        seededUserIds,
        count: seededUserIds.length
      };
    });

    return runSeed();
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
