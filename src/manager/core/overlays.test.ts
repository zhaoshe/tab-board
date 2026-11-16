import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceOverlayFocusEpoch,
  getMenuDescriptionTipPosition,
  getOverlayFocusRestoreTarget,
  getTabHoverTooltipPosition,
  getViewportMenuPosition,
  hasExpectedGroupRemovalLifecycle,
  hasExpectedGroupUpdateLifecycle,
  isContextMenuKey,
  scheduleOverlayFocusRestore,
  TAB_HOVER_TOOLTIP_CONTRACT,
} from '../hooks/useManagerOverlays';
import type { Group } from '../../shared/model';
import {
  getSavedTabMenuTrigger,
  getTabDropMarkerPlacement,
} from '../components/sessions/TabItemRow';
import { isCategoryDragMarkerFor } from '../components/workspace/WorkspaceHeader';

const managerRoot = resolve(process.cwd(), 'src/manager');
const hook = readFileSync(resolve(managerRoot, 'hooks/useManagerOverlays.ts'), 'utf8');
const layout = [
  'components/shell/ManagerLayout.tsx',
  'components/shell/ManagerDndCoordinator.tsx',
  'components/shell/managerDndGeometry.ts',
  'components/shell/ManagerDragOverlay.tsx',
  'components/shell/ManagerFrame.tsx',
].map((file) => readFileSync(resolve(managerRoot, file), 'utf8')).join('\n');
const card = [
  'components/sessions/SessionCard.tsx',
  'components/sessions/SessionCardHeader.tsx',
  'components/sessions/SessionCardMeta.tsx',
].map((file) => readFileSync(resolve(managerRoot, file), 'utf8')).join('\n');
const row = readFileSync(resolve(managerRoot, 'components/sessions/TabItemRow.tsx'), 'utf8');
const openTabs = [
  'components/sidebar/OpenTabsPanel.tsx',
  'components/sidebar/OpenTabRow.tsx',
  'components/sidebar/OpenTabsList.tsx',
  'components/sidebar/OpenTabsWindowBar.tsx',
].map((file) => readFileSync(resolve(managerRoot, file), 'utf8')).join('\n');
const header = [
  'components/workspace/WorkspaceHeader.tsx',
  'components/workspace/CategoryNav.tsx',
  'components/workspace/CategoryManager.tsx',
  'components/workspace/WorkspaceMenu.tsx',
].map((file) => readFileSync(resolve(managerRoot, file), 'utf8')).join('\n');
const css = [
  'header.css',
  'sidebar.css',
  'shell.css',
  'session.css',
  'overlays.css',
  'responsive.css',
].map((file) => readFileSync(resolve(managerRoot, 'styles', file), 'utf8')).join('\n');
const menuCss = readFileSync(resolve(managerRoot, 'styles/overlays.css'), 'utf8');

const sourceFiles = [layout, card, row, openTabs, header];

function expectEverySourceToContain(pattern: string | RegExp): void {
  for (const source of sourceFiles) expect(source).toMatch(pattern);
}

describe('overlay geometry and keyboard helpers', () => {
  it('recognizes only ContextMenu and Shift+F10', () => {
    expect(isContextMenuKey({ key: 'ContextMenu', shiftKey: false })).toBe(true);
    expect(isContextMenuKey({ key: 'F10', shiftKey: true })).toBe(true);
    expect(isContextMenuKey({ key: 'F10', shiftKey: false })).toBe(false);
    expect(isContextMenuKey({ key: 'Enter', shiftKey: true })).toBe(false);
  });

  it('clamps the exact oracle position and all viewport edges', () => {
    expect(getViewportMenuPosition(
      { x: 1000, y: 700 },
      { width: 240, height: 300 },
      { width: 1024, height: 768 },
    )).toEqual({ left: 776, top: 460 });
    expect(getViewportMenuPosition(
      { x: 0, y: 0 },
      { width: 100, height: 80 },
      { width: 400, height: 300 },
    )).toEqual({ left: 8, top: 8 });
    expect(getViewportMenuPosition(
      { x: 390, y: 290 },
      { width: 100, height: 80 },
      { width: 400, height: 300 },
    )).toEqual({ left: 292, top: 212 });
  });

  it('keeps oversized menus inside the viewport padding without producing negative coordinates', () => {
    expect(getViewportMenuPosition(
      { x: 200, y: 100 },
      { width: 900, height: 700 },
      { width: 400, height: 300 },
    )).toEqual({ left: 8, top: 8 });
  });

  it('places description tips beside the item and flips at the right viewport edge', () => {
    expect(getMenuDescriptionTipPosition(
      { left: 40, right: 140, top: 80, bottom: 109 },
      { width: 120, height: 40 },
      { width: 400, height: 240 },
    )).toEqual({ left: 146, top: 74.5 });
    expect(getMenuDescriptionTipPosition(
      { left: 260, right: 360, top: 80, bottom: 109 },
      { width: 120, height: 40 },
      { width: 400, height: 240 },
    )).toEqual({ left: 134, top: 74.5 });
  });

  it('clamps description tips to the top and bottom viewport padding', () => {
    expect(getMenuDescriptionTipPosition(
      { left: 40, right: 140, top: 0, bottom: 29 },
      { width: 120, height: 40 },
      { width: 400, height: 240 },
    )).toEqual({ left: 146, top: 8 });
    expect(getMenuDescriptionTipPosition(
      { left: 40, right: 140, top: 225, bottom: 254 },
      { width: 120, height: 40 },
      { width: 400, height: 240 },
    )).toEqual({ left: 146, top: 192 });
  });
});

