import { expect, test } from '@playwright/test';
import { getWhopPlanId } from '../../lib/whop/client';

const subscriber = {
  id: 991,
  email: 'pricing-redesign@example.com',
  role: 'user',
  isPremium: false,
  creditBalance: 0,
  hasChatAccess: false,
  hasPaidSubscription: false,
  isAdmin: false,
  emailVerified: true,
};

test.describe('TCM pricing redesign', () => {
  test('serves every generated TCM chart image from static public assets', async ({
    page,
  }) => {
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      });
    });

    const failedImages: string[] = [];
    page.on('response', response => {
      if (
        response.url().includes('/images/tcm-suite/') &&
        response.status() !== 200
      ) {
        failedImages.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto('/pricing');

    const heroImage = page
      .getByAltText(
        'TCM pseudo order-flow indicator organizing range and reaction zones on a TradingView chart'
      )
      .first();
    await expect(heroImage).toHaveAttribute(
      'src',
      '/images/tcm-suite/hero-market-context-4k.webp'
    );
    await expect
      .poll(() =>
        heroImage.evaluate(
          image =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth === 3840 &&
            (image as HTMLImageElement).naturalHeight === 2160
        )
      )
      .toBe(true);

    const features = [
      ['Range context', 'range-context-4k.webp'],
      ['Pseudo order flow', 'pseudo-order-flow-4k.webp'],
      ['Absorption', 'absorption-levels-4k.webp'],
      ['Reaction zones', 'reaction-zones-4k.webp'],
      ['Bias and sessions', 'session-bias-4k.webp'],
    ] as const;

    for (const [label, filename] of features) {
      await page.getByRole('tab', { name: label }).click();
      const image = page.locator('#feature-panel img').first();
      await expect(image).toHaveAttribute(
        'src',
        `/images/tcm-suite/${filename}`
      );
      await expect
        .poll(() =>
          image.evaluate(
            element =>
              (element as HTMLImageElement).complete &&
              (element as HTMLImageElement).naturalWidth === 3840 &&
              (element as HTMLImageElement).naturalHeight === 2160
          )
        )
        .toBe(true);
    }

    expect(failedImages).toEqual([]);
  });

  test('keeps the product story and plan controls usable from mobile to desktop', async ({ page }) => {
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      });
    });

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/pricing');

      await expect(
        page.getByRole('heading', {
          name: 'Read participation. Frame the range. Trade with context.',
        })
      ).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Range context' })).toHaveAttribute(
        'aria-selected',
        'true'
      );

      await page.getByRole('tab', { name: 'Absorption' }).click();
      await expect(page.getByRole('tab', { name: 'Absorption' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(
        page.getByRole('heading', {
          name: 'Identify effort that is no longer producing progress.',
        })
      ).toBeVisible();

      await page.locator('#plans').scrollIntoViewIfNeeded();
      const quarterlyButton = page.getByRole('button', { name: 'Choose quarterly' });
      await expect(quarterlyButton).toBeVisible();
      const box = await quarterlyButton.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('sends the selected billing cadence to checkout', async ({ page }) => {
    const requestedPeriods: string[] = [];

    await page.route('**/api/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: subscriber }),
      });
    });

    await page.route('**/api/whop/checkout', async route => {
      const body = route.request().postDataJSON() as { billingPeriod: string };
      requestedPeriods.push(body.billingPeriod);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: `http://localhost:3000/pricing?checkout-created=${body.billingPeriod}`,
        }),
      });
    });

    for (const period of ['monthly', 'quarterly', 'yearly'] as const) {
      await page.goto(`/pricing?plan=${period}`);
      await page.getByRole('button', { name: `Choose ${period}` }).click();
      await expect(page).toHaveURL(new RegExp(`checkout-created=${period}`));
    }

    expect(requestedPeriods).toEqual(['monthly', 'quarterly', 'yearly']);
  });

  test('rejects unsupported billing periods before checkout', async ({ request }) => {
    const response = await request.post('/api/whop/checkout', {
      headers: {
        Origin: 'http://localhost:3000',
      },
      data: {
        billingPeriod: 'weekly',
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid billing period',
    });
  });

  test('maps each billing period to its server-side plan id', () => {
    const previous = {
      monthly: process.env.WHOP_PLAN_ID_MONTHLY,
      quarterly: process.env.WHOP_PLAN_ID_QUARTERLY,
      yearly: process.env.WHOP_PLAN_ID_YEARLY,
      fallback: process.env.WHOP_PLAN_ID,
    };

    process.env.WHOP_PLAN_ID_MONTHLY = 'plan_monthly_test';
    process.env.WHOP_PLAN_ID_QUARTERLY = 'plan_quarterly_test';
    process.env.WHOP_PLAN_ID_YEARLY = 'plan_yearly_test';
    process.env.WHOP_PLAN_ID = 'plan_legacy_test';

    try {
      expect(getWhopPlanId('monthly')).toBe('plan_monthly_test');
      expect(getWhopPlanId('quarterly')).toBe('plan_quarterly_test');
      expect(getWhopPlanId('yearly')).toBe('plan_yearly_test');

      delete process.env.WHOP_PLAN_ID_MONTHLY;
      expect(getWhopPlanId('monthly')).toBe('plan_legacy_test');
    } finally {
      if (previous.monthly === undefined) {
        delete process.env.WHOP_PLAN_ID_MONTHLY;
      } else {
        process.env.WHOP_PLAN_ID_MONTHLY = previous.monthly;
      }
      if (previous.quarterly === undefined) {
        delete process.env.WHOP_PLAN_ID_QUARTERLY;
      } else {
        process.env.WHOP_PLAN_ID_QUARTERLY = previous.quarterly;
      }
      if (previous.yearly === undefined) {
        delete process.env.WHOP_PLAN_ID_YEARLY;
      } else {
        process.env.WHOP_PLAN_ID_YEARLY = previous.yearly;
      }
      if (previous.fallback === undefined) {
        delete process.env.WHOP_PLAN_ID;
      } else {
        process.env.WHOP_PLAN_ID = previous.fallback;
      }
    }
  });
});
