import { test, expect } from '@playwright/test';

test.describe('Video Player Controls Visibility', () => {
  test('controls should appear on hover after video starts playing', async ({ page }) => {
    // Navigate to TCM page which has video player
    await page.goto('http://localhost:3000/tcm');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial state
    await page.screenshot({ path: 'test-results/01-initial-page.png' });

    // Type a question to trigger video response
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await chatInput.fill('What is a liquidity sweep?');

    // Submit
    await page.keyboard.press('Enter');

    // Wait for response with video
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'test-results/02-after-question.png' });

    // Look for video player
    const videoContainer = page.locator('video').first();
    const exists = await videoContainer.count();

    console.log(`Video elements found: ${exists}`);

    if (exists > 0) {
      // Get the video player container
      const playerContainer = page.locator('video').first().locator('..').locator('..');

      await page.screenshot({ path: 'test-results/03-video-found.png' });

      // Check if controls are visible initially
      const controlsBar = page.locator('text=Play').or(page.locator('[title*="Play"]')).first();
      const initiallyVisible = await controlsBar.isVisible().catch(() => false);
      console.log(`Controls initially visible: ${initiallyVisible}`);

      // Click play button if visible
      const playButton = page.locator('[title*="Play"]').first();
      if (await playButton.isVisible()) {
        await playButton.click();
        console.log('Clicked play button');
      }

      // Wait for video to play and controls to potentially hide
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'test-results/04-after-play-wait.png' });

      // Check if controls are hidden
      const controlsAfterPlay = page.locator('[title*="Pause"]').or(page.locator('[title*="Play"]')).first();
      const visibleAfterPlay = await controlsAfterPlay.isVisible().catch(() => false);
      console.log(`Controls visible after play + wait: ${visibleAfterPlay}`);

      // Now hover over video
      await videoContainer.hover();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/05-after-hover.png' });

      // Check if controls reappear
      const visibleAfterHover = await controlsAfterPlay.isVisible().catch(() => false);
      console.log(`Controls visible after hover: ${visibleAfterHover}`);

      // Move mouse away
      await page.mouse.move(0, 0);
      await page.waitForTimeout(4000);
      await page.screenshot({ path: 'test-results/06-after-mouse-away.png' });

      // Hover again
      await videoContainer.hover();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test-results/07-hover-again.png' });

      const visibleAfterSecondHover = await controlsAfterPlay.isVisible().catch(() => false);
      console.log(`Controls visible after second hover: ${visibleAfterSecondHover}`);

      // Assert controls should be visible after hover
      expect(visibleAfterSecondHover).toBe(true);
    } else {
      console.log('No video found, checking page structure...');
      await page.screenshot({ path: 'test-results/no-video.png', fullPage: true });
    }
  });
});
