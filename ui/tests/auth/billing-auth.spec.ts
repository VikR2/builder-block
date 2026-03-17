import path from 'path';
import Database from 'better-sqlite3';
import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

const DB_PATH = path.join(process.cwd(), '..', 'data', 'builder.db');

function enableStripeSubscriptionForUser(userId: number, customerId: string): void {
  const db = new Database(DB_PATH);

  try {
    db.prepare(`
      UPDATE users
      SET stripe_customer_id = ?, manual_premium = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(customerId, userId);

    db.prepare(`
      INSERT INTO subscriptions (
        user_id,
        stripe_subscription_id,
        stripe_price_id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end
      )
      VALUES (?, ?, ?, 'active', datetime('now'), datetime('now', '+30 day'), 0)
    `).run(userId, `sub_test_${userId}`, 'price_test');
  } finally {
    db.close();
  }
}

function clearStripeSubscriptionForUser(userId: number): void {
  const db = new Database(DB_PATH);

  try {
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
    db.prepare(`
      UPDATE users
      SET stripe_customer_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);
  } finally {
    db.close();
  }
}

test.describe('Auth and billing smoke flows', () => {
  test('renders the login page without a prerender bailout', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    await page.getByRole('button', { name: 'Magic Link' }).click();
    await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();
  });

  test('redirects unauthenticated pricing users to login before checkout', async ({ page }) => {
    await page.goto('/pricing');
    await page.getByRole('button', { name: 'Subscribe Now' }).click();

    await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)pricing$/);
  });

  test('does not offer Stripe portal actions to manual premium users', async ({ page }) => {
    const sessionId = createSession(1);

    try {
      await attachSessionCookie(page, sessionId);

      await page.goto('/pricing');
      await expect(page.getByRole('link', { name: 'Account Settings' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Manage Subscription' })).toHaveCount(0);

      await page.goto('/account');
      await expect(page.getByText(/not managed through the Stripe billing portal/i)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Manage Subscription' })).toHaveCount(0);

      await page.goto('/account/subscription');
      await expect(page.getByText(/there is no billing portal to open/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Open Stripe Portal' })).toHaveCount(0);
    } finally {
      deleteSession(sessionId);
    }
  });

  test('shows the Stripe portal action for Stripe-managed subscribers', async ({ page }) => {
    const sessionId = createSession(2);
    enableStripeSubscriptionForUser(2, 'cus_test_user_2');

    try {
      await attachSessionCookie(page, sessionId);

      await page.route('/api/stripe/portal', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'http://localhost:3000/account?portal=1' }),
        });
      });

      await page.goto('/account/subscription');
      await expect(page.getByRole('button', { name: 'Open Stripe Portal' })).toBeVisible();

      await page.getByRole('button', { name: 'Open Stripe Portal' }).click();
      await expect(page).toHaveURL(/\/account\?portal=1$/);
    } finally {
      clearStripeSubscriptionForUser(2);
      deleteSession(sessionId);
    }
  });
});
