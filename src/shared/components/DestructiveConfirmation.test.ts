// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DestructiveConfirmationProvider,
  useDestructiveConfirmation,
} from './DestructiveConfirmation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness({ onDelete }: { onDelete: () => void }) {
  const confirmDestructive = useDestructiveConfirmation();
  const [pending, setPending] = useState(false);

  const handleDelete = async () => {
    setPending(true);
    const confirmed = await confirmDestructive({
      title: 'Delete Saved Tab',
      message: 'Move this saved tab to Trash?',
      confirmLabel: 'Delete Saved Tab',
    });
    setPending(false);
    if (confirmed) onDelete();
  };

  return createElement(
    'button',
    { type: 'button', disabled: pending, onClick: () => void handleDelete() },
    'Delete',
  );
}

async function mount(onDelete: () => void): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      null,
      createElement(
        DestructiveConfirmationProvider,
        null,
        createElement(Harness, { onDelete }),
      ),
    ));
  });
}

function getButton(label: string): HTMLButtonElement {
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

describe('DestructiveConfirmationProvider', () => {
  it('resolves false on cancel without running the destructive action', async () => {
    const onDelete = vi.fn();
    await mount(onDelete);

    await act(async () => getButton('Delete').click());
    expect(document.querySelector('[role="dialog"]')?.textContent)
      .toContain('Move this saved tab to Trash?');

    await act(async () => getButton('Cancel').click());
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent)
      .not.toContain('Move this saved tab to Trash?');
  });

  it('resolves true only after the specific confirm action', async () => {
    const onDelete = vi.fn();
    await mount(onDelete);

    await act(async () => getButton('Delete').click());
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => getButton('Delete Saved Tab').click());
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')?.textContent)
      .not.toContain('Move this saved tab to Trash?');
  });
});
