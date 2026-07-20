import { test, expect } from '@playwright/test';

test.describe('TCM streaming chat access', () => {
  test('rejects unauthenticated streaming requests', async ({ request }) => {
    const response = await request.post('/api/tcm/chat/stream', {
      data: {
        message: 'What is the matching window?',
        chatMode: 'knowledge',
      },
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({
      error: 'Authentication is required',
    });
  });
});
