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

function seed() {
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
        group('group_alpha', 'Alpha Session', [
          link('tab_a1', 'Alpha One', 'https://alpha.example/one'),
          link('tab_a2', 'Alpha Two', 'https://alpha.example/two'),
        ]),
        group('group_beta', 'Beta Session', [
          link('tab_b1', 'Beta One', 'https://beta.example/one'),
        ]),
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

async function boot(page: Page): Promise<void> {
  await page.addInitScript((options) => {
    sessionStorage.clear();
    (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
  }, seed());
  await page.goto(PREVIEW_PATH);
  await expect(page.locator('#session-card-group_alpha')).toBeVisible();
}

async function persistedState(page: Page) {
  return page.evaluate(async () => (
    await chrome.storage.local.get('tabboardState')
  ).tabboardState as {
    groups: Array<{
      id: string;
      title: string;
      starred: boolean;
      tabs: Array<{ id: string; title: string; url: string }>;
    }>;
  });
}

async function drag(page: Page, sourceSelector: string, targetSelector: string): Promise<void> {
  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error(`Missing drag geometry: ${sourceSelector} -> ${targetSelector}`);
  }
  const sourcePoint = await source.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (let x = rect.left + 4; x < rect.right - 4; x += 4) {
      const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
      if (
        hit
        && element.contains(hit)
        && !hit.closest('button, input, textarea, a, [data-no-drag]')
      ) {
        return { x, y: rect.top + rect.height / 2 };
      }
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(
    sourcePoint.x + 12,
    sourcePoint.y + 8,
    { steps: 4 },
  );
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
}

test.describe('Required DnD acceptance paths', () => {
  test.beforeEach(async ({ page }) => boot(page));

  test('reorders a session within the same category', async ({ page }) => {
    await drag(
      page,
      '#session-card-group_alpha .session-card__drag-handle',
      '[data-drop-target="new-group"]',
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
      '#session-card-group_alpha .session-card__drag-handle',
      '[data-category-column="saved"]',
    );

    await expect.poll(async () => (
      await persistedState(page)
    ).groups.find(({ id }) => id === 'group_alpha')?.starred).toBe(true);
  });

  test('moves one saved tab into an existing session', async ({ page }) => {
    await drag(
      page,
      '[data-group-id="group_alpha"][data-tab-id="tab_a1"] .tab-item-row__content',
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

  test('copies multiple selected Open Tabs into an existing session', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Select Open One' }).check();
    await page.getByRole('checkbox', { name: 'Select Open Two' }).check();
    await drag(
      page,
      '[data-open-tab-id="101"] .manager-open-tab-drag-handle',
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

  test('creates a new session from multiple selected Open Tabs', async ({ page }) => {
    await page.getByRole('checkbox', { name: 'Select Open One' }).check();
    await page.getByRole('checkbox', { name: 'Select Open Two' }).check();
    await drag(
      page,
      '[data-open-tab-id="101"] .manager-open-tab-drag-handle',
      '[data-category-column="inbox"]',
    );

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
});
