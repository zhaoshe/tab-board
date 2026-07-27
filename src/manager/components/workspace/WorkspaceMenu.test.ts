// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { WorkspaceMenu } from './WorkspaceMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workspaces = [
  { id: 'workspace-a', name: 'Personal', createdAt: '', updatedAt: '' },
  { id: 'workspace-b', name: 'Work', createdAt: '', updatedAt: '' },
];

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

async function mountMenu() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const props = {
    activeWorkspaceId: 'workspace-a',
    workspaces,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
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
  document.body.innerHTML = '';
});

describe('WorkspaceMenu', () => {
  it('creates a workspace with inline validation instead of window.prompt', async () => {
    const props = await mountMenu();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Workspace: Personal"]')?.click());
    const create = await vi.waitFor(() => {
      const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((candidate) => candidate.textContent?.includes('New Workspace'));
      expect(item).toBeDefined();
      return item!;
    });
    await act(async () => create?.click());

    const input = document.querySelector<HTMLInputElement>('input[name="workspace-name"]');
    expect(input).not.toBeNull();
    const submit = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Create Workspace');
    await act(async () => submit?.click());
    expect(document.body.textContent).toContain('Workspace name is required.');
    expect(props.onCreate).not.toHaveBeenCalled();

    await changeInput(input!, '  Focus  ');
    await act(async () => submit?.click());
    expect(props.onCreate).toHaveBeenCalledWith('Focus');
  });

  it('rejects duplicate rename values inline', async () => {
    const props = await mountMenu();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Workspace: Personal"]')?.click());
    const rename = await vi.waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>('[aria-label="Rename Workspace"]');
      expect(button).not.toBeNull();
      return button!;
    });
    await act(async () => rename.click());
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Rename Workspace');
    });
    const input = document.querySelector<HTMLInputElement>('input[name="workspace-name"]');
    await changeInput(input!, ' work ');
    const submit = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Rename Workspace');
    await act(async () => submit?.click());

    expect(document.body.textContent).toContain('A workspace with this name already exists.');
    expect(props.onRename).not.toHaveBeenCalled();
  });
});
