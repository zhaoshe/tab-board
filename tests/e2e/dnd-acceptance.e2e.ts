import { expect, test, type Page } from '@playwright/test';

const PREVIEW_PATH = '/dev/manager-preview.html';
const WORKSPACE_ID = 'workspace_default';

function link(id: string, title: string, url: string) {
  return {
    id,
    itemType: 'link' as const,
    title,
    url,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: 'none' as const,
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function group(
  id: string,
  title: string,
  tabs: ReturnType<typeof link>[],
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title,
    note: '',
    workspaceId: WORKSPACE_ID,
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function seed(options: { overflow?: boolean } = {}) {
  const inboxGroups = [
    group('group_alpha', 'Alpha Session', [
      link('tab_a1', 'Alpha One', 'https://alpha.example/one'),
      link('tab_a2', 'Alpha Two', 'https://alpha.example/two'),
    ]),
    group('group_beta', 'Beta Session', [
      link('tab_b1', 'Beta One', 'https://beta.example/one'),
    ]),
  ];
  if (options.overflow) {
    inboxGroups.push(...Array.from({ length: 6 }, (_, index) => group(
      `group_overflow_${index + 1}`,
      `Overflow Session ${index + 1}`,
      [
        link(
          `tab_overflow_${index + 1}`,
          `Overflow Tab ${index + 1}`,
          `https://overflow-${index + 1}.example/`,
        ),
      ],
    )));
  }
  return {
    state: {
      version: 1,
      mutationRevision: 0,
      workspaces: [{
        id: WORKSPACE_ID,
        name: 'Personal',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      activeWorkspaceId: WORKSPACE_ID,
      groups: [
        ...inboxGroups,
        group('group_saved', 'Saved Session', [
          link('tab_s1', 'Saved One', 'https://saved.example/one'),
        ], { starred: true }),
      ],
      folders: [],
      categoryOrderByWorkspace: {},
      bin: [],
      dropOperationLedger: [],
      settings: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    tabs: [
      {
        id: 101,
        windowId: 1,
        index: 0,
        active: true,
        title: 'Open One',
        url: 'https://open.example/one',
      },
      {
        id: 102,
        windowId: 1,
        index: 1,
        active: false,
        title: 'Open Two',
        url: 'https://open.example/two',
      },
      {
        id: 103,
        windowId: 1,
        index: 2,
        active: false,
        title: 'Open Three',
        url: 'https://open.example/three',
      },
    ],
  };
}

async function boot(
  page: Page,
  options: { overflow?: boolean } = {},
): Promise<void> {
  await page.addInitScript((options) => {
    sessionStorage.clear();
    (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
  }, seed(options));
  await page.goto(PREVIEW_PATH);
  await expect(page).toHaveURL(
    /workspace=workspace_default.*category=inbox.*view=board/,
  );
  await expect(page.locator('#session-card-group_alpha')).toBeVisible();
  await expect(page.locator('#session-card-group_beta')).toBeVisible();
  await expect(page.locator(
    '.manager-open-tab-row[data-open-tab-id="101"]:visible',
  )).toHaveCount(1);
}

async function persistedState(page: Page) {
  return page.evaluate(async () => (
    await chrome.storage.local.get('tabboardState')
  ).tabboardState as {
    groups: Array<{
      id: string;
      title: string;
      starred: boolean;
      archived: boolean;
      tabs: Array<{ id: string; title: string; url: string }>;
    }>;
  });
}

async function selectOpenTab(page: Page, tabId: number, title: string): Promise<void> {
  const row = page.locator(
    `.manager-open-tab-row[data-open-tab-id="${tabId}"]:visible`,
  );
  await row.hover();
  const checkbox = row.getByRole('checkbox', { name: `Select ${title}` });
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
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

async function startDrag(page: Page, sourceSelector: string): Promise<void> {
  const source = page.locator(sourceSelector);
  await expect(source).toBeVisible();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error(`Missing drag source geometry: ${sourceSelector}`);
  }
  const sourcePoint = await source.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    if (element.matches('.manager-open-tab-row, .tab-item-row__content')) {
      return { x: rect.left + 2, y: rect.top + 2 };
    }
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
    throw new Error(`No non-interactive drag point inside ${element.className}`);
  });
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(
    sourcePoint.x + 12,
    sourcePoint.y + 8,
    { steps: 4 },
  );
  await expect(page.locator('.manager-drag-overlay__preview')).toBeVisible();
}

async function startDragFromCenter(
  page: Page,
  sourceSelector: string,
): Promise<void> {
  const source = page.locator(sourceSelector);
  await expect(source).toBeVisible();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error(`Missing drag source geometry: ${sourceSelector}`);
  }
  const x = sourceBox.x + sourceBox.width / 2;
  const y = sourceBox.y + sourceBox.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 8, { steps: 4 });
  await expect(page.locator('.manager-drag-overlay__preview')).toBeVisible();
}

async function moveToTarget(
  page: Page,
  targetSelector: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const target = page.locator(targetSelector);
  await expect(target).toBeVisible();
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error(`Missing drag target geometry: ${targetSelector}`);
  }
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 },
  );
  return targetBox;
}

