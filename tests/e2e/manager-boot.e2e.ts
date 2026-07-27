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

  test('deep-links and restores Manager navigation with browser history', async ({ page }) => {
    await page.goto(`${PREVIEW_PATH}?workspace=workspace_default&category=archive&view=board&q=needle`);

    await expect(page.locator('.manager-board')).toHaveAttribute(
      'aria-label',
      'Personal Archive sessions',
    );
    await expect(page.getByRole('textbox', { name: 'Search Saved Sessions' }))
      .toHaveValue('needle');

    await page.getByRole('button', { name: 'Trash' }).click();
    await expect(page).toHaveURL(/view=bin/);
    await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/view=board/);
    await expect(page.locator('.manager-board')).toHaveAttribute(
      'aria-label',
      'Personal Archive sessions',
    );
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 800, height: 800 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test(`keeps header geometry and critical actions usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(PREVIEW_PATH);
      await expect(page.locator('.manager-shell')).toBeVisible();

      const geometry = await page.evaluate(() => {
        const topbar = document.querySelector('.manager-topbar')!.getBoundingClientRect();
        const categoryNav = document.querySelector('.manager-category-nav')!.getBoundingClientRect();
        return {
          topbar: { top: topbar.top, bottom: topbar.bottom },
          category: { top: categoryNav.top, bottom: categoryNav.bottom },
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: innerWidth,
        };
      });
      expect(geometry.category.top).toBeGreaterThanOrEqual(geometry.topbar.top);
      expect(geometry.category.bottom).toBeLessThanOrEqual(geometry.topbar.bottom);
      expect(geometry.scrollWidth).toBe(geometry.viewportWidth);

      if (viewport.width <= 760) {
        await page.getByRole('button', { name: 'More Actions' }).click();
        for (const name of ['Import', 'Export', 'Trash', 'Options']) {
          await expect(page.getByRole('menuitem', { name })).toBeVisible();
        }
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Show Search' }).click();
        await expect(page.getByRole('textbox', { name: 'Search Saved Sessions' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'More Actions' })).toBeHidden();
      }
    });
  }
});
