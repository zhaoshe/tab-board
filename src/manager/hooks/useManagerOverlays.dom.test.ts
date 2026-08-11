// @vitest-environment happy-dom
import {
  act,
  createElement,
  Fragment,
  memo,
  type ReactNode,
  useRef,
  useState,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { MantineProvider } from '@mantine/core';
import {
  getTabHoverTooltipPosition,
  MANAGER_HOVER_SUPPRESSED_ATTRIBUTE,
  ManagerMenuItem,
  ManagerOverlayPortal,
  ManagerOverlaysProvider,
  renderTabHoverTooltipContent,
  TAB_HOVER_TOOLTIP_CONTRACT,
  useManagerInfoTrigger,
  useManagerOverlayCommands,
  useManagerOverlayController,
  type ManagerOverlaysController,
} from './useManagerOverlays';
import * as tabItemRowModule from '../components/sessions/TabItemRow';
import { TabItemRow } from '../components/sessions/TabItemRow';
import { ToastProvider } from './useToast';
import { DestructiveConfirmationProvider } from '../../shared/components/DestructiveConfirmation';
import { ITEM_LINK, ITEM_NOTE, type TabItem } from '../../shared/model';
import type { ManagerRuntime } from './useManagerRuntime';
import { titleRefreshActivityStore } from '../core/titleRefreshActivity';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface RafController {
  cancel: ReturnType<typeof vi.fn>;
  flush: () => Promise<void>;
  pending: () => number;
}

function installRafController(): RafController {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback): number => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number): void => {
    callbacks.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);

  return {
    cancel,
    flush: async () => {
      const queued = [...callbacks.values()];
      callbacks.clear();
      await act(async () => {
        queued.forEach((callback) => callback(0));
      });
    },
    pending: () => callbacks.size,
  };
}