async function moveToExactNewSessionTarget(
  page: Page,
  targetSelector: string,
): Promise<void> {
  const target = page.locator(targetSelector);
  await expect(target).toBeVisible();
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error(`Missing new-session target geometry: ${targetSelector}`);
  }
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 },
  );
  await expect(target).toHaveAttribute('data-active', 'true');
}

async function expectReleaseTipWithinViewport(page: Page): Promise<void> {
  const bounds = await page.locator('.new-session-gap-target__release-tip')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
  expect(bounds.left).toBeGreaterThanOrEqual(12);
  expect(bounds.top).toBeGreaterThanOrEqual(12);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth - 12);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight - 12);
}

async function expectEmptySlotAffordanceClear(
  page: Page,
  primaryCopy: string,
): Promise<void> {
  const slot = page.locator('.session-board__empty-slot-target');
  const plusBox = await slot.locator('.session-board__empty-slot-plus').boundingBox();
  const copyBox = await slot.getByText(primaryCopy, { exact: true }).boundingBox();
  const iconBox = await slot.locator('svg').boundingBox();
  if (!plusBox || !copyBox || !iconBox) {
    throw new Error('Missing empty-slot affordance geometry.');
  }
  expect(plusBox.y).toBeGreaterThanOrEqual(iconBox.y + iconBox.height);
  expect(plusBox.y + plusBox.height).toBeLessThanOrEqual(copyBox.y);
}

async function drag(page: Page, sourceSelector: string, targetSelector: string): Promise<void> {
  await startDrag(page, sourceSelector);
  await moveToTarget(page, targetSelector);
  await page.mouse.up();
}

