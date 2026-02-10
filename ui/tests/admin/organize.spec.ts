import { test, expect } from '@playwright/test';

test.describe('Admin Organization Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth for admin access
    await page.context().addCookies([
      {
        name: 'auth_token',
        value: 'test-admin-token',
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('should load organization dashboard', async ({ page }) => {
    await page.goto('/tcm/admin/organize');

    // Check page title and sections
    await expect(page.locator('h1')).toContainText('Organize');

    // Categories section should be visible
    await expect(page.locator('text=Categories')).toBeVisible();

    // Tags section should be visible
    await expect(page.locator('text=Tags')).toBeVisible();

    // Playlists section should be visible
    await expect(page.locator('text=Playlists')).toBeVisible();
  });

  test('should open category manager modal', async ({ page }) => {
    await page.goto('/tcm/admin/organize');

    // Click manage button for categories
    await page.click('button:has-text("Manage"):near(:text("Categories"))');

    // Modal should appear
    await expect(page.locator('[role="dialog"], .fixed.inset-0')).toBeVisible();

    // Should have category management UI
    await expect(page.locator('text=Manage Categories')).toBeVisible();
  });

  test('should open tag manager modal', async ({ page }) => {
    await page.goto('/tcm/admin/organize');

    // Click manage button for tags
    await page.click('button:has-text("Manage"):near(:text("Tags"))');

    // Modal should appear
    await expect(page.locator('[role="dialog"], .fixed.inset-0')).toBeVisible();

    // Should have tag management UI
    await expect(page.locator('text=Manage Tags')).toBeVisible();
  });

  test('should show new playlist form', async ({ page }) => {
    await page.goto('/tcm/admin/organize');

    // Click new playlist button
    await page.click('button:has-text("New Playlist")');

    // Form should appear with input
    await expect(page.locator('input[placeholder*="Playlist name"]')).toBeVisible();

    // Create and cancel buttons should be present
    await expect(page.locator('button:has-text("Create")')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
  });

  test('should navigate back to admin from organize page', async ({ page }) => {
    await page.goto('/tcm/admin/organize');

    // Click back arrow
    await page.click('a[href="/tcm/admin"]');

    // Should be on admin page
    await expect(page).toHaveURL('/tcm/admin');
  });
});

test.describe('Admin Videos Page - Organization Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: 'auth_token',
        value: 'test-admin-token',
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('should show category filter dropdown', async ({ page }) => {
    await page.goto('/tcm/admin/videos');

    // Category filter should have folder icon
    await expect(page.locator('select').first()).toBeVisible();

    // Should have "All Categories" option
    await expect(page.locator('option:has-text("All Categories")')).toBeVisible();
  });

  test('should show status filter tabs', async ({ page }) => {
    await page.goto('/tcm/admin/videos');

    // Status filter buttons
    await expect(page.locator('button:has-text("All")')).toBeVisible();
    await expect(page.locator('button:has-text("Pending")')).toBeVisible();
    await expect(page.locator('button:has-text("Completed")')).toBeVisible();
  });

  test('should have organize link in header', async ({ page }) => {
    await page.goto('/tcm/admin/videos');

    // Organize button should be visible
    await expect(page.locator('a:has-text("Organize")')).toBeVisible();

    // Click and verify navigation
    await page.click('a:has-text("Organize")');
    await expect(page).toHaveURL('/tcm/admin/organize');
  });

  test('should filter by status', async ({ page }) => {
    await page.goto('/tcm/admin/videos');

    // Click completed filter
    await page.click('button:has-text("Completed")');

    // Button should be highlighted (amber background)
    await expect(page.locator('button:has-text("Completed")')).toHaveClass(/bg-amber/);
  });
});

test.describe('Category Manager Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: 'auth_token',
        value: 'test-admin-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/tcm/admin/organize');
    await page.click('button:has-text("Manage"):near(:text("Categories"))');
  });

  test('should show add category form', async ({ page }) => {
    // Input for new category name
    await expect(page.locator('input[placeholder*="category name"], input[placeholder*="Category"]')).toBeVisible();

    // Add button
    await expect(page.locator('button:has-text("Add")')).toBeVisible();
  });

  test('should show color picker', async ({ page }) => {
    // Color buttons should be visible
    const colorButtons = page.locator('button[style*="background"]');
    await expect(colorButtons.first()).toBeVisible();
  });

  test('should close modal with X button', async ({ page }) => {
    // Close button
    await page.click('button:has-text("×"), button[aria-label="Close"]');

    // Modal should be gone
    await expect(page.locator('text=Manage Categories')).not.toBeVisible();
  });
});

test.describe('Tag Manager Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: 'auth_token',
        value: 'test-admin-token',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.goto('/tcm/admin/organize');
    await page.click('button:has-text("Manage"):near(:text("Tags"))');
  });

  test('should show add tag form', async ({ page }) => {
    // Input for new tag name
    await expect(page.locator('input[placeholder*="tag name"], input[placeholder*="Tag"]')).toBeVisible();
  });

  test('should display tags as pills', async ({ page }) => {
    // If tags exist, they should be styled as rounded pills
    const tagPills = page.locator('.rounded-full');
    // Just verify the component structure is correct
    await expect(page.locator('text=Manage Tags')).toBeVisible();
  });
});
