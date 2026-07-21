import { test, expect } from '@playwright/test';
import { twoInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/manager-preview.html';

/**
 * Regression for the manager white-screen: an idle/cold MV3 service worker (or a
 * torn-down message port) must not blank the page. Hydration is decoupled from
 * the worker — `ensureStateForHydration` falls back to reading
 * `chrome.storage.local` directly — so the manager always comes up.
 *
 * We simulate an unreachable worker by making `chrome.runtime.sendMessage`
 * reject for the `tabboard-ensure-state` message before the manager module runs.
 */
test.describe('Manager hydration resilience (worker unreachable)', () => {
  test.beforeEach(async ({ page }) => {
    const seed = twoInboxSessions();
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;

      // Patch the mocked chrome as soon as the harness installs it, so the very
      // first `tabboard-ensure-state` sees an "asleep" worker.
      const patch = () => {
        const runtime = (window as unknown as { chrome?: { runtime?: { sendMessage?: (m: unknown) => Promise<unknown> } } }).chrome?.runtime;
        if (!runtime?.sendMessage) {
          setTimeout(patch, 0);
          return;
        }
        const original = runtime.sendMessage.bind(runtime);
        runtime.sendMessage = async (message: unknown) => {
          if (message && typeof message === 'object' && (message as { type?: string }).type === 'tabboard-ensure-state') {
            throw new Error('Could not establish connection. Receiving end does not exist.');
          }
          return original(message);
        };
      };
      patch();
    }, seed);
  });

  test('renders the seeded board even when the ensure-state worker call fails', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(PREVIEW_PATH);

    // The shell and seeded sessions must appear despite the worker being down —
    // no infinite loading overlay, no blank #root.
    await expect(page.locator('.manager-shell')).toBeVisible();
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
    await expect(page.locator('#session-card-group_beta')).toBeVisible();
    expect(errors, `unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
  });
});
