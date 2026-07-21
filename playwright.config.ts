import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for TabBoard browser-level smoke tests.
 *
 * These tests drive the real React manager against the mocked-Chrome preview
 * harness (`dev/manager-preview.html` + `installPreviewChrome()`), so they cover
 * `@dnd-kit` drag lifecycle and manager boot without needing an unpacked
 * extension. They are intentionally NOT part of `npm test` (Vitest) or `npm run
 * check`; run them on demand with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/dev/manager-preview.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
