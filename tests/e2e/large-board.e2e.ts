import { test, expect } from '@playwright/test';
import { manyInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/manager-preview.html';
const SESSION_COUNT = 60;

/**
 * Large-board perf smoke test.
 *
 * Every session keeps a stable horizontal slot and DnD geometry. Expensive
 * card/tab interaction trees mount only near the viewport and upgrade as a
 * shell approaches the board overscan.
 */
test.describe('Large session board (stable-slot activation path)', () => {
  test.beforeEach(async ({ page }) => {
    const seed = manyInboxSessions(SESSION_COUNT);
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_000')).toBeVisible();
  });

  test('keeps every session slot while bounding the initial interactive cards', async ({ page }) => {
    const slots = page.locator('[data-session-slot-id]');
    const cards = page.locator('[id^="session-card-group_"]');
    await expect(slots).toHaveCount(SESSION_COUNT);
    await expect(cards).toHaveCount(6);
    await expect(page.locator('[data-session-shell="true"]')).toHaveCount(
      SESSION_COUNT - 6,
    );
  });

  test('upgrades a far-off shell after horizontal scroll', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    const slot = page.locator('[data-session-slot-id="group_059"]');
    const last = page.locator('#session-card-group_059');
    await expect(slot).toBeAttached();
    await expect(page.locator('#session-shell-group_059')).toBeAttached();
    await expect(last).toHaveCount(0);

    await slot.scrollIntoViewIfNeeded();
    await expect(last).toBeAttached();
    await expect(last).toBeVisible();
    await expect(last.getByRole('button', { name: 'Tab 059 One' })).toBeVisible();
    expect(errors, `unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('upgrades a shell from its title without relying on hover', async ({ page }) => {
    const shell = page.locator('#session-shell-group_020');
    await expect(shell).toBeAttached();
    await shell.getByRole('button', { name: 'Session 020', exact: true })
      .evaluate((button) => button.click());
    await expect(page.locator('#session-card-group_020')).toBeAttached();
  });
});
