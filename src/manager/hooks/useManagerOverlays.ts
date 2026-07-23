import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { IconBrowser } from '@tabler/icons-react';

export const OPEN_DELAY_MS = 180;
export const CLOSE_DELAY_MS = 120;
export const MANAGER_HOVER_SUPPRESSED_ATTRIBUTE = 'data-tabboard-hover-suppressed';
const PREVIEW_PLACEMENT = 'right-start';
const PREVIEW_DISTANCE = 10;

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export function isContextMenuKey(event: Pick<KeyboardEvent, 'key' | 'shiftKey'>): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

export function getViewportMenuPosition(
  anchor: ViewportPoint,
  menu: MenuSize,
  viewport: ViewportSize,
  padding = 8,
): { left: number; top: number } {
  const maxLeft = Math.max(padding, viewport.width - menu.width - padding);
  const maxTop = Math.max(padding, viewport.height - menu.height - padding);
  return {
    left: Math.min(Math.max(padding, anchor.x), maxLeft),
    top: Math.min(Math.max(padding, anchor.y), maxTop),
  };
}

export interface ManagerInfoPopoverModel {
  title: string;
  url: string;
  favIconUrl?: string;
  note?: string;
  savedAt?: string;
  actions?: ReactNode;
}

function getDomain(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function formatSavedTime(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `Saved ${date.toLocaleString()}`;
}

export function renderManagerInfoPopoverContent(model: ManagerInfoPopoverModel): ReactNode {
  const savedTime = formatSavedTime(model.savedAt);
  return createElement(
    'section',
    { className: 'manager-info-card', 'aria-label': `Details for ${model.title}` },
    createElement(
      'div',
      { className: 'manager-info-card-header' },
      createElement(
        'span',
        { className: 'manager-open-tab-favicon manager-info-card-favicon', 'aria-hidden': true },
        createElement(IconBrowser, { className: 'manager-open-tab-favicon__fallback', size: 14 }),
        model.favIconUrl
          ? createElement('img', {
            src: model.favIconUrl,
            alt: '',
            onLoad: (event: React.SyntheticEvent<HTMLImageElement>) => {
              event.currentTarget.dataset.loaded = 'true';
            },
            onError: (event: React.SyntheticEvent<HTMLImageElement>) => {
              event.currentTarget.style.display = 'none';
            },
          })
          : null,
      ),
      createElement(
        'div',
        { className: 'manager-info-card-heading' },
        createElement('strong', null, model.title),
        getDomain(model.url) ? createElement('span', { className: 'muted' }, getDomain(model.url)) : null,
      ),
    ),
    model.url ? createElement('p', { className: 'manager-info-card-url' }, model.url) : null,
    model.note ? createElement('p', { className: 'manager-info-card-note' }, model.note) : null,
    savedTime ? createElement('time', { className: 'muted', dateTime: model.savedAt }, savedTime) : null,
    model.actions ? createElement('div', { className: 'manager-info-card-actions' }, model.actions) : null,
  );
}

export type OverlayKind = 'session' | 'saved-tab' | 'open-tab' | 'category';

export interface MenuState {
  id: string;
  kind: OverlayKind;
  itemKey: string;
  anchor: ViewportPoint;
  content: ReactNode;
  trigger: HTMLElement | null;
  openedByKeyboard: boolean;
  position: { left: number; top: number } | null;
}

export interface PreviewState {
  id: string;
  kind: 'open' | 'saved';
  content: ReactNode;
  trigger: HTMLElement;
  restoreFocusOnClose: boolean;
  position: { left: number; top: number } | null;
}

export interface OpenMenuOptions {
  id: string;
  kind: OverlayKind;
  anchor: ViewportPoint;
  content: ReactNode;
  trigger?: HTMLElement | null;
  openedByKeyboard?: boolean;
}

export interface OpenPreviewOptions {
  id: string;
  kind: 'open' | 'saved';
  content: ReactNode;
  trigger: HTMLElement;
  restoreFocusOnClose?: boolean;
}

export function shouldRestorePreviewFocusOnClose(event: Pick<MouseEvent, 'detail'>): boolean {
  return event.detail === 0;
}

export function getOverlayFocusRestoreTarget(
  menu: Pick<MenuState, 'trigger' | 'openedByKeyboard'> | null,
  preview: Pick<PreviewState, 'trigger' | 'restoreFocusOnClose'> | null,
  shouldRestore: boolean,
): HTMLElement | null {
  if (!shouldRestore) return null;
  if (menu?.openedByKeyboard) return menu.trigger;
  return preview?.restoreFocusOnClose ? preview.trigger : null;
}

export function scheduleOverlayFocusRestore(
  target: HTMLElement | null,
  capturedFocusEpoch: number,
  getCurrentFocusEpoch: () => number,
  requestFrame: (callback: () => void) => number,
  restoreFocus: (target: HTMLElement | null) => void,
): number | null {
  if (!target) return null;
  return requestFrame(() => {
    restoreFocus(capturedFocusEpoch === getCurrentFocusEpoch() ? target : null);
  });
}

export function advanceOverlayFocusEpoch(
  currentEpoch: number,
  cancelPendingFocusRestore: () => void,
): number {
  cancelPendingFocusRestore();
  return currentEpoch + 1;
}

interface InfoTriggerEntry {
  kind: 'open' | 'saved';
  model: ManagerInfoPopoverModel;
  element: HTMLElement;
}

export type ManagerFocusRestoreLifecycleAllowance =
  | { kind: 'category-delete' }
  | { kind: 'open-tab-removal'; tabId: string; windowId: string | null }
  | { kind: 'session-removal'; groupId: string }
  | { kind: 'saved-tab-removal'; groupId: string; tabId: string };

export interface ManagerFocusRestoreIntent {
  trigger: HTMLElement | null;
  fallbackSelectors: string[];
  lifecycleVersion: number;
  focusEpoch: number;
  workspaceKey?: string;
  categoryKey?: string;
  itemKey?: string;
  lifecycleAllowance?: ManagerFocusRestoreLifecycleAllowance;
}

export interface ManagerOverlaysController {
  menu: MenuState | null;
  preview: PreviewState | null;
  openMenu: (options: OpenMenuOptions) => void;
  closeMenu: (options?: { restoreFocus?: boolean }) => void;
  openPreview: (options: OpenPreviewOptions) => void;
  schedulePreview: (options: OpenPreviewOptions, delay?: number) => void;
  scheduleClosePreview: () => void;
  cancelClosePreview: () => void;
  closePreview: (options?: { restoreFocus?: boolean }) => void;
  closeOverlays: (options?: { restoreFocus?: boolean }) => void;
  invalidateOverlayLifecycle: () => void;
  captureFocusRestoreIntent: (triggerOverride?: HTMLElement | null) => ManagerFocusRestoreIntent;
  restoreFocusAfterMutation: (intent: ManagerFocusRestoreIntent) => void;
  isMenuOpen: (id: string) => boolean;
  isPreviewOpen: (id: string) => boolean;
  registerInfoTrigger: (id: string, entry: Omit<InfoTriggerEntry, 'element'>, element: HTMLElement | null) => void;
  registerMenuElement: (element: HTMLElement | null) => void;
  registerPreviewElement: (element: HTMLElement | null) => void;
  setMenuPosition: (position: { left: number; top: number }) => void;
  setPreviewPosition: (position: { left: number; top: number }) => void;
}

export type ManagerOverlayCommands = Omit<
  ManagerOverlaysController,
  'menu' | 'preview' | 'isMenuOpen' | 'isPreviewOpen'
>;

interface ManagerOverlayStateStore {
  menu: MenuState | null;
  preview: PreviewState | null;
  listeners: Set<() => void>;
}

interface ManagerOverlaysProviderProps {
  children: ReactNode;
  workspaceKey?: string;
  categoryKey?: string;
  itemKey?: string;
}

const ManagerOverlaysContext = createContext<ManagerOverlaysController | null>(null);
const ManagerOverlayCommandsContext = createContext<ManagerOverlayCommands | null>(null);
const ManagerOverlayStateStoreContext = createContext<ManagerOverlayStateStore | null>(null);

function getTarget(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

function isInside(element: HTMLElement | null, target: EventTarget | null): boolean {
  return Boolean(element && target instanceof Node && element.contains(target));
}

function isManagerHoverSuppressed(): boolean {
  return document.documentElement.hasAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE);
}

function getFocusableTarget(element: HTMLElement | null): HTMLElement | null {
  if (!element?.isConnected) return null;
  if (element.matches('button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])')) return element;
  if (element.matches('.session-board, .manager-board, [data-open-tabs-panel]')) return element;
  if (element.matches('.manager-open-tab-row, .tab-item-row__content')) {
    const infoTrigger = element.matches('[data-info-key]')
      ? element
      : element.querySelector<HTMLElement>('[data-info-key]');
    if (infoTrigger) return infoTrigger;
  }
  return element.querySelector<HTMLElement>('button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])');
}

function getFocusRestoreSelectors(trigger: HTMLElement | null): string[] {
  if (!trigger) return [];
  const selectors: string[] = [];
  const infoTrigger = trigger.matches('[data-info-key]')
    ? trigger
    : trigger.querySelector<HTMLElement>('[data-info-key]');
  if (infoTrigger?.dataset.infoKey) {
    selectors.push(`[data-info-key="${CSS.escape(infoTrigger.dataset.infoKey)}"]`);
  }
  const openTabRow = trigger.closest<HTMLElement>('.manager-open-tab-row');
  if (openTabRow) {
    const openTabId = openTabRow.dataset.openTabId;
    selectors.push(openTabId ? `[data-open-tab-id="${CSS.escape(openTabId)}"]` : '.manager-open-tab-row');
    selectors.push('.manager-open-tab-row');
    selectors.push('[data-open-tabs-panel]');
  }
  const savedTabRow = trigger.closest<HTMLElement>('.tab-item-row');
  const sessionCard = trigger.closest<HTMLElement>('.session-card');
  if (savedTabRow) {
    const groupId = savedTabRow.dataset.groupId;
    const tabId = savedTabRow.dataset.tabId;
    if (groupId && tabId) {
      selectors.push(`.session-board .tab-item-row[data-group-id="${CSS.escape(groupId)}"][data-tab-id="${CSS.escape(tabId)}"]`);
    }
    if (sessionCard?.dataset.groupId) {
      selectors.push(`.session-board .session-card[data-group-id="${CSS.escape(sessionCard.dataset.groupId)}"] .tab-item-row`);
    }
  }
  if (sessionCard?.dataset.groupId) {
    selectors.push(`.session-board .session-card[data-group-id="${CSS.escape(sessionCard.dataset.groupId)}"]`);
  }
  if (sessionCard) {
    selectors.push('.session-board .session-card');
    selectors.push('.session-board');
    selectors.push('.manager-board');
  }
  return [...new Set(selectors)];
}

function getLifecycleSegments(value: string | undefined): string[] {
  return value?.split('|').filter(Boolean) ?? [];
}

function hasExpectedGroupRemovalLifecycle(
  previousItemKey: string | undefined,
  currentItemKey: string | undefined,
  groupId: string,
): boolean {
  const previousSegments = getLifecycleSegments(previousItemKey);
  const currentSegments = getLifecycleSegments(currentItemKey);
  const removedSegment = previousSegments.find((segment) => segment.startsWith(`${groupId}:`));
  if (!removedSegment) return false;
  const expectedSegments = previousSegments.filter((segment) => segment !== removedSegment);
  return expectedSegments.length === currentSegments.length
    && expectedSegments.every((segment, index) => currentSegments[index] === segment);
}

function hasExpectedGroupUpdateLifecycle(
  previousItemKey: string | undefined,
  currentItemKey: string | undefined,
  groupId: string,
): boolean {
  const previousSegments = getLifecycleSegments(previousItemKey);
  const currentSegments = getLifecycleSegments(currentItemKey);
  const previousGroupSegment = previousSegments.find((segment) => segment.startsWith(`${groupId}:`));
  const currentGroupSegment = currentSegments.find((segment) => segment.startsWith(`${groupId}:`));
  if (!previousGroupSegment) return false;
  if (!currentGroupSegment) return hasExpectedGroupRemovalLifecycle(previousItemKey, currentItemKey, groupId);
  if (previousGroupSegment === currentGroupSegment) {
    return previousSegments.length === currentSegments.length
      && previousSegments.every((segment, index) => currentSegments[index] === segment);
  }
  const previousOtherSegments = previousSegments.filter((segment) => segment !== previousGroupSegment);
  const currentOtherSegments = currentSegments.filter((segment) => segment !== currentGroupSegment);
  return previousOtherSegments.length === currentOtherSegments.length
    && previousOtherSegments.every((segment, index) => currentOtherSegments[index] === segment);
}

export function useManagerOverlays({
  workspaceKey,
  categoryKey,
  itemKey,
}: Pick<ManagerOverlaysProviderProps, 'workspaceKey' | 'categoryKey' | 'itemKey'> = {}): ManagerOverlaysController {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const menuRef = useRef<MenuState | null>(null);
  const previewRef = useRef<PreviewState | null>(null);
  menuRef.current = menu;
  previewRef.current = preview;
  const menuElementRef = useRef<HTMLElement | null>(null);
  const previewElementRef = useRef<HTMLElement | null>(null);
  const restoredFocusRef = useRef<HTMLElement | null>(null);
  const infoTriggersRef = useRef(new Map<string, InfoTriggerEntry>());
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusRestoreFrameRef = useRef<number | null>(null);
  const isProviderMountedRef = useRef(false);
  const lifecycleVersionRef = useRef(0);
  const focusEpochRef = useRef(0);
  const idRef = useRef(0);
  const previousLifecycleRef = useRef({ workspaceKey, categoryKey, itemKey });
  const lifecycleContextRef = useRef({ workspaceKey, categoryKey, itemKey });
  lifecycleContextRef.current = { workspaceKey, categoryKey, itemKey };

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const cancelPendingFocusRestore = useCallback(() => {
    if (pendingFocusRestoreFrameRef.current !== null) {
      cancelAnimationFrame(pendingFocusRestoreFrameRef.current);
      pendingFocusRestoreFrameRef.current = null;
    }
  }, []);

  const advanceFocusEpoch = useCallback(() => {
    focusEpochRef.current = advanceOverlayFocusEpoch(focusEpochRef.current, cancelPendingFocusRestore);
  }, [cancelPendingFocusRestore]);

  const invalidateOverlayLifecycle = useCallback(() => {
    cancelPendingFocusRestore();
    lifecycleVersionRef.current += 1;
  }, [cancelPendingFocusRestore]);

  const restoreFocus = useCallback((target: HTMLElement | null, shouldRestore: boolean) => {
    if (shouldRestore && target?.isConnected) {
      restoredFocusRef.current = target;
      target.focus();
    }
  }, []);

  const deferFocusRestore = useCallback((target: HTMLElement | null, shouldRestore: boolean) => {
    if (!shouldRestore) return;
    const focusEpoch = focusEpochRef.current;
    pendingFocusRestoreFrameRef.current = scheduleOverlayFocusRestore(
      target,
      focusEpoch,
      () => focusEpochRef.current,
      (callback) => requestAnimationFrame(() => callback()),
      (restoredTarget) => {
        pendingFocusRestoreFrameRef.current = null;
        restoreFocus(restoredTarget, true);
      },
    );
  }, [restoreFocus]);

  const closeMenu = useCallback(({ restoreFocus: shouldRestore = false }: { restoreFocus?: boolean } = {}) => {
    const currentMenu = menuRef.current;
    setMenu(null);
    if (currentMenu && shouldRestore && currentMenu.openedByKeyboard) {
      deferFocusRestore(currentMenu.trigger, true);
    }
  }, [deferFocusRestore]);

  const closePreview = useCallback(({ restoreFocus: shouldRestore = false }: { restoreFocus?: boolean } = {}) => {
    clearOpenTimer();
    clearCloseTimer();
    const currentPreview = previewRef.current;
    setPreview(null);
    if (!currentPreview) return;
    currentPreview.trigger.setAttribute('aria-expanded', 'false');
    const focusTarget = getOverlayFocusRestoreTarget(null, currentPreview, shouldRestore);
    deferFocusRestore(focusTarget, focusTarget !== null);
  }, [clearCloseTimer, clearOpenTimer, deferFocusRestore]);

  const closeOverlays = useCallback(({ restoreFocus: shouldRestore = false }: { restoreFocus?: boolean } = {}) => {
    cancelPendingFocusRestore();
    clearOpenTimer();
    clearCloseTimer();
    const currentMenu = menuRef.current;
    const currentPreview = previewRef.current;
    setMenu(null);
    setPreview(null);
    if (currentPreview) currentPreview.trigger.setAttribute('aria-expanded', 'false');
    const focusTarget = getOverlayFocusRestoreTarget(currentMenu, currentPreview, shouldRestore);
    deferFocusRestore(focusTarget, focusTarget !== null);
  }, [cancelPendingFocusRestore, clearCloseTimer, clearOpenTimer, deferFocusRestore]);

  const captureFocusRestoreIntent = useCallback((triggerOverride?: HTMLElement | null): ManagerFocusRestoreIntent => {
    const trigger = triggerOverride ?? menuRef.current?.trigger ?? previewRef.current?.trigger ?? null;
    return {
      trigger,
      fallbackSelectors: getFocusRestoreSelectors(trigger),
      lifecycleVersion: lifecycleVersionRef.current,
      focusEpoch: focusEpochRef.current,
      workspaceKey,
      categoryKey,
      itemKey,
    };
  }, [categoryKey, itemKey, workspaceKey]);

  const restoreFocusAfterMutation = useCallback((intent: ManagerFocusRestoreIntent) => {
    cancelPendingFocusRestore();
    const isCurrentFocusIntent = (): boolean => {
      if (!isProviderMountedRef.current) return false;
      if (intent.focusEpoch !== focusEpochRef.current) return false;
      const allowance = intent.lifecycleAllowance;
      const currentContext = lifecycleContextRef.current;
      if (!allowance) return intent.lifecycleVersion === lifecycleVersionRef.current;
      if (intent.workspaceKey !== currentContext.workspaceKey) return false;
      if (allowance.kind === 'category-delete') return true;
      if (intent.categoryKey !== currentContext.categoryKey) return false;
      if (allowance.kind === 'session-removal') {
        if (lifecycleVersionRef.current <= intent.lifecycleVersion) {
          return lifecycleVersionRef.current === intent.lifecycleVersion && Boolean(getFocusableTarget(intent.trigger));
        }
        if (!hasExpectedGroupRemovalLifecycle(intent.itemKey, currentContext.itemKey, allowance.groupId)) return false;
        return !document.querySelector(`.session-board .session-card[data-group-id="${CSS.escape(allowance.groupId)}"]`);
      }
      if (allowance.kind === 'saved-tab-removal') {
        if (lifecycleVersionRef.current <= intent.lifecycleVersion) {
          return lifecycleVersionRef.current === intent.lifecycleVersion && Boolean(getFocusableTarget(intent.trigger));
        }
        if (!hasExpectedGroupUpdateLifecycle(intent.itemKey, currentContext.itemKey, allowance.groupId)) return false;
        if (document.querySelector(`.session-board .tab-item-row[data-group-id="${CSS.escape(allowance.groupId)}"][data-tab-id="${CSS.escape(allowance.tabId)}"]`)) return false;
        return Boolean(
          document.querySelector(`.session-board .session-card[data-group-id="${CSS.escape(allowance.groupId)}"]`)
            || document.querySelector('.session-board, .manager-board'),
        );
      }
      if (intent.itemKey !== currentContext.itemKey) return false;
      if (lifecycleVersionRef.current !== intent.lifecycleVersion + 1) return false;
      if (document.querySelector(`[data-open-tab-id="${CSS.escape(allowance.tabId)}"]`)) return false;
      return allowance.windowId === null
        || Boolean(document.querySelector(`[data-open-window-id="${CSS.escape(allowance.windowId)}"]`));
    };
    if (!isCurrentFocusIntent()) return;
    const lifecycleVersion = intent.lifecycleAllowance
      ? lifecycleVersionRef.current
      : intent.lifecycleVersion;
    pendingFocusRestoreFrameRef.current = requestAnimationFrame(() => {
      pendingFocusRestoreFrameRef.current = null;
      if (!isCurrentFocusIntent() || lifecycleVersion !== lifecycleVersionRef.current) return;
      const fallbackTarget = intent.fallbackSelectors
        .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
        .map(getFocusableTarget)
        .find((target): target is HTMLElement => Boolean(target));
      restoreFocus(getFocusableTarget(intent.trigger) ?? fallbackTarget ?? null, true);
    });
  }, [cancelPendingFocusRestore, restoreFocus]);

  const openMenu = useCallback((options: OpenMenuOptions) => {
    cancelPendingFocusRestore();
    clearOpenTimer();
    clearCloseTimer();
    setPreview((current) => {
      if (current) current.trigger.setAttribute('aria-expanded', 'false');
      return null;
    });
    idRef.current += 1;
    setMenu({
      ...options,
      trigger: options.trigger ?? null,
      openedByKeyboard: options.openedByKeyboard === true,
      position: null,
      itemKey: options.id,
      id: `${options.id}-${idRef.current}`,
    });
  }, [cancelPendingFocusRestore, clearCloseTimer, clearOpenTimer]);

  const openPreview = useCallback((options: OpenPreviewOptions) => {
    cancelPendingFocusRestore();
    clearOpenTimer();
    clearCloseTimer();
    setMenu(null);
    setPreview((current) => {
      if (current && current.trigger !== options.trigger) current.trigger.setAttribute('aria-expanded', 'false');
      options.trigger.setAttribute('aria-haspopup', 'dialog');
      options.trigger.setAttribute('aria-expanded', 'true');
      return {
        ...options,
        restoreFocusOnClose: options.restoreFocusOnClose === true,
        position: null,
      };
    });
  }, [cancelPendingFocusRestore, clearCloseTimer, clearOpenTimer]);

  const schedulePreview = useCallback((options: OpenPreviewOptions, delay = OPEN_DELAY_MS) => {
    clearOpenTimer();
    clearCloseTimer();
    openTimerRef.current = setTimeout(() => openPreview(options), delay);
  }, [clearCloseTimer, clearOpenTimer, openPreview]);

  const scheduleClosePreview = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => closePreview(), CLOSE_DELAY_MS);
  }, [clearCloseTimer, closePreview]);

  const cancelClosePreview = useCallback(() => {
    clearCloseTimer();
  }, [clearCloseTimer]);

  const registerInfoTrigger = useCallback((id: string, entry: Omit<InfoTriggerEntry, 'element'>, element: HTMLElement | null) => {
    if (element) {
      infoTriggersRef.current.set(id, { ...entry, element });
      return;
    }
    infoTriggersRef.current.delete(id);
  }, []);

  const registerMenuElement = useCallback((element: HTMLElement | null) => {
    menuElementRef.current = element;
  }, []);

  const registerPreviewElement = useCallback((element: HTMLElement | null) => {
    previewElementRef.current = element;
  }, []);

  const setMenuPosition = useCallback((position: { left: number; top: number }) => {
    setMenu((current) => current && !current.position ? { ...current, position } : current);
  }, []);

  const setPreviewPosition = useCallback((position: { left: number; top: number }) => {
    setPreview((current) => current && !current.position ? { ...current, position } : current);
  }, []);

  useEffect(() => {
    const previous = previousLifecycleRef.current;
    if (previous.workspaceKey !== workspaceKey || previous.categoryKey !== categoryKey || previous.itemKey !== itemKey) {
      invalidateOverlayLifecycle();
      closeOverlays();
    }
    previousLifecycleRef.current = { workspaceKey, categoryKey, itemKey };
  }, [categoryKey, closeOverlays, invalidateOverlayLifecycle, itemKey, workspaceKey]);

  useEffect(() => {
    const getPreviewOptions = (trigger: HTMLElement): OpenPreviewOptions | null => {
      const id = trigger.dataset.infoKey || '';
      const entry = infoTriggersRef.current.get(id);
      if (!id || !entry || entry.element !== trigger || !trigger.isConnected) return null;
      return {
        id,
        kind: entry.kind,
        content: renderManagerInfoPopoverContent(entry.model),
        trigger,
      };
    };
    const handlePointerDown = (event: PointerEvent) => {
      document.documentElement.removeAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE);
      advanceFocusEpoch();
      if (isInside(menuElementRef.current, event.target) || isInside(previewElementRef.current, event.target)) return;
      if (menuRef.current?.trigger && isInside(menuRef.current.trigger, event.target)) return;
      if (previewRef.current?.trigger && isInside(previewRef.current.trigger, event.target)) return;
      closeOverlays();
    };
    const handleOutsideClick = (event: MouseEvent) => {
      if (isInside(menuElementRef.current, event.target) || isInside(previewElementRef.current, event.target)) return;
      if (menuRef.current?.trigger && isInside(menuRef.current.trigger, event.target)) return;
      if (previewRef.current?.trigger && isInside(previewRef.current.trigger, event.target)) return;
      closeOverlays();
    };
    const handleMenuKeyDown = (event: globalThis.KeyboardEvent) => {
      const isArrowDown = event.key === 'ArrowDown';
      const isArrowUp = event.key === 'ArrowUp';
      if (!menuRef.current || (!isArrowDown && !isArrowUp)) return;
      const target = getTarget(event.target);
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const menuElement = menuElementRef.current;
      if (!menuElement) return;
      const menuItems = Array.from(menuElement.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'));
      if (!menuItems.length) return;
      const currentItem = target?.closest<HTMLElement>('[role="menuitem"]');
      const currentIndex = currentItem ? menuItems.indexOf(currentItem) : -1;
      const direction = isArrowDown ? 1 : -1;
      const nextIndex = (currentIndex + direction + menuItems.length) % menuItems.length;
      event.preventDefault();
      menuItems[nextIndex]?.focus();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || (!menuRef.current && !previewRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      closeOverlays({ restoreFocus: true });
    };
    const handleViewportChange = () => closeOverlays();
    const handleDragStart = () => closeOverlays();
    const handleWindowBlur = () => {
      document.documentElement.setAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE, '');
      advanceFocusEpoch();
      closeOverlays();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleWindowBlur();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!isManagerHoverSuppressed()) return;
      if (event.movementX === 0 && event.movementY === 0) return;
      document.documentElement.removeAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE);
      const trigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]');
      const options = trigger ? getPreviewOptions(trigger) : null;
      if (options) schedulePreview(options);
    };
    const handleInteractionKeyDown = () => {
      document.documentElement.removeAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE);
    };
    const handleMouseOver = (event: MouseEvent) => {
      if (isManagerHoverSuppressed()) return;
      const trigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]');
      if (!trigger || trigger.contains(event.relatedTarget as Node | null)) return;
      const options = getPreviewOptions(trigger);
      if (options) {
        schedulePreview({
          ...options,
          restoreFocusOnClose: previewRef.current?.trigger === trigger
            && previewRef.current.restoreFocusOnClose,
        });
      }
    };
    const handleMouseOut = (event: MouseEvent) => {
      const trigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]');
      if (!trigger || trigger.contains(event.relatedTarget as Node | null) || isInside(previewElementRef.current, event.relatedTarget)) return;
      scheduleClosePreview();
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isManagerHoverSuppressed()) return;
      const trigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]');
      const wasRestoredFocus = restoredFocusRef.current === trigger;
      restoredFocusRef.current = null;
      if (wasRestoredFocus) return;
      const options = trigger ? getPreviewOptions(trigger) : null;
      if (options) openPreview({ ...options, restoreFocusOnClose: true });
    };
    const handleFocusOut = (event: FocusEvent) => {
      const relatedTarget = event.relatedTarget;
      const trigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]');
      const leavingTrigger = Boolean(
        trigger
        && !trigger.contains(relatedTarget as Node | null)
        && !isInside(previewElementRef.current, relatedTarget),
      );
      const leavingPreview = isInside(previewElementRef.current, event.target)
        && !isInside(previewElementRef.current, relatedTarget);
      if (leavingTrigger || leavingPreview) scheduleClosePreview();
    };
    const handleClick = (event: MouseEvent) => {
      const trigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]');
      const options = trigger ? getPreviewOptions(trigger) : null;
      if (options) {
        openPreview({ ...options, restoreFocusOnClose: shouldRestorePreviewFocusOnClose(event) });
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleMenuKeyDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('click', handleClick);
    document.addEventListener('click', handleOutsideClick, true);
    document.addEventListener('scroll', handleViewportChange, true);
    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('keydown', handleInteractionKeyDown, true);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleMenuKeyDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('click', handleOutsideClick, true);
      document.removeEventListener('scroll', handleViewportChange, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('keydown', handleInteractionKeyDown, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('resize', handleViewportChange);
      clearOpenTimer();
      clearCloseTimer();
    };
  }, [advanceFocusEpoch, clearCloseTimer, clearOpenTimer, closeOverlays, openPreview, scheduleClosePreview, schedulePreview]);

  useEffect(() => {
    isProviderMountedRef.current = true;
    return () => {
      isProviderMountedRef.current = false;
      document.documentElement.removeAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE);
      invalidateOverlayLifecycle();
      closeOverlays();
    };
  }, [closeOverlays, invalidateOverlayLifecycle]);

  const isMenuOpen = useCallback((id: string) => menu?.itemKey === id, [menu]);
  const isPreviewOpen = useCallback((id: string) => preview?.id === id, [preview]);

  return useMemo(() => ({
    menu,
    preview,
    openMenu,
    closeMenu,
    openPreview,
    schedulePreview,
    scheduleClosePreview,
    cancelClosePreview,
    closePreview,
    closeOverlays,
    invalidateOverlayLifecycle,
    captureFocusRestoreIntent,
    restoreFocusAfterMutation,
    isMenuOpen,
    isPreviewOpen,
    registerInfoTrigger,
    registerMenuElement,
    registerPreviewElement,
    setMenuPosition,
    setPreviewPosition,
  }), [cancelClosePreview, captureFocusRestoreIntent, closeMenu, closeOverlays, closePreview, invalidateOverlayLifecycle, isMenuOpen, isPreviewOpen, menu, openMenu, openPreview, preview, registerInfoTrigger, registerMenuElement, registerPreviewElement, restoreFocusAfterMutation, scheduleClosePreview, schedulePreview, setMenuPosition, setPreviewPosition]);
}

