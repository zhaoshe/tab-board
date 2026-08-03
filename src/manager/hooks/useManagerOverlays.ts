import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
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
import type { LucideIcon } from 'lucide-react';
import type { Group } from '../../shared/model';
import { TabBoardIcon } from '../../shared/components/TabBoardIcon';
import { claimTip, releaseTip } from '../../shared/components/tipLifecycle';
import { formatDateTime } from '../../shared/utils/formatters';

export const OPEN_DELAY_MS = 180;
export const CLOSE_DELAY_MS = 120;
export const MANAGER_HOVER_SUPPRESSED_ATTRIBUTE = 'data-tabboard-hover-suppressed';
const TAB_HOVER_TOOLTIP_GAP = 6;

export const TAB_HOVER_TOOLTIP_CONTRACT = {
  titleLines: 2,
  linkLines: 4,
  pointerEvents: 'none',
} as const;

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

export function getMenuDescriptionTipPosition(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  tip: MenuSize,
  viewport: ViewportSize,
  gap = 6,
  padding = 8,
): { left: number; top: number } {
  const rightPlacement = anchor.right + gap;
  const preferredLeft = rightPlacement + tip.width <= viewport.width - padding
    ? rightPlacement
    : anchor.left - gap - tip.width;
  const maxLeft = Math.max(padding, viewport.width - tip.width - padding);
  const maxTop = Math.max(padding, viewport.height - tip.height - padding);
  const centeredTop = (anchor.top + anchor.bottom - tip.height) / 2;
  return {
    left: Math.min(Math.max(padding, preferredLeft), maxLeft),
    top: Math.min(Math.max(padding, centeredTop), maxTop),
  };
}

export interface TabHoverTooltipModel {
  title: string;
  domain: string;
  link: string;
  savedAt?: string;
}

