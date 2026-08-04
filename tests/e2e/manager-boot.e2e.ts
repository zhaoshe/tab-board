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

  test('locks document overscroll while preserving Manager internal scrollers', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();

    const contract = await page.evaluate(() => {
      const htmlStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const root = document.querySelector<HTMLElement>('#root')!;
      const rootStyle = getComputedStyle(root);
      const boardStyle = getComputedStyle(
        document.querySelector<HTMLElement>('.manager-board')!,
      );
      const sidebarStyle = getComputedStyle(
        document.querySelector<HTMLElement>('.manager-open-tabs-scroll')!,
      );
      const sessionStyle = getComputedStyle(
        document.querySelector<HTMLElement>('.session-card__tabs')!,
      );
      return {
        rootOverflowY: [
          htmlStyle.overflowY,
          bodyStyle.overflowY,
          rootStyle.overflowY,
        ],
        rootOverscrollY: [
          htmlStyle.overscrollBehaviorY,
          bodyStyle.overscrollBehaviorY,
        ],
        internalOverflow: {
          boardX: boardStyle.overflowX,
          sessionY: sessionStyle.overflowY,
          sidebarY: sidebarStyle.overflowY,
        },
      };
    });
    expect(contract).toEqual({
      rootOverflowY: ['hidden', 'hidden', 'hidden'],
      rootOverscrollY: ['none', 'none'],
      internalOverflow: {
        boardX: 'auto',
        sessionY: 'auto',
        sidebarY: 'auto',
      },
    });

    await page.mouse.move(1200, 760);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => ({
      bodyScrollTop: document.body.scrollTop,
      documentScrollTop: document.documentElement.scrollTop,
      windowScrollY: window.scrollY,
    }))).toEqual({
      bodyScrollTop: 0,
      documentScrollTop: 0,
      windowScrollY: 0,
    });
  });

  test('keeps the T1 title and Session header actions correct across four disclosure states', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      `${PREVIEW_PATH}?workspace=workspace_default&category=inbox&view=board`,
    );

    const session = page.locator('#session-card-group_alpha');
    const header = session.locator('.session-card__header');
    const title = session.locator('.session-card__title');
    const actions = session.locator('.session-card__actions');
    const actionButtons = actions.getByRole('button');
    await expect(actionButtons).toHaveCount(2);

    const readState = () => header.evaluate((element) => {
      const titleElement = element.querySelector<HTMLElement>(
        '.session-card__title',
      )!;
      const actionElement = element.querySelector<HTMLElement>(
        '.session-card__actions',
      )!;
      const titleStyle = getComputedStyle(titleElement);
      const actionStyle = getComputedStyle(actionElement);
      return {
        title: {
          fontSize: titleStyle.fontSize,
          lineHeight: titleStyle.lineHeight,
          lineClamp: titleStyle.webkitLineClamp,
        },
        actions: {
          opacity: actionStyle.opacity,
          pointerEvents: actionStyle.pointerEvents,
          transitionDuration: actionStyle.transitionDuration,
          boxes: [...actionElement.querySelectorAll<HTMLElement>('button')]
            .map((button) => {
              const bounds = button.getBoundingClientRect();
              return {
                height: bounds.height,
                width: bounds.width,
              };
            }),
        },
      };
    });

    await page.mouse.move(1000, 700);
    await title.blur();
    const resting = await readState();
    expect(resting.title).toEqual({
      fontSize: '14px',
      lineHeight: '18px',
      lineClamp: '2',
    });
    expect(resting.actions.opacity).toBe('0');
    expect(resting.actions.pointerEvents).toBe('none');
    expect(resting.actions.transitionDuration).toBe('0.1s');
    expect(resting.actions.boxes).toEqual([
      { height: 32, width: 32 },
      { height: 32, width: 32 },
    ]);

    await header.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    const hovered = await readState();
    expect(hovered.actions.opacity).toBe('1');
    expect(hovered.actions.pointerEvents).toBe('auto');

    await page.mouse.move(1000, 700);
    await title.focus();
    await expect(actions).toHaveCSS('opacity', '1');
    const focused = await readState();
    expect(focused.actions.opacity).toBe('1');
    expect(focused.actions.pointerEvents).toBe('auto');

    await page.keyboard.press('Escape');
    await session.click({ button: 'right', position: { x: 120, y: 12 } });
    await expect(page.getByRole('menu', { name: 'Session Actions' })).toBeVisible();
    const menuOpen = await readState();
    expect(menuOpen.actions.opacity).toBe('1');
    expect(menuOpen.actions.pointerEvents).toBe('auto');
    await expect(actions).toHaveAttribute('data-overlay-open', 'true');
  });

  test('keeps the Workspace emoji, label, and chevron in separate visual slots', async ({ page }) => {
    const seed = twoInboxSessions();
    const state = seed.state as {
      workspaces: Array<Record<string, unknown>>;
    };
    state.workspaces[0] = {
      ...state.workspaces[0],
      name: 'Very Long Research Workspace Name',
      emoji: '👩🏽‍💻',
    };
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown })
        .__TABBOARD_PREVIEW__ = options;
    }, seed);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);

    const geometry = await page.locator('.manager-workspace-trigger').evaluate(
      (trigger) => {
        const emoji = trigger.querySelector<HTMLElement>(
          '.manager-workspace-trigger__emoji',
        )!.getBoundingClientRect();
        const label = trigger.querySelector<HTMLElement>(
          '.manager-workspace-trigger__label',
        )!.getBoundingClientRect();
        const chevron = trigger.querySelector<SVGElement>(
          '.lucide-chevron-down',
        )!.getBoundingClientRect();
        return {
          emojiToLabel: label.left - emoji.right,
          labelToChevron: chevron.left - label.right,
        };
      },
    );

    expect(geometry.emojiToLabel).toBeGreaterThanOrEqual(6);
    expect(geometry.labelToChevron).toBeGreaterThanOrEqual(4);

    await page.setViewportSize({ width: 390, height: 844 });
    const compactGeometry = await page.locator('.manager-workspace-trigger').evaluate(
      (trigger) => {
        const triggerRect = trigger.getBoundingClientRect();
        const emojiRect = trigger.querySelector<HTMLElement>(
          '.manager-workspace-trigger__emoji',
        )!.getBoundingClientRect();
        const label = trigger.querySelector<HTMLElement>(
          '.manager-workspace-trigger__label',
        )!;
        const chevron = trigger.querySelector<SVGElement>(
          '.lucide-chevron-down',
        )!;
        const chevronSection = chevron.closest<HTMLElement>(
          '.mantine-Button-section',
        )!;
        return {
          centerDelta: Math.abs(
            (triggerRect.left + triggerRect.width / 2)
            - (emojiRect.left + emojiRect.width / 2),
          ),
          labelDisplay: getComputedStyle(label).display,
          chevronSectionDisplay: getComputedStyle(chevronSection).display,
        };
      },
    );
    expect(compactGeometry.centerDelta).toBeLessThanOrEqual(1);
    expect(compactGeometry.labelDisplay).toBe('none');
    expect(compactGeometry.chevronSectionDisplay).toBe('none');
  });

  test('separates Category labels from counts and Session metadata icons from copy', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${PREVIEW_PATH}?workspace=workspace_default&category=inbox&view=board`);

    const categoryGap = await page
      .locator('[data-category-id="inbox"]')
      .evaluate((button) => {
        const label = button.querySelector<HTMLElement>('.mantine-Text-root')!
          .getBoundingClientRect();
        const count = button.querySelector<HTMLElement>('.manager-category-count')!
          .getBoundingClientRect();
        return count.left - label.right;
      });
    expect(categoryGap).toBeGreaterThanOrEqual(4);

    const metaGaps = await page.locator('.session-card__meta-item').evaluateAll(
      (items) => items.map((item) => {
        const icon = item.querySelector('svg')!.getBoundingClientRect();
        const textNode = [...item.childNodes].find(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        )!;
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const copy = range.getBoundingClientRect();
        return copy.left - icon.right;
      }),
    );
    expect(metaGaps.length).toBeGreaterThan(0);
    for (const gap of metaGaps) expect(gap).toBeGreaterThanOrEqual(3);
  });

  test('keeps the active Category visible in the compact topbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `${PREVIEW_PATH}?workspace=workspace_default&category=saved&view=board`,
    );

    const geometry = await page
      .locator('[data-category-id="saved"]')
      .evaluate((active) => {
        const nav = active.closest<HTMLElement>('.manager-category-nav')!
          .getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        return {
          nav: {
            left: nav.left,
            right: nav.right,
            width: nav.width,
          },
          active: {
            left: activeRect.left,
            right: activeRect.right,
            width: activeRect.width,
          },
        };
      });

    const pixelTolerance = 1;
    expect(geometry.nav.width + pixelTolerance)
      .toBeGreaterThanOrEqual(geometry.active.width);
    expect(geometry.active.left)
      .toBeGreaterThanOrEqual(geometry.nav.left - pixelTolerance);
    expect(geometry.active.right)
      .toBeLessThanOrEqual(geometry.nav.right + pixelTolerance);
    await expect(page.locator('[data-category-id="saved"] .manager-category-count'))
      .toHaveText('0');
  });

  test('visually marks the current Workspace in the dense management list', async ({ page }) => {
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
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Workspace: Personal' }).click();
    await page.getByText('Manage Workspaces', { exact: true }).click();

    const current = page.locator(
      '[data-workspace-id="workspace_default"]',
    );
    await expect(current).toBeVisible();
    await expect(current).toHaveClass(/workspace-manager-row--current/);
    const material = await current.evaluate((element) => {
      const style = getComputedStyle(element);
      const next = element.nextElementSibling as HTMLElement | null;
      return {
        background: style.backgroundColor,
        borderColor: style.borderColor,
        nextGap: next
          ? next.getBoundingClientRect().top
            - element.getBoundingClientRect().bottom
          : null,
      };
    });
    expect(material.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(material.borderColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(material.nextGap).toBeCloseTo(5, 1);
    await current.focus();
    const focusedMaterial = await current.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        borderColor: style.borderColor,
      };
    });
    expect(focusedMaterial).toEqual({
      background: material.background,
      borderColor: material.borderColor,
    });
  });

  test('creates a Workspace from inside Manage Workspaces and restores nested focus', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Workspace: Personal' }).click();
    await page.getByText('Manage Workspaces', { exact: true }).click();

    const manager = page.getByRole('dialog', { name: 'Manage Workspaces' });
    const create = manager.getByRole('button', { name: 'New Workspace' });
    await expect(create).toBeVisible();
    await expect(manager.getByRole('button', { name: 'Done' })).toBeVisible();

    await create.click();
    const editor = page.getByRole('dialog', { name: 'New Workspace' });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('button', { name: /^Use / })).toHaveCount(16);
    const nestedState = await page.locator('[role="dialog"]').evaluateAll(
      (dialogs) => dialogs.map((dialog) => ({
        hidden: dialog.getAttribute('aria-hidden'),
        inert: dialog.hasAttribute('inert'),
      })),
    );
    expect(nestedState).toEqual([
      { hidden: 'true', inert: true },
      { hidden: null, inert: false },
    ]);

    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(manager).toBeVisible();
    await expect(create).toBeFocused();
    await expect(manager).not.toHaveAttribute('inert', '');
    await expect(manager).not.toHaveAttribute('aria-hidden', 'true');

    await manager.getByRole('button', { name: 'Done' }).click();
    await expect(manager).toHaveCount(0);
  });

  test('uses accent-soft as the Workspace switcher current-row state', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Workspace: Personal' }).click();

    const current = page.locator(
      '[data-workspace-menu-id="workspace_default"]',
    );
    await expect(current).toBeVisible();
    const resting = await current.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      itemBackground: getComputedStyle(
        element.querySelector<HTMLElement>('[role="menuitem"]')!,
      ).backgroundColor,
      accentSoft: (() => {
        const probe = document.createElement('span');
        probe.style.background = 'var(--tabboard-accent-soft)';
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      })(),
    }));
    expect(resting.background).toBe(resting.accentSoft);
    expect(resting.itemBackground).toBe('rgba(0, 0, 0, 0)');

    await current.getByRole('menuitem').focus();
    await expect.poll(async () => current.evaluate((element) => ({
      row: getComputedStyle(element).backgroundColor,
      item: getComputedStyle(
        element.querySelector<HTMLElement>('[role="menuitem"]')!,
      ).backgroundColor,
    }))).toEqual({
      row: resting.accentSoft,
      item: 'rgba(0, 0, 0, 0)',
    });

    const edit = current.getByRole('button', { name: 'Edit Workspace' });
    const editGeometry = await edit.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const icon = element.querySelector<SVGElement>('svg')
        ?.getBoundingClientRect();
      return {
        rowHeight: element.closest<HTMLElement>(
          '[data-workspace-menu-id]',
        )!.getBoundingClientRect().height,
        width: bounds.width,
        height: bounds.height,
        iconWidth: icon?.width,
        iconHeight: icon?.height,
      };
    });
    expect(editGeometry).toEqual({
      rowHeight: 29,
      width: 18,
      height: 18,
      iconWidth: 14,
      iconHeight: 14,
    });
  });

  test('keeps the Workspace editor keyboard-complete with ZWJ custom emoji', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Workspace: Personal' }).click();
    const createTrigger = page.getByText('New Workspace', { exact: true });
    await createTrigger.click();

    const dialog = page.getByRole('dialog', { name: 'New Workspace' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Use / })).toHaveCount(16);
    const geometry = await dialog.evaluate((element) => {
      const grid = element.querySelector<HTMLElement>(
        '.workspace-editor-emoji-grid',
      )!;
      const options = [...grid.querySelectorAll<HTMLElement>(
        '.workspace-editor-emoji-option',
      )];
      const bounds = element.getBoundingClientRect();
      const gridBounds = grid.getBoundingClientRect();
      return {
        dialogWidth: bounds.width,
        gridWidth: gridBounds.width,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        gap: Number.parseFloat(getComputedStyle(grid).gap),
        optionSizes: options.map((option) => {
          const optionBounds = option.getBoundingClientRect();
          return {
            width: optionBounds.width,
            height: optionBounds.height,
          };
        }),
        overflow: element.scrollWidth - element.clientWidth,
      };
    });
    expect(geometry.dialogWidth).toBe(380);
    expect(geometry.columns).toBe(8);
    expect(geometry.gap).toBe(6);
    expect(geometry.overflow).toBe(0);
    for (const option of geometry.optionSizes) {
      expect(option.width).toBeCloseTo(option.height, 1);
      expect(option.width).toBeGreaterThanOrEqual(38);
    }

    const testTube = dialog.getByRole('button', { name: 'Use 🧪' });
    await testTube.focus();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('button', { name: 'Use 🚀' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Use 🚀' }))
      .toHaveAttribute('aria-pressed', 'true');

    await dialog.getByRole('textbox', { name: 'Workspace name' })
      .fill('Research Lab');
    await dialog.getByRole('button', { name: 'Custom' }).click();
    const custom = dialog.getByRole('textbox', { name: 'Custom emoji' });
    await custom.fill('👩🏽‍💻');
    await expect(dialog.locator('.workspace-editor-preview'))
      .toContainText('👩🏽‍💻');
    await expect(dialog.locator('.workspace-editor-preview'))
      .toContainText('Research Lab');
    await expect(dialog.getByRole('button', { name: 'Create Workspace' }))
      .toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('menuitem', {
      name: 'New Workspace',
    })).toBeFocused();
  });

  test('keeps Manage Categories as two-line object rows instead of menu rows', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Category Options' }).click();
    await page.getByText('Manage Categories', { exact: true }).click();

    const rows = page.locator('[data-category-manager-id]');
    await expect(rows).toHaveCount(3);
    const geometry = await rows.evaluateAll((elements) => elements.map(
      (element, index) => {
        const name = element.querySelector<HTMLElement>(
          '.manager-category-manager-row__name',
        );
        const meta = element.querySelector<HTMLElement>(
          '.manager-category-manager-row__meta',
        );
        const action = element.querySelector<HTMLElement>(
          '.manager-category-manager-row__action',
        );
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          active: element.getAttribute('data-category-manager-id') === 'inbox',
          height: bounds.height,
          borderWidth: style.borderTopWidth,
          background: style.backgroundColor,
          nameBottom: name?.getBoundingClientRect().bottom ?? null,
          metaTop: meta?.getBoundingClientRect().top ?? null,
          actionSize: action?.getBoundingClientRect().width ?? null,
          nextGap: elements[index + 1]
            ? elements[index + 1].getBoundingClientRect().top
              - bounds.bottom
            : null,
        };
      },
    ));
    for (const row of geometry) {
      expect(row.height).toBeGreaterThanOrEqual(48);
      expect(row.borderWidth).toBe('1px');
      expect(row.nameBottom).not.toBeNull();
      expect(row.metaTop).not.toBeNull();
      expect(row.metaTop!).toBeGreaterThanOrEqual(row.nameBottom!);
      expect(row.actionSize).toBe(32);
      if (row.nextGap !== null) expect(row.nextGap).toBeCloseTo(5, 1);
    }
    const active = geometry.find(({ active }) => active);
    expect(active?.background).not.toBe('rgba(0, 0, 0, 0)');
    const activeRow = page.locator(
      '.manager-category-manager-row--active',
    );
    await activeRow.focus();
    await expect.poll(async () => activeRow.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    )).toBe(active?.background);
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

    await page.getByRole('button', { name: 'Bin' }).click();
    await expect(page).toHaveURL(/view=bin/);
    await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/view=board/);
    await expect(page.locator('.manager-board')).toHaveAttribute(
      'aria-label',
      'Personal Archive sessions',
    );
  });

  test('peeks without reflow and explicitly pins the 52px desktop rail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);

    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await page.mouse.move(800, 400);

    await expect.poll(async () => page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    )).toBe(52);
    const collapsedLeft = await page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    );
    expect(collapsedLeft).toBe(52);
    const collapsedSidebarTabOrder = await page.locator('.manager-sidebar').evaluate(
      (sidebar) => [...sidebar.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )]
        .filter((element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && bounds.width > 0
            && bounds.height > 0;
        })
        .map((element) => element.getAttribute('aria-label') || element.textContent?.trim()),
    );
    expect(collapsedSidebarTabOrder).toEqual([
      expect.stringMatching(/^Browser window, \d+ tabs?(, focused)?$/),
      'Expand Sidebar',
    ]);

    await page.evaluate(() => {
      const sidebar = document.querySelector<HTMLElement>('.manager-sidebar');
      const shell = document.querySelector<HTMLElement>('.manager-shell');
      if (!sidebar || !shell) throw new Error('Sidebar disclosure timing targets are missing.');
      const timing = {
        elapsed: null as number | null,
        startedAt: null as number | null,
      };
      (window as unknown as {
        __task7PeekTiming?: typeof timing;
      }).__task7PeekTiming = timing;
      sidebar.addEventListener('pointerenter', () => {
        timing.startedAt = performance.now();
      }, { once: true });
      const observer = new MutationObserver(() => {
        if (
          timing.startedAt !== null
          && shell.classList.contains('manager-shell--sidebar-peek')
        ) {
          timing.elapsed = performance.now() - timing.startedAt;
          observer.disconnect();
        }
      });
      observer.observe(shell, { attributes: true, attributeFilter: ['class'] });
    });
    await page.mouse.move(20, 300);
    await expect.poll(async () => page.evaluate(() =>
      (window as unknown as {
        __task7PeekTiming?: { elapsed: number | null };
      }).__task7PeekTiming?.elapsed ?? null,
    )).not.toBeNull();
    const measuredPeekElapsed = await page.evaluate(() =>
      (window as unknown as {
        __task7PeekTiming?: { elapsed: number | null };
      }).__task7PeekTiming?.elapsed ?? null,
    );
    expect(measuredPeekElapsed).not.toBeNull();
    expect(measuredPeekElapsed!).toBeGreaterThanOrEqual(300);
    expect(measuredPeekElapsed!).toBeLessThanOrEqual(1500);
    await expect.poll(async () => page.locator('.manager-sidebar__overlay').evaluate(
      (element) => element.getBoundingClientRect().width,
    )).toBeGreaterThan(52);
    await expect(page.locator('.manager-shell')).toHaveClass(/manager-shell--sidebar-peek/);
    const disclosedLeft = await page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    );

    expect(disclosedLeft).toBe(collapsedLeft);

    await page.mouse.move(800, 400);
    await expect(page.locator('.manager-shell')).not.toHaveClass(/manager-shell--sidebar-peek/);
    await page.getByRole('button', { name: 'Expand Sidebar' }).click();
    await expect(page.locator('.manager-shell')).toHaveClass(/manager-shell--sidebar-pinned/);
    await expect.poll(async () => page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    )).toBeGreaterThan(52);
  });

  test('animates pinned disclosure through intermediate geometry and delays expanded copy', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await expect.poll(async () => page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    )).toBe(52);

    const frames = await page.evaluate(async () => {
      const shell = document.querySelector<HTMLElement>('.manager-shell')!;
      const sidebar = document.querySelector<HTMLElement>(
        '.manager-sidebar__overlay',
      )!;
      const main = document.querySelector<HTMLElement>('.manager-main')!;
      const trigger = document.querySelector<HTMLButtonElement>(
        '[aria-label="Expand Sidebar"]',
      )!;
      const sample = (elapsed: number) => {
        const details = document.querySelector<HTMLElement>(
          '.manager-open-tab-content',
        );
        const ownerElement = document.querySelector<HTMLElement>(
          '.manager-open-tab-owner-slot',
        )!;
        const owner = ownerElement.getBoundingClientRect();
        const selectedWindow = document.querySelector<HTMLElement>(
          '.manager-window-button[aria-pressed="true"]',
        )!.getBoundingClientRect();
        const row = ownerElement.closest<HTMLElement>(
          '.manager-open-tab-row',
        )!.getBoundingClientRect();
        return {
          elapsed,
          sidebarWidth: sidebar.getBoundingClientRect().width,
          mainLeft: main.getBoundingClientRect().left,
          ownerCenter: owner.left + owner.width / 2,
          detailsLeft: details?.getBoundingClientRect().left ?? null,
          rowLeft: row.left,
          selectedWindowCenter:
            selectedWindow.left + selectedWindow.width / 2,
          detailsDisplay: details ? getComputedStyle(details).display : null,
          detailsOpacity: details
            ? Number.parseFloat(getComputedStyle(details).opacity)
            : null,
          shellTransition: getComputedStyle(shell).transition,
          sidebarTransition: getComputedStyle(sidebar).transition,
        };
      };
      const nextFrame = () => new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()));
      const wait = (ms: number) => new Promise<void>((resolve) =>
        setTimeout(resolve, ms));

      const baseline = sample(-1);
      trigger.click();
      await nextFrame();
      const frames = [baseline, sample(0)];
      for (const [elapsed, delay] of [[45, 45], [90, 45], [135, 45], [220, 85]] as const) {
        await wait(delay);
        frames.push(sample(elapsed));
      }
      return frames;
    });

    const final = frames.at(-1)!;
    expect(frames[0].shellTransition).toContain('grid-template-columns');
    expect(frames[0].sidebarTransition).toContain('width');
    expect(frames[2].sidebarWidth).toBeGreaterThan(52);
    expect(frames[2].sidebarWidth).toBeLessThan(final.sidebarWidth);
    expect(frames[2].mainLeft).toBeGreaterThan(52);
    expect(frames[2].mainLeft).toBeLessThan(final.mainLeft);
    expect(frames[0].detailsDisplay).not.toBeNull();
    expect(frames[0].detailsOpacity ?? 1).toBeLessThan(1);
    expect(frames[3].detailsOpacity ?? 0).toBeGreaterThan(frames[0].detailsOpacity ?? 0);
    expect(final.sidebarWidth).toBeGreaterThanOrEqual(272);
    expect(final.detailsOpacity).toBe(1);
    expect((final.detailsLeft ?? Infinity) - final.rowLeft)
      .toBeLessThanOrEqual(34);
    expect(Math.max(...frames.map(({ ownerCenter }) => ownerCenter))
      - Math.min(...frames.map(({ ownerCenter }) => ownerCenter))).toBeLessThanOrEqual(1);
    expect(Math.max(...frames.map(({ selectedWindowCenter }) => selectedWindowCenter))
      - Math.min(...frames.map(({ selectedWindowCenter }) => selectedWindowCenter)))
      .toBeLessThanOrEqual(1);
  });

  test('disables sidebar geometry motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);

    const transitionState = await page.locator('.manager-shell').evaluate(
      (shell) => {
        const sidebar = document.querySelector<HTMLElement>(
          '.manager-sidebar__overlay',
        )!;
        return {
          shell: getComputedStyle(shell).transitionDuration,
          sidebar: getComputedStyle(sidebar).transitionDuration,
        };
      },
    );

    expect(transitionState.shell).toBe('0s');
    expect(transitionState.sidebar).toBe('0s');
  });

  test('animates Peek as an overlay without moving the Board', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await expect.poll(async () => page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    )).toBe(52);

    await page.mouse.move(20, 300);
    const frames = await page.evaluate(async () => {
      const shell = document.querySelector<HTMLElement>('.manager-shell')!;
      const sidebar = document.querySelector<HTMLElement>(
        '.manager-sidebar__overlay',
      )!;
      const main = document.querySelector<HTMLElement>('.manager-main')!;
      const sample = () => ({
        sidebarWidth: sidebar.getBoundingClientRect().width,
        mainLeft: main.getBoundingClientRect().left,
      });
      while (!shell.classList.contains('manager-shell--sidebar-peek')) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()));
      }
      const frames = [sample()];
      for (let index = 0; index < 10; index += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()));
        frames.push(sample());
      }
      return frames;
    });

    expect(frames.some(({ sidebarWidth }) =>
      sidebarWidth > 52 && sidebarWidth < frames.at(-1)!.sidebarWidth,
    )).toBe(true);
    for (const frame of frames) expect(frame.mainLeft).toBe(52);
  });

  test('reverses an interrupted pinned transition from its current geometry', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await expect.poll(async () => page.locator('.manager-main').evaluate(
      (element) => element.getBoundingClientRect().left,
    )).toBe(52);

    const frames = await page.evaluate(async () => {
      const shell = document.querySelector<HTMLElement>('.manager-shell')!;
      const sidebar = document.querySelector<HTMLElement>(
        '.manager-sidebar__overlay',
      )!;
      const expand = document.querySelector<HTMLButtonElement>(
        '[aria-label="Expand Sidebar"]',
      )!;
      const wait = (ms: number) => new Promise<void>((resolve) =>
        setTimeout(resolve, ms));
      const nextFrame = () => new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()));
      const finalWidth = Math.min(320, Math.max(272, innerWidth * 0.24));
      document.documentElement.style.setProperty(
        '--manager-sidebar-motion-duration',
        '600ms',
      );
      expand.click();
      const reverseThreshold = 52 + ((finalWidth - 52) * 0.25);
      let beforeReverse = sidebar.getBoundingClientRect().width;
      for (let index = 0; index < 60; index += 1) {
        await nextFrame();
        beforeReverse = sidebar.getBoundingClientRect().width;
        if (beforeReverse >= reverseThreshold && beforeReverse < finalWidth) {
          break;
        }
      }
      document.querySelector<HTMLButtonElement>(
        '[aria-label="Collapse Sidebar"]',
      )!.click();
      const atReverse = sidebar.getBoundingClientRect().width;
      const reverseFrames = [atReverse];
      for (let index = 0; index < 40; index += 1) {
        await nextFrame();
        reverseFrames.push(sidebar.getBoundingClientRect().width);
      }
      await wait(600);
      return {
        finalWidth,
        beforeReverse,
        atReverse,
        reverseFrames,
        final: sidebar.getBoundingClientRect().width,
      };
    });

    expect(frames.beforeReverse).toBeGreaterThan(52);
    expect(frames.beforeReverse).toBeLessThan(frames.finalWidth);
    expect(frames.atReverse).toBeGreaterThan(52);
    expect(frames.atReverse).toBeLessThan(frames.finalWidth);
    expect(frames.reverseFrames.some((width) =>
      width < frames.beforeReverse && width > 52,
    )).toBe(true);
    expect(frames.final).toBe(52);
  });

  test('animates the compact Drawer over a fixed Board and restores Expand focus on close', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PREVIEW_PATH);
    const expand = page.getByRole('button', { name: 'Expand Sidebar' });
    await expect(expand).toBeVisible();
    await expect.poll(async () => page.locator('.manager-sidebar__overlay').evaluate(
      (element) => element.getBoundingClientRect().width,
    )).toBe(52);

    const openingFrames = await page.evaluate(async () => {
      const sidebar = document.querySelector<HTMLElement>(
        '.manager-sidebar__overlay',
      )!;
      const main = document.querySelector<HTMLElement>('.manager-main')!;
      document.querySelector<HTMLButtonElement>(
        '[aria-label="Expand Sidebar"]',
      )!.click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()));
      const frames: Array<{
        width: number;
        mainLeft: number;
        inert: boolean;
      }> = [];
      for (let index = 0; index < 8; index += 1) {
        frames.push({
          width: sidebar.getBoundingClientRect().width,
          mainLeft: main.getBoundingClientRect().left,
          inert: document.querySelector<HTMLElement>(
            '.manager-main-surface',
          )!.inert,
        });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()));
      }
      return frames;
    });

    const finalDrawerWidth = Math.min(320, Math.max(272, 390 * 0.24));
    expect(openingFrames.some(({ width }) =>
      width > 52 && width < finalDrawerWidth,
    )).toBe(true);
    for (const frame of openingFrames) {
      expect(frame.mainLeft).toBe(52);
      expect(frame.inert).toBe(true);
    }

    await page.getByRole('button', { name: 'Close Sidebar' }).click();
    await expect.poll(async () => page.locator('.manager-sidebar__overlay').evaluate(
      (element) => element.getBoundingClientRect().width,
    )).toBe(52);
    await expect(expand).toBeFocused();
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

  test('promotes peek for selection without replacing the explicit collapsed preference', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await page.mouse.move(20, 300);
    await page.evaluate(() => {
      const windowGlyph = document.querySelector<HTMLButtonElement>(
        '.manager-window-button[aria-pressed="true"]',
      );
      const expand = document.querySelector<HTMLButtonElement>(
        '.manager-open-tabs-context-expand',
      );
      windowGlyph?.focus();
      expand?.focus();
    });
    await expect(page.getByRole('button', { name: 'Expand Sidebar' })).toBeFocused();
    await page.waitForTimeout(400);
    await expect(page.locator('.manager-shell')).not.toHaveClass(/manager-shell--sidebar-peek/);

    await page.mouse.move(800, 400);
    await page.mouse.move(20, 300);
    await expect(page.locator('.manager-shell')).toHaveClass(/manager-shell--sidebar-peek/);
    await page.getByRole('button', { name: 'Enter Tab Selection Mode' }).click();

    await expect(page.locator('.manager-shell')).toHaveClass(/manager-shell--sidebar-pinned/);
    await expect.poll(() => page.evaluate(() =>
      localStorage.getItem('tabboard.sidebarCollapsed'),
    )).toBe('true');

    await page.reload();
    await expect(page.locator('.manager-shell')).toHaveClass(/manager-shell--sidebar-collapsed/);
    await expect(page.getByRole('button', { name: 'Expand Sidebar' })).toBeVisible();
  });

  test('keeps a quiet filter indicator and result count on the collapsed Expand action', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('textbox', {
      name: 'Filter Tabs by Title or URL',
    }).fill('duplicate');
    await expect(page.locator('.manager-open-tab-row')).toHaveCount(2);
    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();

    const expand = page.getByRole('button', {
      name: 'Expand Sidebar, 2 of 7 open tabs match the filter',
    });
    await expect(expand).toBeVisible();
    const indicator = expand.locator(
      '.manager-open-tabs-filter-indicator',
    );
    await expect(indicator).toBeVisible();
    const geometry = await indicator.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const trigger = element.closest('button')!.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        topInset: bounds.top - trigger.top,
        rightInset: trigger.right - bounds.right,
        pointerEvents: getComputedStyle(element).pointerEvents,
      };
    });
    expect(geometry.width).toBe(7);
    expect(geometry.height).toBe(7);
    expect(geometry.topInset).toBe(3);
    expect(geometry.rightInset).toBe(3);
    expect(geometry.pointerEvents).toBe('none');

    await expand.click();
    await expect(page.getByRole('textbox', {
      name: 'Filter Tabs by Title or URL',
    })).toHaveValue('duplicate');
  });

  test('keeps only the four confirmed Open Tabs selection actions', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', {
      name: 'Enter Tab Selection Mode',
    }).click();

    const toolbar = page.locator(
      '.manager-open-tabs-selection-actions__tools',
    );
    await expect(toolbar.locator('button')).toHaveCount(4);
    await expect(toolbar.getByRole('button', {
      name: 'Select All Visible Tabs',
    })).toBeVisible();
    await expect(toolbar.getByRole('button', {
      name: 'Create Session from 0 Selected Tabs',
    })).toBeDisabled();
    await expect(toolbar.getByRole('button', {
      name: 'Save Selected Tabs To',
    })).toBeDisabled();
    await expect(toolbar.getByRole('button', {
      name: 'Exit Tab Selection Mode',
    })).toBeVisible();
    await expect(page.getByRole('button', {
      name: /Close \d+ Selected Tabs/,
    })).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: /Pin \d+ Selected Tabs/,
    })).toHaveCount(0);
  });

  test('selects only visible filtered Open Tabs while retaining hidden selection', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', {
      name: 'Enter Tab Selection Mode',
    }).click();

    const hiddenAfterFilter = page.getByRole('checkbox', {
      name: 'Select Active HTTP tab',
    });
    await hiddenAfterFilter.check();
    await expect(page.locator(
      '.manager-open-tabs-selection-actions__count',
    )).toHaveText('1 Selected');

    await page.getByRole('textbox', {
      name: 'Filter Tabs by Title or URL',
    }).fill('duplicate');
    await expect(page.locator('.manager-open-tab-row')).toHaveCount(2);
    await expect(hiddenAfterFilter).toHaveCount(0);

    await page.getByRole('button', {
      name: 'Select All Visible Tabs',
    }).click();
    await expect(page.locator(
      '.manager-open-tabs-selection-actions__count',
    )).toHaveText('3 Selected');
    await expect(page.getByRole('button', {
      name: 'Unselect All Visible Tabs',
    })).toBeVisible();
    await expect(page.locator(
      '.manager-open-tab-row input[type="checkbox"]:checked',
    )).toHaveCount(2);

    await page.getByRole('button', {
      name: 'Unselect All Visible Tabs',
    }).click();
    await expect(page.locator(
      '.manager-open-tabs-selection-actions__count',
    )).toHaveText('1 Selected');
    await expect(page.locator(
      '.manager-open-tab-row input[type="checkbox"]:checked',
    )).toHaveCount(0);
    await expect(page.getByRole('button', {
      name: 'Create Session from 1 Selected Tabs',
    })).toBeEnabled();
    await expect(page.getByRole('button', {
      name: 'Save Selected Tabs To',
    })).toBeEnabled();

    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await expect(page.getByRole('button', {
      name: 'Expand Sidebar, 2 of 7 open tabs match the filter',
    })).toBeVisible();
    await expect(page.locator(
      '.manager-open-tabs-selection-actions',
    )).toHaveCount(0);

    await page.getByRole('button', {
      name: 'Expand Sidebar, 2 of 7 open tabs match the filter',
    }).click();
    await expect(page.getByRole('textbox', {
      name: 'Filter Tabs by Title or URL',
    })).toHaveValue('duplicate');
    await page.getByRole('button', {
      name: 'Enter Tab Selection Mode',
    }).click();
    await expect(page.locator(
      '.manager-open-tabs-selection-actions__count',
    )).toHaveText('0 Selected');
  });

  test('keeps the complete icon-led Session command menu and focus lifecycle', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      `${PREVIEW_PATH}?workspace=workspace_default&category=inbox&view=board`,
    );
    const session = page.locator('#session-card-group_alpha');
    await session.focus();
    await page.keyboard.press('Shift+F10');

    const menu = page.getByRole('menu', { name: 'Session Actions' });
    await expect(menu).toBeVisible();
    const items = menu.getByRole('menuitem');
    await expect(items).toHaveCount(9);
    await expect(items).toHaveText([
      'Add Link',
      'Add Note',
      'Rename Session',
      'Edit Session Note',
      'Move Session',
      'Lock Session',
      'Copy Links',
      'Select Tabs',
      'Delete Session',
    ]);
    await expect(items.first()).toBeFocused();
    await expect(menu.getByRole('separator')).toHaveCount(2);
    const geometry = await items.evaluateAll((elements) => elements.map(
      (element) => {
        const bounds = element.getBoundingClientRect();
        const icon = element.querySelector<SVGElement>('svg')
          ?.getBoundingClientRect();
        return {
          height: bounds.height,
          iconWidth: icon?.width ?? null,
          iconHeight: icon?.height ?? null,
          danger: element.classList.contains(
            'manager-overlay-menu__item--danger',
          ),
          separated: element.classList.contains(
            'manager-overlay-menu__item--separated',
          ),
        };
      },
    ));
    for (const [index, item] of geometry.entries()) {
      expect(item.height).toBe(29);
      expect(item.iconWidth).toBe(16);
      expect(item.iconHeight).toBe(16);
      expect(item.danger).toBe(index === geometry.length - 1);
      expect(item.separated).toBe(index === geometry.length - 1);
    }

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(session).toBeFocused();
  });

  test('keeps Global, Category, and Saved Tab menus dense, named, and focus-managed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      `${PREVIEW_PATH}?workspace=workspace_default&category=inbox&view=board`,
    );

    const assertDenseItems = async (
      menu: import('@playwright/test').Locator,
      labels: string[],
    ) => {
      const items = menu.getByRole('menuitem');
      await expect(items).toHaveText(labels);
      const geometry = await items.evaluateAll((elements) => elements.map(
        (element) => {
          const icon = element.querySelector<SVGElement>('svg')
            ?.getBoundingClientRect();
          return {
            height: element.getBoundingClientRect().height,
            iconWidth: icon?.width ?? null,
            iconHeight: icon?.height ?? null,
          };
        },
      ));
      for (const item of geometry) {
        expect(item.height).toBe(29);
        expect(item.iconWidth).toBe(16);
        expect(item.iconHeight).toBe(16);
      }
    };

    const globalTrigger = page.getByRole('button', {
      name: 'More Actions',
      exact: true,
    });
    await globalTrigger.focus();
    await page.keyboard.press('Enter');
    const globalMenu = page.locator('#manager-global-actions-menu');
    await expect(globalMenu).toBeVisible();
    await assertDenseItems(globalMenu, ['Import', 'Export', 'Options']);
    await expect(globalMenu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(globalTrigger).toBeFocused();

    const categoryTrigger = page.getByRole('button', {
      name: 'Category Options',
    });
    await categoryTrigger.focus();
    await page.keyboard.press('Enter');
    const categoryMenu = page.locator('#category-options-menu');
    await expect(categoryMenu).toBeVisible();
    await assertDenseItems(categoryMenu, [
      'Manage Categories',
      'Add Category',
    ]);
    await expect(categoryMenu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(categoryTrigger).toBeFocused();

    const savedTitle = page.getByRole('button', {
      name: 'Alpha One',
    });
    await savedTitle.focus();
    await page.keyboard.press('Shift+F10');
    const savedMenu = page.getByRole('menu', {
      name: 'Saved Tab Actions',
    });
    await expect(savedMenu).toBeVisible();
    await assertDenseItems(savedMenu, [
      'Add Note',
      'Copy URL',
      'Delete Saved Tab',
    ]);
    await expect(savedMenu.getByRole('menuitem').first()).toBeFocused();
    await expect(page.locator('.manager-menu-item__description-tip')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await expect(savedMenu.getByRole('menuitem', { name: 'Copy URL' })).toBeFocused();
    await expect(page.locator('.manager-menu-item__description-tip'))
      .toHaveText('Copy the saved address');
    await page.keyboard.press('Escape');
    await expect(savedMenu).toHaveCount(0);
    await expect(savedTitle).toBeFocused();

    await savedTitle.click({ button: 'right' });
    await expect(savedMenu).toBeVisible();
    await savedMenu.getByRole('menuitem', { name: 'Copy URL' }).hover();
    await page.waitForTimeout(400);
    expect(await page.locator(
      '.manager-menu-item__description-tip',
    ).count()).toBe(0);
    await page.waitForTimeout(200);
    const tip = page.locator('.manager-menu-item__description-tip');
    await expect(tip).toHaveText('Copy the saved address');
    await expect(tip).toHaveCSS('pointer-events', 'none');

    await page.keyboard.press('Escape');
    await expect(savedMenu).toHaveCount(0);
    await expect(savedTitle).toBeFocused();
  });

  test('saves every eligible tab in the selected window with one action', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('#session-card-group_alpha')).toBeVisible();
    await expect(page.locator('#session-card-group_beta')).toBeVisible();
    const cardsBefore = await page.locator('.session-card').count();
    const wholeWindowActions = page.getByRole('button', {
      name: /Save All \d+ Tabs|Save \d+ Tabs in This Window|Save Window/,
    });
    await expect(wholeWindowActions).toHaveCount(1);
    await expect(page.locator('.manager-open-tabs-window-bar').getByRole(
      'button',
      { name: /Save All|Save Window|in This Window/ },
    )).toHaveCount(0);
    await expect(page.locator('.manager-open-tabs-selection-bar').getByRole(
      'button',
      { name: /Save All \d+ Tabs/ },
    )).toHaveCount(1);

    await page.getByRole('button', { name: /Save All \d+ Tabs/ }).click();

    await expect.poll(async () => page.locator('.session-card').count()).toBe(cardsBefore + 1);
    await expect(page.locator('.session-card').first()).toContainText('6 links');
    await expect(page.getByRole('button', { name: 'Go to Pinned tab' }))
      .toBeVisible();
    await expect.poll(async () => page.evaluate(async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return {
        browserSources: tabs
          .filter((tab) => !String(tab.url).startsWith('/dev/'))
          .map((tab) => ({
            pinned: tab.pinned,
            title: tab.title,
          })),
        managerTabs: tabs.filter((tab) =>
          String(tab.url).startsWith('/dev/manager-preview.html')).length,
      };
    })).toEqual({
      browserSources: [{ pinned: true, title: 'Pinned tab' }],
      managerTabs: 1,
    });
  });

  test('focuses an open browser tab with one click without exposing row menus', async ({ page }) => {
    await page.goto(PREVIEW_PATH);

    await page.getByRole('button', { name: 'Go to Pinned tab' }).click();

    await expect.poll(async () => page.evaluate(async () => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return tabs.find((tab) => tab.active)?.title;
    })).toBe('Pinned tab');
    await expect(page.getByRole('button', { name: 'More Actions for Pinned tab' }))
      .toHaveCount(0);
    await expect(page.locator('.manager-info-popover button, .manager-info-popover a, .manager-info-popover input'))
      .toHaveCount(0);
    const tooltipStates = await page.locator('.manager-info-popover').evaluateAll(
      (tooltips) => tooltips.map((tooltip) => ({
        interactiveCount: tooltip.querySelectorAll(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ).length,
        pointerEvents: getComputedStyle(tooltip).pointerEvents,
      })),
    );
    for (const tooltip of tooltipStates) {
      expect(tooltip.interactiveCount).toBe(0);
      expect(tooltip.pointerEvents).toBe('none');
    }
  });

  test('renders count glyphs without window ordinals and marks only the focused window', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-window-button')).toHaveCount(6);

    const geometry = await page.locator('.manager-window-button').evaluateAll(
      (buttons) => buttons.map((button, index) => {
        const buttonRect = button.getBoundingClientRect();
        return {
          accessibleName: button.getAttribute('aria-label'),
          button: {
            left: buttonRect.left,
            right: buttonRect.right,
            width: buttonRect.width,
          },
          count: button.querySelector('.manager-window-tab-count')?.textContent,
          focusedBadge: Boolean(button.querySelector('.manager-window-focused-badge')),
          nextLeft: buttons[index + 1]?.getBoundingClientRect().left ?? null,
        };
      }),
    );

    expect(geometry).toHaveLength(6);
    expect(geometry.filter((item) => item.focusedBadge)).toHaveLength(1);
    for (const item of geometry) {
      expect(item.accessibleName).toMatch(/^Browser window, \d+ tabs?(, focused)?$/);
      expect(item.accessibleName).not.toMatch(/Window \d|current|selected/i);
      expect(item.count).toMatch(/^\d+$/);
      expect(item.button.width).toBeGreaterThanOrEqual(32);
      expect(item.button.width).toBeLessThanOrEqual(44);
      if (item.nextLeft !== null) {
        expect(item.button.right).toBeLessThanOrEqual(item.nextLeft);
      }
    }

    await page.getByRole('button', { name: 'Collapse Sidebar' }).click();
    await page.mouse.move(800, 400);

    await expect(page.locator('.manager-window-label')).toHaveCount(0);
    await expect.poll(async () => page.locator('.manager-window-button').first().evaluate(
      (button) => button.getBoundingClientRect().width,
    )).toBe(32);
  });

  test('dismisses an action tooltip on click until the pointer actually moves', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(PREVIEW_PATH);

    const windowButton = page.locator(
      '.manager-window-button[aria-pressed="true"]',
    );
    const label = await windowButton.getAttribute('aria-label');
    const bounds = await windowButton.boundingBox();
    if (!label || !bounds) throw new Error('Current Window action is missing.');
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;

    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(1_100);
    await expect(page.getByRole('tooltip', { name: label })).toHaveCount(0);

    await page.mouse.move(x + 2, y);
    await page.waitForTimeout(1_100);
    await expect(page.getByRole('tooltip', { name: label })).toBeVisible();
  });

  test('keeps compact sidebar actions above the session board when expanded', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PREVIEW_PATH}?workspace=workspace_default&category=saved&view=board`);

    const expand = page.getByRole('button', { name: 'Expand Sidebar' });
    await expect(expand).toBeVisible();
    await expect.poll(async () => page.locator('.manager-sidebar__overlay').evaluate(
      (element) => element.getBoundingClientRect().width,
    )).toBe(52);
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
    expect(collapsedRowGeometry.visibleControls).toEqual([]);
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
      .toEqual(['Browser window, 7 tabs, focused']);
    for (const control of collapsedWindowBarGeometry.visibleControls) {
      expect(control.left).toBeGreaterThanOrEqual(collapsedWindowBarGeometry.rail.left);
      expect(control.right).toBeLessThanOrEqual(collapsedWindowBarGeometry.rail.right);
    }

    await expand.click();
    await expect(page.locator('.manager-shell')).toHaveClass(/manager-shell--sidebar-drawer/);
    await expect(page.locator('.manager-topbar')).toHaveAttribute('inert', '');
    await expect(page.locator('.manager-main-surface')).toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: 'Close Sidebar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expand Sidebar' })).toBeHidden();

    const expandedRowTargets = await page.locator('.manager-open-tab-row').first().evaluate(
      (row) => {
        const selectors = [
          '.manager-open-tab-select',
          '.manager-open-tab-content',
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
      '.manager-open-tab-content',
      '.manager-open-tab-close',
    ]);
    for (const target of expandedRowTargets) {
      expect(target.width, target.selector).toBeGreaterThanOrEqual(44);
      expect(target.height, target.selector).toBeGreaterThanOrEqual(44);
    }
    const [checkboxTarget, titleTarget, closeTarget] = expandedRowTargets;
    expect(checkboxTarget.right).toBeLessThanOrEqual(titleTarget.left);
    expect(titleTarget.left - checkboxTarget.right).toBeGreaterThanOrEqual(8);
    expect(titleTarget.right).toBeLessThanOrEqual(closeTarget.left);
    expect(closeTarget.left - titleTarget.right).toBeGreaterThanOrEqual(8);

    await page.getByRole('button', { name: 'Close Sidebar' }).click();
    await expect(page.locator('.manager-shell')).not.toHaveClass(/manager-shell--sidebar-drawer/);
    await expect(page.locator('.manager-topbar')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.manager-main-surface')).not.toHaveAttribute('inert', '');
  });

  test('keeps 800px fine-pointer drawer targets at 44px with 8px gaps', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    await page.goto(PREVIEW_PATH);
    await page.getByRole('button', { name: 'Expand Sidebar' }).click();
    await expect(page.locator('.manager-shell')).toHaveClass(/manager-shell--sidebar-drawer/);

    const targets = await page.locator('.manager-open-tab-row').first().evaluate((row) =>
      [
        '.manager-open-tab-select',
        '.manager-open-tab-content',
        '.manager-open-tab-close',
      ].map((selector) => {
        const element = row.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const bounds = element.getBoundingClientRect();
        return {
          selector,
          left: bounds.left,
          right: bounds.right,
          width: bounds.width,
          height: bounds.height,
        };
      }),
    );

    for (const target of targets) {
      expect(target.width, target.selector).toBeGreaterThanOrEqual(44);
      expect(target.height, target.selector).toBeGreaterThanOrEqual(44);
    }
    expect(targets[1].left - targets[0].right).toBeGreaterThanOrEqual(8);
    expect(targets[2].left - targets[1].right).toBeGreaterThanOrEqual(8);
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

      if (viewport.width >= 1280) {
        for (const label of [
          'Category Options',
          'Show Search',
          'Bin',
          'More Actions',
        ]) {
          const icon = page.getByRole('button', { name: label }).locator('svg');
          await expect(icon).toHaveCSS('width', '18px');
          await expect(icon).toHaveCSS('height', '18px');
          await expect(icon).toHaveCSS('stroke-width', '1.75px');
        }
      }

      if (viewport.width <= 760) {
        const compactTargets = await page.evaluate(() => {
          const selectors = [
            '.manager-workspace-trigger',
            '[data-category-trigger="label"]',
            '.manager-search-toggle',
            '.manager-header-actions',
            '.manager-sidebar-header-action',
            '.manager-open-tab-select',
            '.manager-open-tab-content',
            '.manager-open-tab-close',
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
        await expect(page.getByRole('button', { name: 'Bin' })).toBeVisible();
        for (const name of ['Import', 'Export', 'Options']) {
          await expect(page.getByRole('menuitem', { name })).toBeVisible();
        }
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Show Search' }).click();
        await expect(page.getByRole('textbox', { name: 'Search Saved Sessions' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'More Actions', exact: true })).toBeHidden();
      }
    });
  }

  test('keeps direct category drag in the normal compact toolbar without hidden handles', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-category-nav')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('.manager-category-nav')!.getBoundingClientRect();
      const visible = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      return {
        nav: { left: nav.left, right: nav.right, width: nav.width },
        workspaceVisible: visible('.manager-workspace-switcher'),
        searchVisible: visible('.manager-search-slot'),
        actionsVisible: visible('.manager-header-actions'),
        categoryButtonCount: document.querySelectorAll(
          '[data-category-trigger="label"]',
        ).length,
        dragHandleCount: document.querySelectorAll(
          '[data-category-drag-handle]',
        ).length,
        reorderTargetCount: document.querySelectorAll(
          '[data-category-reorder-target]',
        ).length,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
      };
    });

    expect(geometry.nav.width).toBeGreaterThan(0);
    expect(geometry.categoryButtonCount).toBeGreaterThan(0);
    expect(geometry.dragHandleCount).toBe(0);
    expect(geometry.reorderTargetCount).toBe(
      geometry.categoryButtonCount * 2,
    );
    expect(geometry.workspaceVisible).toBe(true);
    expect(geometry.searchVisible).toBe(true);
    expect(geometry.actionsVisible).toBe(true);
    expect(geometry.scrollWidth).toBe(geometry.viewportWidth);
  });
});
