import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';

const PINE_PATH = path.resolve(
  process.cwd(),
  '..',
  'scripts-output',
  'TradingView',
  'SMT-Range-OB-Continuation.pine',
);

const SYNC_SIGNATURE = 'TV_SYNC_SIGNATURE: SMT Range OB Continuation';

test.describe('TradingView SMT range indicator', () => {
  test('pine source exposes the finalized SMT range contract', async () => {
    const source = fs.readFileSync(PINE_PATH, 'utf8');

    expect(source).toContain('comparisonSymbol = input.symbol(');
    expect(source).toContain('SMT comparison symbol');
    expect(source).toContain('pivotLength = input.int(');
    expect(source).toContain('rangeExtensionBars = input.int(');
    expect(source).toContain('obExtensionBars = input.int(');
    expect(source).toContain('request.security(');
    expect(source).toContain('lookahead=barmerge.lookahead_off');
    expect(source).toContain('activeRangeBias := -1');
    expect(source).toContain('activeRangeBias := 1');
    expect(source).toContain('activeRangeBox = na');
    expect(source).toContain('continuationPrinted = false');
    expect(source).toContain('bullishEqReject');
    expect(source).toContain('bearishEqReject');
  });

  test('syncs the current TradingView Pine editor without creating a new script copy', async ({
    page,
  }) => {
    test.skip(
      !process.env.TRADINGVIEW_SYNC_ENABLED,
      'Set TRADINGVIEW_SYNC_ENABLED=1 to run the live TradingView editor sync.',
    );

    const chartUrl =
      process.env.TRADINGVIEW_CHART_URL ?? 'https://www.tradingview.com/chart/wwgrhNUG/';
    const source = fs.readFileSync(PINE_PATH, 'utf8');
    const pineSaveButton = page.locator('[data-qa-id="pine-script-save-button"]');
    const editor = page.getByRole('textbox', {
      name: /Editor content;Press Alt\+F1 for Accessibility Options\./,
    });

    await page.goto(chartUrl, { waitUntil: 'domcontentloaded' });
    await expect(pineSaveButton).toBeVisible({ timeout: 30_000 });

    await page.evaluate((nextSource) => {
      const rawDraft = localStorage.getItem('last_edited_script');

      if (!rawDraft) {
        throw new Error('TradingView did not expose last_edited_script in localStorage.');
      }

      const draftPayload = JSON.parse(rawDraft) as Record<
        string,
        { scriptSource?: string }
      >;
      const firstDraftKey = Object.keys(draftPayload)[0];

      if (!firstDraftKey) {
        throw new Error('TradingView draft payload did not contain any script entries.');
      }

      draftPayload[firstDraftKey].scriptSource = nextSource;
      localStorage.setItem('last_edited_script', JSON.stringify(draftPayload));

      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function patchedSetItem(key: string, value: string): void {
        if (this === localStorage && key === 'last_edited_script') {
          return;
        }

        originalSetItem.call(this, key, value);
      };
    }, source);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(pineSaveButton).toBeVisible({ timeout: 30_000 });
    await expect(editor).toContainText(SYNC_SIGNATURE);
    await expect(page.getByText(/Mismatched input/i)).toHaveCount(0);

    await pineSaveButton.click();
    await expect(page.getByRole('button', { name: 'Unsaved version' })).toHaveCount(0);
  });
});
