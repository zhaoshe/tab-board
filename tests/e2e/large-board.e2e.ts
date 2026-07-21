import { test, expect } from '@playwright/test';
import { manyInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/manager-preview.html';
const SESSION_COUNT = 60;

/**
 * Large-board perf smoke test.
 *
 * The board uses CSS `content-visibility: auto` on session slots so off-screen
 * cards skip layout/paint but stay in the DOM. This test guards that contract:
 * every seeded session is present (not virtualized away) and a far-off card is
 * reachable via horizontal scroll.
 */
test.describe('Large session board (content-visibility perf path)', () => {
  test.beforeEach(async ({ page }) => {
    const seed = manyInboxSessions(SESSION_COUNT);
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_000')).toBeVisible();
  });

  test('keeps every session in the DOM (no virtualization drops)', async ({ page }) => {
    const cards = page.locator('[id^="session-card-group_"]');
    await expect(cards).toHaveCount(SESSION_COUNT);
  });

  test('renders without error and scrolls a far-off session into view', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    const last = page.locator('#session-card-group_059');
    // Present in the DOM even though it starts off-screen.
    await expect(last).toBeAttached();

    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
    expect(errors, `unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
  });
});