test.describe('Required DnD acceptance paths', () => {
  test.beforeEach(async ({ page }) => boot(page));

  test('starts an Open Tab drag from both title and URL copy', async ({ page }) => {
    const row = '.manager-open-tab-row[data-open-tab-id="101"]:visible';
    for (const selector of [
      `${row} .manager-open-tab-title`,
      `${row} .manager-open-tab-url`,
    ]) {
      await startDragFromCenter(page, selector);
      await page.keyboard.press('Escape');
      await page.mouse.up().catch(() => undefined);
      await expect(page.locator('.manager-drag-overlay__preview')).toBeHidden();
    }
  });

  test('reorders a session within the same category', async ({ page }) => {
    await drag(
      page,
      '#session-card-group_alpha .session-card__header',
      '.session-board__group-end-target[data-drop-target="group-insert"]',
    );

    await expect.poll(async () => (
      await persistedState(page)
    ).groups.filter((item) => !item.starred).map(({ id }) => id)).toEqual([
      'group_beta',
      'group_alpha',
    ]);
  });

  test('moves a session across categories', async ({ page }) => {
    await drag(
      page,
      '#session-card-group_alpha .session-card__header',
      '[data-category-column="saved"]',
    );

    await expect.poll(async () => (
      await persistedState(page)
    ).groups.find(({ id }) => id === 'group_alpha')?.starred).toBe(true);
  });

  test('moves one saved tab into an existing session', async ({ page }) => {
    await drag(
      page,
      '.tab-item-row[data-group-id="group_alpha"][data-tab-id="tab_a1"] .tab-item-row__content',
      '#session-card-group_beta',
    );

    await expect.poll(async () => {
      const state = await persistedState(page);
      return {
        source: state.groups.find(({ id }) => id === 'group_alpha')?.tabs.map(({ id }) => id),
        target: state.groups.find(({ id }) => id === 'group_beta')?.tabs.map(({ id }) => id),
      };
    }).toEqual({
      source: ['tab_a2'],
      target: ['tab_b1', 'tab_a1'],
    });
  });

  test('reorders one saved tab within its source session', async ({ page }) => {
    await startDrag(
      page,
      '.tab-item-row[data-group-id="group_alpha"][data-tab-id="tab_a1"] .tab-item-row__content',
    );
    await moveToTarget(page, '#session-card-group_alpha');
    await expect(page.locator('.manager-shell'))
      .toHaveAttribute('data-drag-target', 'group-body');
    await page.mouse.up();

    await expect.poll(async () => (
      await persistedState(page)
    ).groups.find(({ id }) => id === 'group_alpha')?.tabs.map(({ id }) => id))
      .toEqual(['tab_a2', 'tab_a1']);
  });

  test('copies multiple selected Open Tabs into an existing session', async ({ page }) => {
    await selectOpenTab(page, 101, 'Open One');
    await selectOpenTab(page, 102, 'Open Two');
    await drag(
      page,
      '.manager-open-tab-row[data-open-tab-id="101"]:visible',
      '#session-card-group_beta',
    );

    await expect.poll(async () => {
      const target = (await persistedState(page)).groups
        .find(({ id }) => id === 'group_beta');
      return target?.tabs.map(({ url }) => url);
    }).toEqual([
      'https://beta.example/one',
      'https://open.example/one',
      'https://open.example/two',
    ]);
  });

  test('keeps the between-session plus hit-testable at its center', async ({ page }) => {
    await selectOpenTab(page, 101, 'Open One');
    await startDrag(
      page,
      '.manager-open-tab-row[data-open-tab-id="101"]:visible',
    );
    const target = page.locator(
      '.session-board__group-slot:nth-child(2) > .new-session-gap-target',
    );

    await expect(target).toBeVisible();
    expect(await target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      ) === element;
    })).toBe(true);

    await page.keyboard.press('Escape');
    await page.mouse.up().catch(() => undefined);
  });

  test('activates the exact end plus from the last Session body, clears on leave, dwells, and creates only on release', async ({ page }) => {
    await selectOpenTab(page, 101, 'Open One');
    await selectOpenTab(page, 102, 'Open Two');
    await startDrag(
      page,
      '.manager-open-tab-row[data-open-tab-id="101"]:visible',
    );
    const initialSlots = await page.locator('.session-slot').count();
    const endTarget = '.session-board__new-session-end-anchor .new-session-gap-target';
    await expect(page.locator(endTarget)).toBeVisible();
    await moveToTarget(page, '#session-card-group_beta');
    await expect(page.locator('.manager-shell'))
      .toHaveAttribute('data-drag-target', 'group-body');

    await moveToExactNewSessionTarget(page, endTarget);
    await expect(page.locator('.manager-shell'))
      .toHaveAttribute('data-drag-target', 'new-session-insert');
    await expect(page.locator('.session-slot')).toHaveCount(initialSlots);

    const targetBox = await page.locator(endTarget).boundingBox();
    if (!targetBox) throw new Error('Missing exact end-plus geometry.');
    await page.mouse.move(
      targetBox.x + targetBox.width + 1,
      targetBox.y + targetBox.height / 2,
    );
    await expect(page.locator(endTarget)).not.toHaveAttribute('data-active', 'true');
    await expect(page.locator('.manager-shell'))
      .not.toHaveAttribute('data-drag-target', 'new-session-insert');

    await page.clock.install();
    const startTarget = '.session-board__group-slot:first-child > .new-session-gap-target';
    await moveToExactNewSessionTarget(page, startTarget);
    await expect(page.locator('.new-session-gap-target__release-tip')).toHaveCount(0);

    await page.clock.runFor(300);
    const tip = page.locator('.new-session-gap-target__release-tip');
    await expect(tip).toHaveText('Release to create session');
    const layers = await tip.evaluate((element) => ({
      pointerEvents: getComputedStyle(element).pointerEvents,
      tip: Number.parseInt(getComputedStyle(element).zIndex, 10),
      ghost: Number.parseInt(getComputedStyle(
        document.querySelector('.manager-drag-overlay')!,
      ).zIndex, 10),
    }));
    expect(layers.pointerEvents).toBe('none');
    expect(layers.tip).toBeGreaterThan(layers.ghost);
    await expectReleaseTipWithinViewport(page);
    await expect(page.locator('.session-slot')).toHaveCount(initialSlots);

    await page.clock.resume();
    const startTargetBox = await page.locator(startTarget).boundingBox();
    if (!startTargetBox) throw new Error('Missing exact start-plus geometry after tip.');
    await page.mouse.move(
      startTargetBox.x + startTargetBox.width + 1,
      startTargetBox.y + startTargetBox.height / 2,
    );
    await expect(page.locator(startTarget)).not.toHaveAttribute('data-active', 'true');
    await expect(tip).toHaveCount(0);
    await expect(page.locator('.manager-shell'))
      .not.toHaveAttribute('data-drag-target', 'new-session-insert');
    await expect(page.locator('.session-slot')).toHaveCount(initialSlots);

    const betweenTarget =
      '.session-board__group-slot:nth-child(2) > .new-session-gap-target';
    await moveToExactNewSessionTarget(page, betweenTarget);
    await expect(page.locator('.manager-shell'))
      .toHaveAttribute('data-drag-target', 'new-session-insert');
    await expect(page.locator('.session-slot')).toHaveCount(initialSlots);
    const betweenTargetBox = await page.locator(betweenTarget).boundingBox();
    if (!betweenTargetBox) throw new Error('Missing exact between-plus geometry.');
    await page.mouse.move(
      betweenTargetBox.x + betweenTargetBox.width + 1,
      betweenTargetBox.y + betweenTargetBox.height / 2,
    );
    await expect(page.locator(betweenTarget))
      .not.toHaveAttribute('data-active', 'true');

    await moveToExactNewSessionTarget(page, endTarget);
    await expect(tip).toBeVisible();
    await expectReleaseTipWithinViewport(page);
    const targetBoxAfterTip = await page.locator(endTarget).boundingBox();
    if (!targetBoxAfterTip) throw new Error('Missing exact end-plus geometry after tip.');
    await page.mouse.move(
      targetBoxAfterTip.x + targetBoxAfterTip.width + 1,
      targetBoxAfterTip.y + targetBoxAfterTip.height / 2,
    );
    await expect(page.locator(endTarget)).not.toHaveAttribute('data-active', 'true');
    await expect(tip).toHaveCount(0);

    await moveToExactNewSessionTarget(page, endTarget);
    await expect(page.locator('.session-slot')).toHaveCount(initialSlots);
    await page.mouse.up();

    await expect.poll(async () => {
      const inbox = (await persistedState(page)).groups.filter((item) => !item.starred);
      return {
        count: inbox.length,
        lastUrls: inbox.at(-1)?.tabs.map(({ url }) => url),
      };
    }).toEqual({
      count: 3,
      lastUrls: [
        'https://open.example/one',
        'https://open.example/two',
      ],
    });
  });

  test('Saved All Source hides every New target but still merges into Existing', async ({ page }) => {
    await selectSavedTab(page, 'group_alpha', 'tab_a1', 'Alpha One');
    await selectSavedTab(page, 'group_alpha', 'tab_a2', 'Alpha Two');
    await startDrag(
      page,
      '.tab-item-row[data-group-id="group_alpha"][data-tab-id="tab_a1"] .tab-item-row__content',
    );

    await expect(page.locator('.new-session-gap-target')).toHaveCount(0);
    await expect(page.locator('.session-board__empty-slot-target')).toHaveCount(0);
    await moveToTarget(page, '#session-card-group_beta');
    await expect(page.locator('.manager-shell'))
      .toHaveAttribute('data-drag-target', 'group-body');
    await page.mouse.up();

    await expect.poll(async () => {
      const state = await persistedState(page);
      return {
        sourceExists: state.groups.some(({ id }) => id === 'group_alpha'),
        targetTabs: state.groups.find(({ id }) => id === 'group_beta')
          ?.tabs.map(({ id }) => id),
      };
    }).toEqual({
      sourceExists: false,
      targetTabs: ['tab_b1', 'tab_a1', 'tab_a2'],
    });
  });

  test('partial Saved Tabs retain exact plus creation', async ({ page }) => {
    await selectSavedTab(page, 'group_alpha', 'tab_a1', 'Alpha One');
    await startDrag(
      page,
      '.tab-item-row[data-group-id="group_alpha"][data-tab-id="tab_a1"] .tab-item-row__content',
    );

    await expect(page.locator('.new-session-gap-target')).toHaveCount(3);
    const endTarget = '.session-board__new-session-end-anchor .new-session-gap-target';
    await moveToExactNewSessionTarget(page, endTarget);
    await page.mouse.up();

    await expect.poll(async () => {
      const inbox = (await persistedState(page)).groups.filter((item) => !item.starred);
      return {
        count: inbox.length,
        sourceTabs: inbox.find(({ id }) => id === 'group_alpha')
          ?.tabs.map(({ id }) => id),
        createdTabs: inbox.at(-1)?.tabs.map(({ id }) => id),
      };
    }).toEqual({
      count: 3,
      sourceTabs: ['tab_a2'],
      createdTabs: ['tab_a1'],
    });
  });

  test('creates a first session in the empty Archive full-slot target', async ({ page }) => {
    await page.getByRole('button', { name: /^Archive/ }).click();
    await expect(page.getByText('No archived sessions yet')).toBeVisible();

    await startDrag(page, '.manager-open-tab-row[data-open-tab-id="101"]:visible');
    const slotSelector = '.session-board__empty-slot-target';
    const slotBox = await moveToTarget(page, slotSelector);
    const boardBox = await page.locator('.manager-board').boundingBox();
    if (!boardBox) throw new Error('Missing manager board geometry.');

    expect(slotBox.width).toBe(340);
    expect(slotBox.height).toBe(boardBox.height);
    await expect(page.locator(`${slotSelector}[data-active="true"]`)).toBeVisible();
    const activeCopy = page.locator(slotSelector)
      .getByText('Release to create session', { exact: true });
    await expect(activeCopy).toBeVisible();
    await expect(activeCopy).toHaveCount(1);
    await expect(page.locator('.new-session-gap-target__release-tip')).toHaveCount(0);
    await expect(activeCopy).toHaveCount(1);
    await expect(page.getByText('No archived sessions yet')).toHaveCount(0);
    await expectEmptySlotAffordanceClear(page, 'Release to create session');
    await page.mouse.up();

    await expect.poll(async () => {
      const archive = (await persistedState(page)).groups.filter((item) => item.archived);
      return archive.length === 1
        && archive[0]?.tabs.map(({ url }) => url).join(',') === 'https://open.example/one'
        ? archive[0].id
        : null;
    }).not.toBeNull();

    const createdGroupId = (await persistedState(page)).groups
      .filter((item) => item.archived)[0]?.id;
    expect(createdGroupId).toBeTruthy();
    const createdCard = page.locator(`#session-card-${createdGroupId}`);
    await expect(createdCard).toBeVisible();
    const createdCardBox = await createdCard.boundingBox();
    if (!createdCardBox) throw new Error('Missing created session geometry.');
    expect(createdCardBox.x).toBe(slotBox.x);
    expect(createdCardBox.y).toBe(slotBox.y + 3);
    expect(createdCardBox.width).toBe(slotBox.width);
    expect(createdCardBox.height).toBe(slotBox.height - 8);
    const archiveIds = (await persistedState(page)).groups
      .filter((item) => item.archived)
      .map(({ id }) => id);
    expect(archiveIds[0]).toBe(createdGroupId);
  });

  test('cancels an Open Tabs drag when the browser source is replaced', async ({ page }) => {
    await startDrag(page, '.manager-open-tab-row[data-open-tab-id="101"]:visible');
    await expect(page.locator('.manager-drag-overlay__preview')).toBeVisible();

    await page.evaluate(async () => {
      await chrome.tabs.create({
        windowId: 1,
        active: false,
        url: 'https://source-replacement.example/new',
      });
    });

    await expect(page.locator(
      '.manager-open-tab-row:visible',
    )).toHaveCount(4);
    await expect(page.locator('.manager-drag-overlay__preview')).toBeHidden();
    await expect(page.locator('.manager-shell'))
      .not.toHaveClass(/manager-shell--drag-active/);
    await page.mouse.up().catch(() => undefined);
    await expect.poll(async () => (
      await persistedState(page)
    ).groups.map(({ id }) => id)).toEqual([
      'group_alpha',
      'group_beta',
      'group_saved',
    ]);
  });
});