function setGeometry(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
    if (this.matches('[data-info-popover]')) {
      return {
        x: 20,
        y: 30,
        top: 30,
        right: 120,
        bottom: 60,
        left: 20,
        width: 100,
        height: 30,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return {
      x: 0,
      y: 0,
      top: 0,
      right: 240,
      bottom: 100,
      left: 0,
      width: 240,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

interface MountedOverlay {
  container: HTMLDivElement;
  root: Root;
  trigger: HTMLButtonElement;
  controller: ManagerOverlaysController;
  removeTrigger: () => void;
}

let activeMount: MountedOverlay | null = null;

const OverlayCommandRenderProbe = memo(function OverlayCommandRenderProbe(
  { onRender }: { onRender: () => void },
): ReactNode {
  useManagerOverlayCommands();
  onRender();
  return null;
});

function OverlayHarness({
  onReady,
  onCommandRender,
}: {
  onReady: (value: { trigger: HTMLButtonElement; controller: ManagerOverlaysController; removeTrigger: () => void }) => void;
  onCommandRender?: () => void;
}): ReactNode {
  const [isTriggerVisible, setTriggerVisible] = useState(true);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const controller = useManagerOverlayController();
  const registerInfoTrigger = useManagerInfoTrigger('preview-key', {
    kind: 'open',
    model: {
      title: 'Preview',
      domain: 'example.test',
      link: 'https://example.test/page',
      savedAt: '2026-07-31T12:00:00.000Z',
    },
  });

  const setTrigger = (element: HTMLButtonElement | null): void => {
    triggerRef.current = element;
    registerInfoTrigger(element);
    if (element) onReady({ trigger: element, controller, removeTrigger: () => setTriggerVisible(false) });
  };

  return createElement(
    Fragment,
    null,
    isTriggerVisible
      ? createElement('button', {
          ref: setTrigger,
          type: 'button',
          'data-info-key': 'preview-key',
          'data-info-popover': 'open',
        }, 'Preview')
      : null,
    onCommandRender ? createElement(OverlayCommandRenderProbe, { onRender: onCommandRender }) : null,
    createElement(ManagerOverlayPortal),
  );
}

function MenuItemHarness(): ReactNode {
  const controller = useManagerOverlayController();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return createElement(
    Fragment,
    null,
    createElement('button', {
      ref: triggerRef,
      type: 'button',
      onClick: () => {
        if (!triggerRef.current) return;
        controller.openMenu({
          id: 'described-menu',
          kind: 'session',
          anchor: { x: 10, y: 10 },
          content: createElement(ManagerMenuItem, {
            label: 'Import',
            description: 'Import a TabBoard backup',
            onClick: vi.fn(),
          }),
          trigger: triggerRef.current,
        });
      },
    }, 'Open menu'),
    createElement(ManagerOverlayPortal),
  );
}

function InvokerMenuHarness(): ReactNode {
  const controller = useManagerOverlayController();
  const titleRef = useRef<HTMLButtonElement | null>(null);
  const openFromEvent = (
    event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
  ): void => {
    if (!titleRef.current) return;
    const getSavedTabMenuTrigger = (
      tabItemRowModule as typeof tabItemRowModule & {
        getSavedTabMenuTrigger?: (
          target: EventTarget | null,
          row: HTMLElement,
          fallback: HTMLElement,
        ) => HTMLElement;
      }
    ).getSavedTabMenuTrigger;
    const trigger = getSavedTabMenuTrigger
      ? getSavedTabMenuTrigger(event.target, event.currentTarget, titleRef.current)
      : titleRef.current;
    event.preventDefault();
    controller.openMenu({
      id: 'saved-tab-invoker-menu',
      kind: 'saved-tab',
      anchor: { x: 10, y: 10 },
      content: createElement(ManagerMenuItem, {
        label: 'Copy Text',
        onClick: vi.fn(),
      }),
      trigger,
      openedByKeyboard: true,
      restoreFocusOnClose: true,
    });
  };

  return createElement(
    Fragment,
    null,
    createElement(
      'div',
      {
        className: 'tab-item-row__content',
        tabIndex: -1,
        onContextMenu: openFromEvent,
        onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            openFromEvent(event);
          }
        },
      },
      createElement('input', {
        type: 'checkbox',
        'aria-label': 'Select saved item',
      }),
      createElement('button', {
        ref: titleRef,
        type: 'button',
      }, 'Saved title'),
      createElement('button', {
        type: 'button',
        'aria-label': 'Delete',
      }, 'Delete'),
    ),
    createElement(ManagerOverlayPortal),
  );
}

const savedNote: TabItem = {
  id: 'saved-note',
  itemType: ITEM_NOTE,
  title: 'Fallback note title',
  url: '',
  favIconUrl: '',
  note: 'Saved note text',
  pinned: false,
  incognito: false,
  starred: false,
  taskStatus: 'none',
  browserGroup: null,
  sourceWindowId: null,
  sourceTabId: null,
  createdAt: '2026-07-31T12:00:00.000Z',
  updatedAt: '2026-07-31T12:00:00.000Z',
};

const savedLink: TabItem = {
  ...savedNote,
  id: 'saved-link',
  itemType: ITEM_LINK,
  title: 'Temporary title',
  url: 'https://refresh.example/article',
  note: '',
};

const runtimeStub: ManagerRuntime = {
  openSavedTab: vi.fn(async () => undefined),
  openSavedTabs: vi.fn(async () => undefined),
  refreshSavedTabTitle: vi.fn(async () => 'Loaded article title'),
  refreshSavedGroupTitles: vi.fn(async () => ({ refreshed: 0, failed: 0 })),
  restoreGroup: vi.fn(async () => undefined),
  restoreTab: vi.fn(async () => undefined),
  restoreTabs: vi.fn(async () => ({ restoredTabs: 0, outcomes: [] })),
};

interface SavedRowHarnessProps {
  parentContextMenu: () => void;
  parentKeyDown: (key: string) => void;
  tab?: TabItem;
  runtime?: ManagerRuntime;
  locked?: boolean;
  updateTab?: (
    groupId: string,
    tabId: string,
    updates: Partial<TabItem>,
  ) => void;
}

function SavedRowParentOverwriteHarness({
  parentContextMenu,
  parentKeyDown,
  tab = savedNote,
  runtime = runtimeStub,
  locked = false,
  updateTab = vi.fn(),
}: SavedRowHarnessProps): ReactNode {
  const controller = useManagerOverlayController();
  const openParentMenu = (trigger: HTMLElement): void => {
    controller.openMenu({
      id: 'parent-session-menu',
      kind: 'session',
      anchor: { x: 0, y: 0 },
      content: createElement(ManagerMenuItem, {
        label: 'Add Link',
        onClick: vi.fn(),
      }),
      trigger,
      ariaLabel: 'Actions',
    });
  };

  return createElement(
    'div',
    {
      className: 'session-card',
      onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => {
        parentContextMenu();
        event.preventDefault();
        openParentMenu(event.currentTarget);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        parentKeyDown(event.key);
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
          event.preventDefault();
          openParentMenu(event.currentTarget);
        }
      },
    },
    createElement(TabItemRow, {
      tab,
      groupId: 'group-a',
      workspaceId: 'workspace-a',
      tabIndex: 0,
      selectedRefs: [],
      runtime,
      locked,
      commands: {
        confirmBeforeDestructive: false,
        deleteTab: vi.fn(),
        updateTab,
      },
    }),
    createElement(ManagerOverlayPortal),
  );
}

async function mountSavedRow(
  overrides: Partial<SavedRowHarnessProps> = {},
): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(
      MantineProvider,
      null,
      createElement(
        DndContext,
        null,
        createElement(
          ToastProvider,
          null,
          createElement(
            DestructiveConfirmationProvider,
            null,
            createElement(
              ManagerOverlaysProvider,
              null,
              createElement(SavedRowParentOverwriteHarness, {
                parentContextMenu: vi.fn(),
                parentKeyDown: vi.fn(),
                ...overrides,
              }),
            ),
          ),
        ),
      ),
    ));
  });
  return { container, root };
}

