import { test, expect } from '@playwright/test';
import { attachSessionCookie, createSession, deleteSession } from '../helpers/session';

test.describe('TCM chat Coach Brief rendering', () => {
  let sessionId: string;

  test.beforeEach(async ({ page }) => {
    sessionId = createSession(1);
    await attachSessionCookie(page, sessionId);

    await page.addInitScript(() => {
      window.localStorage.setItem('tcm-chat-session:v2:1:knowledge-bot', JSON.stringify({
        schemaVersion: 2,
        userId: '1',
        scope: 'knowledge-bot',
        updatedAt: new Date().toISOString(),
        input: '',
        messages: [
          {
            id: 'assistant-structured',
            role: 'assistant',
            content: 'The mentor treats book building as a sequence: first locate submitted interest, then confirm the matching window actually traded through it.',
            timestamp: new Date().toISOString(),
            structuredAnswer: {
              lead: 'Book building is the overlap between submitted orders and the later matching window.',
              bullets: [
                'Submitted orders show intent, but the book only becomes actionable after matching starts.',
                'Matched order levels are where EQ, liquidity, and fill logic become clearer.',
                'Use the matching window to decide whether price is likely to continue, rebalance, or reverse.',
              ],
              bestClipReason: 'Watch the clip around the matching window transition because the mentor shows where submitted orders become actionable.',
              broaderContext: 'Across TCM material, the same rule holds: liquidity matters most after the market begins filling orders, not while the levels are still theoretical.',
              sources: ['Lesson guide', 'Transcript @ 26:30'],
            },
            primaryClip: {
              videoId: 'Order-Fufilment-Tips_a89df5aa',
              videoTitle: 'Order Fulfillment Tips',
              startTime: 1590,
              endTime: 1645,
              description: 'The mentor marks the transition from submitted orders to matched order flow.',
              watchLink: '/tcm/library/Order-Fufilment-Tips_a89df5aa?t=1590',
              lessonLink: '/tcm/library/Order-Fufilment-Tips_a89df5aa/lesson',
            },
            watchLink: '/tcm/library/Order-Fufilment-Tips_a89df5aa?t=1590',
            lessonLink: '/tcm/library/Order-Fufilment-Tips_a89df5aa/lesson',
          },
        ],
      }));
    });
  });

  test.afterEach(async () => {
    deleteSession(sessionId);
  });

  test('prefers the generated tutor response over the retrieval preview', async ({ page }) => {
    await page.goto('/tcm');

    await expect(page.getByText(/The mentor treats book building as a sequence/i)).toBeVisible();
    await expect(page.getByText('Mentor take')).toHaveCount(0);
    await expect(page.getByText(/Book building is the overlap between submitted orders/i)).toHaveCount(0);
  });
});