export function ManagerOverlaysProvider(props: ManagerOverlaysProviderProps): ReactNode {
  const controller = useManagerOverlays(props);
  const stateStoreRef = useRef<ManagerOverlayStateStore>({
    menu: controller.menu,
    preview: controller.preview,
    listeners: new Set(),
  });
  const stateStore = stateStoreRef.current;
  useLayoutEffect(() => {
    stateStore.menu = controller.menu;
    stateStore.preview = controller.preview;
    stateStore.listeners.forEach((listener) => listener());
  }, [controller.menu, controller.preview, stateStore]);
  const commands = useMemo<ManagerOverlayCommands>(() => ({
    openMenu: controller.openMenu,
    closeMenu: controller.closeMenu,
    openPreview: controller.openPreview,
    schedulePreview: controller.schedulePreview,
    scheduleClosePreview: controller.scheduleClosePreview,
    cancelClosePreview: controller.cancelClosePreview,
    closePreview: controller.closePreview,
    closeOverlays: controller.closeOverlays,
    invalidateOverlayLifecycle: controller.invalidateOverlayLifecycle,
    captureFocusRestoreIntent: controller.captureFocusRestoreIntent,
    restoreFocusAfterMutation: controller.restoreFocusAfterMutation,
    registerInfoTrigger: controller.registerInfoTrigger,
    registerMenuElement: controller.registerMenuElement,
    registerPreviewElement: controller.registerPreviewElement,
    setMenuPosition: controller.setMenuPosition,
    setPreviewPosition: controller.setPreviewPosition,
  }), [
    controller.cancelClosePreview,
    controller.captureFocusRestoreIntent,
    controller.closeMenu,
    controller.closeOverlays,
    controller.closePreview,
    controller.invalidateOverlayLifecycle,
    controller.openMenu,
    controller.openPreview,
    controller.registerInfoTrigger,
    controller.registerMenuElement,
    controller.registerPreviewElement,
    controller.restoreFocusAfterMutation,
    controller.scheduleClosePreview,
    controller.schedulePreview,
    controller.setMenuPosition,
    controller.setPreviewPosition,
  ]);
  return createElement(
    ManagerOverlayCommandsContext.Provider,
    { value: commands },
    createElement(
      ManagerOverlayStateStoreContext.Provider,
      { value: stateStore },
      createElement(ManagerOverlaysContext.Provider, { value: controller }, props.children),
    ),
  );
}

