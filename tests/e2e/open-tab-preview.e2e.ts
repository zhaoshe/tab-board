import { test, expect } from '@playwright/test';
import { twoInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/manager-preview.html';

test.describe('Open tab preview positioning', () => {
  test.beforeEach(async ({ page }) => {
    const seed = {
      ...twoInboxSessions(),
      tabs: Array.from({ length: 80 }, (_, index) => ({
        id: index + 1,
        windowId: 1,
        index,
        active: index === 0,
        title: `Open tab ${index + 1}`,
        url: `https://open.example/${index + 1}`,
      })),
    };
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
  });

  test('clears stale hover UI across tab and app focus changes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();
    await expect(page.locator('.manager-open-tab-row')).toHaveCount(80);

    const savedLink = page.getByRole('button', { name: 'Alpha One' });
    await savedLink.hover();
    await expect(page.locator('.manager-info-popover')).toBeVisible();
    await savedLink.click();
    await expect(page.locator('.manager-info-popover')).toHaveCount(0);

    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await expect.poll(async () => page.evaluate(() =>
      document.documentElement.hasAttribute('data-tabboard-hover-suppressed'),
    )).toBe(true);
    const selectOpacity = await page.locator('.tab-item-row__select').first().evaluate(
      (element) => getComputedStyle(element).opacity,
    );
    const deleteOpacity = await page.locator('.tab-item-row__more').first().evaluate(
      (element) => getComputedStyle(element).opacity,
    );
    expect(selectOpacity).toBe('0');
    expect(deleteOpacity).toBe('0');

    await page.evaluate(() => {
      window.dispatchEvent(new FocusEvent('focus'));
    });
    await expect(page.locator('.manager-info-popover')).toHaveCount(0);
    await expect(page.locator('.manager-open-tab-row')).toHaveCount(81);

    const openTabTrigger = page.locator('[data-info-popover="open"]').first();
    await openTabTrigger.dispatchEvent('pointermove', { movementX: 1, movementY: 0 });
    await openTabTrigger.hover();
    await expect(page.locator('.manager-info-popover')).toBeVisible();
    await expect(page.locator('.tabboard-error-boundary')).toHaveCount(0);
    expect(errors, `unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
  });
});
