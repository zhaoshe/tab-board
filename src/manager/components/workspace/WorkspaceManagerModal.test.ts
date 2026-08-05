// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import type { Folder, Group, Workspace } from '../../../shared/model';
import { WorkspaceManagerModal } from './WorkspaceManagerModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const timestamp = '2026-07-31T00:00:00.000Z';
const workspaces: Workspace[] = [
  {
    id: 'workspace-personal',
    name: 'Personal',
    emoji: '🏠',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'workspace-work',
    name: 'Work',
    emoji: '💼',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'workspace-research',
    name: 'Research',
    emoji: '🧪',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

function group(id: string, workspaceId: string, locked = false): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId,
    folderId: null,
    locked,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function folder(id: string, workspaceId: string): Folder {
  return {
    id,
    workspaceId,
    name: id,
    color: 'slate',
    collapsed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function changeInput(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function mountManager(
  overrides: Partial<Parameters<typeof WorkspaceManagerModal>[0]> = {},
) {
  container = document.createElement('div');
  container.id = 'manager-main';
  document.body.append(container);
  const trigger = document.createElement('button');
  trigger.textContent = 'Manage Workspaces trigger';
  document.body.append(trigger);
  const props = {
    opened: true,
    activeWorkspaceId: 'workspace-personal',
    workspaces,
    groups: [
      group('personal-session-a', 'workspace-personal'),
      group('personal-session-b', 'workspace-personal'),
      group('locked-work-session', 'workspace-work', true),
    ],
    folders: [folder('personal-category', 'workspace-personal')],
    finalFocusRef: { current: trigger },
    onClose: vi.fn(),
    onCreate: vi.fn(),
    onUpdateWorkspace: vi.fn(),
    onUpdateWorkspaceOrder: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onActiveWorkspaceDeleted: vi.fn(),
    confirmBeforeDestructive: true,
    ...overrides,
  };
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      null,
      createElement(WorkspaceManagerModal, props),
    ));
  });
  return props;
}

function row(workspaceId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-workspace-id="${workspaceId}"]`,
  );
  if (!element) throw new Error(`Missing workspace row: ${workspaceId}`);
  return element;
}

function action(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing action: ${label}`);
  return button;
}

