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

  test('expands the collapsed sidebar without reflowing the session board', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);

    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await page.mouse.move(800, 400);

    const collapsedLeft = await page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    );
    expect(collapsedLeft).toBe(54);

    await page.mouse.move(20, 300);
    await expect.poll(async () => page.locator('.manager-sidebar__overlay').evaluate(
      (element) => element.getBoundingClientRect().width,
    )).toBeGreaterThan(54);
    const disclosedLeft = await page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    );

    expect(disclosedLeft).toBe(collapsedLeft);
  });

  test('activates category navigation with Enter without starting a drag', async ({ page }) => {
    await page.goto(PREVIEW_PATH);

    const saved = page.getByRole('button', { name: 'Saved', exact: true });
    await saved.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/category=saved/);
    await expect(page.locator('.manager-drag-overlay__preview')).toBeHidden();
    await expect(page.locator('.manager-shell')).not.toHaveClass(/manager-shell--drag-active/);
  });

  test('saves every eligible tab in the selected window with one action', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
    await expect(page.locator('#session-card-group_beta')).toBeVisible();
    const cardsBefore = await page.locator('.session-card').count();

    await page.getByRole('button', { name: /Save \d+ Tabs in This Window/ }).click();

    await expect.poll(async () => page.locator('.session-card').count()).toBe(cardsBefore + 1);
    await expect(page.getByText(/tabs$/i).first()).toBeVisible();
  });

  test('focuses an open browser tab with one click and keeps details separate', async ({ page }) => {
    await page.goto(PREVIEW_PATH);

    await page.getByRole('button', { name: 'Focus Pinned tab' }).click();

    await expect.poll(async () => page.evaluate(async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return tabs.find((tab) => tab.active)?.title;
    })).toBe('Pinned tab');
    await expect(page.locator('.manager-info-popover')).toHaveCount(0);

    await page.getByRole('button', { name: 'More Actions for Pinned tab' }).click();
    await expect(page.locator('.manager-info-popover')).toBeVisible();
  });

  test('contains expanded window labels inside their selector buttons', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-window-button')).toHaveCount(6);

    const geometry = await page.locator('.manager-window-button').evaluateAll(
      (buttons) => buttons.map((button, index) => {
        const buttonRect = button.getBoundingClientRect();
        const labelRect = button.querySelector('.manager-window-label')
          ?.getBoundingClientRect();
        return {
          button: {
            left: buttonRect.left,
            right: buttonRect.right,
            width: buttonRect.width,
          },
          label: labelRect
            ? { left: labelRect.left, right: labelRect.right }
            : null,
          nextLeft: buttons[index + 1]?.getBoundingClientRect().left ?? null,
        };
      }),
    );

    expect(geometry).toHaveLength(6);
    expect(geometry.filter((item) => item.label !== null)).toHaveLength(1);
    for (const item of geometry) {
      if (item.label) {
        expect(item.button.width).toBeGreaterThan(80);
        expect(item.label.left).toBeGreaterThanOrEqual(item.button.left);
        expect(item.label.right).toBeLessThanOrEqual(item.button.right);
      } else {
        expect(item.button.width).toBeGreaterThanOrEqual(32);
        expect(item.button.width).toBeLessThanOrEqual(44);
      }
      if (item.nextLeft !== null) {
        expect(item.button.right).toBeLessThanOrEqual(item.nextLeft);
      }
    }

    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await page.mouse.move(800, 400);

    await expect(page.locator('.manager-window-label').first()).toBeHidden();
    await expect.poll(async () => page.locator('.manager-window-button').first().evaluate(
      (button) => button.getBoundingClientRect().width,
    )).toBe(32);
  });

  test('keeps compact sidebar actions above the session board when expanded', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PREVIEW_PATH}?workspace=workspace_default&category=saved&view=board`);

    const expand = page.getByRole('button', { name: 'Expand Sidebar' });
    await expect(expand).toBeVisible();
    const collapsedRowGeometry = await page.locator('.manager-open-tab-row').first().evaluate(
      (row) => {
        const rail = row.closest('.manager-sidebar__overlay')!.getBoundingClientRect();
        const visibleControls = [...row.querySelectorAll<HTMLElement>('button, input')]
          .filter((control) => {
            const style = getComputedStyle(control);
            const bounds = control.getBoundingClientRect();
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && bounds.width > 0
              && bounds.height > 0;
          })
          .map((control) => {
            const bounds = control.getBoundingClientRect();
            return {
              label: control.getAttribute('aria-label'),
              left: bounds.left,
              right: bounds.right,
            };
          });
        return {
          rail: { left: rail.left, right: rail.right },
          visibleControls,
        };
      },
    );
    expect(collapsedRowGeometry.visibleControls.map(({ label }) => label))
      .toEqual(['Focus Active HTTP tab']);
    for (const control of collapsedRowGeometry.visibleControls) {
      expect(control.left).toBeGreaterThanOrEqual(collapsedRowGeometry.rail.left);
      expect(control.right).toBeLessThanOrEqual(collapsedRowGeometry.rail.right);
    }
    const collapsedWindowBarGeometry = await page.locator('.manager-open-tabs-window-bar').evaluate(
      (bar) => {
        const rail = bar.closest('.manager-sidebar__overlay')!.getBoundingClientRect();
        const visibleControls = [...bar.querySelectorAll<HTMLElement>('button, a, input')]
          .filter((control) => {
            const style = getComputedStyle(control);
            const bounds = control.getBoundingClientRect();
            return style.display !== 'none'
              && style.visibility !== 'hidden'
              && bounds.width > 0
              && bounds.height > 0;
          })
          .map((control) => {
            const bounds = control.getBoundingClientRect();
            return {
              label: control.getAttribute('aria-label'),
              left: bounds.left,
              right: bounds.right,
            };
          });
        return {
          rail: { left: rail.left, right: rail.right },
          visibleControls,
        };
      },
    );
    expect(collapsedWindowBarGeometry.visibleControls.map(({ label }) => label))
      .toEqual(['Window 1: 7 tabs, current browser window']);
    for (const control of collapsedWindowBarGeometry.visibleControls) {
      expect(control.left).toBeGreaterThanOrEqual(collapsedWindowBarGeometry.rail.left);
      expect(control.right).toBeLessThanOrEqual(collapsedWindowBarGeometry.rail.right);
    }

    await expand.click();
    await expect(page.locator('.manager-shell')).toHaveClass(/manager-shell--sidebar-overlay-open/);
    await expect(page.getByRole('button', { name: 'Expand Sidebar' })).toBeHidden();

    const expandedRowTargets = await page.locator('.manager-open-tab-row').first().evaluate(
      (row) => {
        const selectors = [
          '.manager-open-tab-select',
          '.manager-open-tab-drag-handle',
          '.manager-open-tab-content',
          '.manager-open-tab-more',
          '.manager-open-tab-close',
        ];
        return selectors.flatMap((selector) => {
          const element = row.querySelector<HTMLElement>(selector);
          if (!element) return [];
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          if (
            style.display === 'none'
            || style.visibility === 'hidden'
            || bounds.width === 0
            || bounds.height === 0
          ) return [];
          return [{
            selector,
            left: bounds.left,
            right: bounds.right,
            width: bounds.width,
            height: bounds.height,
          }];
        });
      },
    );
    expect(expandedRowTargets.map(({ selector }) => selector)).toEqual([
      '.manager-open-tab-select',
      '.manager-open-tab-drag-handle',
      '.manager-open-tab-content',
      '.manager-open-tab-more',
    ]);
    for (const target of expandedRowTargets) {
      expect(target.width, target.selector).toBeGreaterThanOrEqual(44);
      expect(target.height, target.selector).toBeGreaterThanOrEqual(44);
    }
    for (let index = 1; index < expandedRowTargets.length; index += 1) {
      expect(
        expandedRowTargets[index].left - expandedRowTargets[index - 1].right,
        `${expandedRowTargets[index - 1].selector} to ${expandedRowTargets[index].selector}`,
      ).toBeGreaterThanOrEqual(8);
    }

    const more = page.getByRole('button', {
      name: 'More Actions for Active HTTP tab',
      exact: true,
    });
    await expect.poll(async () => more.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return hit === element || element.contains(hit);
    })).toBe(true);
    await more.click();
    await expect(page.locator('.manager-info-popover')).toBeVisible();
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
        const compactTargets = await page.evaluate(() => {
          const selectors = [
            '.manager-workspace-trigger',
            '[data-category-drag-handle]',
            '[data-category-trigger="label"]',
            '.manager-search-toggle',
            '.manager-header-actions-compact',
            '.manager-sidebar-header-action',
            '.manager-open-tab-select',
            '.manager-open-tab-drag-handle',
            '.manager-open-tab-content',
            '.manager-open-tab-more',
            '.manager-open-tab-close',
            '.session-card__drag-handle',
            '.session-card__actions button',
            '.tab-item-row__select',
            '.tab-item-row__more',
          ];
          return selectors.flatMap((selector) =>
            [...document.querySelectorAll<HTMLElement>(selector)]
              .filter((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== 'none'
                  && style.visibility !== 'hidden'
                  && rect.width > 0
                  && rect.height > 0;
              })
              .map((element) => ({
                label: element.getAttribute('aria-label')
                  || element.textContent?.trim()
                  || selector,
                height: element.getBoundingClientRect().height,
                width: element.getBoundingClientRect().width,
              })));
        });
        for (const target of compactTargets) {
          expect(target.width, target.label).toBeGreaterThanOrEqual(44);
          expect(target.height, target.label).toBeGreaterThanOrEqual(44);
        }

        await page.getByRole('button', { name: 'More Actions', exact: true }).click();
        for (const name of ['Import', 'Export', 'Trash', 'Options']) {
          await expect(page.getByRole('menuitem', { name })).toBeVisible();
        }
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Show Search' }).click();
        await expect(page.getByRole('textbox', { name: 'Search Saved Sessions' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'More Actions', exact: true })).toBeHidden();
      }
    });
  }
});
