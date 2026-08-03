import { test, expect } from '@playwright/test';
import { twoInboxSessions } from './fixtures';

const MANAGER_PATH = '/dev/manager-preview.html';
const OPTIONS_PATH = '/dev/options-preview.html?advanced=1';

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test.describe('Coarse pointer parity', () => {
  test.beforeEach(async ({ page }) => {
    const seed = twoInboxSessions();
    const state = seed.state as {
      workspaces: Array<Record<string, unknown>>;
    };
    state.workspaces.push({
      id: 'workspace_research',
      name: 'Research',
      emoji: '🧪',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown })
        .__TABBOARD_PREVIEW__ = options;
    }, seed);
  });

  test('keeps Manager direct actions and B2 menu rows touch-safe', async ({ page }) => {
    await page.goto(MANAGER_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();
    expect(await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      noHover: matchMedia('(hover: none)').matches,
    }))).toEqual({ coarse: true, noHover: true });

    await page.getByRole('button', { name: 'Expand Sidebar' }).click();
    await expect(page.locator('.manager-shell'))
      .toHaveClass(/manager-shell--sidebar-drawer/);
    const drawerTargets = await page.locator(
      '.manager-sidebar__overlay button:not([disabled]),'
      + '.manager-sidebar__overlay input:not([disabled])',
    ).evaluateAll((elements) => elements
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && bounds.width > 0
          && bounds.height > 0;
      })
      .map((element) => {
        const target = element.matches('input')
          ? element.closest<HTMLElement>(
              '.manager-open-tab-select, .mantine-TextInput-root',
            ) ?? element
          : element;
        const bounds = target.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label')
            || element.textContent?.trim()
            || element.getAttribute('name'),
          width: bounds.width,
          height: bounds.height,
        };
      }));
    for (const target of drawerTargets) {
      expect(target.width, target.name ?? undefined).toBeGreaterThanOrEqual(44);
      expect(target.height, target.name ?? undefined).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Close Sidebar' }).click();

    await page.getByRole('button', { name: 'More Actions' }).click();
    const globalItems = page.locator(
      '#manager-global-actions-menu [role="menuitem"]',
    );
    await expect(globalItems).toHaveCount(3);
    for (const height of await globalItems.evaluateAll((items) => items.map(
      (item) => item.getBoundingClientRect().height,
    ))) expect(height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Workspace: Personal' }).click();
    const workspaceRows = page.locator('[data-workspace-menu-id]');
    await expect(workspaceRows).toHaveCount(2);
    const workspaceGeometry = await workspaceRows.evaluateAll((rows) => rows.map(
      (row) => {
        const edit = row.querySelector<HTMLElement>(
          '.manager-workspace-edit',
        );
        const bounds = row.getBoundingClientRect();
        const editBounds = edit?.getBoundingClientRect();
        return {
          height: bounds.height,
          edit: editBounds
            ? { width: editBounds.width, height: editBounds.height }
            : null,
        };
      },
    ));
    for (const row of workspaceGeometry) {
      expect(row.height).toBeGreaterThanOrEqual(44);
      if (row.edit) {
        expect(row.edit.width).toBeGreaterThanOrEqual(44);
        expect(row.edit.height).toBeGreaterThanOrEqual(44);
      }
    }

    await page.getByText('Manage Workspaces', { exact: true }).click();
    const workspaceManager = page.getByRole('dialog', {
      name: 'Manage Workspaces',
    });
    await expect(workspaceManager).toBeVisible();
    const managementTargets = workspaceManager.locator(
      '.tabboard-modal__header-action button,'
      + '.manager-management-footer button,'
      + '.mantine-Modal-close',
    );
    await expect(managementTargets).toHaveCount(3);
    const managementGeometry = await managementTargets.evaluateAll(
      (elements) => elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label')
            || element.textContent?.trim(),
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      }),
    );
    for (const target of managementGeometry) {
      expect(target.width, target.name ?? undefined).toBeGreaterThanOrEqual(44);
      expect(target.height, target.name ?? undefined).toBeGreaterThanOrEqual(44);
    }
    const create = managementGeometry.find(
      ({ name }) => name === 'New Workspace',
    )!;
    const done = managementGeometry.find(({ name }) => name === 'Done')!;
    const close = managementGeometry.find(
      ({ name }) => name === 'Close Manage Workspaces',
    )!;
    expect(create.right).toBeLessThanOrEqual(close.left);
    expect(done.left).toBeGreaterThanOrEqual(
      (await workspaceManager.boundingBox())!.x,
    );
  });

  test('keeps Workspace emoji options and Options controls touch-safe', async ({ page }) => {
    await page.goto(MANAGER_PATH);
    await page.getByRole('button', { name: 'Workspace: Personal' }).click();
    await page.getByText('New Workspace', { exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New Workspace' });
    const emojiOptions = editor.locator('.workspace-editor-emoji-option');
    await expect(emojiOptions).toHaveCount(16);
    const emojiGeometry = await emojiOptions.evaluateAll((elements) => ({
      sizes: elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      }),
      columns: getComputedStyle(elements[0]!.parentElement!)
        .gridTemplateColumns.split(' ').length,
      overflow: elements[0]!.parentElement!.scrollWidth
        - elements[0]!.parentElement!.clientWidth,
    }));
    for (const option of emojiGeometry.sizes) {
      expect(option.width).toBeGreaterThanOrEqual(44);
      expect(option.height).toBeGreaterThanOrEqual(44);
    }
    expect(emojiGeometry.overflow).toBe(0);

    await page.goto(OPTIONS_PATH);
    await expect(page.locator('.options-page-container')).toBeVisible();
    const optionsTargets = await page.locator(
      '.options-page-container button:not([disabled]),'
      + '.options-page-container summary,'
      + '.options-page-container .mantine-Radio-body,'
      + '.options-page-container .mantine-Switch-body',
    ).evaluateAll((elements) => elements
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && bounds.width > 0
          && bounds.height > 0;
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label')
            || element.textContent?.trim().slice(0, 60),
          width: bounds.width,
          height: bounds.height,
        };
      }));
    for (const target of optionsTargets) {
      expect(target.height, target.name ?? undefined).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
});
