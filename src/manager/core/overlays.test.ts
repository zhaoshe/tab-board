import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceOverlayFocusEpoch,
  getOverlayFocusRestoreTarget,
  getViewportMenuPosition,
  isContextMenuKey,
  scheduleOverlayFocusRestore,
  shouldRestorePreviewFocusOnClose,
} from '../hooks/useManagerOverlays';
import { getTabDropMarkerPlacement } from '../components/sessions/TabItemRow';
import { isCategoryDragMarkerFor } from '../components/workspace/WorkspaceHeader';

const managerRoot = resolve(process.cwd(), 'src/manager');
const hook = readFileSync(resolve(managerRoot, 'hooks/useManagerOverlays.ts'), 'utf8');
const layout = readFileSync(resolve(managerRoot, 'components/shell/ManagerLayout.tsx'), 'utf8');
const card = readFileSync(resolve(managerRoot, 'components/sessions/SessionCard.tsx'), 'utf8');
const row = readFileSync(resolve(managerRoot, 'components/sessions/TabItemRow.tsx'), 'utf8');
const openTabs = readFileSync(resolve(managerRoot, 'components/sidebar/OpenTabsPanel.tsx'), 'utf8');
const header = readFileSync(resolve(managerRoot, 'components/workspace/WorkspaceHeader.tsx'), 'utf8');
const css = readFileSync(resolve(managerRoot, 'styles/manager.css'), 'utf8');

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
});

