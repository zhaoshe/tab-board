import { describe, expect, it } from 'vitest';
import {
  reduceSelectionScope,
  shouldExitForOpenTabsSource,
  shouldExitForSidebarCollapse,
  type SelectionScope,
} from './selectionScope';

describe('selection scope reducer', () => {
  it('clears the previous owner when entering a different scope', () => {
    const openTabs: SelectionScope = { kind: 'open-tabs', windowId: 7 };
    const firstSaved: SelectionScope = { kind: 'saved-tabs', groupId: 'group-a' };

    expect(reduceSelectionScope(openTabs, {
      type: 'enter-saved-tabs',
      groupId: 'group-a',
    })).toEqual({
      scope: firstSaved,
      clearedScope: openTabs,
    });
    expect(reduceSelectionScope(firstSaved, {
      type: 'enter-saved-tabs',
      groupId: 'group-b',
    })).toEqual({
      scope: { kind: 'saved-tabs', groupId: 'group-b' },
      clearedScope: firstSaved,
    });
    expect(reduceSelectionScope(firstSaved, {
      type: 'enter-open-tabs',
      windowId: 7,
    })).toEqual({
      scope: openTabs,
      clearedScope: firstSaved,
    });
  });

  it('preserves the active owner when re-entering the same scope', () => {
    const openTabs: SelectionScope = { kind: 'open-tabs', windowId: 7 };
    const savedTabs: SelectionScope = { kind: 'saved-tabs', groupId: 'group-a' };

    expect(reduceSelectionScope(openTabs, {
      type: 'enter-open-tabs',
      windowId: 7,
    })).toEqual({
      scope: openTabs,
      clearedScope: null,
    });
    expect(reduceSelectionScope(savedTabs, {
      type: 'enter-saved-tabs',
      groupId: 'group-a',
    })).toEqual({
      scope: savedTabs,
      clearedScope: null,
    });
  });

  it('exits the active scope and reports which owner must clear its IDs', () => {
    const savedTabs: SelectionScope = { kind: 'saved-tabs', groupId: 'group-a' };

    expect(reduceSelectionScope(savedTabs, { type: 'exit' })).toEqual({
      scope: null,
      clearedScope: savedTabs,
    });
    expect(reduceSelectionScope(null, { type: 'exit' })).toEqual({
      scope: null,
      clearedScope: null,
    });
  });

  it('exits any active scope when the sidebar transitions to collapsed', () => {
    expect(shouldExitForSidebarCollapse(
      { kind: 'saved-tabs', groupId: 'group-a' },
      false,
      true,
    )).toBe(true);
    expect(shouldExitForSidebarCollapse(
      { kind: 'open-tabs', windowId: 7 },
      true,
      true,
    )).toBe(false);
    expect(shouldExitForSidebarCollapse(null, false, true)).toBe(false);
  });

  it('exits Open Tabs only when its source window changes or disappears', () => {
    const openTabs: SelectionScope = { kind: 'open-tabs', windowId: 7 };

    expect(shouldExitForOpenTabsSource(openTabs, 8)).toBe(true);
    expect(shouldExitForOpenTabsSource(openTabs, null)).toBe(true);
    expect(shouldExitForOpenTabsSource(openTabs, 7)).toBe(false);
    expect(shouldExitForOpenTabsSource(
      { kind: 'saved-tabs', groupId: 'group-a' },
      8,
    )).toBe(false);
  });
});
