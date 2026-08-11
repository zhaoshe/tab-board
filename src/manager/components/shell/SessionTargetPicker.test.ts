// @vitest-environment happy-dom
import {
  act,
  createElement,
  useState,
  type ComponentProps,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { DndContext } from '@dnd-kit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyState,
  type Group,
  type TabBoardState,
  type TabItem,
} from '../../../shared/model';
import { DestructiveConfirmationProvider } from '../../../shared/components/DestructiveConfirmation';
import { managerTheme } from '../../../shared/styles/theme';
import { SessionCard } from '../sessions/SessionCard';
import {
  ManagerOverlayPortal,
  ManagerOverlaysProvider,
} from '../../hooks/useManagerOverlays';
import { ToastProvider } from '../../hooks/useToast';
import type { ManagerRuntime } from '../../hooks/useManagerRuntime';
import {
  createSessionTargetChoices,
  createSessionTargetChoiceLabels,
  createSessionTargetIntent,
  sessionTargetChoiceKey,
  SessionTargetPicker,
  type OpenSessionTargetPickerInput,
  type SessionTargetChoice,
} from './SessionTargetPicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = '2026-08-01T00:00:00.000Z';

function tab(id: string): TabItem {
  return {
    id,
    itemType: 'link',
    title: id,
    url: `https://${id}.example/`,
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

function group(
  id: string,
  overrides: Partial<Group> = {},
): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId: 'workspace_default',
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [tab(`${id}-tab`)],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function targetState(groups: Group[]): TabBoardState {
  const empty = createEmptyState();
  return {
    ...empty,
    workspaces: [
      ...empty.workspaces,
      {
        id: 'workspace-other',
        name: 'Other',
        emoji: 'O',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    folders: [{
      id: 'research',
      name: 'Research',
      color: 'blue',
      workspaceId: 'workspace_default',
      collapsed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    groups,
    categoryOrderByWorkspace: {
      workspace_default: ['saved', 'inbox', 'folder:research', 'archive'],
    },
  };
}

describe('Session target choice generation', () => {
  it('orders eligible Existing and every legal New position by canonical category/session order', () => {
    const source = group('source', {
      tabs: [tab('source-a'), tab('source-b')],
    });
    const saved = group('saved-target', { starred: true });
    const inbox = group('inbox-target');
    const research = group('research-target', { folderId: 'research' });
    const state = targetState([inbox, source, research, saved]);

    const choices = createSessionTargetChoices({
      mode: 'move-saved-tabs',
      state,
      workspaceId: 'workspace_default',
      source: {
        kind: 'saved-tabs',
        refs: [{ groupId: source.id, tabId: 'source-a' }],
      },
    });

    expect(choices).toEqual([
      { kind: 'new-session', category: 'saved', index: 0 },
      {
        kind: 'existing-session',
        groupId: saved.id,
        category: 'saved',
        index: saved.tabs.length,
      },
      { kind: 'new-session', category: 'saved', index: 1 },
      { kind: 'new-session', category: 'inbox', index: 0 },
      {
        kind: 'existing-session',
        groupId: inbox.id,
        category: 'inbox',
        index: inbox.tabs.length,
      },
      { kind: 'new-session', category: 'inbox', index: 1 },
      {
        kind: 'existing-session',
        groupId: source.id,
        category: 'inbox',
        index: 1,
      },
      { kind: 'new-session', category: 'inbox', index: 2 },
      { kind: 'new-session', category: 'folder:research', index: 0 },
      {
        kind: 'existing-session',
        groupId: research.id,
        category: 'folder:research',
        index: research.tabs.length,
      },
      { kind: 'new-session', category: 'folder:research', index: 1 },
      { kind: 'new-session', category: 'archive', index: 0 },
    ]);
  });

  it('removes locked, cross-workspace, and semantic no-op Existing choices', () => {
    const source = group('source', {
      tabs: [tab('source-a'), tab('source-b')],
    });
    const locked = group('locked-target', { locked: true });
    const crossWorkspace = group('cross-target', {
      workspaceId: 'workspace-other',
    });
    const eligible = group('eligible-target');
    const state = targetState([source, locked, crossWorkspace, eligible]);

    const choices = createSessionTargetChoices({
      mode: 'move-saved-tabs',
      state,
      workspaceId: 'workspace_default',
      source: {
        kind: 'saved-tabs',
        refs: [{ groupId: source.id, tabId: 'source-b' }],
      },
    });
    const existingIds = choices.flatMap((choice) =>
      choice.kind === 'existing-session' && choice.groupId
        ? [choice.groupId]
        : []);

    expect(existingIds).toEqual([eligible.id]);
    expect(existingIds).not.toContain(source.id);
    expect(existingIds).not.toContain(locked.id);
    expect(existingIds).not.toContain(crossWorkspace.id);
  });

  it('suppresses every New choice for Saved All Source Tabs but keeps eligible Existing merge targets', () => {
    const source = group('source', {
      tabs: [tab('source-a'), tab('source-b')],
    });
    const target = group('eligible-target');
    const state = targetState([source, target]);

    const choices = createSessionTargetChoices({
      mode: 'move-saved-tabs',
      state,
      workspaceId: 'workspace_default',
      source: {
        kind: 'saved-tabs',
        refs: source.tabs.map(({ id }) => ({ groupId: source.id, tabId: id })),
      },
    });

    expect(choices).toEqual([{
      kind: 'existing-session',
      groupId: target.id,
      category: 'inbox',
      index: target.tabs.length,
    }]);
  });

  it('keeps an eligible All Source Existing target before an unrelated locked sibling', () => {
    const source = group('source', {
      tabs: [tab('source-a'), tab('source-b'), tab('source-c')],
    });
    const target = group('eligible-target');
    const lockedSibling = group('unrelated-locked', { locked: true });
    const state = targetState([source, target, lockedSibling]);

    const choices = createSessionTargetChoices({
      mode: 'move-saved-tabs',
      state,
      workspaceId: 'workspace_default',
      source: {
        kind: 'saved-tabs',
        refs: source.tabs.map(({ id }) => ({ groupId: source.id, tabId: id })),
      },
    });

    expect(choices).toEqual([{
      kind: 'existing-session',
      groupId: target.id,
      category: 'inbox',
      index: target.tabs.length,
    }]);
  });

  it('never applies All Source suppression to Open Tabs', () => {
    const target = group('eligible-target');
    const state = targetState([target]);
    const record = {
      id: 41,
      windowId: 7,
      title: 'Open tab',
      url: 'https://open.example/',
      favIconUrl: '',
      pinned: false,
      index: 0,
      browserGroup: null,
      storable: true,
      reason: null,
    };

    const choices = createSessionTargetChoices({
      mode: 'save-open-tabs',
      state,
      workspaceId: 'workspace_default',
      source: {
        kind: 'open-tabs',
        tabIds: [record.id],
        windowId: record.windowId,
        records: [record],
      },
    });

    expect(choices.some(({ kind }) => kind === 'new-session')).toBe(true);
    expect(choices).toContainEqual({
      kind: 'existing-session',
      groupId: target.id,
      category: 'inbox',
      index: target.tabs.length,
    });
  });

  it('maps Saved/Open Existing/New commits to the authoritative DropIntent schema', () => {
    const existing: SessionTargetChoice = {
      kind: 'existing-session',
      groupId: 'target',
      category: 'inbox',
      index: 3,
    };
    const created: SessionTargetChoice = {
      kind: 'new-session',
      category: 'folder:research',
      index: 2,
    };

    expect(createSessionTargetIntent({
      mode: 'move-saved-tabs',
      choice: existing,
      workspaceId: 'workspace_default',
      source: {
        kind: 'saved-tabs',
        refs: [{ groupId: 'source', tabId: 'saved-a' }],
      },
    })).toEqual({
      kind: 'move-tabs',
      refs: [{ groupId: 'source', tabId: 'saved-a' }],
      targetGroupId: 'target',
      targetIndex: 3,
      workspaceId: 'workspace_default',
    });
    expect(createSessionTargetIntent({
      mode: 'move-saved-tabs',
      choice: created,
      workspaceId: 'workspace_default',
      source: {
        kind: 'saved-tabs',
        refs: [{ groupId: 'source', tabId: 'saved-a' }],
      },
    })).toEqual({
      kind: 'create-session',
      source: {
        kind: 'saved-tabs',
        refs: [{ groupId: 'source', tabId: 'saved-a' }],
      },
      category: 'folder:research',
      index: 2,
      workspaceId: 'workspace_default',
    });
    expect(createSessionTargetIntent({
      mode: 'save-open-tabs',
      choice: existing,
      workspaceId: 'workspace_default',
      source: { kind: 'open-tabs', tabIds: [41, 42], windowId: 7, records: [] },
    })).toEqual({
      kind: 'copy-open-tabs',
      tabIds: [41, 42],
      windowId: 7,
      targetGroupId: 'target',
      targetIndex: 3,
      workspaceId: 'workspace_default',
    });
    expect(createSessionTargetIntent({
      mode: 'save-open-tabs',
      choice: created,
      workspaceId: 'workspace_default',
      source: { kind: 'open-tabs', tabIds: [41, 42], windowId: 7, records: [] },
    })).toEqual({
      kind: 'create-session',
      source: { kind: 'open-tabs', tabIds: [41, 42], windowId: 7 },
      category: 'folder:research',
      index: 2,
      workspaceId: 'workspace_default',
    });
  });

  it('builds human Session and Category labels with before/between/after semantics', () => {
    const first = group('opaque-first', { title: 'Daily Briefing' });
    const second = group('opaque-second', { title: 'Research Queue' });
    const research = group('opaque-research', {
      title: 'Reading List',
      folderId: 'research',
    });
    const state = targetState([first, second, research]);
    const choices: SessionTargetChoice[] = [
      {
        kind: 'existing-session',
        groupId: second.id,
        category: 'inbox',
        index: second.tabs.length,
      },
      { kind: 'new-session', category: 'inbox', index: 0 },
      { kind: 'new-session', category: 'inbox', index: 1 },
      { kind: 'new-session', category: 'inbox', index: 2 },
      { kind: 'new-session', category: 'folder:research', index: 1 },
      { kind: 'new-session', category: 'archive', index: 0 },
    ];

    expect(createSessionTargetChoiceLabels({
      state,
      workspaceId: 'workspace_default',
      choices,
    })).toEqual(new Map([
      ['existing-session:opaque-second', 'Research Queue'],
      ['new-session:inbox:0', 'New Session before Daily Briefing in Inbox'],
      [
        'new-session:inbox:1',
        'New Session between Daily Briefing and Research Queue in Inbox',
      ],
      ['new-session:inbox:2', 'New Session after Research Queue in Inbox'],
      [
        'new-session:folder:research:1',
        'New Session after Reading List in Research',
      ],
      ['new-session:archive:0', 'New Session in Archive'],
    ]));
  });

  it.each([
    {
      sourceId: 'first',
      indexes: [1, 2],
      labels: ['After Middle Session in Inbox', 'After Last Session in Inbox'],
    },
    {
      sourceId: 'middle',
      indexes: [0, 2],
      labels: ['Before First Session in Inbox', 'After Last Session in Inbox'],
    },
    {
      sourceId: 'last',
      indexes: [0, 1],
      labels: ['Before First Session in Inbox', 'After First Session in Inbox'],
    },
  ])('excludes only the same-category no-op for a $sourceId source', ({
    sourceId,
    indexes,
    labels,
  }) => {
    const state = targetState([
      group('first', { title: 'First Session' }),
      group('middle', { title: 'Middle Session' }),
      group('last', { title: 'Last Session' }),
    ]);
    const choices = createSessionTargetChoices({
      mode: 'move-session-category',
      state,
      workspaceId: 'workspace_default',
      source: { kind: 'session', groupId: sourceId },
    });
    const inboxChoices = choices.filter((choice) =>
      choice.kind === 'session-position' && choice.category === 'inbox');
    const choiceLabels = createSessionTargetChoiceLabels({
      state,
      workspaceId: 'workspace_default',
      choices: inboxChoices,
    });

    expect(inboxChoices.map(({ index }) => index)).toEqual(indexes);
    expect(inboxChoices.map((choice) =>
      choiceLabels.get(sessionTargetChoiceKey(choice)))).toEqual(labels);
  });

  it('offers every cross-category boundary and one First position for an empty category', () => {
    const source = group('opaque-source', { title: 'Source Session' });
    const savedFirst = group('opaque-saved-first', {
      title: 'Saved First',
      starred: true,
    });
    const savedLast = group('opaque-saved-last', {
      title: 'Saved Last',
      starred: true,
    });
    const state = targetState([source, savedFirst, savedLast]);

    const choices = createSessionTargetChoices({
      mode: 'move-session-category',
      state,
      workspaceId: 'workspace_default',
      source: { kind: 'session', groupId: source.id },
    });
    const sessionChoices = choices.filter(({ kind }) =>
      kind === 'session-position');
    const labels = createSessionTargetChoiceLabels({
      state,
      workspaceId: 'workspace_default',
      choices: sessionChoices,
    });
    const savedChoices = sessionChoices.filter(({ category }) =>
      category === 'saved');
    const researchChoices = sessionChoices.filter(({ category }) =>
      category === 'folder:research');

    expect(savedChoices).toEqual([
      {
        kind: 'session-position',
        groupId: source.id,
        category: 'saved',
        index: 0,
      },
      {
        kind: 'session-position',
        groupId: source.id,
        category: 'saved',
        index: 1,
      },
      {
        kind: 'session-position',
        groupId: source.id,
        category: 'saved',
        index: 2,
      },
    ]);
    expect(savedChoices.map((choice) =>
      labels.get(sessionTargetChoiceKey(choice)))).toEqual([
      'Before Saved First in Saved',
      'After Saved First in Saved',
      'After Saved Last in Saved',
    ]);
    expect(researchChoices).toEqual([{
      kind: 'session-position',
      groupId: source.id,
      category: 'folder:research',
      index: 0,
    }]);
    expect(labels.get(sessionTargetChoiceKey(researchChoices[0]!)))
      .toBe('First in Research');
  });

  it('rejects locked, missing, and cross-workspace whole-session sources', () => {
    const locked = group('locked-source', { locked: true });
    const crossWorkspace = group('cross-source', {
      workspaceId: 'workspace-other',
    });
    const state = targetState([locked, crossWorkspace]);

    for (const groupId of [
      locked.id,
      'missing-source',
      crossWorkspace.id,
    ]) {
      expect(createSessionTargetChoices({
        mode: 'move-session-category',
        state,
        workspaceId: 'workspace_default',
        source: { kind: 'session', groupId },
      })).toEqual([]);
    }
  });

  it('rejects every mode, source, and choice mismatch', () => {
    const state = targetState([group('source')]);
    const savedSource = {
      kind: 'saved-tabs' as const,
      refs: [{ groupId: 'source', tabId: 'source-tab' }],
    };
    const sessionSource = { kind: 'session' as const, groupId: 'source' };
    const existingChoice: SessionTargetChoice = {
      kind: 'existing-session',
      groupId: 'target',
      category: 'inbox',
      index: 0,
    };
    const sessionChoice = {
      kind: 'session-position' as const,
      groupId: 'source',
      category: 'saved' as const,
      index: 0,
    };

    expect(createSessionTargetChoices({
      mode: 'move-saved-tabs',
      state,
      workspaceId: 'workspace_default',
      source: sessionSource,
    })).toEqual([]);
    expect(createSessionTargetChoices({
      mode: 'move-session-category',
      state,
      workspaceId: 'workspace_default',
      source: savedSource,
    })).toEqual([]);
    expect(createSessionTargetIntent({
      mode: 'move-session-category',
      choice: existingChoice,
      workspaceId: 'workspace_default',
      source: sessionSource,
    })).toBeNull();
    expect(createSessionTargetIntent({
      mode: 'move-saved-tabs',
      choice: sessionChoice,
      workspaceId: 'workspace_default',
      source: sessionSource,
    })).toBeNull();
    expect(createSessionTargetIntent({
      mode: 'move-saved-tabs',
      choice: sessionChoice,
      workspaceId: 'workspace_default',
      source: savedSource,
    })).toBeNull();
    expect(createSessionTargetIntent({
      mode: 'move-session-category',
      choice: sessionChoice,
      workspaceId: 'workspace_default',
      source: savedSource,
    })).toBeNull();
  });

  it('maps a named whole-session position to the existing move-session wire', () => {
    const choice = {
      kind: 'session-position' as const,
      groupId: 'source-session',
      category: 'folder:research' as const,
      index: 2,
    };

    expect(sessionTargetChoiceKey(choice))
      .toBe('session-position:source-session:folder:research:2');
    expect(createSessionTargetIntent({
      mode: 'move-session-category',
      choice,
      workspaceId: 'workspace_default',
      source: { kind: 'session', groupId: 'source-session' },
    })).toEqual({
      kind: 'move-session',
      groupId: 'source-session',
      category: 'folder:research',
      index: 2,
      workspaceId: 'workspace_default',
    });
  });
});

const pickerChoices: SessionTargetChoice[] = [
  {
    kind: 'existing-session',
    groupId: 'target-session',
    category: 'inbox',
    index: 2,
  },
  { kind: 'new-session', category: 'inbox', index: 1 },
];
const sessionPickerChoices: SessionTargetChoice[] = [
  {
    kind: 'session-position',
    groupId: 'source-session',
    category: 'inbox',
    index: 0,
  },
  {
    kind: 'session-position',
    groupId: 'source-session',
    category: 'saved',
    index: 1,
  },
];
const sessionPickerLabels = new Map([
  [
    'session-position:source-session:inbox:0',
    'Before Alpha Session in Inbox',
  ],
  [
    'session-position:source-session:saved:1',
    'After Saved Session in Saved',
  ],
]);
const runtimeStub: ManagerRuntime = {
  openSavedTab: vi.fn(async () => undefined),
  openSavedTabs: vi.fn(async () => undefined),
  refreshSavedTabTitle: vi.fn(async () => 'Refreshed title'),
  refreshSavedGroupTitles: vi.fn(async () => ({ refreshed: 0, failed: 0 })),
  restoreGroup: vi.fn(async () => undefined),
  restoreTab: vi.fn(async () => undefined),
  restoreTabs: vi.fn(async () => ({ restoredTabs: 0, outcomes: [] })),
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function PickerHarness({
  mode = 'move-saved-tabs',
  choices = pickerChoices,
  choiceLabels = new Map([
    ['existing-session:target-session', 'Research Queue'],
    ['new-session:inbox:1', 'New Session after Research Queue in Inbox'],
  ]),
  onPreview = vi.fn(),
  onCancel = vi.fn(),
  onCommit = vi.fn(async () => undefined),
}: Partial<ComponentProps<typeof SessionTargetPicker>>) {
  const [opened, setOpened] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);
  return createElement(
    'div',
    null,
    showTrigger
      ? createElement('button', {
          type: 'button',
          id: 'picker-trigger',
          onClick: () => setOpened(true),
        }, 'Open Target Picker')
      : null,
    createElement('button', {
      type: 'button',
      className: 'session-card',
      id: 'surviving-session',
    }, 'Surviving Session'),
    createElement(SessionTargetPicker, {
      opened,
      mode,
      choices,
      choiceLabels,
      onPreview,
      onCancel: () => {
        onCancel();
        setOpened(false);
      },
      onCommit: async (choice) => {
        await onCommit(choice);
        setShowTrigger(false);
        setOpened(false);
      },
    }),
  );
}

function SessionCardCommandHarness({
  locked,
  onOpen,
}: {
  locked: boolean;
  onOpen?: (input: OpenSessionTargetPickerInput) => void;
}) {
  const [picker, setPicker] = useState<OpenSessionTargetPickerInput | null>(null);
  const source = group('source-session', {
    locked,
    tabs: [],
    title: 'Source Session',
  });
  const openPicker = onOpen
    ? (input: OpenSessionTargetPickerInput) => {
        onOpen(input);
        input.trigger.focus();
        setPicker(input);
      }
    : undefined;
  return createElement(
    DndContext,
    null,
    createElement(
      ToastProvider,
      null,
      createElement(
        DestructiveConfirmationProvider,
        null,
        createElement(
          ManagerOverlaysProvider,
          {
            groupItems: [source],
            children: [
              createElement(
                'div',
                { className: 'manager-board', key: 'board' },
                createElement(SessionCard, {
                  group: source,
                  runtime: runtimeStub,
                  onOpenSessionTargetPicker: openPicker,
                }),
              ),
              createElement(SessionTargetPicker, {
                key: 'picker',
                opened: picker !== null,
                mode: picker?.mode ?? 'move-session-category',
                choices: sessionPickerChoices,
                choiceLabels: sessionPickerLabels,
                onPreview: vi.fn(),
                onCancel: () => setPicker(null),
                onCommit: () => setPicker(null),
              }),
              createElement(ManagerOverlayPortal, { key: 'portal' }),
            ],
          },
        ),
      ),
    ),
  );
}

async function mountPicker(
  overrides: Partial<ComponentProps<typeof SessionTargetPicker>> = {},
) {
  container = document.createElement('div');
  container.id = 'manager-main';
  document.body.append(container);
  root = createRoot(container);
  const props = {
    onPreview: vi.fn(),
    onCancel: vi.fn(),
    onCommit: vi.fn(async () => undefined),
    ...overrides,
  };
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme: managerTheme },
      createElement(PickerHarness, props),
    ));
  });
  const trigger = document.querySelector<HTMLButtonElement>('#picker-trigger')!;
  trigger.focus();
  await act(async () => trigger.click());
  return { ...props, trigger };
}

async function mountSessionCardCommand({
  locked = false,
  onOpen,
}: {
  locked?: boolean;
  onOpen?: (input: OpenSessionTargetPickerInput) => void;
} = {}) {
  container = document.createElement('div');
  container.id = 'manager-main';
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme: managerTheme },
      createElement(SessionCardCommandHarness, { locked, onOpen }),
    ));
  });
  const more = container.querySelector<HTMLButtonElement>(
    '.session-card button[aria-label="More"]',
  );
  if (!more) throw new Error('Missing Session More action.');
  await act(async () => more.click());
  const move = [...document.querySelectorAll<HTMLButtonElement>(
    '[role="menuitem"]',
  )].find((item) => item.textContent?.trim() === 'Move Session');
  if (!move) throw new Error('Missing Move Session command.');
  return { more, move };
}

