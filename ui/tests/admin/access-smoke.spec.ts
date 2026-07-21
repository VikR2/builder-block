import { expect, test } from '@playwright/test';
import {
  attachSessionCookie,
  createSession,
  deleteSession,
} from '../helpers/session';

test.describe('Admin access smoke checks', () => {
  test('keeps the existing admin organization workspace available to admins', async ({ page }) => {
    const sessionId = createSession(1);

    try {
      await attachSessionCookie(page, sessionId);
      await page.goto('/tcm/admin/organize');

      await expect(page.getByRole('heading', { name: /Organize/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Tags' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Playlists' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Member navigation' })).toHaveCount(0);
    } finally {
      deleteSession(sessionId);
    }
  });

  test('redirects non-admin members away from admin routes', async ({ page }) => {
    const sessionId = createSession(3);

    try {
      await attachSessionCookie(page, sessionId);
      await page.goto('/tcm/admin');
      await expect(page).toHaveURL(/\/tcm$/);
    } finally {
      deleteSession(sessionId);
    }
  });

  test('redirects signed-out visitors to login', async ({ page }) => {
    await page.goto('/tcm/admin');
    await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)tcm(?:%2F|\/)admin$/);
  });
});
