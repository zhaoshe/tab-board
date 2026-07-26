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
  Tooltip: ({ children }: NativeProps) => children,
}));

vi.mock('@tabler/icons-react', () => {
  const Icon = () => null;
  return {
    IconKeyboard: Icon,
    IconSearch: Icon,
    IconX: Icon,
  };
});

vi.mock('../../hooks/useBoardProjection', () => ({
  useBoardProjection: () => ({
    workspaceId: 'workspace',
    categoryGroups: testHarness.categoryGroups,
    visibleGroups: testHarness.categoryGroups,
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
  vi.useRealTimers();
});

describe('SearchBar query lifecycle', () => {
  it('counts canonical category matches immediately before query debounce', async () => {
    await changeInput('needle');

    expect(container?.textContent).toContain('1 result');
    expect(savedSearchQueryStore.getSnapshot()).toBe('');
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