describe('overlay focus restoration scheduling', () => {
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
    expect(hook).toContain('restoreFocusOnClose: preview?.trigger === trigger && preview.restoreFocusOnClose');
    expect(hook).toContain('getOverlayFocusRestoreTarget(null, currentPreview, shouldRestore)');
  });

  it('keeps keyboard-generated preview clicks restorable while pointer clicks are not', () => {
    const trigger = {} as HTMLElement;
    const keyboardActivation = { detail: 0 } as Pick<MouseEvent, 'detail'>;
    const pointerActivation = { detail: 1 } as Pick<MouseEvent, 'detail'>;

    expect(shouldRestorePreviewFocusOnClose(keyboardActivation)).toBe(true);
    expect(shouldRestorePreviewFocusOnClose(pointerActivation)).toBe(false);
    expect(getOverlayFocusRestoreTarget(
      null,
      { trigger, restoreFocusOnClose: shouldRestorePreviewFocusOnClose(keyboardActivation) },
      true,
    )).toBe(trigger);
    expect(getOverlayFocusRestoreTarget(
      null,
      { trigger, restoreFocusOnClose: shouldRestorePreviewFocusOnClose(pointerActivation) },
      true,
    )).toBeNull();
    expect(hook).toContain('restoreFocusOnClose: shouldRestorePreviewFocusOnClose(event)');
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

  it('connects contextual menus for sessions while saved tabs use previews', () => {
    expect(layout).toContain('useManagerOverlays');
    expect(card).toContain('onContextMenu');
    expect(row).not.toContain('onContextMenu');
    expect(openTabs).not.toContain('onContextMenu');
    expect(card).toContain('isContextMenuKey');
    expect(row).not.toContain('isContextMenuKey');
    expect(openTabs).not.toContain('isContextMenuKey');
    expect(header).toContain('aria-label="Category options"');
    expect(header).toContain('Manage categories');
  });

  it('keeps invalid open tabs out of the application menu', () => {
    expect(openTabs).toContain('tab.storable !== true');
    expect(openTabs).toContain('Number.isSafeInteger');
    expect(openTabs).toContain('return;');
  });

  it('renders both oracle preview trigger kinds without eye buttons or whole-row triggers', () => {
    expect(openTabs).toContain('data-info-popover="open"');
    expect(row).toMatch(/data-info-popover(?:="saved"|=\{isDragOverlay \? undefined : 'saved'\})/);
    expect(openTabs).toMatch(/aria-haspopup="dialog"|aria-haspopup=\{isOpenTabMenuOpen \? 'menu' : 'dialog'\}/);
    expect(row).toContain("aria-haspopup={isDragOverlay ? undefined : 'dialog'}");
    expect(openTabs).toContain('aria-expanded');
    expect(row).toContain('aria-expanded');
    expect(row).not.toContain('IconEye');
    expect(row).not.toMatch(/aria-label="Preview"|>Preview<|>Preview action</);
    expect(row).not.toMatch(/onClick=\{[^}]*showPreview/);
    expect(row).toContain('openSavedTab');
  });

  it('keeps preview timing and ARIA synchronization in the shared owner', () => {
    expect(hook).toContain('180');
    expect(hook).toContain('120');
    expect(hook).toContain('aria-expanded');
    expect(hook).toContain('right-start');
    expect(hook).toContain('PREVIEW_DISTANCE = 10');
    expect(hook).toContain('Escape');
  });

  it('closes overlays on workspace/category/list replacement and detached triggers', () => {
    expect(layout).toContain('workspaceKey={workspace?.id}');
    expect(layout).toContain('selectedCategory');
    expect(layout).toMatch(/ManagerOverlaysProvider[\s\S]*workspaceKey=\{workspace\?\.id\}/);
    expect(hook).toContain('itemKey');
    expect(hook).toContain('trigger.isConnected');
  });

  it('sizes every always-mounted drag preview from the captured source rectangle', () => {
    expect(layout).toContain('dragUiState.sourceRect');
    expect(layout).toContain('manager-drag-overlay__preview');
    expect(layout).toContain('manager-drag-overlay__stack');
    expect(layout).toContain('pointerEvents: \'none\'');
    expect(layout).toContain('aria-hidden="true"');
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
    expect(row).toContain('isDragOverlay ? undefined : infoTriggerRef');
    expect(hook).toContain("'aria-label': 'Item details'");
    expect(hook).toContain('leavingPreview');
  });

  it('restores focus only for keyboard menu-item activation', () => {
    expect(hook).toContain('event.detail === 0');
    expect(hook).toContain('captureFocusRestoreIntent');
    expect(hook).toContain('closeOverlays();');
    expect(hook).toContain('restoreFocusAfterMutation');
    expect(card).toContain('aria-hidden={isDragOverlay}');
    expect(card).toContain('pointerEvents: isDragOverlay ?');
    expect(row).toContain('data-selection-mode={selectionMode || undefined}');
    expect(row).toContain('className="tab-item-row__select"');
  });

  it('keeps category management in the unified native menu', () => {
    expect(header).toContain('<Menu shadow="md" width={190} position="bottom-end">');
    expect(header).toContain('setCategoryManagerOpened(true)');
  });

  it('keeps menu semantics on sessions while saved tabs use a preview dialog', () => {
    expect(card).toContain('aria-haspopup="menu"');
    expect(card).toContain('aria-expanded={isSessionMenuOpen}');
    expect(row).toContain("aria-haspopup={isDragOverlay ? undefined : 'dialog'}");
    expect(row).toContain('aria-expanded={isDragOverlay ? undefined : isPreviewOpen(infoKey)}');
    expect(row).toMatch(/aria-label="Delete"[\s\S]*disabled=\{locked\}[\s\S]*onClick=\{handleDelete\}/);
    expect(row).not.toContain('aria-label="More"');
    expect(openTabs).toContain('aria-haspopup="dialog"');
    expect(openTabs).toContain('aria-expanded={isPreviewOpen(previewKey)}');
    expect(openTabs).not.toContain('onContextMenu');
    expect(header).toContain('aria-label="Category options"');
    expect(header).toContain('Manage categories');
    expect(header).not.toContain('data-category-trigger="dots"');
  });

  it('keeps shared preview triggers as dialogs when Open Tab filtering is unavailable', () => {
    expect(row).toContain("aria-haspopup={isDragOverlay ? undefined : 'dialog'}");
    expect(row).toContain('aria-expanded={isDragOverlay ? undefined : isPreviewOpen(infoKey)}');
    expect(openTabs).toContain('aria-haspopup="dialog"');
    expect(openTabs).toContain('aria-expanded={isPreviewOpen(previewKey)}');
    expect(row).not.toContain('event.stopPropagation(); handleClick()');
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

  it('keeps Open Tab content preview-only and guards invalid preview actions', () => {
    expect(openTabs).not.toContain('onClick={() => void onFocusTab(tab.id, tab.windowId)}');
    expect(openTabs).not.toContain('void onFocusTab(tab.id, tab.windowId);');
    expect(openTabs).toMatch(/isValidTabId\(tab\.id\) && \([\s\S]*Close tab/);
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

  it('removes Open Tab filtering context menus and keeps pin in the preview actions', () => {
    expect(openTabs).not.toContain('Filter sessions');
    expect(openTabs).not.toContain('onContextMenu');
    expect(openTabs).toContain('Pin tab');
    expect(openTabs).toContain('onPinTab(tab.id)');
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
    expect(hook).toContain('intent.itemKey');
    expect(openTabs).toContain('lifecycleAllowance="open-tab-removal"');
    expect(hook).toContain('setTimeout(() => restoreFocusAfterMutation(focusIntent), 0)');
    expect(hook).toContain('closeOverlays();');
  });

  it('invalidates open-tab overlays when mutable tab content changes', () => {
    expect(openTabs).toContain('tab.title');
    expect(openTabs).toContain('tab.url');
    expect(openTabs).toContain('tab.favIconUrl');
    expect(openTabs).toContain('tab.storable');
    expect(openTabs).toContain('tab.reason');
    expect(openTabs).toContain('tab.pinned');
  });

  it('limits open-tab lifecycle focus restoration to the expected removal context', () => {
    expect(hook).toContain('lifecycleAllowance');
    expect(hook).toContain("kind: 'open-tab-removal'");
    expect(hook).toContain('data-open-tab-id');
    expect(hook).toContain('data-open-window-id');
    expect(openTabs).toContain('lifecycleAllowance="open-tab-removal"');
    expect(openTabs).toContain('const hasValidTabId = isValidTabId(tab.id);');
    expect(openTabs).toContain('data-open-window-id={hasValidTabId ? selectedWindow.id : undefined}');
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
    expect(row).toContain('aria-label="Delete"');
  });

  it('keeps saved-tab removal valid when its group key stays stable or disappears', () => {
    const savedAllowance = hook.match(/if \(allowance\.kind === 'saved-tab-removal'[\s\S]*?return Boolean[\s\S]*?\n      \}/)?.[0] || '';
    expect(hook).toContain('return hasExpectedGroupRemovalLifecycle(previousItemKey, currentItemKey, groupId);');
    expect(savedAllowance).toContain('.session-board, .manager-board');
    expect(hook).toContain('if (previousGroupSegment === currentGroupSegment)');
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
