import { test, expect } from '@playwright/test';
import { twoInboxSessions } from './fixtures';

const PREVIEW_PATH = '/dev/manager-preview.html';

test.describe('Open tab preview positioning', () => {
  test.beforeEach(async ({ page }) => {
    const base = twoInboxSessions();
    const state = base.state as {
      groups: Array<{
        tabs: Array<Record<string, unknown>>;
      }>;
    };
    const firstSavedLink = state.groups[0]?.tabs[0];
    if (firstSavedLink) {
      state.groups[0]?.tabs.push({
        ...firstSavedLink,
        id: 'tab_note',
        itemType: 'note',
        title: 'Readable note',
        url: '',
        note: 'A note saved beside the preview link.',
      });
    }
    const seed = {
      ...base,
      tabs: Array.from({ length: 80 }, (_, index) => ({
        id: index + 1,
        windowId: 1,
        index,
        active: index === 0,
        title: `Open tab ${index + 1}`,
        url: `https://open.example/${index + 1}`,
      })),
    };
    await page.addInitScript((options) => {
      (window as unknown as { __TABBOARD_PREVIEW__: unknown }).__TABBOARD_PREVIEW__ = options;
    }, seed);
  });

  test('clears stale hover UI across tab and app focus changes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();
    await expect(page.locator('.manager-open-tab-row')).toHaveCount(80);

    const savedLink = page.getByRole('button', { name: 'Alpha One' });
    await savedLink.hover();
    await expect(page.locator('.manager-info-popover')).toBeVisible();
    const savedLinkBounds = await savedLink.boundingBox();
    if (!savedLinkBounds) throw new Error('Saved tab tooltip trigger is missing.');
    await savedLink.click();
    await expect(page.locator('.manager-info-popover')).toHaveCount(0);
    await page.waitForTimeout(300);
    await expect(page.locator('.manager-info-popover')).toHaveCount(0);

    await page.mouse.move(
      savedLinkBounds.x + savedLinkBounds.width / 2 + 2,
      savedLinkBounds.y + savedLinkBounds.height / 2,
    );
    await page.waitForTimeout(200);
    await expect(page.locator('.manager-info-popover')).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
    await expect.poll(async () => page.evaluate(() =>
      document.documentElement.hasAttribute('data-tabboard-hover-suppressed'),
    )).toBe(true);
    const selectOpacity = await page.locator('.tab-item-row__select').first().evaluate(
      (element) => getComputedStyle(element).opacity,
    );
    const deleteOpacity = await page.locator('.tab-item-row__delete').first().evaluate(
      (element) => getComputedStyle(element).opacity,
    );
    expect(selectOpacity).toBe('0');
    expect(deleteOpacity).toBe('0');

    await page.evaluate(() => {
      window.dispatchEvent(new FocusEvent('focus'));
    });
    await expect(page.locator('.manager-info-popover')).toHaveCount(0);
    await expect(page.locator('.manager-open-tab-row')).toHaveCount(81);

    const openTabTrigger = page.locator('[data-info-popover="open"]').first();
    await openTabTrigger.dispatchEvent('pointermove', { movementX: 1, movementY: 0 });
    await openTabTrigger.hover();
    await expect(page.locator('.manager-info-popover')).toBeVisible();
    await expect(page.locator('.tabboard-error-boundary')).toHaveCount(0);
    expect(errors, `unexpected page errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('keeps the shared tooltip 6px above both Open and Saved Tab rows', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();

    const assertRowGap = async (
      triggerSelector: string,
      rowSelector: string,
    ) => {
      const trigger = page.locator(triggerSelector).first();
      const row = page.locator(rowSelector).first();
      await trigger.hover();
      await expect(page.locator('.manager-info-popover')).toBeVisible();
      const geometry = await row.evaluate((element) => {
        const rowRect = element.getBoundingClientRect();
        const tooltip = document.querySelector<HTMLElement>(
          '.manager-info-popover',
        );
        if (!tooltip) throw new Error('Tab tooltip is missing.');
        const tooltipRect = tooltip.getBoundingClientRect();
        return {
          placement: tooltip.dataset.placement,
          gap: rowRect.top - tooltipRect.bottom,
        };
      });
      expect(geometry.placement).toBe('top');
      expect(geometry.gap).toBeCloseTo(6, 1);
      await page.mouse.move(1000, 700);
      await expect(page.locator('.manager-info-popover')).toHaveCount(0);
    };

    await assertRowGap(
      '[data-info-popover="open"]',
      '.manager-open-tab-row',
    );
    await assertRowGap(
      '[data-info-popover="saved"]',
      '.tab-item-row__content',
    );
  });

  test('uses the confirmed 180ms hover delay, immediate focus, and top-edge flip', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();

    const trigger = page.locator('[data-info-popover="open"]').first();
    await page.evaluate(() => {
      const trigger = document.querySelector<HTMLElement>(
        '[data-info-popover="open"]',
      )!;
      const timing = {
        openedAt: null as number | null,
        startedAt: null as number | null,
        visibleAt120: null as boolean | null,
      };
      (window as unknown as {
        __tabTooltipTiming?: typeof timing;
      }).__tabTooltipTiming = timing;
      trigger.addEventListener('mouseover', (event) => {
        if (
          event.relatedTarget instanceof Node
          && trigger.contains(event.relatedTarget)
        ) {
          return;
        }
        timing.startedAt = performance.now();
        window.setTimeout(() => {
          timing.visibleAt120 = Boolean(
            document.querySelector('.manager-info-popover'),
          );
        }, 120);
      }, { once: true });
      const observer = new MutationObserver(() => {
        if (
          timing.openedAt === null
          && document.querySelector('.manager-info-popover')
        ) {
          timing.openedAt = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.querySelector('#manager-main')!, {
        childList: true,
        subtree: true,
      });
    });
    await trigger.hover();
    await expect(page.locator('.manager-info-popover')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const timing = (window as unknown as {
        __tabTooltipTiming?: {
          openedAt: number | null;
          startedAt: number | null;
          visibleAt120: boolean | null;
        };
      }).__tabTooltipTiming;
      if (
        !timing
        || timing.startedAt === null
        || timing.openedAt === null
        || timing.visibleAt120 === null
      ) {
        return null;
      }
      return {
        elapsed: timing.openedAt - timing.startedAt,
        visibleAt120: timing.visibleAt120,
      };
    })).not.toBeNull();
    const measuredHoverTiming = await page.evaluate(() => {
      const timing = (window as unknown as {
        __tabTooltipTiming: {
          openedAt: number;
          startedAt: number;
          visibleAt120: boolean;
        };
      }).__tabTooltipTiming;
      return {
        elapsed: timing.openedAt - timing.startedAt,
        visibleAt120: timing.visibleAt120,
      };
    });
    expect(measuredHoverTiming.visibleAt120).toBe(false);
    expect(measuredHoverTiming.elapsed).toBeGreaterThanOrEqual(170);
    expect(measuredHoverTiming.elapsed).toBeLessThan(600);

    await page.mouse.move(1000, 700);
    await expect(page.locator('.manager-info-popover')).toHaveCount(0);
    await trigger.focus();
    await expect(page.locator('.manager-info-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.manager-info-popover')).toHaveCount(0);
    await page.evaluate(() => {
      const windowBar = document.querySelector<HTMLElement>(
        '.manager-open-tabs-window-bar',
      );
      const contextBar = document.querySelector<HTMLElement>(
        '.manager-open-tabs-selection-bar',
      );
      if (windowBar) windowBar.style.display = 'none';
      if (contextBar) contextBar.style.display = 'none';
    });
    await trigger.hover();
    await expect(page.locator('.manager-info-popover')).toBeVisible();
    const flipped = await page.locator('.manager-open-tab-row').first().evaluate(
      (row) => {
        const rowRect = row.getBoundingClientRect();
        const tooltip = document.querySelector<HTMLElement>(
          '.manager-info-popover',
        )!;
        const tooltipRect = tooltip.getBoundingClientRect();
        return {
          placement: tooltip.dataset.placement,
          gap: tooltipRect.top - rowRect.bottom,
        };
      },
    );
    expect(flipped.placement).toBe('bottom');
    expect(flipped.gap).toBeCloseTo(6, 1);
  });

  test('keeps the read-only tooltip clamped and legible in compact dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();

    const expand = page.getByRole('button', { name: /Expand Sidebar/ });
    if (await expand.isVisible()) {
      await expand.click();
      await expect(page.locator('.manager-shell'))
        .toHaveClass(/manager-shell--sidebar-drawer/);
    }
    const trigger = page.locator('[data-info-popover="open"]').first();
    await expect(trigger).toBeEnabled();
    await expect(trigger).not.toHaveAttribute('aria-hidden', 'true');
    await expect(trigger).toHaveCSS('opacity', '1');
    await trigger.focus();
    const tooltip = page.locator('.manager-info-popover');
    await expect(tooltip).toBeVisible();
    const evidence = await tooltip.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const title = element.querySelector<HTMLElement>(
        '.manager-tab-tooltip__title',
      )!;
      const link = element.querySelector<HTMLElement>(
        '.manager-tab-tooltip__link',
      )!;
      return {
        background: getComputedStyle(element).backgroundColor,
        left: bounds.left,
        right: bounds.right,
        pointerEvents: getComputedStyle(element).pointerEvents,
        titleClamp: getComputedStyle(title).webkitLineClamp,
        linkClamp: getComputedStyle(link).webkitLineClamp,
      };
    });
    expect(evidence.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(evidence.left).toBeGreaterThanOrEqual(8);
    expect(evidence.right).toBeLessThanOrEqual(382);
    expect(evidence.pointerEvents).toBe('none');
    expect(evidence.titleClamp).toBe('2');
    expect(evidence.linkClamp).toBe('4');
  });

  test('balances resting Tab row insets and overlays the trailing action on hover', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();

    const readRowGeometry = async (
      rowSelector: string,
      detailsSelector: string,
      actionSelector: string,
    ) => page.locator(rowSelector).first().evaluate((row, selector) => {
      const { actionSelector, detailsSelector } = selector;
      const details = row.querySelector<HTMLElement>(detailsSelector);
      const title = details?.children.item(0);
      const metadata = details?.children.item(1);
      const owner = row.querySelector<HTMLElement>('.manager-tab-owner-slot');
      const trailingAction = row.querySelector<HTMLElement>(actionSelector);
      if (!details || !title || !metadata || !owner || !trailingAction) {
        throw new Error('Tab row is missing its title, metadata, or action slot.');
      }
      const rowRect = row.getBoundingClientRect();
      const detailsRect = details.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const metadataRect = metadata.getBoundingClientRect();
      const ownerRect = owner.getBoundingClientRect();
      const actionRect = trailingAction.getBoundingClientRect();
      const titleStyle = getComputedStyle(title);
      const metadataStyle = getComputedStyle(metadata);
      return {
        childCount: details.children.length,
        rowHeight: rowRect.height,
        titleBottom: titleRect.bottom,
        metadataTop: metadataRect.top,
        detailsLeft: detailsRect.left,
        detailsRight: detailsRect.right,
        ownerRight: ownerRect.right,
        leadingInset: ownerRect.left - rowRect.left,
        trailingInset: rowRect.right - detailsRect.right,
        actionLeft: actionRect.left,
        actionRight: actionRect.right,
        actionOpacity: Number.parseFloat(getComputedStyle(trailingAction).opacity),
        actionPosition: getComputedStyle(trailingAction).position,
        titleFontSize: titleStyle.fontSize,
        titleLineHeight: titleStyle.lineHeight,
        titleWeight: Number(titleStyle.fontWeight),
        metadataFontSize: metadataStyle.fontSize,
        metadataLineHeight: metadataStyle.lineHeight,
        withinRow: detailsRect.top >= rowRect.top
          && detailsRect.bottom <= rowRect.bottom,
      };
    }, { actionSelector, detailsSelector });

    for (const [rowSelector, detailsSelector, actionSelector] of [
      [
        '.manager-open-tab-row',
        '.manager-open-tab-details',
        '.manager-open-tab-close',
      ],
      [
        '.tab-item-row__content',
        '.tab-item-row__details',
        '.tab-item-row__delete',
      ],
    ] as const) {
      const resting = await readRowGeometry(
        rowSelector,
        detailsSelector,
        actionSelector,
      );
      expect(resting.childCount).toBeGreaterThanOrEqual(2);
      expect(resting.rowHeight).toBeGreaterThanOrEqual(44);
      expect(resting.titleBottom).toBeLessThanOrEqual(resting.metadataTop);
      expect(resting.detailsLeft).toBeGreaterThan(resting.ownerRight);
      expect(resting.trailingInset).toBeCloseTo(resting.leadingInset, 1);
      expect(resting.actionOpacity).toBe(0);
      expect(resting.titleFontSize).toBe('14px');
      expect(resting.titleLineHeight).toBe('20px');
      expect(resting.titleWeight).toBeGreaterThanOrEqual(600);
      expect(resting.metadataFontSize).toBe('12px');
      expect(resting.metadataLineHeight).toBe('16px');
      expect(resting.withinRow).toBe(true);

      await page.locator(rowSelector).first().hover();
      const hovered = await readRowGeometry(
        rowSelector,
        detailsSelector,
        actionSelector,
      );
      expect(hovered.actionOpacity).toBe(1);
      expect(hovered.actionPosition).toBe('absolute');
      expect(hovered.actionLeft).toBeLessThan(hovered.detailsRight);
      expect(await page.locator(actionSelector).first().evaluate((action) => {
        const rect = action.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return Boolean(hit && (hit === action || action.contains(hit)));
      })).toBe(true);

      await page.mouse.move(1000, 700);
    }

    for (const geometry of [
      await readRowGeometry(
        '.manager-open-tab-row',
        '.manager-open-tab-details',
        '.manager-open-tab-close',
      ),
      await readRowGeometry(
        '.tab-item-row__content',
        '.tab-item-row__details',
        '.tab-item-row__delete',
      ),
    ]) {
      expect(geometry.childCount).toBeGreaterThanOrEqual(2);
      expect(geometry.rowHeight).toBeGreaterThanOrEqual(44);
      expect(geometry.titleBottom).toBeLessThanOrEqual(geometry.metadataTop);
      expect(geometry.detailsLeft).toBeGreaterThan(geometry.ownerRight);
      expect(geometry.titleFontSize).toBe('14px');
      expect(geometry.titleLineHeight).toBe('20px');
      expect(geometry.titleWeight).toBeGreaterThanOrEqual(600);
      expect(geometry.metadataFontSize).toBe('12px');
      expect(geometry.metadataLineHeight).toBe('16px');
      expect(geometry.withinRow).toBe(true);
    }

    const savedNoteDetails = page.locator('.tab-item-row__content').filter({
      has: page.getByRole('button', {
        name: 'A note saved beside the preview link.',
      }),
    }).locator('.tab-item-row__details');
    await expect(savedNoteDetails.locator(':scope > *')).toHaveCount(2);
    await expect(savedNoteDetails.locator(':scope > *').nth(1)).toHaveText('note');
  });

  test('keeps Open and Saved rows quiet at rest, visible on hover, and accent-soft when selected', async ({ page }) => {
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.manager-shell')).toBeVisible();

    const colors = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.append(probe);
      probe.style.background = 'var(--tabboard-surface-hover)';
      const hover = getComputedStyle(probe).backgroundColor;
      probe.style.background = 'var(--tabboard-accent-soft)';
      const accentSoft = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { accentSoft, hover };
    });

    const openRow = page.locator('.manager-open-tab-row').first();
    const savedRow = page.locator('.tab-item-row__content').first();
    const outerInsets = await openRow.evaluate((row) => {
      const scroll = row.closest('.manager-open-tabs-scroll');
      if (!scroll) throw new Error('Open Tabs scroll owner is missing.');
      const rowRect = row.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      return {
        left: rowRect.left - scrollRect.left,
        right: scrollRect.right - rowRect.right,
      };
    });
    expect(outerInsets.right).toBeCloseTo(outerInsets.left, 1);
    await expect(openRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(savedRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

    await openRow.hover();
    await expect(openRow).toHaveCSS('background-color', colors.hover);
    await savedRow.hover();
    await expect(savedRow).toHaveCSS('background-color', colors.hover);

    await savedRow.getByRole('checkbox').click();
    await page.mouse.move(1000, 700);
    await expect(savedRow).toHaveAttribute('data-selected', 'true');
    await expect(savedRow).toHaveCSS('background-color', colors.accentSoft);

    await openRow.hover();
    await openRow.getByRole('checkbox').click();
    await page.mouse.move(1000, 700);
    await expect(openRow).toHaveAttribute('data-selected', 'true');
    await expect(openRow).toHaveCSS('background-color', colors.accentSoft);
  });
});
