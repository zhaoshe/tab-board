import { describe, expect, it } from 'vitest';
import type { OpenTabInfo } from '../openTabs';
import { MAX_OPERATION_ID_BYTES } from '../validation';
import {
  isDropIntentShape,
  isDropPayloadWithinLimits,
  isOpenTabInfoShape,
} from './drop-validation';

const openTab: OpenTabInfo = {
  id: 7,
  windowId: 3,
  title: 'Example',
  url: 'https://example.test',
  favIconUrl: 'https://example.test/favicon.ico',
  pinned: false,
  index: 0,
  browserGroup: null,
  storable: true,
  reason: null,
};

const intents = {
  moveSession: {
    kind: 'move-session',
    groupId: 'group-a',
    category: 'inbox',
    index: 0,
    workspaceId: 'workspace-a',
  },
  reorderCategory: {
    kind: 'reorder-category',
    categoryId: 'inbox',
    targetCategoryId: 'saved',
    placement: 'after',
    workspaceId: 'workspace-a',
    expectedCategoryOrder: ['inbox', 'saved', 'archive'],
  },
  moveTabs: {
    kind: 'move-tabs',
    refs: [{ groupId: 'group-a', tabId: 'tab-a' }],
    targetGroupId: 'group-b',
    targetIndex: 0,
    workspaceId: 'workspace-a',
  },
  copyOpenTabs: {
    kind: 'copy-open-tabs',
    tabIds: [7],
    windowId: 3,
    targetGroupId: 'group-b',
    targetIndex: 0,
    workspaceId: 'workspace-a',
  },
  createSavedSession: {
    kind: 'create-session',
    source: {
      kind: 'saved-tabs',
      refs: [{ groupId: 'group-a', tabId: 'tab-a' }],
    },
    category: 'folder:folder-a',
    index: 0,
    workspaceId: 'workspace-a',
  },
  createOpenSession: {
    kind: 'create-session',
    source: {
      kind: 'open-tabs',
      tabIds: [7],
      windowId: 3,
    },
    category: 'saved',
    index: 0,
    workspaceId: 'workspace-a',
  },
};

describe('shared drop validation', () => {
  it('accepts every complete DropIntent wire shape', () => {
    Object.values(intents).forEach((intent) => {
      expect(isDropIntentShape(intent)).toBe(true);
    });
  });

  it('rejects extra keys, malformed categories, IDs, placements, and indexes', () => {
    expect(isDropIntentShape({ ...intents.moveSession, extra: true })).toBe(false);
    expect(isDropIntentShape({ ...intents.moveSession, category: 'folder:' })).toBe(false);
    expect(isDropIntentShape({ ...intents.moveSession, groupId: '' })).toBe(false);
    expect(isDropIntentShape({ ...intents.moveSession, index: -1 })).toBe(false);
    expect(isDropIntentShape({
      ...intents.reorderCategory,
      placement: 'middle',
    })).toBe(false);
    const {
      expectedCategoryOrder: _expectedCategoryOrder,
      ...missingExpectedOrder
    } = intents.reorderCategory;
    expect(isDropIntentShape(missingExpectedOrder)).toBe(false);
    expect(isDropIntentShape({
      ...intents.reorderCategory,
      expectedCategoryOrder: ['inbox', 'inbox', 'archive'],
    })).toBe(false);
    const sparseOrder: unknown[] = [];
    sparseOrder[1] = 'inbox';
    expect(isDropIntentShape({
      ...intents.reorderCategory,
      expectedCategoryOrder: sparseOrder,
    })).toBe(false);
  });

  it('rejects sparse, duplicate, negative, and empty reference arrays', () => {
    const sparseRefs: unknown[] = [];
    sparseRefs[1] = { groupId: 'group-a', tabId: 'tab-a' };
    const sparseTabIds: unknown[] = [];
    sparseTabIds[1] = 7;

    expect(isDropIntentShape({
      ...intents.moveTabs,
      refs: sparseRefs,
    })).toBe(false);
    expect(isDropIntentShape({
      ...intents.moveTabs,
      refs: [],
    })).toBe(false);
    expect(isDropIntentShape({
      ...intents.copyOpenTabs,
      tabIds: [7, 7],
    })).toBe(false);
    expect(isDropIntentShape({
      ...intents.copyOpenTabs,
      tabIds: [-1],
    })).toBe(false);
    expect(isDropIntentShape({
      ...intents.copyOpenTabs,
      tabIds: sparseTabIds,
    })).toBe(false);
  });

  it('validates the complete bounded OpenTabInfo shape', () => {
    expect(isOpenTabInfoShape(openTab)).toBe(true);
    expect(isOpenTabInfoShape({ ...openTab, storable: 'yes' })).toBe(false);
    expect(isOpenTabInfoShape({ ...openTab, unexpected: true })).toBe(false);
    expect(isOpenTabInfoShape({ ...openTab, active: true })).toBe(false);
    expect(isOpenTabInfoShape({
      ...openTab,
      browserGroup: {
        sourceGroupId: 1,
        title: 'Group',
        color: 'blue',
        collapsed: false,
      },
    })).toBe(true);
  });

  it('enforces operation IDs, source-specific Open Tabs, and canonical payload limits', () => {
    expect(isDropPayloadWithinLimits(
      'copy-operation',
      intents.copyOpenTabs,
      [openTab],
    )).toBe(true);
    expect(isDropPayloadWithinLimits(
      'move-operation',
      intents.moveSession,
      [],
    )).toBe(true);
    expect(isDropPayloadWithinLimits(
      'move-operation',
      intents.moveSession,
      [openTab],
    )).toBe(false);
    expect(isDropPayloadWithinLimits(
      'x'.repeat(MAX_OPERATION_ID_BYTES + 1),
      intents.copyOpenTabs,
      [openTab],
    )).toBe(false);
    expect(isDropPayloadWithinLimits(
      'copy-operation',
      intents.copyOpenTabs,
      [{ ...openTab, title: 'x'.repeat(20_000) }],
    )).toBe(false);
  });
});