function buttonWithText(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

describe('WorkspaceManagerModal ordering', () => {
  it('creates Workspaces from inside Manage Workspaces and keeps an explicit Done action', async () => {
    const props = await mountManager();

    const manager = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const header = manager.querySelector<HTMLElement>('.mantine-Modal-header')!;
    const createAction = buttonWithText('New Workspace');
    expect(header.contains(createAction)).toBe(true);
    expect(manager.querySelector('.mantine-Modal-body')?.contains(createAction))
      .toBe(false);
    expect(header.textContent).toContain('3 Workspaces · drag to reorder');
    const done = buttonWithText('Done');
    expect(done.closest('.manager-management-footer')).not.toBeNull();

    await act(async () => createAction.click());

    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0].hasAttribute('inert')).toBe(true);
    expect(dialogs[0].getAttribute('aria-hidden')).toBe('true');
    expect(dialogs[1].textContent).toContain('New Workspace');

    const name = document.querySelector<HTMLInputElement>(
      'input[name="workspace-name"]',
    );
    await changeInput(name!, 'Created in Manager');
    await act(async () => {
      document.querySelector<HTMLButtonElement>(
        '[data-workspace-emoji="🚀"]',
      )?.click();
    });
    await act(async () => buttonWithText('Create Workspace').click());

    expect(props.onCreate).toHaveBeenCalledWith({
      name: 'Created in Manager',
      emoji: '🚀',
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    await act(async () => done.click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('uses singular management context when only one Workspace remains', async () => {
    await mountManager({
      workspaces: [workspaces[0]],
      groups: [],
      folders: [],
    });

    const header = document.querySelector<HTMLElement>(
      '[role="dialog"] .mantine-Modal-header',
    );
    expect(header?.textContent).toContain('1 Workspace · drag to reorder');
    expect(header?.textContent).not.toContain('1 Workspaces');
  });

  it('uses the whole row as the pointer drag surface without a drag-handle focus stop', async () => {
    const props = await mountManager();
    const personal = row('workspace-personal');
    const research = row('workspace-research');
    const setData = vi.fn();
    const dragStart = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: { effectAllowed: '', setData },
    });

    await act(async () => personal.dispatchEvent(dragStart));
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: () => 'workspace-personal' },
    });
    await act(async () => research.dispatchEvent(drop));

    expect(personal.getAttribute('draggable')).toBe('true');
    expect(personal.tabIndex).toBe(0);
    expect(personal.getAttribute('role')).toBe('group');
    expect(personal.getAttribute('aria-label')).toBe('Personal Workspace');
    expect(document.querySelector('[data-workspace-drag-handle]')).toBeNull();
    expect(setData).toHaveBeenCalledWith(
      'application/x-tabboard-workspace',
      'workspace-personal',
    );
    expect(props.onUpdateWorkspaceOrder).toHaveBeenCalledWith([
      'workspace-work',
      'workspace-research',
      'workspace-personal',
    ]);
  });

  it('publishes the same complete order payload from Move Up and Move Down', async () => {
    const props = await mountManager();

    await act(async () => action('Move Work up').click());
    expect(props.onUpdateWorkspaceOrder).toHaveBeenLastCalledWith([
      'workspace-work',
      'workspace-personal',
      'workspace-research',
    ]);

    await act(async () => action('Move Work down').click());
    expect(props.onUpdateWorkspaceOrder).toHaveBeenLastCalledWith([
      'workspace-personal',
      'workspace-research',
      'workspace-work',
    ]);
  });

  it('exposes exactly Move Up, Move Down, Edit, and Delete for every row', async () => {
    await mountManager();

    for (const workspace of workspaces) {
      const labels = [...row(workspace.id).querySelectorAll<HTMLButtonElement>('button')]
        .map((button) => button.getAttribute('aria-label'));
      expect(labels).toEqual([
        `Move ${workspace.name} up`,
        `Move ${workspace.name} down`,
        `Edit ${workspace.name}`,
        `Delete ${workspace.name}`,
      ]);
      const remove = action(`Delete ${workspace.name}`);
      expect(remove.querySelector('.lucide-trash')).not.toBeNull();
      expect(remove.querySelector('.lucide-trash-2')).toBeNull();
    }
  });

  it('marks only the active Workspace with the current-row material hook', async () => {
    await mountManager();

    expect(row('workspace-personal').classList).toContain(
      'workspace-manager-row--current',
    );
    expect(row('workspace-work').classList).not.toContain(
      'workspace-manager-row--current',
    );
    expect(row('workspace-research').classList).not.toContain(
      'workspace-manager-row--current',
    );
  });

  it('keeps hidden row actions out of Tab order until the row receives focus', async () => {
    await mountManager();
    const workRow = row('workspace-work');
    const actions = [...workRow.querySelectorAll<HTMLButtonElement>('button')];

    expect(actions.every(({ tabIndex }) => tabIndex === -1)).toBe(true);

    await act(async () => workRow.focus());

    expect(actions.every(({ tabIndex }) => tabIndex === 0)).toBe(true);
  });
});