export function getTabHoverDomain(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function formatSavedTime(value: string | undefined): string {
  if (!value) return '';
  const formatted = formatDateTime(value);
  return formatted ? `Saved ${formatted}` : '';
}

export function renderTabHoverTooltipContent(model: TabHoverTooltipModel): ReactNode {
  const savedTime = formatSavedTime(model.savedAt);
  return createElement(
    'section',
    { className: 'manager-tab-tooltip' },
    createElement('strong', { className: 'manager-tab-tooltip__title' }, model.title),
    model.domain
      ? createElement('span', { className: 'manager-tab-tooltip__domain' }, model.domain)
      : null,
    model.link ? createElement('p', { className: 'manager-tab-tooltip__link' }, model.link) : null,
    savedTime
      ? createElement(
          'time',
          { className: 'manager-tab-tooltip__timestamp', dateTime: model.savedAt },
          savedTime,
        )
      : null,
  );
}

export function getTabHoverTooltipPosition(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  tooltip: MenuSize,
  viewport: ViewportSize,
  gap = TAB_HOVER_TOOLTIP_GAP,
  padding = 8,
): { left: number; top: number; placement: 'top' | 'bottom' } {
  const preferredTop = anchor.top - gap - tooltip.height;
  const placement = preferredTop >= padding ? 'top' : 'bottom';
  const rawTop = placement === 'top' ? preferredTop : anchor.bottom + gap;
  const maxLeft = Math.max(padding, viewport.width - tooltip.width - padding);
  const maxTop = Math.max(padding, viewport.height - tooltip.height - padding);
  return {
    left: Math.min(Math.max(padding, anchor.left), maxLeft),
    top: Math.min(Math.max(padding, rawTop), maxTop),
    placement,
  };
}

export function getTabHoverTooltipAnchor(trigger: HTMLElement): HTMLElement {
  return trigger.closest<HTMLElement>(
    '.manager-open-tab-row, .tab-item-row__content',
  ) ?? trigger;
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
  restoreFocusOnClose: boolean;
  ariaLabel: string;
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
  restoreFocusOnClose?: boolean;
  ariaLabel?: string;
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
  menu: (
    Pick<MenuState, 'trigger'>
    & Partial<Pick<MenuState, 'openedByKeyboard' | 'restoreFocusOnClose'>>
  ) | null,
  preview: Pick<PreviewState, 'trigger' | 'restoreFocusOnClose'> | null,
  shouldRestore: boolean,
): HTMLElement | null {
  if (!shouldRestore) return null;
  if (menu && (menu.restoreFocusOnClose ?? menu.openedByKeyboard)) return menu.trigger;
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
  model: TabHoverTooltipModel;
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
  groupItems?: readonly Group[];
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
  groupItems?: readonly Group[];
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

export function hasExpectedGroupRemovalLifecycle(
  previousGroups: readonly Group[] | undefined,
  currentGroups: readonly Group[] | undefined,
  groupId: string,
): boolean {
  if (!previousGroups || !currentGroups) return false;
  const removedIndex = previousGroups.findIndex((group) => group.id === groupId);
  if (removedIndex < 0 || currentGroups.length !== previousGroups.length - 1) {
    return false;
  }
  return currentGroups.every((group, index) =>
    group === previousGroups[index < removedIndex ? index : index + 1]);
}

export function hasExpectedGroupUpdateLifecycle(
  previousGroups: readonly Group[] | undefined,
  currentGroups: readonly Group[] | undefined,
  groupId: string,
): boolean {
  if (!previousGroups || !currentGroups) return false;
  const previousIndex = previousGroups.findIndex((group) => group.id === groupId);
  const currentIndex = currentGroups.findIndex((group) => group.id === groupId);
  if (previousIndex < 0) return false;
  if (currentIndex < 0) {
    return hasExpectedGroupRemovalLifecycle(previousGroups, currentGroups, groupId);
  }
  if (previousIndex !== currentIndex || previousGroups.length !== currentGroups.length) {
    return false;
  }
  return currentGroups.every((group, index) =>
    index === currentIndex || group === previousGroups[index]);
}

export function useManagerOverlays({
  workspaceKey,
  categoryKey,
  groupItems,
}: Pick<ManagerOverlaysProviderProps, 'workspaceKey' | 'categoryKey' | 'groupItems'> = {}): ManagerOverlaysController {
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
  const previewTipOwnerRef = useRef({});
  const suppressedPreviewTriggerRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusRestoreFrameRef = useRef<number | null>(null);
  const isProviderMountedRef = useRef(false);
  const lifecycleVersionRef = useRef(0);
  const focusEpochRef = useRef(0);
  const idRef = useRef(0);
  const previousLifecycleRef = useRef({ workspaceKey, categoryKey, groupItems });
  const lifecycleContextRef = useRef({ workspaceKey, categoryKey, groupItems });
  lifecycleContextRef.current = { workspaceKey, categoryKey, groupItems };

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
    if (currentMenu && shouldRestore && currentMenu.restoreFocusOnClose) {
      deferFocusRestore(currentMenu.trigger, true);
    }
  }, [deferFocusRestore]);

  const closePreview = useCallback(({ restoreFocus: shouldRestore = false }: { restoreFocus?: boolean } = {}) => {
    releaseTip(previewTipOwnerRef.current);
    clearOpenTimer();
    clearCloseTimer();
    const currentPreview = previewRef.current;
    setPreview(null);
    if (!currentPreview) return;
    currentPreview.trigger.removeAttribute('aria-describedby');
    const focusTarget = getOverlayFocusRestoreTarget(null, currentPreview, shouldRestore);
    deferFocusRestore(focusTarget, focusTarget !== null);
  }, [clearCloseTimer, clearOpenTimer, deferFocusRestore]);

  const closeOverlays = useCallback(({ restoreFocus: shouldRestore = false }: { restoreFocus?: boolean } = {}) => {
    releaseTip(previewTipOwnerRef.current);
    cancelPendingFocusRestore();
    clearOpenTimer();
    clearCloseTimer();
    const currentMenu = menuRef.current;
    const currentPreview = previewRef.current;
    setMenu(null);
    setPreview(null);
    if (currentPreview) currentPreview.trigger.removeAttribute('aria-describedby');
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
      groupItems,
    };
  }, [categoryKey, groupItems, workspaceKey]);

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
        if (!hasExpectedGroupRemovalLifecycle(intent.groupItems, currentContext.groupItems, allowance.groupId)) return false;
        return !document.querySelector(`.session-board .session-card[data-group-id="${CSS.escape(allowance.groupId)}"]`);
      }
      if (allowance.kind === 'saved-tab-removal') {
        if (lifecycleVersionRef.current <= intent.lifecycleVersion) {
          return lifecycleVersionRef.current === intent.lifecycleVersion && Boolean(getFocusableTarget(intent.trigger));
        }
        if (!hasExpectedGroupUpdateLifecycle(intent.groupItems, currentContext.groupItems, allowance.groupId)) return false;
        if (document.querySelector(`.session-board .tab-item-row[data-group-id="${CSS.escape(allowance.groupId)}"][data-tab-id="${CSS.escape(allowance.tabId)}"]`)) return false;
        return Boolean(
          document.querySelector(`.session-board .session-card[data-group-id="${CSS.escape(allowance.groupId)}"]`)
            || document.querySelector('.session-board, .manager-board'),
        );
      }
      if (intent.groupItems !== currentContext.groupItems) return false;
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
      if (current) current.trigger.removeAttribute('aria-describedby');
      return null;
    });
    idRef.current += 1;
    setMenu({
      ...options,
      trigger: options.trigger ?? null,
      openedByKeyboard: options.openedByKeyboard === true,
      restoreFocusOnClose: options.restoreFocusOnClose
        ?? options.openedByKeyboard === true,
      ariaLabel: options.ariaLabel ?? 'Actions',
      position: null,
      itemKey: options.id,
      id: `${options.id}-${idRef.current}`,
    });
  }, [cancelPendingFocusRestore, clearCloseTimer, clearOpenTimer]);

  const openPreview = useCallback((options: OpenPreviewOptions) => {
    claimTip(
      previewTipOwnerRef.current,
      0,
      () => undefined,
      () => {
        setPreview((current) => {
          if (current) current.trigger.removeAttribute('aria-describedby');
          return null;
        });
      },
    );
    cancelPendingFocusRestore();
    clearOpenTimer();
    clearCloseTimer();
    setMenu(null);
    setPreview((current) => {
      if (current && current.trigger !== options.trigger) {
        current.trigger.removeAttribute('aria-describedby');
      }
      options.trigger.setAttribute('aria-describedby', options.id);
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
    claimTip(
      previewTipOwnerRef.current,
      delay,
      () => openPreview(options),
      () => {
        clearOpenTimer();
        setPreview((current) => {
          if (current) current.trigger.removeAttribute('aria-describedby');
          return null;
        });
      },
    );
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
    if (previous.workspaceKey !== workspaceKey || previous.categoryKey !== categoryKey || previous.groupItems !== groupItems) {
      invalidateOverlayLifecycle();
      closeOverlays();
    }
    previousLifecycleRef.current = { workspaceKey, categoryKey, groupItems };
  }, [categoryKey, closeOverlays, groupItems, invalidateOverlayLifecycle, workspaceKey]);

  useEffect(() => {
    const getPreviewOptions = (trigger: HTMLElement): OpenPreviewOptions | null => {
      const id = trigger.dataset.infoKey || '';
      const entry = infoTriggersRef.current.get(id);
      if (!id || !entry || entry.element !== trigger || !trigger.isConnected) return null;
      return {
        id,
        kind: entry.kind,
        content: renderTabHoverTooltipContent(entry.model),
        trigger,
      };
    };
    const handlePointerDown = (event: PointerEvent) => {
      document.documentElement.removeAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE);
      advanceFocusEpoch();
      const infoTrigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]')
        ?? null;
      suppressedPreviewTriggerRef.current = infoTrigger;
      if (infoTrigger) {
        closePreview();
        return;
      }
      if (isInside(menuElementRef.current, event.target) || isInside(previewElementRef.current, event.target)) return;
      if (menuRef.current?.trigger && isInside(menuRef.current.trigger, event.target)) return;
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
      menuElement.setAttribute('data-tip-keyboard-armed', '');
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
      suppressedPreviewTriggerRef.current = null;
      advanceFocusEpoch();
      closeOverlays();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleWindowBlur();
    };
    const handlePointerMove = (event: PointerEvent) => {
      const trigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]');
      const suppressedTrigger = suppressedPreviewTriggerRef.current;
      if (suppressedTrigger) {
        if (event.movementX === 0 && event.movementY === 0) return;
        suppressedPreviewTriggerRef.current = null;
        const options = trigger ? getPreviewOptions(trigger) : null;
        if (options) schedulePreview(options);
        return;
      }
      if (!isManagerHoverSuppressed()) return;
      if (event.movementX === 0 && event.movementY === 0) return;
      document.documentElement.removeAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE);
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
      if (suppressedPreviewTriggerRef.current === trigger) return;
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
      if (!trigger || trigger.contains(event.relatedTarget as Node | null)) return;
      if (suppressedPreviewTriggerRef.current === trigger) {
        suppressedPreviewTriggerRef.current = null;
      }
      scheduleClosePreview();
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isManagerHoverSuppressed()) return;
      const trigger = getTarget(event.target)?.closest<HTMLElement>('[data-info-popover]');
      if (suppressedPreviewTriggerRef.current === trigger) return;
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
        && !trigger.contains(relatedTarget as Node | null),
      );
      if (leavingTrigger) scheduleClosePreview();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleMenuKeyDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
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
      suppressedPreviewTriggerRef.current = null;
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