export function useManagerOverlayController(): ManagerOverlaysController {
  const controller = useContext(ManagerOverlaysContext);
  if (!controller) throw new Error('ManagerOverlaysProvider is required.');
  return controller;
}

export function useManagerOverlayCommands(): ManagerOverlayCommands {
  const commands = useContext(ManagerOverlayCommandsContext);
  if (!commands) throw new Error('ManagerOverlaysProvider is required.');
  return commands;
}

function useManagerOverlayOpenState(
  getSnapshot: (store: ManagerOverlayStateStore) => boolean,
): boolean {
  const store = useContext(ManagerOverlayStateStoreContext);
  if (!store) throw new Error('ManagerOverlaysProvider is required.');
  const subscribe = useCallback((listener: () => void) => {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  }, [store]);
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(store),
    () => false,
  );
}

export function useManagerMenuOpen(id: string): boolean {
  const getSnapshot = useCallback(
    (store: ManagerOverlayStateStore) => store.menu?.itemKey === id,
    [id],
  );
  return useManagerOverlayOpenState(getSnapshot);
}

export function useManagerPreviewOpen(id: string): boolean {
  const getSnapshot = useCallback(
    (store: ManagerOverlayStateStore) => store.preview?.id === id,
    [id],
  );
  return useManagerOverlayOpenState(getSnapshot);
}

