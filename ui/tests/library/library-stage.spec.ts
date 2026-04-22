import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

test.describe('Library page stage-one UX', () => {
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    sessionId = createSession(3);
    await attachSessionCookie(page, sessionId);
  });

  test.afterEach(async () => {
    deleteSession(sessionId);
  });

  test('focuses on videos when no playlists exist', async ({ page }) => {
    await page.route('/api/tcm/library/playlists', async (route) => {
      await route.fulfill({
        json: {
          playlists: [],
        },
      });
    });

    await page.goto('/tcm/library');

    await expect(page.getByText('Courses Available')).toHaveCount(0);
    await expect(page.locator('h2:has-text("Courses")')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'All Videos' })).toBeVisible();
    await expect(page.getByText(/Show Videos/i)).toHaveCount(0);
  });
});
