import { test, expect } from '@playwright/test';
import { twoInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/popup-preview.html';

function popupScenarioSeed({
  closeTabsAfterSave = true,
  customUrlFilter = '',
  tabs,
}: {
  closeTabsAfterSave?: boolean;
  customUrlFilter?: string;
  tabs: Array<Record<string, unknown>>;
}) {
  const seed = twoInboxSessions();
  const state = seed.state as {
    settings: Record<string, unknown>;
  };
  state.settings = {
    ...state.settings,
    closeTabsAfterSave,
    customUrlFilter,
    dedupeOnSave: false,
    openManagerAfterSave: false,
  };
  return { ...seed, tabs };
}

async function installPopupScenario(
  page: import('@playwright/test').Page,
  seed: ReturnType<typeof popupScenarioSeed>,
) {
  await page.addInitScript((options) => {
    (window as unknown as { __TABBOARD_PREVIEW__: unknown })
      .__TABBOARD_PREVIEW__ = options;
  }, seed);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(PREVIEW_PATH);
  await expect(page.locator('.popup-app')).toBeVisible();
}

test.describe('Popup approved P2 geometry', () => {
  test('matches the confirmed header, body, pinned, and action hierarchy', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.popup-app')).toBeVisible();

    const geometry = await page.locator('.popup-app').evaluate((popup) => {
      const select = <T extends Element>(selector: string): T => {
        const element = popup.querySelector<T>(selector);
        if (!element) throw new Error(`Missing Popup element: ${selector}`);
        return element;
      };
      const rect = (element: Element) => {
        const bounds = element.getBoundingClientRect();
        return {
          width: bounds.width,
          height: bounds.height,
        };
      };
      const header = select<HTMLElement>('.popup-app__header');
      const body = select<HTMLElement>('.popup-app__capture');
      const brand = select<HTMLImageElement>('.popup-app__brand-icon');
      const count = select<HTMLElement>('.popup-app__count');
      const pinned = select<HTMLElement>('.popup-app__pinned');
      const checkbox = select<HTMLElement>(
        '.popup-app__pinned .mantine-Checkbox-inner',
      );
      const checkboxInput = select<HTMLInputElement>(
        '.popup-app__pinned .mantine-Checkbox-input',
      );
      const checkboxIcon = select<SVGElement>(
        '.popup-app__pinned .mantine-Checkbox-icon',
      );
      const checkboxLabel = select<HTMLElement>(
        '.popup-app__pinned .mantine-Checkbox-label',
      );
      const helper = select<HTMLElement>('.popup-app__pinned-helper');
      const duplicate = select<HTMLElement>('.popup-app__duplicate-row');
      const save = select<HTMLElement>('.popup-app__save');
      const remove = select<HTMLElement>('.popup-app__dedupe');
      const headerActions = [
        ...header.querySelectorAll<HTMLElement>('button'),
      ].map(rect);
      const headerStyle = getComputedStyle(header);
      const bodyStyle = getComputedStyle(body);
      const countStyle = getComputedStyle(count);
      const checkboxInputBounds = checkboxInput.getBoundingClientRect();
      const checkboxIconBounds = checkboxIcon.getBoundingClientRect();
      return {
        popup: rect(popup),
        header: rect(header),
        headerPaddingInline: Number.parseFloat(headerStyle.paddingInlineStart),
        body: rect(body),
        bodyPadding: Number.parseFloat(bodyStyle.paddingTop),
        bodyRowGap: Number.parseFloat(bodyStyle.rowGap),
        brand: rect(brand),
        brandAttributes: {
          width: brand.width,
          height: brand.height,
        },
        countWeight: countStyle.fontWeight,
        pinned: rect(pinned),
        checkbox: rect(checkbox),
        checkboxInput: rect(checkboxInput),
        checkboxIcon: rect(checkboxIcon),
        checkboxInputRadius: getComputedStyle(checkboxInput).borderRadius,
        checkboxIconCenterDelta: {
          x: Math.abs(
            checkboxInputBounds.left + checkboxInputBounds.width / 2
            - (checkboxIconBounds.left + checkboxIconBounds.width / 2),
          ),
          y: Math.abs(
            checkboxInputBounds.top + checkboxInputBounds.height / 2
            - (checkboxIconBounds.top + checkboxIconBounds.height / 2),
          ),
        },
        checkboxLabel: checkboxLabel.textContent,
        checkboxAccessibleName: checkboxInput.getAttribute('aria-label'),
        helper: rect(helper),
        helperWhiteSpace: getComputedStyle(helper).whiteSpace,
        duplicate: rect(duplicate),
        save: rect(save),
        remove: rect(remove),
        saveIcons: save.querySelectorAll('svg').length,
        removeIcons: remove.querySelectorAll('svg').length,
        headerActions,
      };
    });

    expect(geometry.popup.width).toBe(320);
    expect(geometry.header.height).toBe(52);
    expect(geometry.headerPaddingInline).toBe(16);
    expect(geometry.bodyPadding).toBe(16);
    expect(geometry.bodyRowGap).toBe(10);
    expect(geometry.brand).toEqual({ width: 22, height: 22 });
    expect(geometry.brandAttributes).toEqual({ width: 22, height: 22 });
    expect(geometry.countWeight).toBe('700');
    expect(geometry.checkbox).toEqual({ width: 16, height: 16 });
    expect(geometry.checkboxInput).toEqual({ width: 16, height: 16 });
    expect(geometry.checkboxIcon.width).toBeGreaterThanOrEqual(9.5);
    expect(geometry.checkboxIcon.height).toBeGreaterThanOrEqual(6.5);
    expect(geometry.checkboxInputRadius).toBe('4px');
    expect(geometry.checkboxIconCenterDelta.x).toBeLessThanOrEqual(0.01);
    expect(geometry.checkboxIconCenterDelta.y).toBeLessThanOrEqual(0.01);
    expect(geometry.checkboxLabel).toBe('1 pinned');
    expect(geometry.checkboxAccessibleName).toBe('Include 1 pinned tab');
    expect(geometry.pinned.height).toBe(56);
    expect(geometry.helper.height).toBe(32);
    expect(geometry.helperWhiteSpace).toBe('normal');
    expect(geometry.duplicate.height).toBe(40);
    expect(geometry.save).toEqual({ width: 80, height: 32 });
    expect(geometry.remove).toEqual({ width: 80, height: 32 });
    expect(geometry.saveIcons).toBe(0);
    expect(geometry.removeIcons).toBe(0);
    expect(geometry.headerActions).toEqual([
      { width: 32, height: 32 },
      { width: 32, height: 32 },
    ]);
  });

  test('removes the pinned region without leaving an empty layout track', async ({ page }) => {
    const seed = {
      ...twoInboxSessions(),
      tabs: [
        {
          id: 1,
          windowId: 1,
          index: 0,
          active: true,
          title: 'Duplicate one',
          url: 'https://duplicate.example/',
        },
        {
          id: 2,
          windowId: 1,
          index: 1,
          title: 'Duplicate two',
          url: 'https://duplicate.example/',
        },
        {
          id: 3,
          windowId: 1,
          index: 2,
          title: 'Regular tab',
          url: 'https://regular.example/',
        },
      ],
    };
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown })
        .__TABBOARD_PREVIEW__ = options;
    }, seed);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(PREVIEW_PATH);

    await expect(page.locator('.popup-app__pinned')).toHaveCount(0);
    const geometry = await page.locator('.popup-app__capture').evaluate(
      (body) => {
        const save = body.querySelector<HTMLElement>(
          '.popup-app__save-copy',
        )?.getBoundingClientRect();
        const duplicate = body.querySelector<HTMLElement>(
          '.popup-app__duplicate-row',
        )?.getBoundingClientRect();
        if (!save || !duplicate) {
          throw new Error('Popup save or duplicate row is missing.');
        }
        return {
          rowGap: duplicate.top - save.bottom,
          saveHeight: save.height,
          duplicateHeight: duplicate.height,
          paddingBlock: Number.parseFloat(
            getComputedStyle(body).paddingTop,
          ),
          bodyHeight: body.getBoundingClientRect().height,
          overflow: body.scrollWidth - body.clientWidth,
        };
      },
    );
    expect(geometry.rowGap).toBe(10);
    expect(geometry.bodyHeight).toBe(
      (geometry.paddingBlock * 2)
      + geometry.saveHeight
      + geometry.rowGap
      + geometry.duplicateHeight,
    );
    expect(geometry.overflow).toBe(0);
  });

  test('renders the confirmed mixed, excluded, and keep-all pinned outcomes', async ({ page }) => {
    const tabs = [
      ...Array.from({ length: 4 }, (_, index) => ({
        id: index + 1,
        windowId: 1,
        index,
        active: index === 0,
        pinned: false,
        title: `Regular ${index + 1}`,
        url: `https://regular-${index + 1}.example/`,
      })),
      {
        id: 5,
        windowId: 1,
        index: 4,
        pinned: false,
        title: 'Regular duplicate',
        url: 'https://protected-duplicate.example/',
      },
      {
        id: 6,
        windowId: 1,
        index: 5,
        pinned: true,
        title: 'Pinned duplicate',
        url: 'https://protected-duplicate.example/',
      },
      {
        id: 7,
        windowId: 1,
        index: 6,
        pinned: true,
        title: 'Pinned context',
        url: 'https://pinned-context.example/',
      },
    ];
    await installPopupScenario(page, popupScenarioSeed({ tabs }));

    await expect(page.locator('.popup-app__count')).toHaveText('7 tabs');
    await expect(page.locator('.popup-app__save-helper'))
      .toHaveText('Save and close tabs');
    await expect(page.locator('.popup-app__pinned-helper'))
      .toHaveText('Pinned tabs will be saved and stay open after capture.');
    await expect(page.locator('.popup-app__duplicate')).toHaveText(
      '1 duplicate tab',
    );
    await expect(page.locator('.popup-app__duplicate-helper')).toHaveText(
      'Pinned duplicates stay open',
    );

    await page.getByRole('checkbox', {
      name: 'Include 2 pinned tabs',
    }).uncheck();
    await expect(page.locator('.popup-app__count')).toHaveText('5 tabs');
    await expect(page.locator('.popup-app__save-helper'))
      .toHaveText('Save and close tabs');
    await expect(page.locator('.popup-app__pinned-helper'))
      .toHaveText('Pinned tabs will not be saved and will stay open.');
    await expect(page.locator('.popup-app__duplicate-helper')).toHaveText(
      'Pinned duplicates stay open',
    );

    await page.reload();
    await expect(page.locator('.popup-app')).toBeVisible();
    await page.evaluate(async () => {
      const result = await chrome.runtime.sendMessage({
        type: 'saveSelectedTabs',
        selectedWindowId: 1,
        tabIds: [1, 2, 3, 4, 5, 6, 7],
        workspaceId: 'workspace_default',
      });
      if (result?.ok !== true) throw new Error(String(result?.error));
    });
    const remaining = await page.evaluate(async () =>
      (await chrome.tabs.query({ currentWindow: true })).map((tab) => tab.id));
    expect(remaining).toEqual([6, 7]);

    const keepPage = await page.context().newPage();
    await installPopupScenario(
      keepPage,
      popupScenarioSeed({ closeTabsAfterSave: false, tabs }),
    );
    await expect(keepPage.locator('.popup-app__save-helper'))
      .toHaveText('Save and keep tabs open');
    await expect(keepPage.locator('.popup-app__duplicate-helper')).toHaveText(
      'Pinned duplicates stay open',
    );
    await keepPage.close();
  });

  test('handles pinned-only, regular-only, and all-pinned duplicate scenarios without empty tracks', async ({ page }) => {
    const pinnedOnly = Array.from({ length: 3 }, (_, index) => ({
      id: index + 1,
      windowId: 1,
      index,
      active: index === 0,
      pinned: true,
      title: `Pinned ${index + 1}`,
      url: `https://pinned-${index + 1}.example/`,
    }));
    await installPopupScenario(page, popupScenarioSeed({ tabs: pinnedOnly }));
    await expect(page.locator('.popup-app__count')).toHaveText('3 tabs');
    await expect(page.locator('.popup-app__duplicate-row')).toHaveCount(0);

    const regularPage = await page.context().newPage();
    const regularOnly = [
      {
        id: 1,
        windowId: 1,
        index: 0,
        active: true,
        title: 'Duplicate 1',
        url: 'https://regular-duplicate.example/',
      },
      {
        id: 2,
        windowId: 1,
        index: 1,
        title: 'Duplicate 2',
        url: 'https://regular-duplicate.example/',
      },
      {
        id: 3,
        windowId: 1,
        index: 2,
        title: 'Duplicate 3',
        url: 'https://regular-duplicate.example/',
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: index + 4,
        windowId: 1,
        index: index + 3,
        title: `Regular ${index + 1}`,
        url: `https://regular-${index + 1}.example/`,
      })),
    ];
    await installPopupScenario(
      regularPage,
      popupScenarioSeed({ tabs: regularOnly }),
    );
    await expect(regularPage.locator('.popup-app__pinned')).toHaveCount(0);
    await expect(regularPage.locator('.popup-app__duplicate')).toHaveText(
      '2 duplicate tabs',
    );
    await expect(regularPage.locator('.popup-app__duplicate-helper')).toHaveText(
      'Keep one copy in this window',
    );
    await regularPage.close();

    const protectedPage = await page.context().newPage();
    await installPopupScenario(
      protectedPage,
      popupScenarioSeed({
        tabs: [
          {
            id: 1,
            windowId: 1,
            index: 0,
            active: true,
            pinned: true,
            title: 'Pinned duplicate 1',
            url: 'https://all-pinned.example/',
          },
          {
            id: 2,
            windowId: 1,
            index: 1,
            pinned: true,
            title: 'Pinned duplicate 2',
            url: 'https://all-pinned.example/',
          },
        ],
      }),
    );
    await expect(protectedPage.locator('.popup-app__duplicate-row'))
      .toHaveCount(0);
    await expect(protectedPage.getByRole('button', {
      name: /Remove Duplicate Tabs/,
    })).toHaveCount(0);
    await protectedPage.close();
  });

  test('keeps duplicate removal independent from the capture Exclude URL scope', async ({ page }) => {
    await installPopupScenario(
      page,
      popupScenarioSeed({
        customUrlFilter: 'excluded.example',
        tabs: [
          {
            id: 1,
            windowId: 1,
            index: 0,
            active: true,
            title: 'Excluded duplicate 1',
            url: 'https://excluded.example/repeated',
          },
          {
            id: 2,
            windowId: 1,
            index: 1,
            title: 'Excluded duplicate 2',
            url: 'https://excluded.example/repeated',
          },
        ],
      }),
    );

    await expect(page.locator('.popup-app__count')).toHaveText('0 tabs');
    await expect(page.locator('.popup-app__save')).toBeDisabled();
    await expect(page.locator('.popup-app__duplicate')).toHaveText(
      '1 duplicate tab',
    );
    await expect(page.locator('.popup-app__duplicate-helper')).toHaveText(
      'Keep one copy in this window',
    );
    await page.locator('.popup-app__dedupe').click();
    await expect(page.getByRole('dialog', { name: 'Remove Duplicate Tabs' }))
      .toHaveCount(0);
    await expect.poll(async () => page.evaluate(async () =>
      (await chrome.tabs.query({ currentWindow: true })).length,
    )).toBe(1);
  });
});
