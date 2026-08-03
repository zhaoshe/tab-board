import { test, expect, type Page } from '@playwright/test';
import type { PreviewChromeOptions } from '../../src/dev/previewChrome';
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
  const point = await header.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (let y = rect.top + 2; y < rect.bottom - 2; y += 2) {
      for (let x = rect.left + 2; x < rect.right - 2; x += 2) {
        const hit = document.elementFromPoint(x, y);
        if (
          hit
          && element.contains(hit)
          && !hit.closest('button, input, textarea, a, [data-no-drag]')
        ) {
          return { x, y };
        }
      }
    }
    throw new Error('no non-interactive session header drag point');
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  // PointerSensor activation constraint is 5px; move well past it in steps so
  // the drag actually starts.
  await page.mouse.move(point.x + 24, point.y + 12, { steps: 5 });
  await page.mouse.move(point.x + 80, point.y, { steps: 8 });
}

async function beginDragFrom(
  page: Page,
  selector: string,
): Promise<void> {
  const source = page.locator(selector);
  await expect(source).toBeVisible();
  const box = await source.boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 24, y + 12, { steps: 5 });
}

async function cancelActiveDrag(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator(OVERLAY)).toBeHidden();
  await page.mouse.up().catch(() => undefined);
}

function itemGhostState(): PreviewChromeOptions {
  const base = twoInboxSessions();
  const state = base.state as {
    groups: Array<{
      id: string;
      tabs: Array<Record<string, unknown>>;
    }>;
    [key: string]: unknown;
  };
  const groups = state.groups.map((group) => {
    if (group.id !== 'group_alpha') return group;
    const template = group.tabs[0]!;
    return {
      ...group,
      tabs: [
        ...group.tabs,
        {
          ...template,
          id: 'tab_a3',
          title: 'Alpha Three',
          url: 'https://three.alpha.example/path',
        },
        {
          ...template,
          id: 'tab_a4',
          title: 'Alpha Four',
          url: 'https://four.alpha.example/path',
        },
        {
          ...template,
          id: 'tab_a5',
          title: 'Alpha Five',
          url: 'https://five.alpha.example/path',
        },
        {
          ...template,
          id: 'tab_a6',
          title: 'Alpha Six',
          url: 'https://six.alpha.example/path',
        },
      ],
    };
  });
  const openTabs = Array.from({ length: 128 }, (_, index) => ({
    id: 101 + index,
    windowId: 1,
    index,
    active: index === 0,
    title: index === 0
      ? 'Open One'
      : index === 1
        ? 'Open Two'
        : `Open ${index + 1}`,
    url: index === 0
      ? 'https://open-one.example.test/path'
      : index === 1
        ? 'https://open-two.example.test/path'
        : `https://open-${index + 1}.example.test/path`,
  }));
  return {
    ...base,
    state: { ...state, groups },
    tabs: openTabs,
  };
}

async function selectSavedTab(
  page: Page,
  groupId: string,
  tabId: string,
  title: string,
): Promise<void> {
  const row = page.locator(
    `.tab-item-row[data-group-id="${groupId}"][data-tab-id="${tabId}"]`,
  );
  await row.hover();
  const checkbox = row.getByRole('checkbox', { name: `Select ${title}` });
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
}

async function selectOpenTab(
  page: Page,
  tabId: number,
  title: string,
): Promise<void> {
  const row = page.locator(
    `.manager-open-tab-row[data-open-tab-id="${tabId}"]:visible`,
  );
  await row.hover();
  const checkbox = row.getByRole('checkbox', { name: `Select ${title}` });
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
}

async function beginItemDrag(
  page: Page,
  sourceSelector: string,
  geometrySelector = sourceSelector,
) {
  const source = page.locator(sourceSelector);
  await expect(source).toBeVisible();
  const sourceBox = await page.locator(geometrySelector).boundingBox();
  if (!sourceBox) throw new Error(`no source bounding box for ${geometrySelector}`);
  const point = await source.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + 2, y: rect.top + 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y + 8, { steps: 4 });
  await expect(page.locator(OVERLAY)).toBeVisible();
  return sourceBox;
}

async function moveToTarget(
  page: Page,
  selector: string,
): Promise<void> {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + box.height / 2,
    { steps: 12 },
  );
  await expect(target).toHaveAttribute('data-active', 'true');
}