async function openSavedRowMenu(container: HTMLElement): Promise<HTMLButtonElement | undefined> {
  const title = container.querySelector<HTMLButtonElement>('.tab-item-row__title');
  await act(async () => {
    title?.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 18,
    }));
  });
  return [...document.querySelectorAll<HTMLButtonElement>(
    '.manager-overlay-menu button',
  )].find((button) => button.textContent?.includes('Refresh Title'));
}

async function mountOverlay(onCommandRender?: () => void): Promise<MountedOverlay> {
  const container = document.createElement('div');
  document.body.append(container);
  let ready: { trigger: HTMLButtonElement; controller: ManagerOverlaysController; removeTrigger: () => void } | null = null;
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(
      ManagerOverlaysProvider,
      null,
      createElement(OverlayHarness, { onReady: (value) => { ready = value; }, onCommandRender }),
    ));
  });
  const readyValue = ready as { trigger: HTMLButtonElement; controller: ManagerOverlaysController; removeTrigger: () => void } | null;
  if (!readyValue) throw new Error('Overlay harness did not mount.');
  const mounted: MountedOverlay = {
    container,
    root,
    trigger: readyValue.trigger,
    controller: readyValue.controller,
    removeTrigger: readyValue.removeTrigger,
  };
  activeMount = mounted;
  return mounted;
}

async function unmountOverlay(mounted: MountedOverlay): Promise<void> {
  await act(async () => mounted.root.unmount());
  mounted.container.remove();
  if (activeMount === mounted) activeMount = null;
}

function dispatchEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
}

beforeEach(() => {
  vi.useFakeTimers();
  setGeometry();
  document.body.innerHTML = '';
});