export function useManagerInfoTrigger(
  id: string,
  entry: Omit<InfoTriggerEntry, 'element'>,
): (element: HTMLElement | null) => void {
  const { registerInfoTrigger } = useManagerOverlayCommands();
  return useCallback((element: HTMLElement | null) => registerInfoTrigger(id, entry, element), [entry, id, registerInfoTrigger]);
}

export function useManagerOverlayLifecycle(itemKey: string): void {
  const { closeOverlays, invalidateOverlayLifecycle } = useManagerOverlayCommands();
  const previousKey = useRef(itemKey);
  useEffect(() => {
    if (previousKey.current !== itemKey) {
      invalidateOverlayLifecycle();
      closeOverlays();
    }
    previousKey.current = itemKey;
  }, [closeOverlays, invalidateOverlayLifecycle, itemKey]);
}

function getMenuItemLifecycleAllowance(
  kind: ManagerFocusRestoreLifecycleAllowance['kind'] | undefined,
  trigger: HTMLElement | null,
): ManagerFocusRestoreLifecycleAllowance | undefined {
  if (kind === 'category-delete') return { kind };
  if (kind === 'session-removal') {
    const groupId = trigger?.closest<HTMLElement>('.session-card')?.dataset.groupId;
    return groupId ? { kind, groupId } : undefined;
  }
  if (kind === 'saved-tab-removal') {
    const row = trigger?.closest<HTMLElement>('.tab-item-row');
    const groupId = row?.dataset.groupId;
    const tabId = row?.dataset.tabId;
    return groupId && tabId ? { kind, groupId, tabId } : undefined;
  }
  if (kind !== 'open-tab-removal') return undefined;
  const row = trigger?.closest<HTMLElement>('.manager-open-tab-row');
  const tabId = row?.dataset.openTabId;
  if (!tabId) return undefined;
  return {
    kind,
    tabId,
    windowId: row.dataset.openWindowId ?? null,
  };
}

