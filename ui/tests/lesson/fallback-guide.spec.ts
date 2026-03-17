import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

test.describe('Fallback lesson guide state', () => {
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    sessionId = createSession(1);
    await attachSessionCookie(page, sessionId);
  });

  test.afterEach(async () => {
    deleteSession(sessionId);
  });

  test('shows refinement banner instead of authoritative guide panels for fallback lessons', async ({ page }) => {
    await page.goto('/tcm/library/Order-Fufilment-Tips_a89df5aa/lesson');

    await expect(page.getByText(/This guide is still being refined/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recommended Moments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Key Takeaways' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Suggested Questions' })).toHaveCount(0);
  });
});