afterEach(async () => {
  if (activeMount) await unmountOverlay(activeMount);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mounted manager overlay behavior', () => {
  it('exports the saved-tab invoker resolver used by pointer and keyboard menus', () => {
    expect((
      tabItemRowModule as typeof tabItemRowModule & {
        getSavedTabMenuTrigger?: unknown;
      }
    ).getSavedTabMenuTrigger).toBeTypeOf('function');
  });

  it('exposes the read-only tooltip clamp contract', () => {
    expect(TAB_HOVER_TOOLTIP_CONTRACT.titleLines).toBe(2);
    expect(TAB_HOVER_TOOLTIP_CONTRACT.linkLines).toBe(4);
    expect(TAB_HOVER_TOOLTIP_CONTRACT.pointerEvents).toBe('none');
  });

  it('renders one read-only tab tooltip with only title, domain, link, and timestamp', () => {
    const content = renderTabHoverTooltipContent({
      title: 'Preview',
      domain: 'example.test',
      link: 'https://example.test/page',
      savedAt: 'Saved Jul 31, 2026',
    });
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(content));

    expect(container.querySelector('.manager-tab-tooltip__title')?.textContent).toBe('Preview');
    expect(container.querySelector('.manager-tab-tooltip__domain')?.textContent).toBe('example.test');
    expect(container.querySelector('.manager-tab-tooltip__link')?.textContent)
      .toBe('https://example.test/page');
    expect(container.querySelector('time')?.textContent).toBe('Saved Jul 31, 2026, 12:00 AM');
    expect(container.querySelector('img, button, [role="button"]')).toBeNull();

    act(() => root.unmount());
  });

  it('uses detailed tooltip text as the aria-describedby content without overriding labels', async () => {
    const mounted = await mountOverlay();

    await act(async () => mounted.trigger.focus());
    const tooltip = document.querySelector<HTMLElement>('.manager-info-popover[role="tooltip"]');

    expect(tooltip).not.toBeNull();
    expect(tooltip?.hasAttribute('aria-label')).toBe(false);
    expect(tooltip?.querySelector('.manager-tab-tooltip')?.hasAttribute('aria-label')).toBe(false);
    expect(mounted.trigger.getAttribute('aria-describedby')).toBe(tooltip?.id);
    expect(tooltip?.textContent).toContain('Preview');
    expect(tooltip?.textContent).toContain('example.test');
    expect(tooltip?.textContent).toContain('https://example.test/page');
    expect(tooltip?.textContent).toContain('Saved');
  });

  it.each([
    ['right-clicked nested checkbox', '[aria-label="Select saved item"]', 'contextmenu'],
    ['keyboard-invoked nested Delete', '[aria-label="Delete"]', 'keyboard'],
    ['keyboard-invoked title', 'button:not([aria-label])', 'keyboard'],
    ['row background fallback', '.tab-item-row__content', 'contextmenu'],
  ])('restores the %s on Escape', async (_label, selector, eventKind) => {
    const raf = installRafController();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(
        ManagerOverlaysProvider,
        null,
        createElement(InvokerMenuHarness),
      ));
    });

    try {
      const target = container.querySelector<HTMLElement>(selector);
      const title = container.querySelector<HTMLButtonElement>('button:not([aria-label])');
      const expectedTrigger = selector === '.tab-item-row__content' ? title : target;
      expect(target).not.toBeNull();
      expect(expectedTrigger).not.toBeNull();

      await act(async () => {
        target?.focus();
        target?.dispatchEvent(eventKind === 'contextmenu'
          ? new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: 12,
              clientY: 18,
            })
          : new KeyboardEvent('keydown', {
              bubbles: true,
              cancelable: true,
              key: 'ContextMenu',
            }));
      });
      expect(document.querySelector('.manager-overlay-menu')).not.toBeNull();

      await act(async () => dispatchEscape());
      expect(document.querySelector('.manager-overlay-menu')).toBeNull();
      await raf.flush();
      expect(document.activeElement).toBe(expectedTrigger);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it.each([
    ['right-click', 'contextmenu'],
    ['Shift+F10', 'keyboard'],
  ])(
    'keeps the Saved Tab Actions menu after %s instead of bubbling to the Session menu',
    async (_label, eventKind) => {
      const raf = installRafController();
      const parentContextMenu = vi.fn();
      const parentKeyDown = vi.fn();
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(createElement(
          MantineProvider,
          null,
          createElement(
            DndContext,
            null,
            createElement(
              ToastProvider,
              null,
              createElement(
                DestructiveConfirmationProvider,
                null,
                createElement(
                  ManagerOverlaysProvider,
                  null,
                  createElement(SavedRowParentOverwriteHarness, {
                    parentContextMenu,
                    parentKeyDown,
                  }),
                ),
              ),
            ),
          ),
        ));
      });

      try {
        const title = container.querySelector<HTMLButtonElement>('.tab-item-row__title');
        expect(title).not.toBeNull();

        await act(async () => {
          title?.focus();
          title?.dispatchEvent(eventKind === 'contextmenu'
            ? new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 12,
                clientY: 18,
              })
            : new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'F10',
                shiftKey: true,
              }));
        });

        const menu = document.querySelector<HTMLElement>('.manager-overlay-menu');
        expect(menu?.getAttribute('aria-label')).toBe('Saved Tab Actions');
        expect(menu?.textContent).toContain('Edit Note');
        expect(menu?.textContent).toContain('Copy Text');
        expect(menu?.textContent).toContain('Delete');
        expect(menu?.textContent).not.toContain('Add Link');
        if (eventKind === 'contextmenu') {
          expect(parentContextMenu).not.toHaveBeenCalled();
        } else {
          expect(parentKeyDown).not.toHaveBeenCalled();
        }

        await act(async () => dispatchEscape());
        await raf.flush();
        expect(document.activeElement).toBe(title);

        await act(async () => {
          title?.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'ArrowRight',
          }));
        });
        expect(parentKeyDown).toHaveBeenCalledWith('ArrowRight');
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
    },
  );

  it('refreshes a saved link title through the runtime and existing update-tab command', async () => {
    const refreshSavedTabTitle = vi.fn(async () => 'Loaded article title');
    const updateTab = vi.fn();
    const { container, root } = await mountSavedRow({
      tab: savedLink,
      runtime: {
        ...runtimeStub,
        refreshSavedTabTitle,
      },
      updateTab,
    });

    try {
      const refresh = await openSavedRowMenu(container);
      expect(refresh?.disabled).toBe(false);

      await act(async () => refresh?.click());

      expect(refreshSavedTabTitle).toHaveBeenCalledWith(
        savedLink.url,
        'group-a',
        savedLink.id,
      );
      expect(updateTab).toHaveBeenCalledWith(
        'group-a',
        savedLink.id,
        { title: 'Loaded article title' },
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('keeps the saved title unchanged when title refresh fails', async () => {
    const updateTab = vi.fn();
    const { container, root } = await mountSavedRow({
      tab: savedLink,
      runtime: {
        ...runtimeStub,
        refreshSavedTabTitle: vi.fn(async () => {
          throw new Error('Unable to load a page title.');
        }),
      },
      updateTab,
    });

    try {
      const refresh = await openSavedRowMenu(container);
      await act(async () => refresh?.click());

      expect(updateTab).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('does not write an update when Refresh Title returns the saved title', async () => {
    const updateTab = vi.fn();
    const { container, root } = await mountSavedRow({
      tab: savedLink,
      runtime: {
        ...runtimeStub,
        refreshSavedTabTitle: vi.fn(async () => savedLink.title),
      },
      updateTab,
    });

    try {
      const refresh = await openSavedRowMenu(container);
      await act(async () => refresh?.click());

      expect(updateTab).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('allows Refresh Title for links in locked sessions', async () => {
    const refreshSavedTabTitle = vi.fn(async () => 'Locked final title');
    const updateTab = vi.fn();
    const { container, root } = await mountSavedRow({
      tab: savedLink,
      locked: true,
      runtime: {
        ...runtimeStub,
        refreshSavedTabTitle,
      },
      updateTab,
    });

    try {
      const refresh = await openSavedRowMenu(container);

      expect(refresh?.disabled).toBe(false);
      await act(async () => refresh?.click());
      expect(refreshSavedTabTitle).toHaveBeenCalledWith(
        savedLink.url,
        'group-a',
        savedLink.id,
      );
      expect(updateTab).toHaveBeenCalledWith(
        'group-a',
        savedLink.id,
        { title: 'Locked final title' },
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('restores persisted saved links through the worker when their title is opened', async () => {
    const restoreTab = vi.fn(async () => undefined);
    const openSavedTab = vi.fn(async () => undefined);
    const { container, root } = await mountSavedRow({
      tab: savedLink,
      runtime: {
        ...runtimeStub,
        restoreTab,
        openSavedTab,
      },
    });

    try {
      const title = container.querySelector<HTMLButtonElement>('.tab-item-row__title');
      await act(async () => title?.click());

      expect(restoreTab).toHaveBeenCalledWith('group-a', savedLink.id);
      expect(openSavedTab).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('replaces Delete with a visible loading action while that saved title refreshes', async () => {
    const { container, root } = await mountSavedRow({ tab: savedLink });

    try {
      const deleteAction = () => container.querySelector<HTMLButtonElement>(
        '.tab-item-row__delete',
      );
      expect(deleteAction()?.getAttribute('aria-label')).toBe('Delete');
      expect(deleteAction()?.hasAttribute('data-loading')).toBe(false);

      await act(async () => {
        titleRefreshActivityStore.apply({
          groupId: 'group-a',
          tabId: savedLink.id,
          operationId: 'loading-test',
          status: 'start',
        });
      });

      expect(deleteAction()?.getAttribute('aria-label')).toBe('Refreshing title');
      expect(deleteAction()?.getAttribute('data-loading')).toBe('true');
      expect(deleteAction()?.classList).toContain(
        'tab-item-row__delete--loading',
      );

      await act(async () => {
        titleRefreshActivityStore.apply({
          groupId: 'group-a',
          tabId: savedLink.id,
          operationId: 'loading-test',
          status: 'finish',
        });
      });

      expect(deleteAction()?.getAttribute('aria-label')).toBe('Delete');
      expect(deleteAction()?.hasAttribute('data-loading')).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('places the tooltip 6px above its trigger and flips below near the viewport top', () => {
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
  });

  it('shows menu descriptions after pointer dwell and immediately on keyboard focus', async () => {
    const managerMain = document.createElement('main');
    managerMain.id = 'manager-main';
    const container = document.createElement('div');
    managerMain.append(container);
    document.body.append(managerMain);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(
        ManagerOverlaysProvider,
        null,
        createElement(MenuItemHarness),
      ));
    });

    try {
      const trigger = container.querySelector<HTMLButtonElement>('button');
      await act(async () => trigger?.click());
      const menu = document.querySelector<HTMLElement>('.manager-overlay-menu');
      const item = document.querySelector<HTMLButtonElement>('[role="menuitem"]');
      expect(menu?.closest('#manager-main')).toBe(managerMain);
      expect(menu?.style.width).toBe('190px');
      expect(menu?.style.minWidth).toBe('');
      expect(item?.textContent).toContain('Import');
      expect(item?.textContent).not.toContain('Import a TabBoard backup');
      expect(document.querySelector('[role="tooltip"]')).toBeNull();

      await act(async () => {
        item?.dispatchEvent(new MouseEvent('mouseover', {
          bubbles: true,
          relatedTarget: document.body,
        }));
        vi.advanceTimersByTime(549);
      });
      expect(document.querySelector('[role="tooltip"]')).toBeNull();

      await act(async () => vi.advanceTimersByTime(1));
      const pointerTip = document.querySelector<HTMLElement>('[role="tooltip"]');
      expect(pointerTip?.textContent).toBe('Import a TabBoard backup');
      expect(item?.getAttribute('aria-describedby')).toBe(pointerTip?.id);

      await act(async () => {
        item?.dispatchEvent(new MouseEvent('mouseout', {
          bubbles: true,
          relatedTarget: document.body,
        }));
        item?.blur();
        menu?.setAttribute('data-tip-keyboard-armed', '');
        item?.focus();
      });
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Import a TabBoard backup');

      const focusTip = document.querySelector<HTMLElement>('[role="tooltip"]');
      expect(focusTip?.textContent).toBe('Import a TabBoard backup');
      expect(item?.getAttribute('aria-describedby')).toBe(focusTip?.id);

      await act(async () => item?.blur());
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
      expect(item?.hasAttribute('aria-describedby')).toBe(false);
    } finally {
      await act(async () => root.unmount());
      managerMain.remove();
    }
  });

  it('keeps the tab tooltip read-only when Tab is pressed on the trigger', async () => {
    const mounted = await mountOverlay();

    await act(async () => mounted.trigger.focus());
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();

    await act(async () => {
      mounted.trigger.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Tab',
      }));
    });

    expect(document.activeElement).toBe(mounted.trigger);
    expect(document.querySelector('.manager-info-popover button')).toBeNull();
  });

  it('binds global listeners once across menu and preview state changes', async () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const mounted = await mountOverlay();
    const pointerAddsAfterMount = addListener.mock.calls.filter(([type]) => type === 'pointerdown').length;
    const scrollAddsAfterMount = addListener.mock.calls.filter(([type]) => type === 'scroll').length;

    await act(async () => {
      mounted.controller.openMenu({
        id: 'stable-listener-menu',
        kind: 'open-tab',
        anchor: { x: 10, y: 10 },
        content: createElement('button', { role: 'menuitem', type: 'button' }, 'Action'),
        trigger: mounted.trigger,
      });
    });
    await act(async () => mounted.controller.closeMenu());
    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });

    expect(addListener.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(pointerAddsAfterMount);
    expect(addListener.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(scrollAddsAfterMount);
    expect(removeListener.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(0);
    expect(removeListener.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(0);

    await unmountOverlay(mounted);
  });

  it('does not rerender command-only consumers when overlay state changes', async () => {
    let commandRenderCount = 0;
    const mounted = await mountOverlay(() => {
      commandRenderCount += 1;
    });
    expect(commandRenderCount).toBe(1);

    await act(async () => {
      mounted.controller.openMenu({
        id: 'command-render-menu',
        kind: 'open-tab',
        anchor: { x: 10, y: 10 },
        content: createElement('button', { role: 'menuitem', type: 'button' }, 'Action'),
        trigger: mounted.trigger,
      });
    });
    await act(async () => mounted.controller.closeMenu());
    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });

    expect(commandRenderCount).toBe(1);
    await unmountOverlay(mounted);
  });

  it('closes a focused tab tooltip on Escape without creating an interactive focus stop', async () => {
    const raf = installRafController();
    const mounted = await mountOverlay();

    await act(async () => mounted.trigger.focus());
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();
    expect(document.querySelector('.manager-info-popover button')).toBeNull();

    await act(async () => dispatchEscape());
    expect(document.querySelector('.manager-info-popover')).toBeNull();
    expect(document.activeElement).toBe(mounted.trigger);
    expect(raf.pending()).toBe(1);
    await raf.flush();

    await unmountOverlay(mounted);
  });

  it('ignores pointer clicks and does not restore focus after hover tooltip close', async () => {
    const raf = installRafController();
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(document.querySelector('.manager-info-popover')).toBeNull();
    expect(raf.pending()).toBe(0);
    expect(document.activeElement).not.toBe(mounted.trigger);

    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    });
    await act(async () => vi.advanceTimersByTime(180));
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();
    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    await act(async () => vi.advanceTimersByTime(120));
    expect(document.querySelector('.manager-info-popover')).toBeNull();
    expect(raf.pending()).toBe(0);
    expect(document.activeElement).not.toBe(mounted.trigger);

    await unmountOverlay(mounted);
  });

  it('dismisses a tab tooltip on pointer activation until the pointer actually moves', async () => {
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('mouseover', {
        bubbles: true,
        relatedTarget: document.body,
      }));
      vi.advanceTimersByTime(180);
    });
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();

    await act(async () => {
      mounted.trigger.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
      }));
      mounted.trigger.focus();
      mounted.trigger.dispatchEvent(new MouseEvent('mouseover', {
        bubbles: true,
        relatedTarget: document.body,
      }));
      vi.advanceTimersByTime(180);
    });
    expect(document.querySelector('.manager-info-popover')).toBeNull();

    await act(async () => {
      mounted.trigger.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        movementX: 0,
        movementY: 0,
      }));
      vi.advanceTimersByTime(180);
    });
    expect(document.querySelector('.manager-info-popover')).toBeNull();

    await act(async () => {
      mounted.trigger.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        movementX: 1,
        movementY: 0,
      }));
      vi.advanceTimersByTime(180);
    });
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();

    await unmountOverlay(mounted);
  });

  it('restores keyboard menu focus and cancels stale restoration after pointer interaction', async () => {
    const raf = installRafController();
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.controller.openMenu({
        id: 'menu-key',
        kind: 'open-tab',
        anchor: { x: 10, y: 10 },
        content: createElement('button', { role: 'menuitem', type: 'button' }, 'Action'),
        trigger: mounted.trigger,
        openedByKeyboard: true,
      });
    });
    expect(document.querySelector('.manager-overlay-menu')).not.toBeNull();

    await act(async () => dispatchEscape());
    expect(document.querySelector('.manager-overlay-menu')).toBeNull();
    expect(raf.pending()).toBe(1);
    expect(document.activeElement).not.toBe(mounted.trigger);

    await act(async () => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(raf.cancel).toHaveBeenCalled();
    await raf.flush();
    expect(document.activeElement).not.toBe(mounted.trigger);

    await unmountOverlay(mounted);
  });

  it('closes a menu when its trigger is disconnected during measurement', async () => {
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.controller.openMenu({
        id: 'menu-disconnected-trigger',
        kind: 'open-tab',
        anchor: { x: 10, y: 10 },
        content: createElement('button', { role: 'menuitem', type: 'button' }, 'Action'),
        trigger: mounted.trigger,
      });
    });
    expect(document.querySelector('.manager-overlay-menu')).not.toBeNull();

    await act(async () => mounted.removeTrigger());

    expect(document.querySelector('.manager-overlay-menu')).toBeNull();
    await unmountOverlay(mounted);
  });

  it('suppresses stale hover previews across window blur until real pointer movement', async () => {
    const mounted = await mountOverlay();

    await act(async () => {
      mounted.trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    });
    await act(async () => vi.advanceTimersByTime(180));
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new FocusEvent('blur'));
    });
    expect(document.documentElement.hasAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE)).toBe(true);
    expect(document.querySelector('.manager-info-popover')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new FocusEvent('focus'));
      mounted.trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
      mounted.trigger.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        movementX: 0,
        movementY: 0,
      }));
      vi.advanceTimersByTime(180);
    });
    expect(document.documentElement.hasAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE)).toBe(true);
    expect(document.querySelector('.manager-info-popover')).toBeNull();

    await act(async () => {
      mounted.trigger.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        movementX: 1,
        movementY: 0,
      }));
      vi.advanceTimersByTime(180);
    });
    expect(document.documentElement.hasAttribute(MANAGER_HOVER_SUPPRESSED_ATTRIBUTE)).toBe(false);
    expect(document.querySelector('.manager-info-popover')).not.toBeNull();

    await unmountOverlay(mounted);
  });
});
