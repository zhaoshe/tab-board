// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import type { Group } from '../../../shared/model';
import { WorkspaceMenu } from './WorkspaceMenu';
import { MANAGER_DENSE_MENU_PROPS } from './managerMenuPolicy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workspaces = [
  { id: 'workspace-a', name: 'Personal', emoji: '🏠', createdAt: '', updatedAt: '' },
  { id: 'workspace-b', name: 'Work', emoji: '💼', createdAt: '', updatedAt: '' },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let managerMain: HTMLDivElement | null = null;

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

function group(id: string, workspaceId: string): Group {
  return {
    id,
    title: id,
    note: '',
    workspaceId,
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: [],
    createdAt: '',
    updatedAt: '',
  };
}

async function mountMenu(groups: Group[] = []) {
  managerMain = document.createElement('div');
  managerMain.id = 'manager-main';
  document.body.append(managerMain);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const props = {
    activeWorkspaceId: 'workspace-a',
    workspaces,
    groups,
    folders: [],
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onUpdateWorkspace: vi.fn(),
    onUpdateWorkspaceOrder: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onActiveWorkspaceDeleted: vi.fn(),
  };
  await act(async () => {
    root?.render(createElement(MantineProvider, null, createElement(WorkspaceMenu, props)));
  });
  return props;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  managerMain?.remove();
  managerMain = null;
  document.body.innerHTML = '';
});

describe('WorkspaceMenu', () => {
  it('renders emoji and title in separate aligned slots with background-only current state', async () => {
    await mountMenu();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[aria-label="Workspace: Personal"]',
    );

    expect(trigger?.querySelector('.manager-workspace-trigger__emoji')?.textContent)
      .toBe('🏠');
    expect(trigger?.querySelector('.manager-workspace-trigger__label')?.textContent)
      .toBe('Personal');
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Workspace: Personal"]')?.click());
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.manager-workspace-menu-emoji')).toHaveLength(2);
    });
    const current = document.querySelector<HTMLElement>('[data-workspace-menu-id="workspace-a"]');
    const other = document.querySelector<HTMLElement>('[data-workspace-menu-id="workspace-b"]');
    expect(current?.classList.contains('manager-workspace-row--current')).toBe(true);
    expect(current?.querySelector('.manager-workspace-menu-emoji')?.textContent).toBe('🏠');
    expect(other?.querySelector('.manager-workspace-menu-emoji')?.textContent).toBe('💼');
    expect(document.querySelector('[aria-label="Current Workspace"]')).toBeNull();
    expect(document.querySelector('[data-icon="check"]')).toBeNull();
  });

  it('uses the exact dense-menu policy and exposes trigger disclosure state', async () => {
    await mountMenu();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[aria-label="Workspace: Personal"]',
    );

    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => trigger?.click());
    await vi.waitFor(() => expect(trigger?.getAttribute('aria-expanded')).toBe('true'));
    expect(document.querySelector('.manager-dense-menu')).not.toBeNull();
    expect(MANAGER_DENSE_MENU_PROPS.width).toBe(190);
  });

  it('describes Workspace session counts with correct singular and plural copy', async () => {
    await mountMenu([group('group-a', 'workspace-a')]);
    await act(async () => document.querySelector<HTMLButtonElement>(
      '[aria-label="Workspace: Personal"]',
    )?.click());
    const personal = document.querySelector<HTMLElement>(
      '[data-workspace-menu-id="workspace-a"] [role="menuitem"]',
    );
    const work = document.querySelector<HTMLElement>(
      '[data-workspace-menu-id="workspace-b"] [role="menuitem"]',
    );

    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    document.querySelector<HTMLElement>('[role="menu"]')
      ?.setAttribute('data-tip-keyboard-armed', '');
    await act(async () => personal?.focus());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('1 saved Session');
    await act(async () => work?.focus());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('0 saved Sessions');
  });

  it('offers Workspace list, New Workspace, Manage Workspaces, and one current-row Edit action', async () => {
    const props = await mountMenu();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Workspace: Personal"]')?.click());
    await vi.waitFor(() => {
      expect(document.querySelector('[data-workspace-menu-id="workspace-a"]')).not.toBeNull();
    });
    expect(document.querySelectorAll('[data-workspace-menu-id]')).toHaveLength(2);
    expect(document.body.textContent).toContain('New Workspace');
    expect(document.body.textContent).toContain('Manage Workspaces');
    expect(document.querySelectorAll('[aria-label="Edit Workspace"]')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('Rename Workspace');
    expect(document.body.textContent).not.toContain('Change Emoji');

    await act(async () => document.querySelector<HTMLButtonElement>(
      '[aria-label="Edit Workspace"]',
    )?.click());
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Edit Workspace');
    });
    const input = document.querySelector<HTMLInputElement>('input[name="workspace-name"]');
    expect(input?.value).toBe('Personal');
    await changeInput(input!, ' Personal Focus ');
    const submit = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Save Workspace');
    await act(async () => submit?.click());

    expect(props.onUpdateWorkspace).toHaveBeenCalledWith('workspace-a', {
      name: 'Personal Focus',
      emoji: '🏠',
    });
  });

  it('creates with the shared editor and sends the selected emoji atomically', async () => {
    const props = await mountMenu();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Workspace: Personal"]')?.click());
    const create = await vi.waitFor(() => {
      const item = [...document.querySelectorAll<HTMLElement>('.mantine-Menu-item')]
        .find((candidate) => candidate.textContent?.includes('New Workspace'));
      expect(item).toBeDefined();
      return item!;
    });
    await act(async () => create.click());

    const input = document.querySelector<HTMLInputElement>('input[name="workspace-name"]');
    await changeInput(input!, '  Focus  ');
    await act(async () => document.querySelector<HTMLButtonElement>(
      '[data-workspace-emoji="🚀"]',
    )?.click());
    const submit = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Create Workspace');
    await act(async () => submit?.click());

    expect(props.onCreate).toHaveBeenCalledWith({
      name: 'Focus',
      emoji: '🚀',
    });
  });
});