interface ManagerMenuItemProps {
  children: ReactNode;
  onClick: (focusIntent?: ManagerFocusRestoreIntent) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  preventFocusRestore?: boolean;
  lifecycleAllowance?: ManagerFocusRestoreLifecycleAllowance['kind'];
}

export function ManagerMenuItem({
  children,
  onClick,
  disabled = false,
  className,
  preventFocusRestore = false,
  lifecycleAllowance,
}: ManagerMenuItemProps): ReactNode {
  const { closeOverlays, captureFocusRestoreIntent, restoreFocusAfterMutation } = useManagerOverlayCommands();
  return createElement(
    'button',
    {
      type: 'button',
      role: 'menuitem',
      className: `manager-overlay-menu__item${className ? ` ${className}` : ''}`,
      disabled,
      onClick: async (event: ReactMouseEvent<HTMLButtonElement>) => {
        if (disabled) return;
        const focusIntent = event.detail === 0
          ? (() => {
              const capturedIntent = captureFocusRestoreIntent();
              const allowance = getMenuItemLifecycleAllowance(lifecycleAllowance, capturedIntent.trigger);
              return {
                ...capturedIntent,
                ...(allowance ? { lifecycleAllowance: allowance } : {}),
              };
            })()
          : undefined;
        closeOverlays();
        try {
          await onClick(focusIntent);
        } finally {
          if (focusIntent && !preventFocusRestore) {
            const allowanceKind = focusIntent.lifecycleAllowance?.kind;
            if (allowanceKind === 'open-tab-removal'
              || allowanceKind === 'session-removal'
              || allowanceKind === 'saved-tab-removal') {
              setTimeout(() => restoreFocusAfterMutation(focusIntent), 0);
            } else {
              restoreFocusAfterMutation(focusIntent);
            }
          }
        }
      },
    },
    children,
  );
}

