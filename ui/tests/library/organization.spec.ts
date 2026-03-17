import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

test.describe('Library Page - Video Organization', () => {
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    sessionId = createSession(3);
    await attachSessionCookie(page, sessionId);
  });

  test.afterEach(async () => {
    deleteSession(sessionId);
  });

  test('should load library page', async ({ page }) => {
    await page.goto('/tcm/library');

    // Page title
    await expect(page.locator('h1')).toContainText('Video Courses');

    // TCM Original Content badge
    await expect(page.locator('text=TCM Original Content')).toBeVisible();
  });

  test('should display stats cards', async ({ page }) => {
    await page.goto('/tcm/library');

    // Stats should be visible
    await expect(page.locator('text=Videos Available')).toBeVisible();
    await expect(page.locator('text=Minutes of Content')).toBeVisible();
    await expect(page.locator('text=Chapters')).toBeVisible();
  });

  test('should show courses section when playlists exist', async ({ page }) => {
    // Mock the playlists API to return data
    await page.route('/api/tcm/library/playlists', async route => {
      await route.fulfill({
        json: {
          playlists: [
            {
              id: 1,
              name: 'Test Course',
              slug: 'test-course',
              description: 'A test course description',
              video_count: 5,
              total_duration: 3600,
            },
          ],
        },
      });
    });

    await page.goto('/tcm/library');

    // Courses section should appear
    await expect(page.locator('h2:has-text("Courses")')).toBeVisible();

    // Course card should be visible
    await expect(page.locator('text=Test Course')).toBeVisible();
  });

  test('should show category tabs when categories exist', async ({ page }) => {
    // Mock the categories API
    await page.route('/api/tcm/library/categories', async route => {
      await route.fulfill({
        json: {
          categories: [
            { id: 1, name: 'Bootcamp', slug: 'bootcamp', color: '#f59e0b', video_count: 3 },
            { id: 2, name: 'Webinars', slug: 'webinars', color: '#10b981', video_count: 2 },
          ],
        },
      });
    });

    await page.goto('/tcm/library');

    // Wait for categories to load
    await page.waitForTimeout(1000);

    // Category tabs should be visible
    await expect(page.locator('button:has-text("All")')).toBeVisible();
    await expect(page.locator('button:has-text("Bootcamp")')).toBeVisible();
    await expect(page.locator('button:has-text("Webinars")')).toBeVisible();
  });

  test('should show tag filter chips when tags exist', async ({ page }) => {
    // Mock the tags API
    await page.route('/api/tcm/library/tags', async route => {
      await route.fulfill({
        json: {
          tags: [
            { id: 1, name: 'beginner', slug: 'beginner', color: '#3b82f6' },
            { id: 2, name: 'advanced', slug: 'advanced', color: '#ef4444' },
          ],
        },
      });
    });

    await page.goto('/tcm/library');

    // Wait for tags to load
    await page.waitForTimeout(1000);

    // Tag chips should be visible
    await expect(page.locator('button:has-text("beginner")')).toBeVisible();
    await expect(page.locator('button:has-text("advanced")')).toBeVisible();
  });

  test('should toggle category selection', async ({ page }) => {
    await page.route('/api/tcm/library/categories', async route => {
      await route.fulfill({
        json: {
          categories: [
            { id: 1, name: 'Bootcamp', slug: 'bootcamp', color: '#f59e0b', video_count: 3 },
          ],
        },
      });
    });

    await page.goto('/tcm/library');
    await page.waitForTimeout(1000);

    // Click category
    await page.click('button:has-text("Bootcamp")');

    // Section header should change
    await expect(page.locator('h2:has-text("Bootcamp")')).toBeVisible();

    // Click "All" to reset
    await page.click('button:has-text("All")');
    await expect(page.locator('h2:has-text("All Videos")')).toBeVisible();
  });

  test('should toggle tag selection with ring indicator', async ({ page }) => {
    await page.route('/api/tcm/library/tags', async route => {
      await route.fulfill({
        json: {
          tags: [
            { id: 1, name: 'beginner', slug: 'beginner', color: '#3b82f6' },
          ],
        },
      });
    });

    await page.goto('/tcm/library');
    await page.waitForTimeout(1000);

    const tagButton = page.locator('button:has-text("beginner")');

    // Click tag to select
    await tagButton.click();

    // Should have ring class
    await expect(tagButton).toHaveClass(/ring-2/);

    // Clear button should appear
    await expect(page.locator('button:has-text("Clear")')).toBeVisible();

    // Click clear
    await page.click('button:has-text("Clear")');

    // Ring should be gone
    await expect(tagButton).not.toHaveClass(/ring-2/);
  });

  test('should expand playlist to show videos on click', async ({ page }) => {
    await page.route('/api/tcm/library/playlists', async route => {
      await route.fulfill({
        json: {
          playlists: [
            {
              id: 1,
              name: 'Volume Course',
              slug: 'volume-course',
              description: 'Learn volume analysis',
              video_count: 3,
              total_duration: 1800,
            },
          ],
        },
      });
    });

    // Mock the playlist detail endpoint for expansion
    await page.route('/api/tcm/library/playlists/volume-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Volume Course',
          slug: 'volume-course',
          description: 'Learn volume analysis',
          is_published: true,
          video_count: 3,
          total_duration: 1800,
          videos: [
            { id: 'vid1', title: 'Introduction to Volume', position: 1, duration: 600 },
            { id: 'vid2', title: 'Volume Profile', position: 2, duration: 600 },
            { id: 'vid3', title: 'Advanced Volume', position: 3, duration: 600 },
          ],
        },
      });
    });

    await page.goto('/tcm/library');
    await page.waitForTimeout(1000);

    // Click course card header to expand
    await page.click('button:has-text("Volume Course")');

    // Wait for videos to load
    await page.waitForTimeout(500);

    // Videos should be visible
    await expect(page.locator('text=Introduction to Volume')).toBeVisible();
    await expect(page.locator('text=Volume Profile')).toBeVisible();

    // Start Course button should appear
    await expect(page.locator('a:has-text("Start Course")')).toBeVisible();
  });

  test('should collapse expanded playlist on second click', async ({ page }) => {
    await page.route('/api/tcm/library/playlists', async route => {
      await route.fulfill({
        json: {
          playlists: [
            {
              id: 1,
              name: 'Test Course',
              slug: 'test-course',
              description: 'A test course',
              video_count: 2,
              total_duration: 1200,
            },
          ],
        },
      });
    });

    await page.route('/api/tcm/library/playlists/test-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Test Course',
          slug: 'test-course',
          is_published: true,
          video_count: 2,
          videos: [
            { id: 'vid1', title: 'Video One', position: 1 },
            { id: 'vid2', title: 'Video Two', position: 2 },
          ],
        },
      });
    });

    await page.goto('/tcm/library');
    await page.waitForTimeout(1000);

    const playlistButton = page.locator('button:has-text("Test Course")');

    // Click to expand
    await playlistButton.click();
    await page.waitForTimeout(500);

    // Video should be visible
    await expect(page.locator('text=Video One')).toBeVisible();

    // Click again to collapse
    await playlistButton.click();

    // Video should no longer be visible
    await expect(page.locator('text=Video One')).not.toBeVisible();
  });

  test('should navigate to playlist page via Start Course button', async ({ page }) => {
    await page.route('/api/tcm/library/playlists', async route => {
      await route.fulfill({
        json: {
          playlists: [
            {
              id: 1,
              name: 'Volume Course',
              slug: 'volume-course',
              description: 'Learn volume analysis',
              video_count: 3,
              total_duration: 1800,
            },
          ],
        },
      });
    });

    await page.route('/api/tcm/library/playlists/volume-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Volume Course',
          slug: 'volume-course',
          is_published: true,
          video_count: 3,
          videos: [
            { id: 'vid1', title: 'Video 1', position: 1 },
          ],
        },
      });
    });

    await page.goto('/tcm/library');
    await page.waitForTimeout(1000);

    // Expand the playlist
    await page.click('button:has-text("Volume Course")');
    await page.waitForTimeout(500);

    // Click Start Course
    await page.click('a:has-text("Start Course")');

    // Should navigate to playlist page
    await expect(page).toHaveURL('/tcm/library/playlists/volume-course');
  });

  test('should show remaining video count when more than 5 videos', async ({ page }) => {
    await page.route('/api/tcm/library/playlists', async route => {
      await route.fulfill({
        json: {
          playlists: [
            {
              id: 1,
              name: 'Big Course',
              slug: 'big-course',
              video_count: 8,
              total_duration: 4800,
            },
          ],
        },
      });
    });

    await page.route('/api/tcm/library/playlists/big-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Big Course',
          slug: 'big-course',
          is_published: true,
          video_count: 8,
          videos: [
            { id: 'vid1', title: 'Video 1', position: 1 },
            { id: 'vid2', title: 'Video 2', position: 2 },
            { id: 'vid3', title: 'Video 3', position: 3 },
            { id: 'vid4', title: 'Video 4', position: 4 },
            { id: 'vid5', title: 'Video 5', position: 5 },
            { id: 'vid6', title: 'Video 6', position: 6 },
            { id: 'vid7', title: 'Video 7', position: 7 },
            { id: 'vid8', title: 'Video 8', position: 8 },
          ],
        },
      });
    });

    await page.goto('/tcm/library');
    await page.waitForTimeout(1000);

    // Expand the playlist
    await page.click('button:has-text("Big Course")');
    await page.waitForTimeout(500);

    // Should show "+3 more videos" (8 - 5 = 3)
    await expect(page.locator('text=+3 more videos')).toBeVisible();
  });

  test('should show Knowledge Bot CTA', async ({ page }) => {
    await page.goto('/tcm/library');

    // CTA section
    await expect(page.locator('text=Ready to Learn More?')).toBeVisible();
    await expect(page.locator('a:has-text("Ask Knowledge Bot")')).toBeVisible();
  });
});

