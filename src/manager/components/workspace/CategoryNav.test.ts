// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CategoryStripItem } from '../../core/selectors';
import { CategoryNav } from './CategoryNav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const categories: CategoryStripItem[] = [
  { id: 'inbox', label: 'Inbox', count: 2, kind: 'inbox' },
  { id: 'saved', label: 'Saved', count: 1, kind: 'saved' },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const pointerListener = vi.fn();
const touchListener = vi.fn();
const keyboardListener = vi.fn();
const setActivatorNodeRef = vi.fn();
const draggableOptions: unknown[] = [];

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    useDraggable: (options: unknown) => {
      draggableOptions.push(options);
      return {
      attributes: {
        role: 'button',
        tabIndex: 0,
        'aria-roledescription': 'draggable',
      },
      listeners: {
        onKeyDown: keyboardListener,
        onPointerDown: pointerListener,
        onTouchStart: touchListener,
      },
      setActivatorNodeRef,
      setNodeRef: vi.fn(),
    };
    },
    useDroppable: () => ({
      isOver: false,
      setNodeRef: vi.fn(),
    }),
  };
});

async function mount(onSelect = vi.fn()): Promise<ReturnType<typeof vi.fn>> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      null,
      createElement(CategoryNav, {
        categories,
        workspaceId: 'workspace-a',
        selectedCategory: 'inbox',
        showBin: false,
        onSelect,
      }),
    ));
  });
  return onSelect;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  draggableOptions.length = 0;
  pointerListener.mockClear();
  touchListener.mockClear();
  keyboardListener.mockClear();
  setActivatorNodeRef.mockClear();
});

describe('CategoryNav direct drag', () => {
  it('uses each whole category tab as a typed pointer activator without a drag-handle stop', async () => {
    await mount();

    expect(document.querySelectorAll('[data-category-trigger="label"]'))
      .toHaveLength(2);
    expect(document.querySelectorAll('[data-category-drag-handle]'))
      .toHaveLength(0);
    expect(document.querySelectorAll('[data-category-column]'))
      .toHaveLength(2);
    expect(document.querySelectorAll('[data-category-reorder-target]'))
      .toHaveLength(4);
    expect(draggableOptions).toEqual(categories.map((item) => ({
      id: `category-${item.id}`,
      data: {
        type: 'category',
        dnd: {
          payload: {
            kind: 'category',
            categoryId: item.id,
            workspaceId: 'workspace-a',
          },
        },
      },
    })));
    expect(setActivatorNodeRef).toHaveBeenCalledTimes(2);
  });

  it('routes mouse and touch to separate sensors without keyboard drag attributes', async () => {
    await mount();
    const saved = document.querySelector<HTMLButtonElement>(
      '[data-category-id="saved"]',
    );
    if (!saved) throw new Error('Missing Saved category tab.');

    await act(async () => {
      saved.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      saved.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'touch',
      }));
      saved.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));
      saved.dispatchEvent(new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
      }));
    });

    expect(pointerListener).toHaveBeenCalledTimes(1);
    expect(touchListener).toHaveBeenCalledTimes(1);
    expect(keyboardListener).not.toHaveBeenCalled();
    expect(saved.getAttribute('aria-roledescription')).toBeNull();
    expect(saved.getAttribute('role')).toBeNull();
  });

  it('keeps ordinary click navigation on the same tab control', async () => {
    const onSelect = await mount();
    const saved = document.querySelector<HTMLButtonElement>(
      '[data-category-id="saved"]',
    );

    await act(async () => saved?.click());

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('saved');
  });
});
