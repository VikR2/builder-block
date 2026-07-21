import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

test.describe('Skills library display polish', () => {
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    sessionId = createSession(3);
    await attachSessionCookie(page, sessionId);
  });

  test.afterEach(async () => {
    deleteSession(sessionId);
  });

  test('normalizes category labels before rendering filters and sections', async ({ page }) => {
    await page.goto('/skills');

    await expect(page.getByRole('button', { name: /^entry_patterns/i })).toHaveCount(0);
    await expect(page.getByText('entry_patterns')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Entry Patterns \(\d+\)$/ }).first()).toBeVisible();
  });
});
