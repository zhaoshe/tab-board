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

vi.mock('../../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: (selector: (state: {
    activeWorkspaceId: string;
    workspaces: { id: string }[];
    folders: never[];
    groups: never[];
  }) => unknown) => selector({
    activeWorkspaceId: 'workspace',
    workspaces: [{ id: 'workspace' }],
    folders: [],
    groups: [],
  }),
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