async function movePointerTo(page: Page, selector: string): Promise<void> {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + box.height / 2,
    { steps: 12 },
  );
}

async function moveToExactPlusTarget(
  page: Page,
  selector: string,
): Promise<void> {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  await page.mouse.move(
    box.x + box.width - 1,
    box.y + box.height / 2,
    { steps: 12 },
  );
  await expect(target).toHaveAttribute('data-active', 'true');
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + box.height / 2,
    { steps: 3 },
  );
  await expect(target).toHaveAttribute('data-active', 'true');
}

async function ghostEvidence(page: Page) {
  const preview = page.locator(OVERLAY);
  const box = await preview.boundingBox();
  if (!box) throw new Error('no drag ghost bounding box');
  const style = await preview.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      opacity: Number.parseFloat(computed.opacity),
      pointerEvents: computed.pointerEvents,
      overflowX: computed.overflowX,
      overflowY: computed.overflowY,
    };
  });
  const itemBoxes = await preview.locator(
    '.manager-drag-overlay__row, .manager-drag-overlay__count',
  ).evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }));
  const titleFontSizes = await preview.locator(
    '.manager-drag-overlay__title',
  ).evaluateAll((elements) => elements.map((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize)));
  const domainFontSizes = await preview.locator(
    '.manager-drag-overlay__domain',
  ).evaluateAll((elements) => elements.map((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize)));
  return { box, domainFontSizes, itemBoxes, style, titleFontSizes };
}

async function expectGhostRows(
  page: Page,
  titles: string[],
  domains: string[],
): Promise<void> {
  const preview = page.locator(OVERLAY);
  await expect(preview.locator('.manager-drag-overlay__title')).toHaveText(titles);
  await expect(preview.locator('.manager-drag-overlay__domain')).toHaveText(domains);
  await expect(preview.locator('button, input, textarea, a, [role="button"]'))
    .toHaveCount(0);
}

function expectReadableGhost(
  evidence: Awaited<ReturnType<typeof ghostEvidence>>,
  expectedRows: number,
  minimumTitleFont = 10,
): void {
  const tolerance = 1;
  expect(evidence.itemBoxes).toHaveLength(expectedRows);
  for (const item of evidence.itemBoxes) {
    expect(item.width).toBeGreaterThan(0);
    expect(item.height).toBeGreaterThan(0);
    expect(item.left).toBeGreaterThanOrEqual(evidence.box.x - tolerance);
    expect(item.top).toBeGreaterThanOrEqual(evidence.box.y - tolerance);
    expect(item.right).toBeLessThanOrEqual(
      evidence.box.x + evidence.box.width + tolerance,
    );
    expect(item.bottom).toBeLessThanOrEqual(
      evidence.box.y + evidence.box.height + tolerance,
    );
  }
  expect(Math.min(...evidence.titleFontSizes)).toBeGreaterThanOrEqual(
    minimumTitleFont,
  );
  expect(evidence.style.overflowX).not.toBe('visible');
  expect(evidence.style.overflowY).not.toBe('visible');
}

async function expectSourcePlaceholder(
  page: Page,
  sourceBox: { width: number; height: number },
): Promise<void> {
  const placeholder = page.locator('.tab-item-row-placeholder');
  await expect(placeholder).toBeVisible();
  const box = await placeholder.boundingBox();
  if (!box) throw new Error('no source placeholder bounding box');
  expect(Math.abs(box.width - sourceBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - sourceBox.height)).toBeLessThanOrEqual(1);
}