describe('WorkspaceManagerModal edit and delete safety', () => {
  it('returns nested Edit Escape focus to the exact row action', async () => {
    const edit = action;
    await mountManager();
    const trigger = edit('Edit Research');
    await act(async () => trigger.focus());
    await act(async () => trigger.click());

    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    await act(async () => {
      dialogs[1]?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(trigger.tabIndex).toBe(0);
    expect(trigger.closest('[data-workspace-id]')?.hasAttribute('data-actions-visible'))
      .toBe(true);
  });

  it('makes the manager inert while shared editing is open and submits one atomic update', async () => {
    const props = await mountManager();
    const edit = action('Edit Research');
    await act(async () => edit.click());

    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0].hasAttribute('inert')).toBe(true);
    expect(dialogs[0].getAttribute('aria-hidden')).toBe('true');
    const name = document.querySelector<HTMLInputElement>('input[name="workspace-name"]');
    expect(name?.value).toBe('Research');
    expect(document.querySelector<HTMLButtonElement>(
      '[data-workspace-emoji="🧪"]',
    )?.getAttribute('aria-pressed')).toBe('true');

    await changeInput(name!, 'Research Lab');
    await act(async () => {
      const save = [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === 'Save Workspace');
      save?.click();
    });

    expect(props.onUpdateWorkspace).toHaveBeenCalledTimes(1);
    expect(props.onUpdateWorkspace).toHaveBeenCalledWith(
      'workspace-research',
      { name: 'Research Lab', emoji: '🧪' },
    );
  });

  it('disables Delete for the only workspace and for a workspace with any locked session', async () => {
    await mountManager();
    expect(action('Delete Work').disabled).toBe(true);

    await act(async () => root?.unmount());
    root = null;
    await mountManager({
      activeWorkspaceId: 'workspace-personal',
      workspaces: [workspaces[0]],
      groups: [],
      folders: [],
    });
    expect(action('Delete Personal').disabled).toBe(true);
  });

  it('never deletes immediately and confirms cascade counts plus active replacement', async () => {
    const props = await mountManager();
    await act(async () => action('Delete Personal').click());

    expect(props.onDeleteWorkspace).not.toHaveBeenCalled();
    const confirmation = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      .find((dialog) => dialog.textContent?.includes('Delete Workspace'));
    expect(confirmation?.textContent).toContain('2 Sessions');
    expect(confirmation?.textContent).toContain('1 custom Category');
    expect(confirmation?.textContent).toContain('Work');

    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Delete Workspace');
    await act(async () => confirm?.click());

    expect(props.onDeleteWorkspace).toHaveBeenCalledTimes(1);
    expect(props.onDeleteWorkspace).toHaveBeenCalledWith('workspace-personal');
    expect(props.onActiveWorkspaceDeleted).toHaveBeenCalledWith('workspace-work');
  });

  it('deletes directly when dangerous-operation confirmation is off', async () => {
    const props = await mountManager({ confirmBeforeDestructive: false });
    await act(async () => action('Delete Personal').click());

    expect(props.onDeleteWorkspace).toHaveBeenCalledWith('workspace-personal');
    expect(props.onActiveWorkspaceDeleted).toHaveBeenCalledWith('workspace-work');
    expect([...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      .some((dialog) => dialog.textContent?.includes('Delete Workspace')))
      .toBe(false);
  });

  it('shows direct-delete errors and retries without opening confirmation', async () => {
    const onDeleteWorkspace = vi.fn()
      .mockRejectedValueOnce(new Error('Unable to enqueue Workspace deletion.'))
      .mockResolvedValueOnce(undefined);
    await mountManager({
      confirmBeforeDestructive: false,
      onDeleteWorkspace,
    });

    await act(async () => action('Delete Personal').click());
    expect(onDeleteWorkspace).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Unable to enqueue Workspace deletion.');
    expect([...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      .some((dialog) => dialog.textContent?.includes('Delete Workspace')))
      .toBe(false);

    await act(async () => action('Delete Personal').click());
    expect(onDeleteWorkspace).toHaveBeenCalledTimes(2);
  });

  it('locks confirmation and keeps the manager inert until delete enqueue resolves', async () => {
    let resolveDelete!: () => void;
    const pendingDelete = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    const onDeleteWorkspace = vi.fn(() => pendingDelete);
    const props = await mountManager({ onDeleteWorkspace });
    await act(async () => action('Delete Personal').click());

    const confirm = buttonWithText('Delete Workspace');
    await act(async () => confirm.click());

    expect(onDeleteWorkspace).toHaveBeenCalledTimes(1);
    const deleting = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Deleting Workspace…"]',
    );
    const cancel = buttonWithText('Cancel');
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(deleting?.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    expect(dialogs[0].hasAttribute('inert')).toBe(true);
    expect(dialogs[0].getAttribute('aria-hidden')).toBe('true');

    await act(async () => deleting?.click());
    await act(async () => {
      dialogs[1]?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    expect(onDeleteWorkspace).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Delete Workspace');
    expect(props.onActiveWorkspaceDeleted).not.toHaveBeenCalled();

    await act(async () => resolveDelete());

    expect(props.onActiveWorkspaceDeleted).toHaveBeenCalledTimes(1);
    expect(props.onActiveWorkspaceDeleted).toHaveBeenCalledWith('workspace-work');
    expect(document.querySelector('button[aria-label="Deleting Workspace…"]')).toBeNull();
    const remainingManager = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(remainingManager?.hasAttribute('inert')).toBe(false);
    expect(remainingManager?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('keeps rejected deletion open and inert, surfaces the error, and allows retry', async () => {
    const onDeleteWorkspace = vi.fn()
      .mockRejectedValueOnce(new Error('Unable to enqueue Workspace deletion.'))
      .mockResolvedValueOnce(undefined);
    const props = await mountManager({ onDeleteWorkspace });
    await act(async () => action('Delete Personal').click());

    await act(async () => buttonWithText('Delete Workspace').click());

    expect(onDeleteWorkspace).toHaveBeenCalledTimes(1);
    expect(props.onActiveWorkspaceDeleted).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      'Unable to enqueue Workspace deletion.',
    );
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0].hasAttribute('inert')).toBe(true);
    expect(buttonWithText('Cancel').disabled).toBe(false);
    expect(buttonWithText('Delete Workspace').disabled).toBe(false);

    await act(async () => buttonWithText('Delete Workspace').click());

    expect(onDeleteWorkspace).toHaveBeenCalledTimes(2);
    expect(props.onActiveWorkspaceDeleted).toHaveBeenCalledTimes(1);
    expect(props.onActiveWorkspaceDeleted).toHaveBeenCalledWith('workspace-work');
    expect(document.body.textContent).not.toContain(
      'Unable to enqueue Workspace deletion.',
    );
  });
});