describe('overlay focus restoration scheduling', () => {
  it('accepts only the expected structurally shared group removal or update', () => {
    const before = { id: 'before' } as Group;
    const target = { id: 'target' } as Group;
    const after = { id: 'after' } as Group;
    const updatedTarget = { id: 'target' } as Group;
    const changedAfter = { id: 'after' } as Group;

    expect(hasExpectedGroupRemovalLifecycle(
      [before, target, after],
      [before, after],
      'target',
    )).toBe(true);
    expect(hasExpectedGroupRemovalLifecycle(
      [before, target, after],
      [before, changedAfter],
      'target',
    )).toBe(false);
    expect(hasExpectedGroupUpdateLifecycle(
      [before, target, after],
      [before, updatedTarget, after],
      'target',
    )).toBe(true);
    expect(hasExpectedGroupUpdateLifecycle(
      [before, target, after],
      [before, updatedTarget, changedAfter],
      'target',
    )).toBe(false);
  });

  it('restores menu focus only when the menu opened by keyboard', () => {
    const keyboardTrigger = {} as HTMLElement;
    const pointerTrigger = {} as HTMLElement;
    const previewTrigger = {} as HTMLElement;

    expect(getOverlayFocusRestoreTarget(
      { trigger: keyboardTrigger, openedByKeyboard: true },
      null,
      true,
    )).toBe(keyboardTrigger);
    expect(getOverlayFocusRestoreTarget(
      { trigger: pointerTrigger, openedByKeyboard: false },
      null,
      true,
    )).toBeNull();
    expect(getOverlayFocusRestoreTarget(
      { trigger: keyboardTrigger, openedByKeyboard: true },
      null,
      false,
    )).toBeNull();
    expect(getOverlayFocusRestoreTarget(
      { trigger: pointerTrigger, openedByKeyboard: false },
      { trigger: previewTrigger, restoreFocusOnClose: true },
      true,
    )).toBe(previewTrigger);
  });

  it('does not restore until the scheduled frame and skips pointer/outside close', () => {
    const trigger = {} as HTMLElement;
    let queuedCallback: (() => void) | null = null;
    let restoredTarget: HTMLElement | null = null;
    const requestFrame = (callback: () => void): number => {
      queuedCallback = callback;
      return 17;
    };

    expect(scheduleOverlayFocusRestore(
      trigger,
      0,
      () => 0,
      requestFrame,
      (target) => { restoredTarget = target; },
    )).toBe(17);
    expect(restoredTarget).toBeNull();
    queuedCallback!();
    expect(restoredTarget).toBe(trigger);

    queuedCallback = null;
    restoredTarget = null;
    expect(scheduleOverlayFocusRestore(
      null,
      0,
      () => 0,
      requestFrame,
      (target) => { restoredTarget = target; },
    )).toBeNull();
    expect(queuedCallback).toBeNull();
  });

  it('cancels a queued restore when the focus epoch changes', () => {
    const trigger = {} as HTMLElement;
    let queuedCallback: (() => void) | null = null;
    let focusEpoch = 0;
    let restoredTarget: HTMLElement | null = null;
    const requestFrame = (callback: () => void): number => {
      queuedCallback = callback;
      return 23;
    };

    scheduleOverlayFocusRestore(
      trigger,
      focusEpoch,
      () => focusEpoch,
      requestFrame,
      (target) => { restoredTarget = target; },
    );
    focusEpoch = 1;
    queuedCallback!();
    expect(restoredTarget).toBeNull();
  });

  it('does not restore pointer or hover previews on Escape', () => {
    const pointerPreviewTrigger = {} as HTMLElement;
    expect(getOverlayFocusRestoreTarget(
      null,
      { trigger: pointerPreviewTrigger, restoreFocusOnClose: false },
      true,
    )).toBeNull();
    expect(getOverlayFocusRestoreTarget(
      null,
      { trigger: pointerPreviewTrigger, restoreFocusOnClose: true },
      false,
    )).toBeNull();
    expect(hook).toContain('restoreFocusOnClose: options.restoreFocusOnClose === true');
    expect(hook).toContain('openPreview({ ...options, restoreFocusOnClose: true })');
    expect(hook).toContain('restoreFocusOnClose: previewRef.current?.trigger === trigger');
    expect(hook).toContain('getOverlayFocusRestoreTarget(null, currentPreview, shouldRestore)');
  });

  it('restores explicitly owned saved menus independently of invocation method', () => {
    const checkboxTrigger = {} as HTMLElement;
    const deleteTrigger = {} as HTMLElement;

    expect(getOverlayFocusRestoreTarget(
      {
        trigger: checkboxTrigger,
        openedByKeyboard: false,
        restoreFocusOnClose: true,
      },
      null,
      true,
    )).toBe(checkboxTrigger);
    expect(getOverlayFocusRestoreTarget(
      {
        trigger: deleteTrigger,
        openedByKeyboard: true,
        restoreFocusOnClose: true,
      },
      null,
      true,
    )).toBe(deleteTrigger);
    expect(row).toContain('getSavedTabMenuTrigger');
    expect(row).toContain('restoreFocusOnClose: true');
    expect(hook).toContain('currentMenu.restoreFocusOnClose');
  });

  it('cancels a pending frame before advancing the focus epoch', () => {
    const cancelAnimationFrame = vi.fn();
    const cancelPendingFocusRestore = () => cancelAnimationFrame(41);

    expect(advanceOverlayFocusEpoch(7, cancelPendingFocusRestore)).toBe(8);
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41);
  });
});

