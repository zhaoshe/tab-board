// @vitest-environment happy-dom
import {
  act,
  createElement,
  type ReactElement,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import type { Workspace } from '../../../shared/model';
import {
  WORKSPACE_FAVORITE_EMOJIS,
  WorkspaceEditorModal,
  type WorkspaceEditorValue,
} from './WorkspaceEditorModal';

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
    id: 'workspace-research',
    name: 'Research',
    emoji: '🧪',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
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

async function mountEditor(
  overrides: Partial<Parameters<typeof WorkspaceEditorModal>[0]> = {},
): Promise<{
  onClose: ReturnType<typeof vi.fn>;
  onSubmit: ReturnType<typeof vi.fn>;
  trigger: HTMLButtonElement;
  renderClosed: () => Promise<void>;
}> {
  container = document.createElement('div');
  container.id = 'manager-main';
  document.body.append(container);
  const trigger = document.createElement('button');
  trigger.textContent = 'Editor trigger';
  document.body.append(trigger);
  const triggerRef = { current: trigger };
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const editorProps = {
    opened: true,
    mode: 'create' as const,
    workspaces,
    finalFocusRef: triggerRef,
    onClose,
    onSubmit,
    ...overrides,
  };
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      null,
      createElement(WorkspaceEditorModal, editorProps),
    ));
  });
  return {
    onClose,
    onSubmit,
    trigger,
    renderClosed: async () => {
      await act(async () => {
        root?.render(createElement(
          MantineProvider,
          null,
          createElement(WorkspaceEditorModal, {
            ...editorProps,
            opened: false,
          }),
        ));
      });
    },
  };
}

function editorButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

function favoriteButton(emoji: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-workspace-emoji="${emoji}"]`,
  );
  if (!button) throw new Error(`Missing favorite emoji: ${emoji}`);
  return button;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

describe('WorkspaceEditorModal favorites', () => {
  it('exports and renders 16 favorites in an eight-column pressed-state grid', async () => {
    expect(WORKSPACE_FAVORITE_EMOJIS).toHaveLength(16);
    expect(WORKSPACE_FAVORITE_EMOJIS.indexOf('🚀'))
      .toBe(WORKSPACE_FAVORITE_EMOJIS.indexOf('🧪') + 1);
    await mountEditor();

    const grid = document.querySelector<HTMLElement>('[role="group"][aria-label="Workspace emoji"]');
    const favorites = grid?.querySelectorAll<HTMLButtonElement>('[data-workspace-emoji]');
    expect(grid?.dataset.columns).toBe('8');
    expect(favorites).toHaveLength(16);
    expect(favoriteButton(WORKSPACE_FAVORITE_EMOJIS[0]).getAttribute('aria-pressed'))
      .toBe('true');
    expect([...favorites ?? []].filter(({ tabIndex }) => tabIndex === 0)).toHaveLength(1);
  });

  it('moves favorite focus with arrows and Home/End without adding focus stops', async () => {
    await mountEditor();
    const testTube = favoriteButton('🧪');
    testTube.focus();

    await act(async () => {
      testTube.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(favoriteButton('🚀'));
    expect(favoriteButton('🚀').getAttribute('aria-pressed')).toBe('true');
    expect(favoriteButton('🧪').tabIndex).toBe(-1);

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Home',
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(favoriteButton(WORKSPACE_FAVORITE_EMOJIS[0]));

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'End',
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(
      favoriteButton(WORKSPACE_FAVORITE_EMOJIS[WORKSPACE_FAVORITE_EMOJIS.length - 1]),
    );
  });

  it('keeps top-row and bottom-row focus in place when no vertical neighbor exists', async () => {
    await mountEditor();
    const topRowNonFirst = favoriteButton(WORKSPACE_FAVORITE_EMOJIS[3]);
    await act(async () => topRowNonFirst.click());

    await act(async () => {
      topRowNonFirst.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(topRowNonFirst);
    expect(topRowNonFirst.getAttribute('aria-pressed')).toBe('true');

    const bottomRowNonLast = favoriteButton(WORKSPACE_FAVORITE_EMOJIS[12]);
    await act(async () => bottomRowNonLast.click());
    await act(async () => {
      bottomRowNonLast.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(bottomRowNonLast);
    expect(bottomRowNonLast.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('WorkspaceEditorModal validation and submit', () => {
  it('accepts one normalized ZWJ emoji and rejects text or multiple graphemes', async () => {
    await mountEditor();
    await act(async () => editorButton('Custom').click());
    const custom = document.querySelector<HTMLInputElement>('input[name="workspace-emoji"]');
    expect(custom).not.toBeNull();

    await changeInput(custom!, 'hello');
    expect(document.body.textContent).toContain('Enter exactly one emoji.');
    expect(editorButton('Create Workspace').disabled).toBe(true);

    await changeInput(custom!, '😀😀');
    expect(document.body.textContent).toContain('Enter exactly one emoji.');
    expect(editorButton('Create Workspace').disabled).toBe(true);

    await changeInput(custom!, '👩🏽‍💻');
    expect(document.body.textContent).not.toContain('Enter exactly one emoji.');
  });

  it('shows explicit empty and duplicate errors and disables creation', async () => {
    await mountEditor();
    const name = document.querySelector<HTMLInputElement>('input[name="workspace-name"]');
    expect(name).not.toBeNull();
    expect(document.body.textContent).toContain('Workspace name is required.');
    expect(editorButton('Create Workspace').disabled).toBe(true);

    await changeInput(name!, '  personal  ');
    expect(document.body.textContent).toContain(
      'A workspace with this name already exists.',
    );
    expect(editorButton('Create Workspace').disabled).toBe(true);
  });

  it('prefills edit state, supports custom existing emoji, and submits one atomic value', async () => {
    const customWorkspace: Workspace = {
      ...workspaces[1],
      name: 'Research',
      emoji: '👩🏽‍💻',
    };
    const onSubmit = vi.fn<(value: WorkspaceEditorValue) => void>();
    await mountEditor({
      mode: 'edit',
      workspace: customWorkspace,
      workspaces: [workspaces[0], customWorkspace],
      onSubmit,
    });

    const name = document.querySelector<HTMLInputElement>('input[name="workspace-name"]');
    const custom = document.querySelector<HTMLInputElement>('input[name="workspace-emoji"]');
    expect(name?.value).toBe('Research');
    expect(custom?.value).toBe('👩🏽‍💻');
    expect(document.querySelector('.workspace-editor-preview')?.textContent)
      .toContain('👩🏽‍💻');
    expect(document.querySelector('.workspace-editor-preview')?.textContent)
      .toContain('Research');

    await changeInput(name!, '  Research Lab  ');
    await act(async () => editorButton('Save Workspace').click());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Research Lab',
      emoji: '👩🏽‍💻',
    });
  });

  it('returns focus to the exact trigger on Cancel', async () => {
    const { trigger, onClose, renderClosed } = await mountEditor();
    await act(async () => editorButton('Cancel').click());

    expect(onClose).toHaveBeenCalledTimes(1);
    await renderClosed();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus to the exact trigger on Escape', async () => {
    const { trigger, onClose, renderClosed } = await mountEditor();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    await act(async () => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await renderClosed();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(document.activeElement).toBe(trigger);
  });
});