test.describe('Playlist Page', () => {
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    sessionId = createSession(3);
    await attachSessionCookie(page, sessionId);
  });

  test.afterEach(async () => {
    deleteSession(sessionId);
  });

  test('should load playlist page with videos', async ({ page }) => {
    // Mock playlist API
    await page.route('/api/tcm/library/playlists/test-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Test Course',
          slug: 'test-course',
          description: 'A comprehensive trading course',
          is_published: true,
          video_count: 2,
          total_duration: 3600,
          videos: [
            {
              id: 1,
              folder_id: 'video_abc123',
              title: 'Introduction to Trading',
              duration_sec: 1800,
              frame_count: 10,
              position: 1,
            },
            {
              id: 2,
              folder_id: 'video_def456',
              title: 'Advanced Concepts',
              duration_sec: 1800,
              frame_count: 12,
              position: 2,
            },
          ],
        },
      });
    });

    await page.goto('/tcm/library/playlists/test-course');

    // Playlist title
    await expect(page.locator('h1')).toContainText('Test Course');

    // Description
    await expect(page.locator('text=A comprehensive trading course')).toBeVisible();

    // Stats
    await expect(page.locator('text=2 videos')).toBeVisible();
    await expect(page.locator('text=1h 0m total')).toBeVisible();

    // Start Course button
    await expect(page.locator('text=Start Course')).toBeVisible();

    // Video list
    await expect(page.locator('text=Introduction to Trading')).toBeVisible();
    await expect(page.locator('text=Advanced Concepts')).toBeVisible();
  });

  test('should show numbered position for each video', async ({ page }) => {
    await page.route('/api/tcm/library/playlists/test-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Test Course',
          slug: 'test-course',
          is_published: true,
          video_count: 2,
          total_duration: 3600,
          videos: [
            { id: 1, folder_id: 'vid1', title: 'Video 1', duration_sec: 900, frame_count: 5, position: 1 },
            { id: 2, folder_id: 'vid2', title: 'Video 2', duration_sec: 900, frame_count: 5, position: 2 },
          ],
        },
      });
    });

    await page.goto('/tcm/library/playlists/test-course');

    // Position numbers should be visible
    await expect(page.locator('text="1"').first()).toBeVisible();
    await expect(page.locator('text="2"').first()).toBeVisible();
  });

  test('should navigate to video from playlist', async ({ page }) => {
    await page.route('/api/tcm/library/playlists/test-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Test Course',
          slug: 'test-course',
          is_published: true,
          video_count: 1,
          total_duration: 900,
          videos: [
            { id: 1, folder_id: 'video_abc123', title: 'Test Video', duration_sec: 900, frame_count: 5, position: 1 },
          ],
        },
      });
    });

    await page.goto('/tcm/library/playlists/test-course');

    // Click on video link
    await page.click('a:has-text("Test Video")');

    // Should navigate to video page
    await expect(page).toHaveURL('/tcm/library/video_abc123');
  });

  test('should have breadcrumb navigation back to library', async ({ page }) => {
    await page.route('/api/tcm/library/playlists/test-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Test',
          slug: 'test-course',
          is_published: true,
          video_count: 0,
          total_duration: 0,
          videos: [],
        },
      });
    });

    await page.goto('/tcm/library/playlists/test-course');

    // Breadcrumb should be visible
    await expect(page.locator('a:has-text("Video Library")')).toBeVisible();

    // Click to navigate
    await page.click('a:has-text("Video Library")');
    await expect(page).toHaveURL('/tcm/library');
  });

  test('should show empty state when playlist has no videos', async ({ page }) => {
    await page.route('/api/tcm/library/playlists/empty-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Empty Course',
          slug: 'empty-course',
          is_published: true,
          video_count: 0,
          total_duration: 0,
          videos: [],
        },
      });
    });

    await page.goto('/tcm/library/playlists/empty-course');

    // Empty state message
    await expect(page.locator('text=No videos in this course')).toBeVisible();

    // Back to library link
    await expect(page.locator('a:has-text("Back to Library")')).toBeVisible();
  });

  test('should show Knowledge Bot CTA at bottom', async ({ page }) => {
    await page.route('/api/tcm/library/playlists/test-course', async route => {
      await route.fulfill({
        json: {
          id: 1,
          name: 'Test',
          slug: 'test-course',
          is_published: true,
          video_count: 1,
          total_duration: 900,
          videos: [
            { id: 1, folder_id: 'vid1', title: 'Video', duration_sec: 900, frame_count: 5, position: 1 },
          ],
        },
      });
    });

    await page.goto('/tcm/library/playlists/test-course');

    // CTA
    await expect(page.locator('text=Have Questions?')).toBeVisible();
    await expect(page.locator('a:has-text("Ask Knowledge Bot")')).toBeVisible();
  });
});