function categoryDragState(): PreviewChromeOptions {
  const timestamp = '2026-01-01T00:00:00.000Z';
  return {
    state: {
      version: 1,
      mutationRevision: 0,
      workspaces: [{
        id: 'workspace_default',
        name: 'Personal',
        emoji: '🗂️',
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      activeWorkspaceId: 'workspace_default',
      groups: [],
      folders: [{
        id: 'folder-work',
        name: 'Work',
        color: '#40c057',
        workspaceId: 'workspace_default',
        collapsed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
      categoryOrderByWorkspace: {
        workspace_default: [
          'inbox',
          'saved',
          'folder-work',
          'archive',
        ],
      },
      bin: [],
      dropOperationLedger: [],
      settings: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

function workspaceDragState(): PreviewChromeOptions {
  const timestamp = '2026-01-01T00:00:00.000Z';
  return {
    state: {
      version: 1,
      mutationRevision: 0,
      workspaces: [
        {
          id: 'workspace_personal',
          name: 'Personal',
          emoji: '🏠',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'workspace_work',
          name: 'Work',
          emoji: '💼',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'workspace_research',
          name: 'Research',
          emoji: '🧪',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      activeWorkspaceId: 'workspace_personal',
      groups: [],
      folders: [],
      categoryOrderByWorkspace: {},
      bin: [],
      dropOperationLedger: [],
      settings: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

function wholeSessionCommandState(): PreviewChromeOptions {
  const base = threeInboxSessions();
  const state = base.state as {
    groups: Array<Record<string, unknown> & {
      id: string;
      tabs: Array<Record<string, unknown>>;
    }>;
    [key: string]: unknown;
  };
  const source = state.groups[0]!;
  const sourceTab = source.tabs[0]!;
  return {
    ...base,
    state: {
      ...state,
      groups: [
        ...state.groups,
        {
          ...source,
          id: 'group_saved',
          title: 'Saved Session',
          starred: true,
          tabs: [{
            ...sourceTab,
            id: 'tab_saved',
            title: 'Saved One',
            url: 'https://saved.example/one',
          }],
        },
      ],
      folders: [{
        id: 'research',
        name: 'Research',
        color: '#228be6',
        workspaceId: 'workspace_default',
        collapsed: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      categoryOrderByWorkspace: {
        workspace_default: [
          'inbox',
          'saved',
          'folder:research',
          'archive',
        ],
      },
    },
  };
}

async function openMoveSessionPicker(
  page: Page,
  groupId: string,
  method: 'keyboard' | 'more' | 'context',
): Promise<void> {
  const card = page.locator(`#session-card-${groupId}`);
  const move = page.getByRole('menuitem', { name: 'Move Session' });
  if (method === 'keyboard') {
    await card.focus();
    await page.keyboard.press('Shift+F10');
    await expect(move).toBeVisible();
    await expect(page.locator(
      '.manager-overlay-menu [role="menuitem"]:not(:disabled)',
    ).first()).toBeFocused();
    const menuItemCount = await page.locator(
      '.manager-overlay-menu [role="menuitem"]:not(:disabled)',
    ).count();
    for (let index = 0; index < menuItemCount; index += 1) {
      if (await move.evaluate((element) => element === document.activeElement)) {
        break;
      }
      const previous = await page.evaluate(() =>
        document.activeElement?.textContent?.trim() ?? '');
      await page.keyboard.press('ArrowDown');
      await expect.poll(async () => page.evaluate(() =>
        document.activeElement?.textContent?.trim() ?? '')).not.toBe(previous);
    }
    await expect(move).toBeFocused();
    await page.keyboard.press('Enter');
  } else if (method === 'context') {
    await card.click({ button: 'right' });
    await expect(move).toBeVisible();
    await move.click();
  } else {
    await card.locator('.session-card__header').hover();
    await card.getByRole('button', { name: 'More' }).click();
    await expect(move).toBeVisible();
    await move.click();
  }
  await expect(page.getByRole('dialog', { name: 'Move Session To' }))
    .toBeVisible();
}

async function storedSessionPlacement(page: Page) {
  return page.evaluate(async () => {
    const stored = await chrome.storage.local.get('tabboardState');
    const state = stored.tabboardState as {
      groups: Array<{
        id: string;
        folderId: string | null;
        starred: boolean;
        archived: boolean;
      }>;
    };
    return state.groups.map((group) => ({
      id: group.id,
      folderId: group.folderId,
      starred: group.starred,
      archived: group.archived,
    }));
  });
}

test.describe('Immutable Saved and Open Tabs drag ghost geometry', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((options) => {
      sessionStorage.clear();
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, itemGhostState());
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_alpha')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('keeps five selected Saved rows in one readable envelope across targets', async ({ page }) => {
    await selectSavedTab(page, 'group_alpha', 'tab_a1', 'Alpha One');
    await selectSavedTab(page, 'group_alpha', 'tab_a2', 'Alpha Two');
    await selectSavedTab(page, 'group_alpha', 'tab_a3', 'Alpha Three');
    await selectSavedTab(page, 'group_alpha', 'tab_a4', 'Alpha Four');
    await selectSavedTab(page, 'group_alpha', 'tab_a5', 'Alpha Five');
    const sourceBox = await beginItemDrag(
      page,
      '.tab-item-row[data-group-id="group_alpha"][data-tab-id="tab_a1"] .tab-item-row__content',
    );

    await expectGhostRows(
      page,
      ['Alpha One', 'Alpha Two', 'Alpha Three', 'Alpha Four', 'Alpha Five'],
      [
        'alpha.example',
        'alpha.example',
        'three.alpha.example',
        'four.alpha.example',
        'five.alpha.example',
      ],
    );
    const pickup = await ghostEvidence(page);
    await expectSourcePlaceholder(page, sourceBox);
    expect(Math.abs(pickup.box.width - sourceBox.width)).toBeLessThanOrEqual(1);
    expect(pickup.box.height).toBe(140);
    expectReadableGhost(pickup, 5);
    const pickupTitles = await page.locator(
      `${OVERLAY} .manager-drag-overlay__title`,
    ).allTextContents();
    const existingSelector = '#session-card-group_beta';
    await movePointerTo(page, existingSelector);
    const existing = await ghostEvidence(page);
    expect(existing.box.width).toBe(pickup.box.width);
    expect(existing.box.height).toBe(pickup.box.height);
    expect(existing.titleFontSizes).toEqual(pickup.titleFontSizes);
    expect(await page.locator(
      `${OVERLAY} .manager-drag-overlay__title`,
    ).allTextContents()).toEqual(pickupTitles);
    expectReadableGhost(existing, 5);
    const targetSelector =
      '.session-board__new-session-end-anchor .new-session-gap-target';
    await moveToExactPlusTarget(page, targetSelector);

    await expectGhostRows(
      page,
      ['Alpha One', 'Alpha Two', 'Alpha Three', 'Alpha Four', 'Alpha Five'],
      [
        'alpha.example',
        'alpha.example',
        'three.alpha.example',
        'four.alpha.example',
        'five.alpha.example',
      ],
    );
    const targeted = await ghostEvidence(page);
    expectReadableGhost(targeted, 5);
    expect(targeted.box.width).toBe(pickup.box.width);
    expect(targeted.box.height).toBe(pickup.box.height);
    expect(targeted.titleFontSizes).toEqual(pickup.titleFontSizes);
    expect(targeted.style.opacity).toBeGreaterThan(0);
    expect(targeted.style.opacity).toBeLessThan(1);
    expect(targeted.style.pointerEvents).toBe('none');

    const layers = await page.locator('.manager-drag-overlay').evaluate(
      (overlay, selector) => ({
        overlay: Number.parseInt(getComputedStyle(overlay).zIndex, 10),
        target: Number.parseInt(
          getComputedStyle(document.querySelector(selector)! as Element).zIndex,
          10,
        ),
      }),
      targetSelector,
    );
    expect(layers.overlay).toBeGreaterThan(layers.target);

    await page.keyboard.press('Escape');
    await page.mouse.up().catch(() => undefined);
  });

  test('keeps every selected Open row and the pickup rectangle over an empty full-slot target', async ({ page }) => {
    await page.getByRole('button', { name: /^Archive/ }).click();
    await expect(page.getByText('No archived sessions yet')).toBeVisible();
    await selectOpenTab(page, 101, 'Open One');
    await selectOpenTab(page, 102, 'Open Two');
    const sourceBox = await beginItemDrag(
      page,
      '.manager-open-tab-row[data-open-tab-id="101"]:visible',
    );

    await expectGhostRows(
      page,
      ['Open One', 'Open Two'],
      ['open-one.example.test', 'open-two.example.test'],
    );
    const pickup = await ghostEvidence(page);
    expect(pickup.box.width).toBe(sourceBox.width);
    expect(pickup.box.height).toBe(56);
    expectReadableGhost(pickup, 2);
    const targetSelector = '.session-board__empty-slot-target';
    await moveToTarget(page, targetSelector);

    await expectGhostRows(
      page,
      ['Open One', 'Open Two'],
      ['open-one.example.test', 'open-two.example.test'],
    );
    const targeted = await ghostEvidence(page);
    expectReadableGhost(targeted, 2);
    expect(targeted.box.width).toBe(pickup.box.width);
    expect(targeted.box.height).toBe(pickup.box.height);
    expect(targeted.style.opacity).toBeGreaterThan(0);
    expect(targeted.style.opacity).toBeLessThan(1);
    expect(targeted.style.pointerEvents).toBe('none');

    const layers = await page.locator('.manager-drag-overlay').evaluate(
      (overlay, selector) => {
        const target = document.querySelector(selector)! as Element;
        const plus = target.querySelector('.session-board__empty-slot-plus')!;
        return {
          overlay: Number.parseInt(getComputedStyle(overlay).zIndex, 10),
          target: Number.parseInt(getComputedStyle(target).zIndex, 10),
          plus: Number.parseInt(getComputedStyle(plus).zIndex, 10),
        };
      },
      targetSelector,
    );
    expect(layers.overlay).toBeGreaterThan(layers.target);
    expect(layers.overlay).toBeGreaterThan(layers.plus);

    await page.keyboard.press('Escape');
    await page.mouse.up().catch(() => undefined);
  });

  test('renders every legal Open Tab in a finite readable pickup envelope', async ({ page }) => {
    await selectOpenTab(page, 101, 'Open One');
    await page.getByRole('button', { name: 'Select All Visible Tabs' }).click();
    await expect(page.getByText('128 Selected', { exact: true })).toBeVisible();
    await beginItemDrag(
      page,
      '.manager-open-tab-row[data-open-tab-id="101"]:visible',
    );

    const preview = page.locator(OVERLAY);
    await expect(preview.locator('.manager-drag-overlay__row')).toHaveCount(128);
    await expect(preview.locator('.manager-drag-overlay__title').first())
      .toHaveText('Open One');
    await expect(preview.locator('.manager-drag-overlay__title').last())
      .toHaveText('Open 128');
    const evidence = await ghostEvidence(page);
    expect(evidence.box.width).toBe(952);
    expect(evidence.box.height).toBe(532);
    expect(evidence.box.width).toBeLessThanOrEqual(960);
    expect(evidence.box.height).toBeLessThanOrEqual(560);
    expectReadableGhost(evidence, 128, 12);
    expect(Math.min(...evidence.itemBoxes.map((box) => box.width)))
      .toBeGreaterThanOrEqual(128);
    expect(Math.min(...evidence.itemBoxes.map((box) => box.height)))
      .toBeGreaterThanOrEqual(27.5);
    expect(Math.min(...evidence.domainFontSizes)).toBeGreaterThanOrEqual(10);
    expect(await preview.locator('.manager-drag-overlay__row').evaluateAll(
      (rows) => rows.every((row) => {
        const rowRect = row.getBoundingClientRect();
        const title = row.querySelector('.manager-drag-overlay__title');
        const domain = row.querySelector('.manager-drag-overlay__domain');
        if (!title?.textContent?.trim() || !domain?.textContent?.trim()) {
          return false;
        }
        return [title, domain].every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width >= 24
            && rect.height >= 10
            && rect.left >= rowRect.left
            && rect.right <= rowRect.right
            && rect.top >= rowRect.top
            && rect.bottom <= rowRect.bottom;
        });
      }),
    )).toBe(true);

    await page.keyboard.press('Escape');
    await page.mouse.up().catch(() => undefined);
  });

  test('preserves 34x16 identity tiles when the viewport cannot contain all items', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 180 });
    await page.reload();
    await expect(page.locator(
      '.manager-open-tab-row[data-open-tab-id="101"]:visible',
    )).toBeVisible();
    await page.getByRole('button', { name: 'Expand Sidebar' }).click();
    await expect(page.locator('.manager-shell')).toHaveClass(
      /manager-shell--sidebar-drawer/,
    );
    await selectOpenTab(page, 101, 'Open One');
    await page.getByRole('button', { name: 'Select All Visible Tabs' }).click();
    await expect(page.getByText('128 Selected', { exact: true })).toBeVisible();
    await beginItemDrag(
      page,
      '.manager-open-tab-row[data-open-tab-id="101"]:visible',
    );

    const preview = page.locator(OVERLAY);
    await expect(preview).toHaveAttribute('data-preview-mode', 'identity');
    await expect(preview.locator('.manager-drag-overlay__row')).toHaveCount(128);
    await expect(preview.locator('.manager-drag-overlay__title').first())
      .toHaveText('Open One');
    await expect(preview.locator('.manager-drag-overlay__title').last())
      .toHaveText('Open 128');
    const evidence = await ghostEvidence(page);
    expect(evidence.box.width).toBe(272);
    expect(evidence.box.height).toBe(256);
    expect(evidence.box.height).toBeGreaterThan(180);
    expect(Math.min(...evidence.itemBoxes.map((box) => box.width))).toBe(34);
    expect(Math.min(...evidence.itemBoxes.map((box) => box.height))).toBe(16);
    expect(Math.min(...evidence.titleFontSizes)).toBeGreaterThanOrEqual(10);
    expect(await preview.locator('.manager-drag-overlay__domain').evaluateAll(
      (elements) => elements.every((element) => {
        const rect = element.getBoundingClientRect();
        return getComputedStyle(element).display === 'none'
          && rect.width === 0
          && rect.height === 0;
      }),
    )).toBe(true);
    expect(evidence.style.pointerEvents).toBe('none');
    expect(await preview.locator('.manager-drag-overlay__row').evaluateAll(
      (rows) => rows.every((row) => {
        const title = row.querySelector('.manager-drag-overlay__title');
        const rect = title?.getBoundingClientRect();
        return Boolean(title?.textContent?.trim())
          && Boolean(rect && rect.width > 0 && rect.height >= 10);
      }),
    )).toBe(true);
    expect(await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      overlayPosition: getComputedStyle(
        document.querySelector('.manager-drag-overlay')!,
      ).position,
    }))).toEqual({
      bodyScrollWidth: 320,
      documentScrollWidth: 320,
      innerWidth: 320,
      overlayPosition: 'fixed',
    });

    await page.keyboard.press('Escape');
    await page.mouse.up().catch(() => undefined);
  });
});

test.describe.serial('Whole-session hybrid commands', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((options) => {
      sessionStorage.clear();
      (window as unknown as { __TABBOARD_PREVIEW__: unknown })
        .__TABBOARD_PREVIEW__ = options;
    }, wholeSessionCommandState());
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
  });

  test('names every canonical target and Escape preserves order and trigger focus', async ({ page }) => {
    const placementBefore = await storedSessionPlacement(page);
    const orderBefore = await page.locator('.session-card__title').allTextContents();

    await openMoveSessionPicker(page, 'group_alpha', 'keyboard');

    await expect(page.getByRole('option')).toHaveText([
      'After Beta Session in Inbox',
      'After Gamma Session in Inbox',
      'Before Saved Session in Saved',
      'After Saved Session in Saved',
      'First in Research',
      'First in Archive',
    ]);
    expect((await page.getByRole('option').allTextContents()).join(' '))
      .not.toMatch(/group_(?:alpha|beta|gamma|saved)/);

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', {
      name: 'After Gamma Session in Inbox',
    })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(
      'span.visually-hidden[aria-live="polite"]',
      { hasText: /^Preview After Gamma Session in Inbox$/ },
    ))
      .toContainText('Preview After Gamma Session in Inbox');
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog', { name: 'Move Session To' }))
      .toBeHidden();
    await expect(page.locator(
      '#session-card-group_alpha button[aria-label="More"]',
    )).toBeFocused();
    expect(await page.locator('.session-card__title').allTextContents())
      .toEqual(orderBefore);
    expect(await storedSessionPlacement(page)).toEqual(placementBefore);
  });

  test('reorders within Inbox from More and restores the surviving Session action', async ({ page }) => {
    await openMoveSessionPicker(page, 'group_alpha', 'more');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog', { name: 'Move Session To' }))
      .toBeHidden();
    await expect(page.locator('.session-card__title')).toHaveText([
      'Beta Session',
      'Gamma Session',
      'Alpha Session',
    ]);
    await expect(page.locator(
      '#session-card-group_alpha button[aria-label="More"]',
    )).toBeFocused();
  });

  test('moves across categories from the context menu and focuses a safe fallback', async ({ page }) => {
    await openMoveSessionPicker(page, 'group_alpha', 'context');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('dialog', { name: 'Move Session To' }))
      .toBeHidden();
    await expect(page.locator('.session-card__title')).toHaveText([
      'Beta Session',
      'Gamma Session',
    ]);
    expect(await page.evaluate(() =>
      Boolean(document.activeElement?.closest(
        '.session-card, .session-board, .manager-board',
      )))).toBe(true);

    await page.locator('[data-category-id="saved"]').click();
    await expect(page.locator('.session-card__title')).toHaveText([
      'Alpha Session',
      'Saved Session',
    ]);
    expect(await storedSessionPlacement(page)).toEqual([
      {
        id: 'group_beta',
        folderId: null,
        starred: false,
        archived: false,
      },
      {
        id: 'group_gamma',
        folderId: null,
        starred: false,
        archived: false,
      },
      {
        id: 'group_alpha',
        folderId: null,
        starred: true,
        archived: false,
      },
      {
        id: 'group_saved',
        folderId: null,
        starred: true,
        archived: false,
      },
    ]);
  });
});

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

