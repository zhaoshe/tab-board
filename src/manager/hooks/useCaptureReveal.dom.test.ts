// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DndContext } from '@dnd-kit/core';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyState,
  createGroupFromTabRecords,
  createTabRecord,
  type Group,
} from '../../shared/model';
import { DestructiveConfirmationProvider } from '../../shared/components/DestructiveConfirmation';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import { ManagerOverlaysProvider, ManagerOverlayPortal } from './useManagerOverlays';
import { ToastProvider } from './useToast';
import { WorkspaceContent } from '../components/workspace/WorkspaceContent';
import { useCaptureReveal } from './useCaptureReveal';
import type { CaptureCompletion } from './useOpenTabsRuntime';
import { savedSearchQueryStore, useSearchQuery } from './useSearchQuery';
import type { CategoryFilter } from '../core/selectors';
import type { ManagerRuntime } from './useManagerRuntime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = '2026-01-01T00:00:00.000Z';
const observers: Array<{
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
}> = [];
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let captureCompleted: ((detail: CaptureCompletion | null) => void) | null = null;
let scrollIntoViewSpy: ReturnType<typeof vi.fn>;

const pageState = {
  replace: vi.fn(),
  setQuery: vi.fn(),
};
const toast = {
  showSuccess: vi.fn(),
  showInfo: vi.fn(),
  showError: vi.fn(),
};
const selectionScope = {
  scope: null,
  commands: {
    enterOpenTabs: vi.fn(),
    enterSavedTabs: vi.fn(),
    exit: vi.fn(),
  },
  registerOpenTabsClear: vi.fn(() => () => undefined),
  registerSavedTabsClear: vi.fn(() => () => undefined),
};
const runtime = {
  restoreGroup: vi.fn(),
  restoreTab: vi.fn(),
  restoreTabs: vi.fn(),
  openSavedTab: vi.fn(),
  refreshSavedTabTitle: vi.fn(),
  refreshSavedGroupTitles: vi.fn(),
} as unknown as ManagerRuntime;

function makeGroup(id: string, index: number): Group {
  return {
    ...createGroupFromTabRecords([
      createTabRecord({
        title: `Link ${index}`,
        url: `https://example.com/${encodeURIComponent(id)}`,
      }, {
        id: `tab-${id}`,
      }),
    ], {
      workspaceId: 'workspace_default',
      title: `Session ${index}`,
    }),
    id,
    folderId: null,
    starred: false,
    archived: false,
  };
}

function completionFor(groupId: string): CaptureCompletion {
  return {
    committed: true,
    reconciled: true,
    message: 'saved',
    result: { storedTabs: 1, storedGroups: 1, cleanedDuplicates: 0, createdGroupIds: [groupId] },
    createdGroupIds: [groupId],
    sourceWorkspaceId: 'workspace_default',
    activeWorkspaceId: 'workspace_default',
    selectionCurrent: true,
    filterCurrent: true,
    categorySnapshot: { showBin: false, category: 'inbox' },
    targetCategorySnapshot: { showBin: false, category: 'inbox' },
    targetFilterSnapshot: { searchQuery: '', tabFilterUrl: null },
  };
}

function Harness({
  category = 'inbox',
}: {
  category?: CategoryFilter;
}) {
  const query = useSearchQuery();
  const activeWorkspaceId = useTabBoardStore((state) => state.activeWorkspaceId);
  const groups = useTabBoardStore((state) => state.groups);
  const { highlightedGroupId, handleCaptureCompleted } = useCaptureReveal({
    activeWorkspaceId,
    groups,
    selectedCategory: category,
    showBin: false,
    searchQuery: query,
    tabFilterUrl: null,
    pageState,
    ...toast,
  });
  captureCompleted = handleCaptureCompleted;

  return createElement(WorkspaceContent, {
    category,
    workspaceName: 'Workspace',
    runtime,
    highlightedGroupId,
    onOpenSessionTargetPicker: vi.fn(),
    selectionScope,
  });
}

async function renderHarness(children: ReactNode = createElement(Harness)) {
  root = createRoot(container!);
  await act(async () => {
    root?.render(
      createElement(MantineProvider, null,
        createElement(ToastProvider, null,
          createElement(DestructiveConfirmationProvider, null,
            createElement(ManagerOverlaysProvider, null,
              createElement(DndContext, null, children),
              createElement(ManagerOverlayPortal),
            ),
          ),
        ),
      ),
    );
  });
}

