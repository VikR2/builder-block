import { defineConfig } from '@playwright/test';

const externalOnly = process.env.PLAYWRIGHT_EXTERNAL_ONLY === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  use: {
    screenshot: 'on',
    video: 'on-first-retry',
    ...(externalOnly ? {} : { baseURL: 'http://localhost:3000' }),
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  ...(externalOnly
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120000,
        },
      }),
});
