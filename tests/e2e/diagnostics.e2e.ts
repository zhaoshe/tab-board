import { test, expect } from '@playwright/test';
import { twoInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/manager-preview.html';
const DIAGNOSTICS_KEY = 'tabboardDiagnostics';

interface DiagnosticEntry {
  ts: string;
  level: string;
  scope: string;
  message: string;
  detail?: string;
}

async function readDiagnostics(page: import('@playwright/test').Page): Promise<DiagnosticEntry[]> {
  return page.evaluate(async (key) => {
    const chromeApi = (window as unknown as { chrome?: { storage?: { local?: { get(k: string): Promise<Record<string, unknown>> } } } }).chrome;
    const stored = await chromeApi?.storage?.local?.get(key);
    return (stored?.[key] as DiagnosticEntry[]) ?? [];
  }, DIAGNOSTICS_KEY);
}

/**
 * A white screen destroys the page console, so TabBoard persists a breadcrumb /
 * error trail to `chrome.storage.local` (key `tabboardDiagnostics`) that
 * survives the crash and a reload. These tests assert the trail is written and
 * readable, and that the worker-fallback path is recorded.
 */
test.describe('Crash-surviving diagnostics', () => {
  test.beforeEach(async ({ page }) => {
    const seed = twoInboxSessions();
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
  });

  test('records boot + hydration breadcrumbs to chrome.storage.local', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();

    const entries = await readDiagnostics(page);
    const messages = entries.map((entry) => `${entry.scope}: ${entry.message}`);
    expect(messages).toContain('manager: manager entry script loaded');
    expect(messages).toContain('manager: ManagerApp mounted');
    expect(messages.some((m) => m.startsWith('hydration:'))).toBe(true);
  });

  test('records the worker fallback path when ensure-state fails', async ({ page }) => {
    await page.addInitScript(() => {
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
    });

    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();

    const entries = await readDiagnostics(page);
    const fallback = entries.find((entry) => entry.scope === 'hydration' && /fall(ing|back) back|local storage fallback/i.test(entry.message));
    expect(fallback, `diagnostics: ${JSON.stringify(entries.map((e) => e.message))}`).toBeTruthy();
  });

  test('diagnostics survive a reload', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();
    const before = await readDiagnostics(page);
    expect(before.length).toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator('.manager-shell')).toBeVisible();
    const after = await readDiagnostics(page);
    // The pre-reload trail is still present (plus new boot breadcrumbs).
    expect(after.length).toBeGreaterThanOrEqual(before.length);
  });
});
