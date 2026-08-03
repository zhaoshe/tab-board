// @vitest-environment happy-dom
import {
  act,
  createElement,
  useEffect,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useManagerSelectionScope,
  type ManagerSelectionScope,
} from './useManagerSelectionScope';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let manager: ManagerSelectionScope | null = null;
let registerOpenTabsClear: ((clear: () => void) => () => void) | null = null;
let registerSavedTabsClear: ((
  groupId: string,
  clear: () => void,
) => () => void) | null = null;

function Probe(): null {
  const selection = useManagerSelectionScope();
  manager = selection;
  registerOpenTabsClear = selection.registerOpenTabsClear;
  registerSavedTabsClear = selection.registerSavedTabsClear;
  return null;
}

function SavedOwner({
  clear,
  groupId,
}: {
  clear: () => void;
  groupId: string;
}): null {
  useEffect(
    () => registerSavedTabsClear?.(groupId, clear),
    [clear, groupId],
  );
  return null;
}

beforeEach(async () => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  manager = null;
  registerOpenTabsClear = null;
  registerSavedTabsClear = null;
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Probe));
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
});

describe('useManagerSelectionScope', () => {
  it('clears Open Tabs before entering a saved group', async () => {
    const clearOpenTabs = vi.fn();
    registerOpenTabsClear?.(clearOpenTabs);

    await act(async () => {
      manager?.commands.enterOpenTabs(9);
      manager?.commands.enterSavedTabs('group-a');
    });

    expect(clearOpenTabs).toHaveBeenCalledTimes(1);
    expect(manager?.scope).toEqual({ kind: 'saved-tabs', groupId: 'group-a' });
  });

  it('clears the old saved group before entering another saved or Open Tabs scope', async () => {
    const clearFirstSaved = vi.fn();
    const clearSecondSaved = vi.fn();
    await act(async () => {
      root?.render(createElement(
        'div',
        null,
        createElement(Probe),
        createElement(SavedOwner, { clear: clearFirstSaved, groupId: 'group-a' }),
        createElement(SavedOwner, { clear: clearSecondSaved, groupId: 'group-b' }),
      ));
    });

    await act(async () => {
      manager?.commands.enterSavedTabs('group-a');
      manager?.commands.enterSavedTabs('group-b');
    });
    expect(clearFirstSaved).toHaveBeenCalledTimes(1);
    expect(clearSecondSaved).not.toHaveBeenCalled();

    await act(async () => {
      manager?.commands.enterOpenTabs(9);
    });
    expect(clearSecondSaved).toHaveBeenCalledTimes(1);
    expect(manager?.scope).toEqual({ kind: 'open-tabs', windowId: 9 });
  });

  it('keeps a scope active with zero IDs until explicit exit clears its owner', async () => {
    const clearOpenTabs = vi.fn();
    registerOpenTabsClear?.(clearOpenTabs);

    await act(async () => {
      manager?.commands.enterOpenTabs(9);
    });
    expect(manager?.scope).toEqual({ kind: 'open-tabs', windowId: 9 });

    await act(async () => {
      manager?.commands.exit();
    });
    expect(clearOpenTabs).toHaveBeenCalledTimes(1);
    expect(manager?.scope).toBeNull();
  });
});
