import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

test.describe('Home page stage-one UX', () => {
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    sessionId = createSession(3);
    await attachSessionCookie(page, sessionId);
  });

  test.afterEach(async () => {
    deleteSession(sessionId);
  });

  test('keeps the learner home focused for non-admin users', async ({ page }) => {
    await page.goto('/home');

    await expect(page.getByText('What’s on your mind?')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Quick Actions' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Ask the Knowledge Bot/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByText('Indicator status')).toBeVisible();
  });
});