test.describe('Board-owned progressive auto-scroll', () => {
  test.describe.configure({ mode: 'serial' });

  test('uses the same native vertical scrolling for Open Tabs and Session tabs', async ({ page }) => {
    await boot(page, { overflow: true });

    const contract = await page.evaluate(() => {
      const sidebar = document.querySelector<HTMLElement>(
        '.manager-open-tabs-scroll',
      )!;
      const session = document.querySelector<HTMLElement>(
        '#session-card-group_alpha .session-card__tabs',
      )!;
      return {
        hasMantineViewport: Boolean(sidebar.querySelector(
          '.mantine-ScrollArea-viewport',
        )),
        sessionOverflowX: getComputedStyle(session).overflowX,
        sessionOverflowY: getComputedStyle(session).overflowY,
        sidebarOverflowX: getComputedStyle(sidebar).overflowX,
        sidebarOverflowY: getComputedStyle(sidebar).overflowY,
      };
    });

    expect(contract).toEqual({
      hasMantineViewport: false,
      sessionOverflowX: 'hidden',
      sessionOverflowY: 'auto',
      sidebarOverflowX: 'hidden',
      sidebarOverflowY: 'auto',
    });
  });

  test('keeps reduced-motion Board auto-scroll, exact-plus pause, and drop semantics', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await boot(page, { overflow: true });
    await expect.poll(() => page.locator('.manager-sidebar__overlay').evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).transitionDuration),
    )).toBeLessThanOrEqual(0.001);
    const board = page.locator('.manager-board');
    const sidebarViewport = page.locator('.manager-open-tabs-scroll');
    const sessionTabList = page.locator(
      '#session-card-group_alpha .session-card__tabs',
    );
    const metrics = await board.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth + 1_000);

    await startDrag(page, '.manager-open-tab-row[data-open-tab-id="101"]:visible');

    const boardBox = await board.boundingBox();
    if (!boardBox) throw new Error('Missing overflow board geometry.');
    await page.mouse.move(
      boardBox.x + boardBox.width - 8,
      boardBox.y + 40,
      { steps: 12 },
    );
    const beforeRight = await page.evaluate(() => {
      const boardElement = document.querySelector<HTMLElement>('.manager-board')!;
      const sidebar = document.querySelector<HTMLElement>(
        '.manager-open-tabs-scroll',
      )!;
      const sessionTabs = document.querySelector<HTMLElement>(
        '#session-card-group_alpha .session-card__tabs',
      )!;
      const ghost = document.querySelector<HTMLElement>(
        '.manager-drag-overlay__preview',
      )!.getBoundingClientRect();
      return {
        boardLeft: boardElement.scrollLeft,
        ghost: { x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height },
        pageX: window.scrollX,
        pageY: window.scrollY,
        sessionTop: sessionTabs.scrollTop,
        sidebarTop: sidebar.scrollTop,
      };
    });

    await expect.poll(() => board.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(beforeRight.boardLeft + 60);
    const afterRight = await page.evaluate(() => {
      const ghost = document.querySelector<HTMLElement>(
        '.manager-drag-overlay__preview',
      )!.getBoundingClientRect();
      return {
        ghost: { x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height },
        pageX: window.scrollX,
        pageY: window.scrollY,
        sessionTop: document.querySelector<HTMLElement>(
          '#session-card-group_alpha .session-card__tabs',
        )!.scrollTop,
        sidebarTop: document.querySelector<HTMLElement>(
          '.manager-open-tabs-scroll',
        )!.scrollTop,
      };
    });
    expect(afterRight.ghost).toEqual(beforeRight.ghost);
    expect(afterRight.pageX).toBe(beforeRight.pageX);
    expect(afterRight.pageY).toBe(beforeRight.pageY);
    expect(afterRight.sidebarTop).toBe(beforeRight.sidebarTop);
    expect(afterRight.sessionTop).toBe(beforeRight.sessionTop);

    const beforeLeft = await board.evaluate((element) => element.scrollLeft);
    await page.mouse.move(boardBox.x + 8, boardBox.y + 40, { steps: 12 });
    await expect.poll(() => board.evaluate((element) => element.scrollLeft))
      .toBeLessThan(beforeLeft - 60);

    const stagedTarget = await page.evaluate(() => {
      const boardElement = document.querySelector<HTMLElement>('.manager-board')!;
      const targets = Array.from(document.querySelectorAll<HTMLElement>(
        '.session-board__group-slot > .new-session-gap-target',
      ));
      const target = targets[Math.floor(targets.length / 2)];
      if (!target) throw new Error('Missing middle new-session target.');
      const boardRect = boardElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      boardElement.scrollLeft += (
        targetRect.left + targetRect.width / 2
        - (boardRect.right - 8)
      );
      boardElement.dispatchEvent(new Event('scroll'));
      const stagedRect = target.getBoundingClientRect();
      return {
        x: stagedRect.left + stagedRect.width / 2,
        y: stagedRect.top + stagedRect.height / 2,
      };
    });
    await page.mouse.move(stagedTarget.x, stagedTarget.y);
    const activeTarget = page.locator(
      '.session-board__group-slot > .new-session-gap-target[data-active="true"]',
    );
    await expect(activeTarget).toHaveCount(1);
    await expect(page.locator('.manager-shell'))
      .toHaveAttribute('data-drag-target', 'new-session-insert');
    const pausedScrollLeft = await board.evaluate((element) => element.scrollLeft);
    await page.waitForTimeout(250);
    expect(await board.evaluate((element) => element.scrollLeft))
      .toBe(pausedScrollLeft);

    const activeBox = await activeTarget.boundingBox();
    if (!activeBox) throw new Error('Missing active exact target geometry.');
    await page.mouse.move(
      activeBox.x + activeBox.width + 1,
      activeBox.y + activeBox.height / 2,
    );
    await expect(activeTarget).toHaveCount(0);
    await expect(page.locator('.manager-shell'))
      .not.toHaveAttribute('data-drag-target', 'new-session-insert');
    await expect.poll(() => board.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(pausedScrollLeft);

    const idleX = boardBox.x + boardBox.width / 2;
    const idleY = boardBox.y + 40;
    await page.mouse.move(idleX, idleY);
    await expect(page.locator('.manager-shell'))
      .not.toHaveAttribute('data-drag-target', 'new-session-insert');
    const idleScrollLeft = await board.evaluate((element) => element.scrollLeft);
    await page.waitForTimeout(100);
    expect(await board.evaluate((element) => element.scrollLeft))
      .toBe(idleScrollLeft);

    const releaseStage = await page.evaluate(() => {
      const boardElement = document.querySelector<HTMLElement>('.manager-board')!;
      const targets = Array.from(document.querySelectorAll<HTMLElement>(
        '.session-board__group-slot > .new-session-gap-target',
      ));
      const targetIndex = Math.floor(targets.length / 2);
      const target = targets[targetIndex];
      if (!target) throw new Error('Missing middle release target.');
      const boardRect = boardElement.getBoundingClientRect();
      const beforeRect = target.getBoundingClientRect();
      boardElement.scrollLeft += (
        beforeRect.left + beforeRect.width / 2
        - (boardRect.left + boardRect.width / 2)
      );
      boardElement.dispatchEvent(new Event('scroll'));
      return {
        targetIndex,
      };
    });
    const releaseTarget = page.locator(
      '.session-board__group-slot > .new-session-gap-target',
    ).nth(releaseStage.targetIndex);
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    }));
    await page.waitForTimeout(50);
    const releaseBox = await releaseTarget.boundingBox();
    if (!releaseBox) throw new Error('Missing staged release target geometry.');
    const releaseX = releaseBox.x + releaseBox.width / 2;
    const releaseY = releaseBox.y + releaseBox.height / 2;
    const stagedScrollLeft = await board.evaluate((element) => element.scrollLeft);
    await page.mouse.move(releaseX, releaseY);
    await expect(releaseTarget).toHaveAttribute('data-active', 'true');
    await expect(page.locator('.manager-shell'))
      .toHaveAttribute('data-drag-target', 'new-session-insert');
    await expect(page.locator('[data-dnd-release-announcement]'))
      .toHaveText('Release to create session');
    expect(await board.evaluate((element) => element.scrollLeft))
      .toBe(stagedScrollLeft);
    await page.mouse.up();

    await expect.poll(async () => {
      const inbox = (await persistedState(page)).groups.filter(
        (item) => !item.starred && !item.archived,
      );
      return {
        count: inbox.length,
        createdUrls: inbox.find((item) =>
          item.tabs.some(({ url }) => url === 'https://open.example/one'))
          ?.tabs.map(({ url }) => url),
      };
    }).toEqual({
      count: 9,
      createdUrls: ['https://open.example/one'],
    });
    expect(await sidebarViewport.evaluate((element) => element.scrollTop))
      .toBe(beforeRight.sidebarTop);
    expect(await sessionTabList.evaluate((element) => element.scrollTop))
      .toBe(beforeRight.sessionTop);
  });
});
