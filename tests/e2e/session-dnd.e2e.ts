import { test, expect, type Page } from '@playwright/test';
import { threeInboxSessions, twoInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/manager-preview.html';
const OVERLAY = '.manager-drag-overlay__preview';

/**
 * Smoke coverage for the `@dnd-kit` pointer-drag lifecycle in the real manager.
 *
 * Pointer drag is the primary path; these tests exercise the shared
 * drag-overlay contract and the Escape cancel path end to end. Exhaustive drop
 * resolution (ownership, indices, no-op detection) stays in the pure
 * `src/manager/core/dnd.test.ts` suite, which is cheaper and deterministic.
 */

/** Press-and-move on a session header to activate a drag, without releasing. */
async function beginSessionDrag(page: Page, groupId: string): Promise<void> {
  const header = page.locator(`#session-card-${groupId} .session-card__header`);
  const box = await header.boundingBox();
  if (!box) throw new Error(`no bounding box for ${groupId}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // PointerSensor activation constraint is 5px; move well past it in steps so
  // the drag actually starts.
  await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 12, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
}

test.describe('Session drag lifecycle (@dnd-kit pointer sensor)', () => {
  test.beforeEach(async ({ page }) => {
    const seed = twoInboxSessions();
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
  });

  test('shows the drag overlay while a session drag is active and tears it down on drop', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await beginSessionDrag(page, 'group_alpha');
    await expect(page.locator(OVERLAY)).toBeVisible();

    await page.mouse.up();
    await expect(page.locator(OVERLAY)).toBeHidden();

    // Both sessions remain present and the board is error-free.
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
    await expect(page.locator('#session-card-group_beta')).toBeVisible();
    expect(errors, `unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('cancels a drag with Escape without mutating the board', async ({ page }) => {
    const titlesBefore = await page.locator('.session-card__title').allTextContents();

    await beginSessionDrag(page, 'group_alpha');
    await expect(page.locator(OVERLAY)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(OVERLAY)).toBeHidden();
    await page.mouse.up().catch(() => undefined);

    const titlesAfter = await page.locator('.session-card__title').allTextContents();
    expect(titlesAfter).toEqual(titlesBefore);
  });
});

test.describe('Session drag lifecycle (@dnd-kit keyboard sensor)', () => {
  test.beforeEach(async ({ page }) => {
    const seed = threeInboxSessions();
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
  });

  test('exposes an accessible, focusable drag handle', async ({ page }) => {
    const handle = page.locator('#session-card-group_alpha .session-card__drag-handle');
    await expect(handle).toHaveAttribute('role', 'button');
    await expect(handle).toHaveAttribute('tabindex', '0');
    await expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
    await expect(handle).toHaveAttribute('aria-label', /drag .* to reorder/i);
  });

  test('reorders sessions using only the keyboard', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await expect(page.locator('.session-card__title')).toHaveText([
      'Alpha Session',
      'Beta Session',
      'Gamma Session',
    ]);

    const handle = page.locator('#session-card-group_alpha .session-card__drag-handle');
    await handle.focus();
    await page.keyboard.press('Space');
    await expect(page.locator(OVERLAY)).toBeVisible();
    const liveRegion = page.locator('[role="status"]');
    await expect(liveRegion).toContainText('group-insert-group_alpha');

    // Move past Beta's insertion point so the drop is not an adjacent no-op.
    await page.keyboard.press('ArrowRight');
    await expect(liveRegion).toContainText('group-insert-group_beta');
    await page.keyboard.press('ArrowRight');
    await expect(liveRegion).toContainText('group-insert-group_gamma');
    await page.keyboard.press('Space');

    await expect(page.locator(OVERLAY)).toBeHidden();
    await expect(page.locator('.session-card__title')).toHaveText([
      'Beta Session',
      'Alpha Session',
      'Gamma Session',
    ]);
    expect(errors, `unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
  });
});
