// @vitest-environment happy-dom
import {
  act,
  createElement,
  forwardRef,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savedSearchQueryStore } from '../../hooks/useSearchQuery';
import { SearchBar } from './SearchBar';
import * as selectors from '../../core/selectors';

const testHarness = vi.hoisted(() => ({
  categoryGroups: [] as Array<{
    id: string;
    title: string;
    note: string;
    workspaceId: string;
    folderId: string | null;
    locked: boolean;
    starred: boolean;
    archived: boolean;
    collapsed: boolean;
    tabs: never[];
    createdAt: string;
    updatedAt: string;
  }>,
}));

type NativeProps = {
  children?: ReactNode;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  onChange?: (event: { currentTarget: HTMLInputElement }) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  value?: string;
  [key: string]: unknown;
};

vi.mock('@mantine/core', () => ({
  ActionIcon: ({ children, ...props }: NativeProps) =>
    createElement('button', props, children),
  Badge: ({ children, ...props }: NativeProps) =>
    createElement('span', props, children),
  TextInput: forwardRef<HTMLInputElement, NativeProps>(function TextInput({
    leftSection: _leftSection,
    rightSection,
    rightSectionPointerEvents: _rightSectionPointerEvents,
    ...props
  }, ref) {
    return createElement(
      'div',
      null,
      createElement('input', { ...props, ref }),
      rightSection as ReactNode,
    );
  }),
  Tooltip: forwardRef<HTMLDivElement, NativeProps>(function Tooltip(
    { children },
    ref,
  ) {
    return createElement('div', { ref }, children as ReactNode);
  }),
}));

vi.mock('../../hooks/useBoardProjection', () => ({
  useBoardProjection: () => ({
    workspaceId: 'workspace',
    categoryGroups: testHarness.categoryGroups,
    visibleGroups: testHarness.categoryGroups.filter(group => group.title.toLowerCase().includes(savedSearchQueryStore.getSnapshot().toLowerCase())),
    searchQuery: savedSearchQueryStore.getSnapshot(),
  }),
}));

vi.mock('../../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: () => {
    throw new Error('SearchBar must consume useBoardProjection.');
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function input(): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>('input');
  if (!element) throw new Error('Search input was not rendered.');
  return element;
}

async function changeInput(value: string): Promise<void> {
  await act(async () => {
    const element = input();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  vi.useFakeTimers();
  sessionStorage.clear();
  savedSearchQueryStore.set('');
  testHarness.categoryGroups = [{
    id: 'matching',
    title: 'Needle session',
    note: '',
    workspaceId: 'workspace',
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }, {
    id: 'hidden',
    title: 'Hidden session',
    note: '',
    workspaceId: 'workspace',
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(SearchBar));
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  savedSearchQueryStore.set('');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SearchBar query lifecycle', () => {
  it('exposes a durable form name, label, autocomplete policy, and ellipsis placeholder', () => {
    expect(input().name).toBe('saved-session-search');
    expect(input().getAttribute('aria-label')).toBe('Search Saved Sessions');
    expect(input().autocomplete).toBe('off');
    expect(input().placeholder).toBe('Search sessions, tabs, URLs, notes…');
  });

  it('counts the published query after debounce and indicates pending input without rescanning', async () => {
    const scan = vi.spyOn(selectors, 'filterGroupsByQuery');
    await changeInput('needle');

    expect(container?.textContent).toContain('Updating…');
    expect(container?.textContent).not.toContain('1 result');
    expect(savedSearchQueryStore.getSnapshot()).toBe('');
    expect(scan).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(150));
    expect(container?.textContent).toContain('1 result');
    expect(container?.textContent).not.toContain('Updating…');
    expect(scan).not.toHaveBeenCalled();
  });

  it('publishes user input only after the 150 ms debounce', async () => {
    await changeInput('local');

    await act(async () => vi.advanceTimersByTime(149));
    expect(savedSearchQueryStore.getSnapshot()).toBe('');

    await act(async () => vi.advanceTimersByTime(1));
    expect(savedSearchQueryStore.getSnapshot()).toBe('local');
  });

  it('synchronizes imperative external updates into the local input', async () => {
    await act(async () => {
      savedSearchQueryStore.set('external');
    });

    expect(input().value).toBe('external');
  });

  it('does not let a stale local debounce overwrite a newer external query', async () => {
    await changeInput('stale-local');
    await act(async () => vi.advanceTimersByTime(100));

    await act(async () => {
      savedSearchQueryStore.set('external');
    });
    await act(async () => vi.advanceTimersByTime(100));

    expect(input().value).toBe('external');
    expect(savedSearchQueryStore.getSnapshot()).toBe('external');
  });
});

it('clears pending input immediately and never republishes it', async () => {
  await changeInput('needle');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Clear Search"]')?.click());
  expect(input().value).toBe('');
  expect(savedSearchQueryStore.getSnapshot()).toBe('');
  expect(container?.textContent).not.toContain('Updating');
  await act(async () => vi.advanceTimersByTime(150));
  expect(savedSearchQueryStore.getSnapshot()).toBe('');
});

it('closes pending input immediately and never republishes it', async () => {
  const onEscape = vi.fn();
  await act(async () => root?.render(createElement(SearchBar, { onEscape })));
  await changeInput('needle');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close Search"]')?.click());
  expect(onEscape).toHaveBeenCalledOnce();
  expect(input().value).toBe('');
  expect(savedSearchQueryStore.getSnapshot()).toBe('');
  await act(async () => vi.advanceTimersByTime(150));
  expect(savedSearchQueryStore.getSnapshot()).toBe('');
});

it('scans bookmark counts only for the final published query', async () => {
  const scan = vi.spyOn(selectors, 'filterGroupsByQuery');
  await act(async () => root?.render(createElement(SearchBar, { category: 'bookmarks', bookmarkGroups: testHarness.categoryGroups })));
  await changeInput('need');
  await act(async () => vi.advanceTimersByTime(100));
  await changeInput('needle');
  expect(scan).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(150));
  expect(scan).toHaveBeenCalledOnce();
  expect(scan.mock.calls[0]?.[1]).toBe('needle');
  expect(container?.textContent).toContain('1 result');
});
