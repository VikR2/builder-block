import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

test.describe('Library title cleanup', () => {
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    sessionId = createSession(3);
    await attachSessionCookie(page, sessionId);
  });

  test.afterEach(async () => {
    deleteSession(sessionId);
  });

  test('shows cleaned video titles instead of ingestion typos', async ({ page }) => {
    await page.goto('/tcm/library');

    const cleanedTitle = page.getByText(/Order Fulfillment Tips/i);
    if (await cleanedTitle.count() === 0) {
      await page.getByRole('button', { name: /All Videos/i }).click();
    }

    await expect(page.getByText(/Order Fufilment Tips/i)).toHaveCount(0);
    await expect(page.getByText(/Order Fulfillment Tips/i)).toBeVisible();
  });
});