export function useManagerOverlayLifecycle(itemKey: unknown): void {
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
  children?: ReactNode;
  icon?: LucideIcon;
  label?: string;
  description?: string;
  danger?: boolean;
  onClick: (focusIntent?: ManagerFocusRestoreIntent) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  semanticRole?: 'menuitem' | 'button';
  preventFocusRestore?: boolean;
  lifecycleAllowance?: ManagerFocusRestoreLifecycleAllowance['kind'];
}

interface ManagerMenuDescriptionTargetProps {
  description: string;
  children: (props: ManagerMenuDescriptionTargetRenderProps) => ReactNode;
}

interface ManagerMenuDescriptionTargetRenderProps {
    ref: (element: HTMLElement | null) => void;
    'aria-describedby': string | undefined;
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
    onPointerDown: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

function useManagerMenuDescription(description: string | undefined) {
  const descriptionId = useId();
  const ownerRef = useRef({});
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [descriptionPosition, setDescriptionPosition] = useState<{ left: number; top: number } | null>(null);
  const itemRef = useRef<HTMLElement | null>(null);
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const dismissDescription = useCallback(() => {
    releaseTip(ownerRef.current);
  }, []);
  useEffect(() => () => releaseTip(ownerRef.current), []);
  useLayoutEffect(() => {
    if (!descriptionOpen || !itemRef.current || !descriptionRef.current) return;
    const tipRect = descriptionRef.current.getBoundingClientRect();
    setDescriptionPosition(getMenuDescriptionTipPosition(
      itemRef.current.getBoundingClientRect(),
      { width: tipRect.width, height: tipRect.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, [descriptionOpen]);

  const descriptionTargetProps = {
    ref: (element: HTMLElement | null) => {
      itemRef.current = element;
    },
    'aria-describedby': descriptionOpen ? descriptionId : undefined,
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => {
      if (!description) return;
      const target = event.currentTarget;
      claimTip(
        ownerRef.current,
        550,
        () => {
          if (target.isConnected) setDescriptionOpen(true);
        },
        () => {
          setDescriptionOpen(false);
          setDescriptionPosition(null);
        },
      );
    },
    onMouseLeave: dismissDescription,
    onFocus: () => {
      const menu = itemRef.current?.closest<HTMLElement>('[role="menu"]');
      if (!description || !menu?.hasAttribute('data-tip-keyboard-armed')) return;
      claimTip(
        ownerRef.current,
        0,
        () => setDescriptionOpen(true),
        () => {
          setDescriptionOpen(false);
          setDescriptionPosition(null);
        },
      );
    },
    onBlur: dismissDescription,
    onPointerDown: dismissDescription,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.currentTarget.closest<HTMLElement>('[role="menu"]')
          ?.setAttribute('data-tip-keyboard-armed', '');
      }
    },
  };
  const descriptionTip = description && descriptionOpen && typeof document !== 'undefined'
    ? createPortal(createElement(
        'div',
        {
          ref: descriptionRef,
          id: descriptionId,
          className: 'manager-menu-item__description-tip',
          role: 'tooltip',
          style: {
            left: descriptionPosition?.left ?? 0,
            top: descriptionPosition?.top ?? 0,
            pointerEvents: 'none',
            visibility: descriptionPosition ? 'visible' : 'hidden',
          },
        },
        description,
      ), document.querySelector('#manager-main') ?? document.body)
    : null;

  return {
    descriptionTargetProps,
    descriptionTip,
    dismissDescription,
  };
}

export function ManagerMenuDescriptionTarget({
  description,
  children,
}: ManagerMenuDescriptionTargetProps): ReactNode {
  const {
    descriptionTargetProps,
    descriptionTip,
  } = useManagerMenuDescription(description);
  return createElement(
    Fragment,
    null,
    children(descriptionTargetProps),
    descriptionTip,
  );
}

export function mergeManagerMenuDescriptionRef<T extends HTMLElement>(
  descriptionRef: ManagerMenuDescriptionTargetRenderProps['ref'],
  ownerRef: { current: T | null },
): (element: T | null) => void {
  return (element) => {
    descriptionRef(element);
    ownerRef.current = element;
  };
}

export function ManagerMenuItem({
  children,
  icon,
  label,
  description,
  danger = false,
  onClick,
  disabled = false,
  className,
  ariaLabel,
  semanticRole = 'menuitem',
  preventFocusRestore = false,
  lifecycleAllowance,
}: ManagerMenuItemProps): ReactNode {
  const { closeOverlays, captureFocusRestoreIntent, restoreFocusAfterMutation } = useManagerOverlayCommands();
  const {
    descriptionTargetProps,
    descriptionTip,
    dismissDescription,
  } = useManagerMenuDescription(description);

  const content = label || children;
  const item = createElement(
    'button',
    {
      ...descriptionTargetProps,
      type: 'button',
      role: semanticRole === 'menuitem' ? 'menuitem' : undefined,
      'aria-label': ariaLabel,
      className: [
        'manager-overlay-menu__item',
        icon ? 'manager-overlay-menu__item--with-icon' : '',
        danger ? 'manager-overlay-menu__item--danger manager-overlay-menu__item--separated' : '',
        className,
      ].filter(Boolean).join(' '),
      disabled,
      onClick: async (event: ReactMouseEvent<HTMLButtonElement>) => {
        if (disabled) return;
        dismissDescription();
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
    icon ? createElement(TabBoardIcon, { icon, size: 'menu' }) : null,
    createElement('span', { className: 'manager-overlay-menu__item-label' }, content),
  );

  return createElement(
    Fragment,
    null,
    item,
    descriptionTip,
  );
}

interface ManagerOverlayPortalProps {
  menuWidth?: number;
  onOpenTabPreviewChange?: (open: boolean) => void;
}

export function ManagerOverlayPortal({
  menuWidth = 190,
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
    const triggerRect = getTabHoverTooltipAnchor(
      preview.trigger,
    ).getBoundingClientRect();
    const tooltipPosition = getTabHoverTooltipPosition(
      triggerRect,
      { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    element.dataset.placement = tooltipPosition.placement;
    setPreviewPosition({ left: tooltipPosition.left, top: tooltipPosition.top });
  });

  if (typeof document === 'undefined' || (!menu && !preview)) return null;
  const menuStyle: CSSProperties = {
    position: 'fixed',
    left: menu?.position?.left ?? 0,
    top: menu?.position?.top ?? 0,
    width: menuWidth,
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
            'aria-label': menu.ariaLabel,
            style: menuStyle,
            onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
            onClick: (event: React.MouseEvent) => event.stopPropagation(),
          }, menu.content)
        : null,
      preview
        ? createElement('div', {
            ref: controller.registerPreviewElement,
            id: preview.id,
            className: 'manager-info-popover',
            role: 'tooltip',
            'data-distance': TAB_HOVER_TOOLTIP_GAP,
            style: previewStyle,
          }, preview.content)
        : null,
    ),
    document.querySelector('#manager-main') ?? document.body,
  );
}