function installState(groups: Group[]) {
  useTabBoardStore.setState({
    ...createEmptyState(),
    hydrated: true,
    activeWorkspaceId: 'workspace_default',
    groups,
  });
}

function targetSlot(groupId: string): HTMLElement {
  const slot = [...document.querySelectorAll<HTMLElement>('[data-session-slot-id]')]
    .find((element) => element.dataset.sessionSlotId === groupId) ?? null;
  expect(slot).not.toBeNull();
  if (!slot) throw new Error(`Missing slot ${groupId}`);
  return slot;
}

beforeEach(() => {
  vi.useFakeTimers();
  observers.length = 0;
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/manager.html');
  savedSearchQueryStore.set('');
  container = document.createElement('div');
  document.body.append(container);
  captureCompleted = null;
  pageState.replace.mockClear();
  pageState.setQuery.mockClear();
  Object.values(toast).forEach((mock) => mock.mockClear());
  const matchMedia = vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  vi.stubGlobal('IntersectionObserver', class {
    state: typeof observers[number];
    constructor(callback: IntersectionObserverCallback) {
      this.state = { callback, elements: new Set() };
      observers.push(this.state);
    }
    observe(element: Element) { this.state.elements.add(element); }
    unobserve(element: Element) { this.state.elements.delete(element); }
    disconnect() { this.state.elements.clear(); }
  });
  scrollIntoViewSpy = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewSpy,
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  savedSearchQueryStore.set('');
  window.history.replaceState(null, '', '/manager.html');
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useTabBoardStore.setState({ ...createEmptyState(), hydrated: false });
});

describe('capture reveal through stable session slots', () => {
  it('reveals a capture-completed offscreen shell through its stable slot and releases the retained card', async () => {
    const targetId = 'target.with[special]';
    const groups = Array.from({ length: 8 }, (_, index) =>
      makeGroup(index === 7 ? targetId : `group-${index}`, index));
    installState(groups);
    await renderHarness();

    const slot = targetSlot(targetId);
    expect(slot.querySelector(`#session-shell-${CSS.escape(targetId)}`)).not.toBeNull();
    expect(slot.querySelector(`#session-card-${CSS.escape(targetId)}`)).toBeNull();

    await act(async () => {
      captureCompleted?.(completionFor(targetId));
    });

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(slot);
    expect(scrollIntoViewSpy.mock.calls[0]?.[0]).toMatchObject({
      behavior: 'smooth',
      block: 'center',
    });
    expect(slot.querySelector(`#session-card-${CSS.escape(targetId)}`)).not.toBeNull();
    expect(slot.querySelector(`#session-shell-${CSS.escape(targetId)}`)).toBeNull();
    expect(pageState.replace).toHaveBeenCalledWith({ category: 'inbox', view: 'board' });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(slot.querySelector(`#session-card-${CSS.escape(targetId)}`)).toBeNull();
    expect(slot.querySelector(`#session-shell-${CSS.escape(targetId)}`)).not.toBeNull();
  });

  it('uses the same shell-first path for URL targetGroupId and keeps reduced-motion auto scrolling', async () => {
    const targetId = 'url-target[exact]';
    const groups = Array.from({ length: 8 }, (_, index) =>
      makeGroup(index === 7 ? targetId : `url-group-${index}`, index));
    installState(groups);
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.history.replaceState(null, '', `/manager.html?targetGroupId=${encodeURIComponent(targetId)}`);

    await renderHarness();

    const slot = targetSlot(targetId);
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(slot);
    expect(scrollIntoViewSpy.mock.calls[0]?.[0]).toMatchObject({
      behavior: 'auto',
      block: 'center',
    });
    expect(slot.querySelector(`#session-card-${CSS.escape(targetId)}`)).not.toBeNull();
    expect(pageState.setQuery).toHaveBeenCalledWith('');
    expect(pageState.replace).toHaveBeenCalledWith({ category: 'inbox', view: 'board' });
    expect(window.location.search).not.toContain('targetGroupId');
  });

  it('cancels pending reveal when the target group disappears before a slot exists', async () => {
    const targetId = 'removed-target';
    installState([makeGroup('kept', 0)]);
    await renderHarness();

    await act(async () => {
      captureCompleted?.(completionFor(targetId));
    });

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(toast.showSuccess).toHaveBeenCalled();
    expect(document.querySelector(`#session-card-${targetId}`)).toBeNull();
  });
});
