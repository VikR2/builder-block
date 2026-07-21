import { test, expect } from '@playwright/test';

test.describe('Video Player Controls', () => {
  test.beforeEach(async ({ page }) => {
    // Go to TCM page
    await page.goto('/tcm');
    await page.waitForLoadState('networkidle');
  });

  test('controls bar should be visible initially', async ({ page }) => {
    // Fill chat input and submit to get a video response
    await page.locator('textarea').first().fill('What is a liquidity sweep?');
    await page.keyboard.press('Enter');

    // Wait for video to appear (up to 30s for API response)
    const video = page.locator('video').first();
    await expect(video).toBeVisible({ timeout: 30000 });

    // Wait for controls to render
    await page.waitForTimeout(500);

    // Check for controls bar using data-testid
    const controls = page.locator('[data-testid="video-controls"]').first();
    await expect(controls).toBeVisible();

    // Get data attributes
    const controlsVisible = await controls.getAttribute('data-controls-visible');
    const isPlaying = await controls.getAttribute('data-is-playing');

    console.log(`Initial state - controlsVisible: ${controlsVisible}, isPlaying: ${isPlaying}`);

    // Take screenshot to verify visually
    await page.screenshot({ path: '.playwright-mcp/video-controls-initial.png', fullPage: true });

    // Controls should be visible on initial load
    expect(controlsVisible).toBe('true');

    // Check specific buttons are visible
    const playButton = page.locator('[title*="Play"]').first();
    await expect(playButton).toBeVisible();

    const skipBackButton = page.locator('[title*="Back 10"]').first();
    await expect(skipBackButton).toBeVisible();

    const skipForwardButton = page.locator('[title*="Forward 10"]').first();
    await expect(skipForwardButton).toBeVisible();

    const speedButton = page.locator('[title*="Playback speed"]').first();
    await expect(speedButton).toBeVisible();
  });

  test('controls should reappear on hover after hiding', async ({ page }) => {
    // Fill chat input and submit to get a video response
    await page.locator('textarea').first().fill('What is a liquidity sweep?');
    await page.keyboard.press('Enter');

    // Wait for video to appear
    const video = page.locator('video').first();
    await expect(video).toBeVisible({ timeout: 30000 });

    const controls = page.locator('[data-testid="video-controls"]').first();
    await expect(controls).toBeVisible();

    // Log initial state
    let controlsVisible = await controls.getAttribute('data-controls-visible');
    let isPlaying = await controls.getAttribute('data-is-playing');
    console.log(`Before play - controlsVisible: ${controlsVisible}, isPlaying: ${isPlaying}`);

    // Click play button
    const playButton = page.locator('[title*="Play"]').first();
    await playButton.click();

    await page.waitForTimeout(500);
    isPlaying = await controls.getAttribute('data-is-playing');
    console.log(`After play click - isPlaying: ${isPlaying}`);

    // Screenshot right after play
    await page.screenshot({ path: '.playwright-mcp/video-controls-playing.png', fullPage: true });

    // Wait for controls to hide (timeout is 3s)
    await page.waitForTimeout(4000);

    controlsVisible = await controls.getAttribute('data-controls-visible');
    isPlaying = await controls.getAttribute('data-is-playing');
    console.log(`After 4s - controlsVisible: ${controlsVisible}, isPlaying: ${isPlaying}`);

    await page.screenshot({ path: '.playwright-mcp/video-controls-after-wait.png', fullPage: true });

    // Hover over video container
    await video.hover();
    await page.waitForTimeout(300);

    // Check controls state after hover
    controlsVisible = await controls.getAttribute('data-controls-visible');
    console.log(`After hover - controlsVisible: ${controlsVisible}`);

    await page.screenshot({ path: '.playwright-mcp/video-controls-after-hover.png', fullPage: true });

    // Controls should be visible after hover
    expect(controlsVisible).toBe('true');
  });
});
