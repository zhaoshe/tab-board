import { defineConfig, devices } from '@playwright/test';
import { resolvePlaywrightPreviewServer } from './src/dev/previewValidation';

/**
 * Playwright config for TabBoard browser-level smoke tests.
 *
 * These tests drive the real React manager against the mocked-Chrome preview
 * harness (`dev/manager-preview.html` + `installPreviewChrome()`), so they cover
 * `@dnd-kit` drag lifecycle and manager boot without needing an unpacked
 * extension. They are intentionally NOT part of `npm test` (Vitest) or `npm run
 * check`; run them on demand with `npm run test:e2e`.
 */
const previewServer = resolvePlaywrightPreviewServer(process.env);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: previewServer.baseURL,
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
    env: previewServer.webServerEnv,
    url: previewServer.previewURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