interface ManagerOverlayPortalProps {
  menuMinWidth?: number;
  onOpenTabPreviewChange?: (open: boolean) => void;
}

export function ManagerOverlayPortal({
  menuMinWidth = 190,
  onOpenTabPreviewChange,
}: ManagerOverlayPortalProps = {}): ReactNode {
  const controller = useManagerOverlayController();
  const {
    menu,
    preview,
    closeMenu,
    closePreview,
    setMenuPosition,
    setPreviewPosition,
  } = controller;

  useEffect(() => {
    onOpenTabPreviewChange?.(preview?.kind === 'open');
    return () => onOpenTabPreviewChange?.(false);
  }, [onOpenTabPreviewChange, preview?.kind]);

  useLayoutEffect(() => {
    if (menu?.trigger && !menu.trigger.isConnected) {
      closeMenu();
      return;
    }
    const element = (menu ? document.querySelector<HTMLElement>('.manager-overlay-menu') : null);
    if (!menu || !element || menu.position) return;
    const position = getViewportMenuPosition(
      menu.anchor,
      { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setMenuPosition(position);
  });

  useLayoutEffect(() => {
    if (!menu?.openedByKeyboard || !menu.position) return;
    document.querySelector<HTMLElement>('.manager-overlay-menu [role="menuitem"]:not(:disabled)')?.focus();
  }, [menu]);

  useLayoutEffect(() => {
    if (!preview) return;
    if (!preview.trigger.isConnected) {
      closePreview();
      return;
    }
    if (preview.position) return;
    const element = document.querySelector<HTMLElement>('.manager-info-popover');
    if (!element) return;
    const triggerRect = preview.trigger.getBoundingClientRect();
    const savedRowRect = preview.kind === 'saved'
      ? preview.trigger.closest('.tab-item-row')?.getBoundingClientRect()
      : null;
    const position = getViewportMenuPosition(
      { x: (savedRowRect?.right ?? triggerRect.right) + PREVIEW_DISTANCE, y: triggerRect.top },
      { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPreviewPosition(position);
  });

  if (typeof document === 'undefined' || (!menu && !preview)) return null;
  const menuStyle: CSSProperties = {
    position: 'fixed',
    left: menu?.position?.left ?? 0,
    top: menu?.position?.top ?? 0,
    minWidth: menuMinWidth,
    visibility: menu?.position ? 'visible' : 'hidden',
  };
  const previewStyle: CSSProperties = {
    position: 'fixed',
    left: preview?.position?.left ?? 0,
    top: preview?.position?.top ?? 0,
    visibility: preview?.position ? 'visible' : 'hidden',
  };
  return createPortal(
    createElement(
      Fragment,
      null,
      menu
        ? createElement('div', {
            ref: controller.registerMenuElement,
            className: 'manager-overlay-menu',
            role: 'menu',
            'aria-label': 'Actions',
            style: menuStyle,
            onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
            onClick: (event: React.MouseEvent) => event.stopPropagation(),
          }, menu.content)
        : null,
      preview
        ? createElement('div', {
            ref: controller.registerPreviewElement,
            className: 'manager-info-popover',
            role: 'dialog',
            'aria-label': 'Item details',
            'data-placement': PREVIEW_PLACEMENT,
            'data-distance': PREVIEW_DISTANCE,
            style: previewStyle,
            onMouseEnter: controller.cancelClosePreview,
            onMouseLeave: controller.scheduleClosePreview,
            onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
          }, preview.content)
        : null,
    ),
    document.body,
  );
}
