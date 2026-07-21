import path from 'path';
import Database from 'better-sqlite3';
import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

const DB_PATH = path.join(process.cwd(), '..', 'data', 'builder.db');

function ensureWhopSubscriptionColumns(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(subscriptions)').all() as Array<{ name: string }>;
  const hasColumn = (name: string) => columns.some(column => column.name === name);

  if (!hasColumn('provider')) {
    db.exec("ALTER TABLE subscriptions ADD COLUMN provider TEXT DEFAULT 'legacy'");
  }
  if (!hasColumn('provider_latest_payment_id')) {
    db.exec('ALTER TABLE subscriptions ADD COLUMN provider_latest_payment_id TEXT');
  }
  if (!hasColumn('provider_manage_url')) {
    db.exec('ALTER TABLE subscriptions ADD COLUMN provider_manage_url TEXT');
  }
}

function enableWhopSubscriptionForUser(userId: number): void {
  const db = new Database(DB_PATH);

  try {
    ensureWhopSubscriptionColumns(db);

    db.prepare(`
      UPDATE users
      SET manual_premium = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);

    db.prepare(`
      INSERT INTO subscriptions (
        user_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        provider,
        provider_latest_payment_id,
        provider_manage_url
      )
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now', '+30 day'), 0, 'whop', ?, ?)
    `).run(
      userId,
      `mem_test_${userId}`,
      'plan_test',
      `pay_test_${userId}`,
      'http://localhost:3000/account?portal=1'
    );
  } finally {
    db.close();
  }
}

function clearWhopSubscriptionForUser(userId: number): void {
  const db = new Database(DB_PATH);

  try {
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
  } finally {
    db.close();
  }
}

test.describe('Auth and billing smoke flows', () => {
  test('keeps a new signup authenticated before starting checkout', async ({ page }) => {
    let signedUp = false;
    let checkoutRequested = false;
    let requestedBillingPeriod: string | undefined;

    const newUser = {
      id: 901,
      email: 'new-subscriber@example.com',
      role: 'user',
      isPremium: false,
      creditBalance: 0,
      hasChatAccess: false,
      hasPaidSubscription: false,
      isAdmin: false,
      emailVerified: false,
    };

    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: signedUp ? newUser : null }),
      });
    });

    await page.route('**/api/auth/signup', async route => {
      signedUp = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: newUser }),
      });
    });

    await page.route('**/api/whop/checkout', async route => {
      checkoutRequested = true;
      requestedBillingPeriod = route.request().postDataJSON().billingPeriod;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'http://localhost:3000/pricing?checkout-created=1' }),
      });
    });

    await page.goto('/signup');
    await page.getByLabel('Email').fill(newUser.email);
    await page.getByLabel('Password', { exact: true }).fill('Password123');
    await page.getByLabel('Confirm Password').fill('Password123');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page).toHaveURL(/\/pricing$/);
    await page.getByRole('button', { name: 'Choose quarterly' }).click();

    await expect.poll(() => checkoutRequested).toBe(true);
    expect(requestedBillingPeriod).toBe('quarterly');
    await expect(page).toHaveURL(/\/pricing\?checkout-created=1$/);
  });

  test('keeps a login redirect authenticated before starting checkout', async ({ page }) => {
    let loggedIn = false;
    let checkoutRequested = false;
    let requestedBillingPeriod: string | undefined;

    const user = {
      id: 902,
      email: 'returning-subscriber@example.com',
      role: 'user',
      isPremium: false,
      creditBalance: 0,
      hasChatAccess: false,
      hasPaidSubscription: false,
      isAdmin: false,
      emailVerified: true,
    };

    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: loggedIn ? user : null }),
      });
    });

    await page.route('**/api/auth/login', async route => {
      loggedIn = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user }),
      });
    });

    await page.route('**/api/whop/checkout', async route => {
      checkoutRequested = true;
      requestedBillingPeriod = route.request().postDataJSON().billingPeriod;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'http://localhost:3000/pricing?checkout-created=1' }),
      });
    });

    await page.goto('/login?redirect=/pricing');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('Password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/pricing$/);
    await page.getByRole('button', { name: 'Choose yearly' }).click();

    await expect.poll(() => checkoutRequested).toBe(true);
    expect(requestedBillingPeriod).toBe('yearly');
    await expect(page).toHaveURL(/\/pricing\?checkout-created=1$/);
  });

  test('waits for premium activation on Whop success before entering the library', async ({ page }) => {
    let authChecks = 0;

    const pendingUser = {
      id: 903,
      email: 'activating-subscriber@example.com',
      role: 'user',
      isPremium: false,
      creditBalance: 0,
      hasChatAccess: false,
      hasPaidSubscription: false,
      isAdmin: false,
      emailVerified: true,
    };

    const premiumUser = {
      ...pendingUser,
      isPremium: true,
      hasChatAccess: true,
      hasPaidSubscription: true,
    };

    await page.route('**/api/auth/me', async route => {
      authChecks += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: authChecks >= 2 ? premiumUser : pendingUser }),
      });
    });

    await page.goto('/pricing?success=true&session_id=cs_test');

    await expect(page.getByRole('heading', { name: 'Indicator access is active' })).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByText('Your membership is active. Redirecting you to your subscription workspace.')
    ).toBeVisible();
  });

  test('renders the login page without a prerender bailout', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  });

  test('redirects unauthenticated pricing users to login before checkout', async ({ page }) => {
    await page.goto('/pricing');
    await page.getByRole('button', { name: 'Choose monthly' }).click();

    await expect(page).toHaveURL(
      /\/login\?redirect=%2Fpricing%3Fplan%3Dmonthly%23plans$/
    );
  });

  test('does not offer Whop portal actions to manual premium users', async ({ page }) => {
    const sessionId = createSession(1);

    try {
      await attachSessionCookie(page, sessionId);

      await page.goto('/pricing');
      await expect(page.getByText('Your TCM indicator membership is active.')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Manage subscription' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open Whop Portal' })).toHaveCount(0);

      await page.goto('/account');
      await expect(page.getByText(/not managed through the Whop billing portal/i)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Manage Subscription' })).toHaveCount(0);

      await page.goto('/account/subscription');
      await expect(page.getByText(/there is no billing portal to open/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open Whop Portal' })).toHaveCount(0);
    } finally {
      deleteSession(sessionId);
    }
  });

  test('shows the Whop portal action for Whop-managed subscribers', async ({ page }) => {
    const sessionId = createSession(2);
    enableWhopSubscriptionForUser(2);

    try {
      await attachSessionCookie(page, sessionId);

      await page.route('/api/whop/portal', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'http://localhost:3000/account?portal=1' }),
        });
      });

      await page.goto('/account/subscription');
      await expect(page.getByRole('button', { name: 'Open Whop Portal' })).toBeVisible();

      await page.getByRole('button', { name: 'Open Whop Portal' }).click();
      await expect(page).toHaveURL(/\/account\?portal=1$/);
    } finally {
      clearWhopSubscriptionForUser(2);
      deleteSession(sessionId);
    }
  });
});
