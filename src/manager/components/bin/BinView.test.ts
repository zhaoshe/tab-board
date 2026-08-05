// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { BinView } from './BinView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bin = [{
  id: 'bin-1',
  kind: 'group',
  label: 'Deleted Session',
  deletedAt: '2026-07-27T10:00:00.000Z',
  item: {},
}];

const harness = vi.hoisted(() => ({
  confirmBeforeDestructive: true,
  restoreFromBin: vi.fn(),
  deleteBinEntry: vi.fn(),
  clearBin: vi.fn(),
}));

vi.mock('../../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: (selector: (state: unknown) => unknown) => selector({
    bin,
    settings: {
      confirmBeforeDestructive: harness.confirmBeforeDestructive,
    },
    restoreFromBin: harness.restoreFromBin,
    deleteBinEntry: harness.deleteBinEntry,
    clearBin: harness.clearBin,
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  harness.confirmBeforeDestructive = true;
  harness.restoreFromBin.mockReset();
  harness.deleteBinEntry.mockReset();
  harness.clearBin.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

describe('BinView actions', () => {
  it('keeps the item icon decorative and names restore and permanent delete actions', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(MantineProvider, null, createElement(BinView)));
    });

    expect(document.querySelector('[data-testid="bin-item-icon"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.manager-bin-entry')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Restore Deleted Session"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Delete Deleted Session Permanently"]')).not.toBeNull();
  });

  it('deletes a Trash item directly when dangerous-operation confirmation is off', async () => {
    harness.confirmBeforeDestructive = false;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(MantineProvider, null, createElement(BinView)));
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>(
        '[aria-label="Delete Deleted Session Permanently"]',
      )?.click();
    });

    expect(harness.deleteBinEntry).toHaveBeenCalledWith('bin-1');
    expect(document.body.textContent).not.toContain('Are you sure you want to permanently delete');
  });

  it('empties Trash directly when dangerous-operation confirmation is off', async () => {
    harness.confirmBeforeDestructive = false;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(MantineProvider, null, createElement(BinView)));
    });

    const emptyTrash = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Empty Trash');
    await act(async () => emptyTrash?.click());

    expect(harness.clearBin).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain(
      'Are you sure you want to permanently delete all',
    );
  });
});