describe('centralized manager overlay contracts', () => {
  it('uses B2 dense rows without letting descriptions change row height or capture pointers', () => {
    expect(menuCss).toMatch(
      /\.manager-overlay-menu\s*\{[\s\S]*?box-sizing: border-box;[\s\S]*?width: 190px;[\s\S]*?max-width: 190px;/,
    );
    expect(menuCss).not.toContain('min-width: 190px');
    expect(menuCss).toMatch(
      /\.manager-overlay-menu__item-label\s*\{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/,
    );
    expect(menuCss).toContain('min-height: 29px');
    expect(menuCss).toContain('@media (hover: none), (pointer: coarse)');
    expect(menuCss).toContain('min-height: 44px');
    expect(menuCss).toMatch(
      /\.manager-menu-item__description-tip\s*\{[\s\S]*?position: fixed;[\s\S]*?pointer-events: none;/,
    );
    expect(menuCss).toMatch(
      /\.manager-overlay-menu__item--danger\s*\{[\s\S]*?color:\s*var\(--tabboard-danger\)/,
    );
  });

  it('has one menu owner and one preview owner with shared lifecycle cleanup', () => {
    expect(hook).toContain('const [menu, setMenu]');
    expect(hook).toContain('const [preview, setPreview]');
    expect(hook).toContain('document.addEventListener(\'scroll\'');
    expect(hook).toContain('document.addEventListener(\'dragstart\'');
    expect(hook).toContain('window.addEventListener(\'resize\'');
    expect(hook).toContain('return () =>');
    expect(layout).toContain('useManagerOverlays');
    expect(layout).toContain('<ManagerOverlayPortal');
  });

  it('uses fixed viewport portal menus with hidden pre-measurement and keyboard focus', () => {
    expect(hook).toContain('createPortal');
    expect(hook).toContain('position: \'fixed\'');
    expect(hook).toContain("'hidden'");
    expect(hook).toContain('getViewportMenuPosition');
    expect(hook).toContain('ManagerMenuItem');
    expect(hook).toContain('isConnected');
    expect(hook).toContain('openedByKeyboard');
  });

  it('connects contextual menus for sessions and saved tabs but not Open Tabs', () => {
    expect(layout).toContain('useManagerOverlays');
    expect(card).toContain('onContextMenu');
    expect(row).toContain('onContextMenu');
    expect(openTabs).not.toContain('onContextMenu');
    expect(card).toContain('isContextMenuKey');
    expect(row).toContain('isContextMenuKey');
    expect(openTabs).not.toContain('isContextMenuKey');
    expect(row).toContain("ariaLabel: 'Saved Tab Actions'");
    expect(header).toContain('label="Category Options"');
    expect(header).toContain('Manage Categories');
  });

  it('keeps invalid open tabs out of the application menu', () => {
    expect(openTabs).toContain('tab.storable !== true');
    expect(openTabs).toContain('Number.isSafeInteger');
    expect(openTabs).toContain('return;');
  });

  it('links Open and Saved title controls to the shared read-only tooltip', () => {
    expect(openTabs).toContain(
      "data-info-popover={sidebarCollapsed ? undefined : 'open'}",
    );
    expect(row).toMatch(/data-info-popover(?:="saved"|=\{isDragOverlay \? undefined : 'saved'\})/);
    expect(openTabs).toContain(
      'data-info-key={sidebarCollapsed ? undefined : previewKey}',
    );
    expect(row).toContain('data-info-key={isDragOverlay ? undefined : infoKey}');
    expect(openTabs).not.toContain('aria-haspopup="dialog"');
    expect(row).not.toContain("aria-haspopup={isDragOverlay ? undefined : 'dialog'}");
    expect(openTabs).not.toContain('aria-expanded={isPreviewOpen}');
    expect(row).not.toContain('aria-expanded={isDragOverlay ? undefined : isPreviewOpen}');
    expect(row).not.toContain('IconEye');
    expect(row).not.toMatch(/manager-info-card-action|>Preview action</);
    expect(openTabs).toContain('aria-label={`Go to ${title}`}');
    expect(row).toContain('openSavedTab');
  });

  it('keeps read-only tooltip timing, ARIA description, and top-bottom placement in one owner', () => {
    expect(hook).toContain('180');
    expect(hook).toContain('120');
    expect(hook).toContain("setAttribute('aria-describedby', options.id)");
    expect(hook).toContain("removeAttribute('aria-describedby')");
    expect(hook).toContain("role: 'tooltip'");
    expect(hook).not.toMatch(/className: 'manager-info-popover'[\s\S]*?'aria-label'/);
    expect(hook).toContain('TAB_HOVER_TOOLTIP_GAP = 6');
    expect(getTabHoverTooltipPosition(
      { left: 40, right: 240, top: 120, bottom: 150 },
      { width: 180, height: 60 },
      { width: 320, height: 240 },
    )).toEqual({ left: 40, top: 54, placement: 'top' });
    expect(getTabHoverTooltipPosition(
      { left: 40, right: 240, top: 20, bottom: 50 },
      { width: 180, height: 60 },
      { width: 320, height: 240 },
    )).toEqual({ left: 40, top: 56, placement: 'bottom' });
    expect(hook).toContain('Escape');
    expect(hook).toContain('if (preview.position) return;');
    expect(hook).not.toContain('}, [controller, preview]);');
    expect(hook).not.toContain("document.addEventListener('click', handleClick)");
    expect(hook).toContain("window.addEventListener('blur'");
    expect(hook).toContain("document.addEventListener('visibilitychange'");
    expect(hook).toContain('MANAGER_HOVER_SUPPRESSED_ATTRIBUTE');
    expect(hook).toContain('event.movementX === 0 && event.movementY === 0');
    expect(css).toContain('html[data-tabboard-hover-suppressed]');
  });

  it('closes overlays on workspace/category/list replacement and detached triggers', () => {
    expect(layout).toContain('workspaceKey={workspace?.id}');
    expect(layout).toContain('selectedCategory');
    expect(layout).toMatch(/ManagerOverlaysProvider[\s\S]*workspaceKey=\{workspace\?\.id\}/);
    expect(hook).toContain('groupItems');
    expect(hook).toContain('trigger.isConnected');
  });

  it('sizes every always-mounted drag preview from the captured source rectangle', () => {
    expect(layout).toContain('dragUiState.sourceRect');
    expect(layout).toContain('manager-drag-overlay__preview');
    expect(layout).toContain('manager-drag-overlay__stack');
    expect(layout).toContain('pointerEvents: \'none\'');
    expect(layout).toContain('aria-hidden="true"');
  });

  it('keeps item ghosts translucent and explicitly stacked above new-session targets', () => {
    expect(css).toMatch(
      /\.manager-drag-overlay__preview\[data-item-preview='true'\][^{]*\{[^}]*opacity:\s*0\.\d+/,
    );
    expect(css).not.toMatch(
      /\.manager-drag-overlay__preview\[data-item-preview='true'\][^{]*\{[^}]*overflow:\s*visible/,
    );
    expect(css).toMatch(
      /\.manager-drag-overlay__stack[^{]*\{[^}]*grid-template-rows:\s*repeat\(var\(--drag-preview-rows\), minmax\(0, 1fr\)\)/,
    );
    expect(css).toMatch(
      /\.manager-drag-overlay__stack[^{]*\{[^}]*grid-template-columns:\s*repeat\(var\(--drag-preview-columns\), minmax\(0, 1fr\)\)/,
    );
    expect(css).toMatch(
      /\.manager-drag-overlay__row[^{]*\{[^}]*min-height:\s*0/,
    );
    expect(css).toMatch(
      /\.manager-drag-overlay__stack[^{]*\{[^}]*border-radius:\s*var\(--mantine-radius-sm\)/,
    );
    expect(css).toMatch(
      /\.manager-drag-overlay__stack[^{]*\{[^}]*box-shadow:\s*inset 0 0 0 1px/,
    );
    expect(css).not.toMatch(
      /\.manager-drag-overlay__stack[^{]*\{[^}]*border:\s*1px/,
    );
    expect(css).not.toContain('.manager-drag-overlay__row:first-child');
    expect(css).not.toContain('.manager-drag-overlay__row:last-child');
    expect(css).toMatch(
      /\.manager-drag-overlay(?:,|\s*\{)[\s\S]*pointer-events:\s*none/,
    );
    expect(layout).toContain('className="manager-drag-overlay"');
    expect(layout).toContain('zIndex={17}');
    expect(layout).toContain('className="manager-drag-overlay__row"');
    expect(layout).toContain('className="manager-drag-overlay__title"');
    expect(layout).toContain('className="manager-drag-overlay__domain"');
    expect(layout).toContain("'--drag-preview-rows'");
    expect(layout).toContain("'--drag-preview-columns'");
    expect(layout).toContain('dragUiState.previewRect');
    expect(layout).toContain('dragUiState.previewLayout');
    expect(layout).not.toContain('MIN_PREVIEW_ROW_HEIGHT');
    expect(layout).not.toContain('manager-drag-overlay__count');
  });

  it('passes resolved markers to rendered drop surfaces', () => {
    expect(layout).toContain('markerForTarget(target)');
    expect(layout).toContain('DragOverlay');
  });

  it('keeps after-edge feedback explicit and propagates locked category markers', () => {
    const tabMarker = { kind: 'tab', groupId: 'group-a', tabId: 'tab-a', placement: 'after' } as const;
    const categoryMarker = { kind: 'category-reorder', categoryId: 'folder-a', placement: 'after' } as const;
    expect(getTabDropMarkerPlacement(tabMarker, 'group-a', 'tab-a')).toBe('after');
    expect(getTabDropMarkerPlacement(tabMarker, 'group-a', 'other-tab')).toBeNull();
    expect(isCategoryDragMarkerFor(categoryMarker, 'folder-a')).toBe(true);
    expect(isCategoryDragMarkerFor(categoryMarker, 'folder-b')).toBe(false);
    expect(isCategoryDragMarkerFor(categoryMarker, 'folder-a', 'before')).toBe(false);
  });

  it('reveals session actions only from the session header', () => {
    expect(css).toMatch(/\.session-card__header:hover[\s\S]*\.session-card__actions/);
    expect(css).toContain('.session-card__header:focus-within');
    expect(css).toContain('.session-card__actions:focus-within');
    expect(css).toContain('[data-overlay-open="true"]');
    expect(css).not.toContain('.session-card:focus-within');
  });

  it('keeps drag overlays inert and closes overlays through dnd-kit lifecycle', () => {
    expect(layout).toContain('useDndMonitor');
    expect(layout).toContain('onDragStart: () => closeOverlays()');
    expect(card).toContain('isDragOverlay={isDragOverlay}');
    expect(row).toContain('isDragOverlay ? undefined : setTitleTrigger');
    expect(hook).toContain("role: 'tooltip'");
    expect(hook).not.toMatch(
      /className: 'manager-info-popover',[\s\S]{0,300}onPointerDown/,
    );
    expect(layout).toContain("pointerEvents: 'none'");
  });

  it('restores focus only for keyboard menu-item activation', () => {
    expect(hook).toContain('event.detail === 0');
    expect(hook).toContain('captureFocusRestoreIntent');
    expect(hook).toContain('closeOverlays();');
    expect(hook).toContain('restoreFocusAfterMutation');
    expect(card).toContain('aria-hidden={isDragOverlay}');
    expect(card).toContain("? { pointerEvents: 'none' as const }");
    expect(row).toContain('data-selection-mode={selectionMode || undefined}');
    expect(row).toContain('className="tab-item-row__select"');
  });

  it('keeps category management in the unified native menu', () => {
    expect(header).toContain('<Menu');
    expect(header).toContain('{...MANAGER_DENSE_MENU_PROPS}');
    expect(header).toContain('position="bottom-end"');
    expect(header).toContain('setManagerOpen(true)');
    expect(header).toContain('Manage Categories');
    expect(header).toContain('Add Category');
    expect(header).not.toContain('Reorder Categories');
  });

  it('keeps session and saved-tab menu semantics while Open Tabs have no application menu', () => {
    expect(card).toContain('aria-haspopup="menu"');
    expect(card).toContain('aria-expanded={isSessionMenuOpen}');
    expect(row).toContain("ariaLabel: 'Saved Tab Actions'");
    expect(row).toContain('onContextMenu');
    expect(row).toContain('isContextMenuKey');
    expect(row).toContain("label={tab.itemType === ITEM_LINK && !tab.note ? 'Add Note' : 'Edit Note'}");
    expect(row).toContain('label="Refresh Title"');
    expect(row).toContain('label="Copy URL"');
    expect(row).toContain('label="Copy Text"');
    expect(row).toContain("label={isTitleRefreshing ? 'Refreshing title' : 'Delete'}");
    expect(row).toContain('restoreFocusOnClose: true');
    expect(row).toMatch(/label="Refresh Title"[\s\S]*onClick=\{handleRefreshTitle\}/);
    expect(row).toMatch(/label=\{isTitleRefreshing \? 'Refreshing title' : 'Delete'\}[\s\S]*disabled=\{locked\}[\s\S]*onClick=\{handleDelete\}/);
    expect(row).not.toContain('aria-label="More"');
    expect(row).not.toContain('manager-info-card-action');
    expect(openTabs).not.toContain('aria-haspopup="menu"');
    expect(openTabs).not.toContain('onContextMenu');
    expect(header).toContain('label="Category Options"');
    expect(header).toContain('Manage Categories');
    expect(header).not.toContain('data-category-trigger="dots"');
    expect(card).toContain('description="Add a saved URL"');
    expect(card).toContain('description="Choose a Category and Session position"');
    expect(row).toContain('description="Copy the saved address"');
    expect(row).toContain('description="Move this item to Bin"');
  });

  it('keeps the shared tooltip read-only with unclobbered detail text and line limits', () => {
    expect(hook).toContain("className: 'manager-tab-tooltip'");
    expect(hook).toContain("className: 'manager-tab-tooltip__title'");
    expect(hook).toContain("className: 'manager-tab-tooltip__domain'");
    expect(hook).toContain("className: 'manager-tab-tooltip__link'");
    expect(hook).toContain("className: 'manager-tab-tooltip__timestamp'");
    expect(hook).not.toMatch(/manager-tab-tooltip'[^\n]*aria-label/);
    expect(hook).not.toMatch(
      /className: 'manager-info-popover',[\s\S]{0,300}'aria-label'/,
    );
    expect(hook).not.toMatch(/renderTabHoverTooltipContent[\s\S]*?Favicon|manager-info-card-action/);
    expect(TAB_HOVER_TOOLTIP_CONTRACT.titleLines).toBe(2);
    expect(TAB_HOVER_TOOLTIP_CONTRACT.linkLines).toBe(4);
    expect(TAB_HOVER_TOOLTIP_CONTRACT.pointerEvents).toBe('none');
    expect(menuCss).toMatch(/\.manager-tab-tooltip__title\s*\{[\s\S]*?-webkit-line-clamp: 2;/);
    expect(menuCss).toMatch(/\.manager-tab-tooltip__link\s*\{[\s\S]*?-webkit-line-clamp: 4;/);
    expect(menuCss).toMatch(/\.manager-tab-tooltip__timestamp\s*\{[\s\S]*?white-space: nowrap;/);
  });

  it('does not reopen a preview while restoring focus after Escape', () => {
    expect(hook).toContain('restoredFocusRef');
    expect(hook).toContain('restoredFocusRef.current === trigger');
  });

  it('defers keyboard menu focus restoration until after portal unmount', () => {
    const focusRestore = hook.slice(hook.indexOf('const deferFocusRestore ='), hook.indexOf('const closeMenu ='));
    const closeMenu = hook.slice(hook.indexOf('const closeMenu ='), hook.indexOf('const closePreview ='));
    const closeOverlays = hook.slice(hook.indexOf('const closeOverlays ='), hook.indexOf('const captureFocusRestoreIntent ='));
    expect(focusRestore).toContain('scheduleOverlayFocusRestore');
    expect(focusRestore).toContain('requestAnimationFrame');
    expect(closeMenu).not.toMatch(/setMenu\(\(current\)[\s\S]*restoreFocus\(current\.trigger/);
    expect(closeMenu).toMatch(/const currentMenu = menuRef\.current;[\s\S]*setMenu\(null\);[\s\S]*deferFocusRestore\(currentMenu\.trigger, true\);/);
    expect(closeOverlays).toContain('getOverlayFocusRestoreTarget');
    expect(closeOverlays).toContain('setMenu(null);');
  });

  it('focuses Open Tabs with one click and keeps details on an explicit action', () => {
    expect(openTabs).toContain('aria-label={`Go to ${title}`}');
    expect(openTabs).toContain('void onFocusTab(tab.id, tab.windowId)');
    expect(openTabs).not.toContain('onDoubleClick');
    expect(openTabs).toContain('label={`Close ${tab.title || \'untitled tab\'}`}');
    expect(openTabs).not.toContain('More Actions');
    expect(openTabs).toContain(
      "data-info-popover={sidebarCollapsed ? undefined : 'open'}",
    );
    expect(openTabs).toContain(
      'data-info-key={sidebarCollapsed ? undefined : previewKey}',
    );
  });

  it('defers keyboard action focus until after mutation with row and card fallbacks', () => {
    expect(hook).toContain('captureFocusRestoreIntent');
    expect(hook).toContain('restoreFocusAfterMutation');
    expect(hook).toContain('requestAnimationFrame');
    expect(hook).toContain("closest<HTMLElement>('.tab-item-row')");
    expect(hook).toContain("closest<HTMLElement>('.session-card')");
    expect(hook).toContain("'.manager-open-tab-row'");
    expect(hook).toMatch(/closeOverlays\(\);[\s\S]*await onClick\(focusIntent\);[\s\S]*restoreFocusAfterMutation/);
  });

  it('keeps Open rows menu-free and pointer-draggable without a keyboard drag stop', () => {
    expect(openTabs).not.toContain('Filter sessions');
    expect(openTabs).not.toContain('onContextMenu');
    expect(openTabs).not.toContain('Pin tab');
    expect(openTabs).not.toContain('onPinTab');
    expect(openTabs).not.toContain('More Actions');
    expect(openTabs).toContain('setActivatorNodeRef(node)');
    expect(openTabs).toContain('listeners?.onPointerDown?.(event)');
    expect(openTabs).toContain('listeners?.onTouchStart?.(event)');
    expect(openTabs).toContain("event.pointerType === 'touch'");
    expect(openTabs).not.toContain('{...attributes}');
    expect(openTabs).not.toContain('{...listeners}');
    expect(openTabs).not.toContain('aria-roledescription');
  });

  it('keeps saved-tab focus selectors exact first and scoped to the session', () => {
    expect(hook).toContain('data-info-key');
    expect(hook).toContain('.tab-item-row[data-group-id=');
    expect(hook).toContain('.session-card[data-group-id=');
    expect(hook).toContain('.session-card[data-group-id="${CSS.escape(sessionCard.dataset.groupId)}"] .tab-item-row');
    expect(row).toContain('data-group-id={groupId}');
    expect(row).toContain('data-tab-id={tab.id}');
  });

  it('cancels deferred focus across overlay lifecycle changes and unmount', () => {
    expect(hook).toContain('pendingFocusRestoreFrameRef');
    expect(hook).toContain('isProviderMountedRef');
    expect(hook).toContain('cancelAnimationFrame');
    expect(hook).toContain('lifecycleVersionRef');
    expect(hook).toContain('intent.lifecycleVersion');
    expect(hook).toContain('intent.workspaceKey');
    expect(hook).toContain('intent.categoryKey');
    expect(hook).toContain('intent.groupItems');
    expect(openTabs).toContain("kind: 'open-tab-removal' as const");
    expect(hook).toContain('setTimeout(() => restoreFocusAfterMutation(focusIntent), 0)');
    expect(hook).toContain('closeOverlays();');
  });

  it('uses stable group references instead of joined list keys for lifecycle invalidation', () => {
    expect(layout).toContain('groupItems={groups}');
    expect(layout).not.toContain('groups.map((group) => `${group.id}:${group.updatedAt}`).join');
    expect(card).not.toContain('group.tabs.map((tab) => tab.id).join');
  });

  it('invalidates open-tab overlays from the stable filtered-tabs projection', () => {
    expect(openTabs).toContain('const sourceSnapshot = useMemo');
    expect(openTabs).toContain('() => ({ selectedWindowId, filteredTabs })');
    expect(openTabs).toContain('[filteredTabs, selectedWindowId]');
    expect(openTabs).toContain('useManagerOverlayLifecycle(sourceSnapshot)');
  });

  it('limits open-tab lifecycle focus restoration to the expected removal context', () => {
    expect(hook).toContain('lifecycleAllowance');
    expect(hook).toContain("kind: 'open-tab-removal'");
    expect(hook).toContain('data-open-tab-id');
    expect(hook).toContain('data-open-window-id');
    expect(openTabs).toContain("kind: 'open-tab-removal' as const");
    expect(openTabs).toContain('captureFocusRestoreIntent(event.currentTarget)');
    expect(openTabs).toContain('const hasValidTabId = isValidTabId(tab.id);');
    expect(openTabs).toContain('data-open-window-id={hasValidTabId ? tab.windowId : undefined}');
  });

  it('limits saved-session lifecycle restoration to explicit expected removals', () => {
    expect(hook).toContain("kind: 'session-removal'");
    expect(hook).toContain("kind: 'saved-tab-removal'");
    expect(hook).toContain('lifecycleVersionRef.current <= intent.lifecycleVersion');
    expect(hook).toContain('lifecycleVersionRef.current === intent.lifecycleVersion');
    expect(hook).toContain('lifecycleContextRef.current');
    expect(hook).toContain('.session-board .session-card');
    expect(hook).toContain('.session-board');
    expect(card).toContain('lifecycleAllowance="session-removal"');
    expect(row).toContain("label={isTitleRefreshing ? 'Refreshing title' : 'Delete'}");
  });

  it('keeps saved-tab removal valid when its group key stays stable or disappears', () => {
    const savedAllowance = hook.match(/if \(allowance\.kind === 'saved-tab-removal'[\s\S]*?return Boolean[\s\S]*?\n      \}/)?.[0] || '';
    expect(hook).toContain('return hasExpectedGroupRemovalLifecycle(previousGroups, currentGroups, groupId);');
    expect(savedAllowance).toContain('.session-board, .manager-board');
    expect(hook).toContain('index === currentIndex || group === previousGroups[index]');
  });

  it('cycles keyboard-opened shared menus through enabled items with wrapped arrows', () => {
    expect(hook).toContain("[role=\"menuitem\"]:not(:disabled)");
    expect(hook).toContain("event.key === 'ArrowDown'");
    expect(hook).toContain("event.key === 'ArrowUp'");
    expect(hook).toContain('event.preventDefault()');
    expect(hook).toContain('nextIndex = (currentIndex + direction + menuItems.length) % menuItems.length');
  });

  it('keeps open-tab mutation focus inside Open Tabs when last row disappears', () => {
    expect(openTabs).toContain('data-open-tabs-panel');
    expect(openTabs).toContain('tabIndex={-1}');
    expect(hook).toContain('[data-open-tabs-panel]');
    expect(hook).toContain("selectors.push('[data-open-tabs-panel]')");
  });

  it('restores keyboard focus after direct Open Tab close actions', () => {
    expect(hook).toContain('triggerOverride?: HTMLElement | null');
    expect(openTabs).toContain('captureFocusRestoreIntent');
    expect(openTabs).toContain("kind: 'open-tab-removal'");
    expect(openTabs).toContain('event.detail === 0');
    expect(openTabs).toContain('setTimeout(() => restoreFocusAfterMutation');
  });

  it('keeps active-menu arrow ownership at document level without duplicate portal handling', () => {
    expect(hook).toContain('const handleMenuKeyDown = (event: globalThis.KeyboardEvent)');
    expect(hook).toContain("document.addEventListener('keydown', handleMenuKeyDown)");
    expect(hook).toContain("document.removeEventListener('keydown', handleMenuKeyDown)");
    expect(hook).toContain('menuElementRef.current');
    expect(hook).toContain('input, textarea, select');
    expect(hook).not.toContain('onKeyDown: handleMenuKeyDown');
  });

  it('invalidates async keyboard focus restoration after pointer interaction', () => {
    expect(hook).toContain('focusEpochRef');
    expect(hook).toContain('focusEpoch: number');
    expect(hook).toContain('intent.focusEpoch');
    expect(hook).toContain('const advanceFocusEpoch = useCallback');
    expect(hook).toContain('advanceOverlayFocusEpoch');
    expect(hook).toMatch(/const invalidateOverlayLifecycle = useCallback[\s\S]*cancelPendingFocusRestore\(\);[\s\S]*lifecycleVersionRef\.current \+= 1/);
    expect(hook).toContain('if (intent.focusEpoch !== focusEpochRef.current) return false;');
    expect(hook).toContain('event.detail === 0');
  });
});