async function rerenderPicker(
  props: Partial<ComponentProps<typeof SessionTargetPicker>>,
): Promise<void> {
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme: managerTheme },
      createElement(PickerHarness, props),
    ));
  });
}

function selectedChoice(): HTMLElement {
  const selected = document.querySelector<HTMLElement>(
    '[role="option"][aria-selected="true"]',
  );
  if (!selected) throw new Error('Missing selected target choice.');
  return selected;
}

async function press(key: string): Promise<void> {
  await act(async () => {
    if (!(document.activeElement instanceof HTMLElement)) {
      throw new Error('Missing active picker element.');
    }
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    }));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

describe('SessionTargetPicker interaction', () => {
  it.each([
    ['missing picker owner', false, undefined],
    ['locked source', true, vi.fn()],
  ])('disables Move Session for a %s', async (_label, locked, onOpen) => {
    const { move } = await mountSessionCardCommand({ locked, onOpen });

    expect(move.disabled).toBe(true);
    await act(async () => move.click());
    if (onOpen) expect(onOpen).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('hands an enabled Move Session command to the picker and restores its exact trigger', async () => {
    const onOpen = vi.fn();
    const { more, move } = await mountSessionCardCommand({ onOpen });

    expect(move.disabled).toBe(false);
    await act(async () => {
      move.focus();
      move.click();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'move-session-category',
      source: { kind: 'session', groupId: 'source-session' },
      trigger: more,
    }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(selectedChoice());

    await press('Escape');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(more);
  });

  it('body-portals and previews Arrow key choices through one aria-live region', async () => {
    const { onPreview } = await mountPicker();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');

    expect(dialog).not.toBeNull();
    expect(container?.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog?.closest('[data-portal]')?.parentElement).toBe(document.body);
    expect(selectedChoice().dataset.choiceGroupId).toBe('target-session');
    expect(selectedChoice().textContent).toContain('Research Queue');
    expect(selectedChoice().getAttribute('aria-label')).toBe('Research Queue');
    expect(selectedChoice().textContent).not.toContain('target-session');
    expect(document.activeElement).toBe(selectedChoice());

    await press('ArrowDown');

    expect(selectedChoice().dataset.choiceKind).toBe('new-session');
    expect(selectedChoice().textContent)
      .toContain('New Session after Research Queue in Inbox');
    expect(selectedChoice().getAttribute('aria-label'))
      .toBe('New Session after Research Queue in Inbox');
    expect(onPreview).toHaveBeenLastCalledWith(pickerChoices[1]);
    expect(document.querySelector('[aria-live="polite"]')?.textContent)
      .toContain('Preview');
  });

  it('focuses a safe command when there are no eligible targets', async () => {
    await mountPicker({
      choices: [],
      choiceLabels: new Map(),
    });

    expect(document.querySelector('[role="option"]')).toBeNull();
    expect([
      'Cancel',
      'Close Move Selected Items To',
    ]).toContain(
      document.activeElement?.textContent?.trim()
        || document.activeElement?.getAttribute('aria-label'),
    );
  });

  it.each(['Enter', ' '])('commits the preview with %s and restores surviving fallback focus', async (key) => {
    const { onCommit } = await mountPicker();
    await press('ArrowDown');
    await press(key);

    expect(onCommit).toHaveBeenCalledWith(pickerChoices[1]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement?.id).toBe('surviving-session');
  });

  it('cancels on Escape without committing and returns focus to the trigger', async () => {
    const { onCancel, onCommit, trigger } = await mountPicker();
    await press('ArrowDown');
    await press('Escape');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('cancels from the visible command and announces cancellation', async () => {
    const { onCancel } = await mountPicker();
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Cancel');
    expect(cancel).not.toBeUndefined();

    await act(async () => cancel?.click());

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-live="polite"]')?.textContent)
      .toContain('cancelled');
  });

  it('keeps the picker and preview active when commit rejects', async () => {
    const onCommit = vi.fn(async () => {
      throw new Error('rejected target');
    });
    await mountPicker({ onCommit });
    await press('Enter');

    expect(onCommit).toHaveBeenCalledWith(pickerChoices[0]);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(selectedChoice().dataset.choiceGroupId).toBe('target-session');
    expect(document.querySelector('[aria-live="polite"]')?.textContent)
      .toContain('Unable to complete');
  });

  it('locks every cancel and repeat path while commit is pending, then closes on success', async () => {
    let resolveCommit!: () => void;
    const onCommit = vi.fn(() => new Promise<void>((resolve) => {
      resolveCommit = resolve;
    }));
    const props = await mountPicker({ onCommit });

    await press('Enter');

    const options = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    )];
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Cancel')!;
    const primary = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Moving…')!;
    const close = document.querySelector<HTMLButtonElement>(
      '[aria-label="Close Move Selected Items To"]',
    )!;
    expect(options.every(({ disabled }) => disabled)).toBe(true);
    expect(cancel.disabled).toBe(true);
    expect(primary.disabled).toBe(true);
    expect(close.disabled).toBe(true);

    await act(async () => {
      options[1]?.click();
      primary.click();
      cancel.click();
      close.click();
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('[aria-live="polite"]')?.textContent)
      .not.toContain('cancelled');

    await act(async () => resolveCommit());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.id).toBe('surviving-session');
  });

  it('re-enables the current picker choice and commands after commit rejects', async () => {
    let rejectCommit!: (error: Error) => void;
    const onCommit = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectCommit = reject;
    }));
    await mountPicker({ onCommit });

    await press('Enter');
    expect(selectedChoice().getAttribute('disabled')).not.toBeNull();

    await act(async () => rejectCommit(new Error('authority rejected')));

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(selectedChoice().getAttribute('disabled')).toBeNull();
    expect(document.activeElement).toBe(selectedChoice());
    expect([...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Cancel')?.disabled)
      .toBe(false);
    expect(document.querySelector<HTMLButtonElement>(
      '[aria-label="Close Move Selected Items To"]',
    )?.disabled).toBe(false);
    expect(document.querySelector('[aria-live="polite"]')?.textContent)
      .toContain('Unable to complete');
  });

  it('focuses the current surviving choice after a pending removed choice rejects', async () => {
    let rejectCommit!: (error: Error) => void;
    const onCommit = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
        rejectCommit = reject;
      }))
      .mockResolvedValueOnce(undefined);
    const props = await mountPicker({ onCommit });

    await press('ArrowDown');
    expect(selectedChoice().dataset.choiceKind).toBe('new-session');
    await press('Enter');

    await rerenderPicker({
      onPreview: props.onPreview,
      onCancel: props.onCancel,
      onCommit,
      choices: [pickerChoices[0]],
      choiceLabels: new Map([
        ['existing-session:target-session', 'Research Queue'],
      ]),
    });

    expect(selectedChoice().dataset.choiceGroupId).toBe('target-session');
    expect(selectedChoice().getAttribute('disabled')).not.toBeNull();

    await act(async () => rejectCommit(new Error('authority rejected')));

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(selectedChoice().getAttribute('disabled')).toBeNull();
    expect(document.activeElement).toBe(selectedChoice());

    await press('ArrowDown');
    expect(document.activeElement).toBe(selectedChoice());
    await press('Enter');
    expect(onCommit).toHaveBeenLastCalledWith(pickerChoices[0]);
  });

  it('uses a Save command for Open Tabs and keeps category mode generically committable', async () => {
    const open = await mountPicker({ mode: 'save-open-tabs' });
    const primary = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Save');
    expect(primary).not.toBeUndefined();

    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';

    const category = await mountPicker({
      mode: 'move-session-category',
      choices: sessionPickerChoices,
      choiceLabels: sessionPickerLabels,
    });
    expect(document.querySelector('[role="dialog"]')?.textContent)
      .toContain('Move Session To');
    await press('Enter');
    expect(category.onCommit).toHaveBeenCalledWith(sessionPickerChoices[0]);
    expect(open.onCommit).not.toHaveBeenCalled();
  });

  it('previews, announces, and commits named whole-session positions from the keyboard', async () => {
    const { onCommit, onPreview } = await mountPicker({
      mode: 'move-session-category',
      choices: sessionPickerChoices,
      choiceLabels: sessionPickerLabels,
    });

    expect(selectedChoice().textContent)
      .toContain('Before Alpha Session in Inbox');
    await press('ArrowDown');
    expect(selectedChoice().textContent)
      .toContain('After Saved Session in Saved');
    expect(onPreview).toHaveBeenLastCalledWith(sessionPickerChoices[1]);
    expect(document.querySelector('[aria-live="polite"]')?.textContent)
      .toContain('Preview After Saved Session in Saved');

    await press('Enter');

    expect(onCommit).toHaveBeenCalledWith(sessionPickerChoices[1]);
  });

  it('cancels whole-session selection without changing caller data and restores its trigger', async () => {
    const order = ['source-session', 'other-session'];
    const onCommit = vi.fn(async () => {
      order.reverse();
    });
    const { onCancel, trigger } = await mountPicker({
      mode: 'move-session-category',
      choices: sessionPickerChoices,
      choiceLabels: sessionPickerLabels,
      onCommit,
    });

    await press('ArrowDown');
    await press('Escape');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(order).toEqual(['source-session', 'other-session']);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('previews and announces the current choice when eligible targets change', async () => {
    const props = await mountPicker();
    expect(props.onPreview).toHaveBeenLastCalledWith(pickerChoices[0]);

    await rerenderPicker({
      onPreview: props.onPreview,
      onCancel: props.onCancel,
      onCommit: props.onCommit,
      choices: [pickerChoices[1]],
      choiceLabels: new Map([
        ['new-session:inbox:1', 'New Session after Research Queue in Inbox'],
      ]),
    });

    expect(selectedChoice().dataset.choiceKind).toBe('new-session');
    expect(props.onPreview).toHaveBeenLastCalledWith(pickerChoices[1]);
    expect(document.querySelector('[aria-live="polite"]')?.textContent)
      .toContain('New Session after Research Queue in Inbox');
  });

  it('preserves the focused preview by choice key when choices reorder', async () => {
    const props = await mountPicker();
    await press('ArrowDown');
    expect(selectedChoice().dataset.choiceKind).toBe('new-session');
    expect(document.activeElement).toBe(selectedChoice());

    await rerenderPicker({
      onPreview: props.onPreview,
      onCancel: props.onCancel,
      onCommit: props.onCommit,
      choices: [pickerChoices[1], pickerChoices[0]],
      choiceLabels: new Map([
        ['existing-session:target-session', 'Research Queue'],
        ['new-session:inbox:1', 'New Session after Research Queue in Inbox'],
      ]),
    });

    expect(selectedChoice().dataset.choiceKind).toBe('new-session');
    expect(document.activeElement).toBe(selectedChoice());
  });

  it('focuses a surviving selected option when the current choice disappears', async () => {
    const props = await mountPicker();
    await press('ArrowDown');
    expect(selectedChoice().dataset.choiceKind).toBe('new-session');

    await rerenderPicker({
      onPreview: props.onPreview,
      onCancel: props.onCancel,
      onCommit: props.onCommit,
      choices: [pickerChoices[0]],
      choiceLabels: new Map([
        ['existing-session:target-session', 'Research Queue'],
      ]),
    });

    expect(selectedChoice().dataset.choiceGroupId).toBe('target-session');
    expect(document.activeElement).toBe(selectedChoice());

    await press('ArrowDown');
    expect(document.activeElement).toBe(selectedChoice());
    await press('Enter');
    expect(props.onCommit).toHaveBeenLastCalledWith(pickerChoices[0]);
  });
});
