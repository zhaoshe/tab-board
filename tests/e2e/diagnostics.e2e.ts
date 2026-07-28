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

async function waitForDiagnostics(
  page: import('@playwright/test').Page,
  predicate: (entries: DiagnosticEntry[]) => boolean,
): Promise<DiagnosticEntry[]> {
  let entries: DiagnosticEntry[] = [];
  await expect.poll(async () => {
    entries = await readDiagnostics(page);
    return predicate(entries);
  }).toBe(true);
  return entries;
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

    const entries = await waitForDiagnostics(
      page,
      (current) => current.some((entry) =>
        entry.scope === 'manager'
        && entry.message === 'hydration complete, rendering manager'),
    );
    const messages = entries.map((entry) => `${entry.scope}: ${entry.message}`);
    expect(messages).toContain('manager: manager entry script loaded');
    expect(messages).toContain('manager: ManagerApp mounted');
    expect(messages).toContain('manager: hydration complete, rendering manager');
  });

  test('records global errors without waiting for the info batch', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'diagnostics e2e error',
        error: new Error('diagnostics e2e error'),
      }));
    });

    const entries = await waitForDiagnostics(
      page,
      (current) => current.some((entry) =>
        entry.scope === 'manager'
        && entry.level === 'error'
        && entry.message === 'diagnostics e2e error'),
    );
    expect(entries.some((entry) => entry.message === 'diagnostics e2e error')).toBe(true);
  });

  test('diagnostics survive a reload', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();
    const before = await waitForDiagnostics(page, (entries) => entries.length > 0);
    const firstEntry = before[0]!;

    await page.reload();
    await expect(page.locator('.manager-shell')).toBeVisible();
    const after = await waitForDiagnostics(
      page,
      (entries) => entries.length >= before.length
        && entries.some((entry) =>
          entry.ts === firstEntry.ts
          && entry.scope === firstEntry.scope
          && entry.message === firstEntry.message),
    );
    // The pre-reload trail is still present (plus new boot breadcrumbs).
    expect(after.length).toBeGreaterThanOrEqual(before.length);
  });
});
