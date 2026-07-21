import { test, expect } from '@playwright/test';

test.describe('TCM chat retrieval normalization', () => {
  test('returns the same primary clip for equivalent matching-window queries', async ({ request }) => {
    const canonical = await request.post('/api/tcm/chat', {
      data: {
        message: 'What is the matching window?',
        chatMode: 'knowledge',
      },
    });

    const normalized = await request.post('/api/tcm/chat', {
      data: {
        message: 'what is the matching window',
        chatMode: 'knowledge',
      },
    });

    expect(canonical.ok()).toBeTruthy();
    expect(normalized.ok()).toBeTruthy();

    const canonicalJson = await canonical.json();
    const normalizedJson = await normalized.json();

    expect(canonicalJson.primaryClip?.videoId).toBe(normalizedJson.primaryClip?.videoId);
    expect(canonicalJson.primaryClip?.startTime).toBe(normalizedJson.primaryClip?.startTime);
    expect(canonicalJson.primaryClip?.endTime).toBe(normalizedJson.primaryClip?.endTime);
  });

  test('resolves Rant2 video aliases to the correct lesson-grounded clip', async ({ request }) => {
    const response = await request.post('/api/tcm/chat', {
      data: {
        message: 'What is taught in rants video part 2?',
        chatMode: 'knowledge',
      },
    });

    expect(response.ok()).toBeTruthy();

    const payload = await response.json();

    expect(payload.primaryClip?.videoId).toBe('Rant2_afed3f3c');
    expect(payload.structuredAnswer?.lead).toContain('Rant2 teaches');
    expect(payload.structuredAnswer?.bullets?.join(' ')).toMatch(/submission range|bias and delivery|bar-by-bar/i);
  });
});