test.describe('Session drag surface semantics', () => {
  test.beforeEach(async ({ page }) => {
    const seed = threeInboxSessions();
    const state = seed.state as {
      groups: Array<{ id: string; note: string }>;
    };
    state.groups = state.groups.map((group) => (
      group.id === 'group_alpha'
        ? { ...group, note: 'Alpha session note' }
        : group
    ));
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
  });

  test('has no visible or hidden keyboard drag activator', async ({ page }) => {
    const header = page.locator(
      '#session-card-group_alpha > .session-card__header',
    );
    await expect(header.locator('[class*="session-card__drag"]')).toHaveCount(0);
    await expect(header.locator('[aria-label*="Drag"][aria-label*="reorder"]'))
      .toHaveCount(0);
    await expect(header.locator('[aria-roledescription="sortable"]'))
      .toHaveCount(0);
  });

  test('drags from title, metadata, note, and whitespace but not actions', async ({ page }) => {
    for (const selector of [
      '#session-card-group_alpha .session-card__title',
      '#session-card-group_alpha .session-card__meta',
      '#session-card-group_alpha .session-card__note',
    ]) {
      await beginDragFrom(page, selector);
      await expect(page.locator(OVERLAY)).toBeVisible();
      await cancelActiveDrag(page);
    }

    await beginSessionDrag(page, 'group_alpha');
    await expect(page.locator(OVERLAY)).toBeVisible();
    await cancelActiveDrag(page);

    for (const name of ['Restore', 'More']) {
      await beginDragFrom(
        page,
        `#session-card-group_alpha button[aria-label="${name}"]`,
      );
      await expect(page.locator(OVERLAY)).toBeHidden();
      await page.mouse.up();
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('Workspace manager drag lifecycle', () => {
  test('reorders whole rows and persists the canonical Workspace order', async ({ page }) => {
    await page.addInitScript((options) => {
      sessionStorage.clear();
      (window as unknown as { __TABBOARD_PREVIEW__: unknown })
        .__TABBOARD_PREVIEW__ = options;
    }, workspaceDragState());
    await page.goto(PREVIEW_PATH);

    await page.getByRole('button', { name: 'Workspace: Personal' }).click();
    await page.getByText('Manage Workspaces', { exact: true }).click();
    const rows = page.locator('[data-workspace-id]');
    const order = () => rows.evaluateAll((elements) => elements.map((element) =>
      element.getAttribute('data-workspace-id')));
    await expect.poll(order).toEqual([
      'workspace_personal',
      'workspace_work',
      'workspace_research',
    ]);

    await page.locator('[data-workspace-id="workspace_personal"]').dragTo(
      page.locator('[data-workspace-id="workspace_research"]'),
      { targetPosition: { x: 40, y: 44 } },
    );

    await expect.poll(order).toEqual([
      'workspace_work',
      'workspace_research',
      'workspace_personal',
    ]);
    await expect.poll(() => page.evaluate(async () => {
      const stored = await chrome.storage.local.get('tabboardState');
      return (stored.tabboardState as {
        workspaces: Array<{ id: string }>;
      }).workspaces.map(({ id }) => id);
    })).toEqual([
      'workspace_work',
      'workspace_research',
      'workspace_personal',
    ]);
  });
});

test.describe('Category drag lifecycle (@dnd-kit pointer sensor)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, categoryDragState());
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('[data-category-id="inbox"]')).toBeVisible();
  });

  test('keeps 3px movement as navigation and activates typed drag after 7px', async ({ page }) => {
    const saved = page.locator('[data-category-id="saved"]');
    const savedBox = await saved.boundingBox();
    if (!savedBox) throw new Error('Missing Saved category bounds.');
    const savedX = savedBox.x + savedBox.width / 2;
    const savedY = savedBox.y + savedBox.height / 2;

    await page.mouse.move(savedX, savedY);
    await page.mouse.down();
    await page.mouse.move(savedX + 3, savedY);
    await page.mouse.up();

    await expect(saved).toHaveAttribute('aria-current', 'page');
    await expect(page.locator(OVERLAY)).toBeHidden();

    const work = page.locator('[data-category-id="folder:folder-work"]');
    const workBox = await work.boundingBox();
    if (!workBox) throw new Error('Missing Work category bounds.');
    const workX = workBox.x + workBox.width / 2;
    const workY = workBox.y + workBox.height / 2;
    await page.mouse.move(workX, workY);
    await page.mouse.down();
    await page.mouse.move(workX + 7, workY);

    await expect(page.locator(OVERLAY)).toBeVisible();
    await expect(page.locator(OVERLAY)).toContainText('folder:folder-work');

    await page.keyboard.press('Escape');
    await expect(page.locator(OVERLAY)).toBeHidden();
    await page.mouse.up().catch(() => undefined);
  });

  test('reorders a whole category tab and keeps Manage Categories synchronized', async ({ page }) => {
    const work = page.locator('[data-category-id="folder:folder-work"]');
    const archive = page.locator('[data-category-id="archive"]');
    const workBox = await work.boundingBox();
    const archiveBox = await archive.boundingBox();
    if (!workBox || !archiveBox) throw new Error('Missing category bounds.');

    await page.mouse.move(
      workBox.x + workBox.width / 2,
      workBox.y + workBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      workBox.x + workBox.width / 2 + 7,
      workBox.y + workBox.height / 2,
    );
    await page.mouse.move(
      archiveBox.x + archiveBox.width - 2,
      archiveBox.y + archiveBox.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();

    await expect.poll(() => page.locator('[data-category-id]').evaluateAll(
      (elements) => elements.map((element) =>
        element.getAttribute('data-category-id')),
    )).toEqual(['inbox', 'saved', 'archive', 'folder:folder-work']);
    await page.getByRole('button', { name: 'Category Options' }).click();
    await page.getByText('Manage Categories', { exact: true }).click();
    await expect.poll(() => page.locator('[data-category-manager-id]').evaluateAll(
      (elements) => elements.map((element) =>
        element.getAttribute('data-category-manager-id')),
    )).toEqual(['inbox', 'saved', 'archive', 'folder:folder-work']);
  });

  test('reorders native manager rows while adjacent drops remain no-ops', async ({ page }) => {
    await page.getByRole('button', { name: 'Category Options' }).click();
    await page.getByText('Manage Categories', { exact: true }).click();
    const rows = page.locator('[data-category-manager-id]');
    const order = () => rows.evaluateAll((elements) => elements.map((element) =>
      element.getAttribute('data-category-manager-id')));

    await expect.poll(order).toEqual([
      'inbox',
      'saved',
      'folder:folder-work',
      'archive',
    ]);

    await page.locator('[data-category-manager-id="saved"]').dragTo(
      page.locator('[data-category-manager-id="folder:folder-work"]'),
      {
        targetPosition: { x: 40, y: 2 },
      },
    );
    await expect.poll(order).toEqual([
      'inbox',
      'saved',
      'folder:folder-work',
      'archive',
    ]);

    await page.locator('[data-category-manager-id="folder:folder-work"]').dragTo(
      page.locator('[data-category-manager-id="archive"]'),
      {
        targetPosition: { x: 40, y: 28 },
      },
    );
    await expect.poll(order).toEqual([
      'inbox',
      'saved',
      'archive',
      'folder:folder-work',
    ]);
  });
});
