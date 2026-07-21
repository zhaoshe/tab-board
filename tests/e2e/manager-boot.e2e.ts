import { test, expect } from '@playwright/test';
import { twoInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/manager-preview.html';

test.describe('Manager boot + Chrome lifecycle (preview harness)', () => {
  test.beforeEach(async ({ page }) => {
    const seed = twoInboxSessions();
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
  });

  test('boots the real React manager against mocked chrome APIs', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(PREVIEW_PATH);

    // The mocked chrome API must be installed before the manager imports it.
    await page.waitForFunction(() => typeof (window as unknown as { chrome?: unknown }).chrome === 'object');

    // Root renders content, not an empty shell.
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.locator('.manager-shell')).toBeVisible();
    expect(errors, `unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('renders the seeded sessions in the active board', async ({ page }) => {
    await page.goto(PREVIEW_PATH);

    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
    await expect(page.locator('#session-card-group_beta')).toBeVisible();
    await expect(page.getByText('Alpha Session')).toBeVisible();
    await expect(page.getByText('Beta Session')).toBeVisible();
  });

  test('recovers session board after a reload (storage persistence path)', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();

    await page.reload();
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
  });
});
