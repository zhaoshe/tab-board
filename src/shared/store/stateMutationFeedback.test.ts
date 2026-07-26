import { describe, expect, it } from 'vitest';
import type { Group, TabItem } from '../model';
import type { StateMutation } from './stateMutations';
import { feedbackForCommittedMutation } from './stateMutationFeedback';

const timestamp = '2026-01-01T00:00:00.000Z';

function tab(id: string): TabItem {
  return {
    id,
    itemType: 'link',
    title: id,
    url: `https://${id}.test`,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: 'none',
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function group(id: string, tabs: TabItem[] = []): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId: 'workspace-default',
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('feedbackForCommittedMutation', () => {
  it('maps a committed add-group mutation to save feedback', () => {
    const mutation: StateMutation = {
      type: 'add-group',
      group: group('Saved work', [tab('first'), tab('second')]),
      updatedAt: timestamp,
    };

    expect(feedbackForCommittedMutation(mutation)).toEqual({
      kind: 'save-succeeded',
      title: 'Saved work',
      tabCount: 2,
    });
  });

  it('maps committed imported groups to aggregate import feedback', () => {
    const mutation: StateMutation = {
      type: 'import-groups',
      groups: [
        group('First import', [tab('one')]),
        group('Second import', [tab('two'), tab('three')]),
      ],
      updatedAt: timestamp,
    };

    expect(feedbackForCommittedMutation(mutation)).toEqual({
      kind: 'import-succeeded',
      groupCount: 2,
      tabCount: 3,
    });
  });

  it('maps a committed group restore to group restore feedback', () => {
    const mutation: StateMutation = {
      type: 'restore-group',
      entryId: 'bin-group',
      group: group('Restored work', [tab('restored-one'), tab('restored-two')]),
      index: 0,
      updatedAt: timestamp,
    };

    expect(feedbackForCommittedMutation(mutation)).toEqual({
      kind: 'restore-succeeded',
      item: 'group',
      count: 2,
      label: 'Restored work',
    });
  });

  it('maps a committed tab restore to tab restore feedback', () => {
    const mutation: StateMutation = {
      type: 'restore-tab',
      entryId: 'bin-tab',
      groupId: 'target-group',
      tab: tab('Restored tab'),
      index: 1,
      updatedAt: timestamp,
    };

    expect(feedbackForCommittedMutation(mutation)).toEqual({
      kind: 'restore-succeeded',
      item: 'tab',
      count: 1,
      label: 'Restored tab',
    });
  });

  it('returns null for mutations without user feedback', () => {
    const mutation: StateMutation = {
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: timestamp,
    };

    expect(feedbackForCommittedMutation(mutation)).toBeNull();
  });
});
