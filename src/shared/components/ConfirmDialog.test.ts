// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { ConfirmDialog } from './ConfirmDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let portalTarget: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  portalTarget?.remove();
  portalTarget = null;
  document.body.innerHTML = '';
});

describe('ConfirmDialog', () => {
  it('focuses the safe action first and exposes specific confirmation copy', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        null,
        createElement(ConfirmDialog, {
          opened: true,
          title: 'Reset Settings',
          message: 'Reset every setting to its default value?',
          confirmLabel: 'Reset Settings',
          onCancel,
          onConfirm,
        }),
      ));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Cancel');
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Reset Settings');

    expect(dialog?.textContent).toContain('Reset every setting to its default value?');
    expect(dialog?.querySelector('.confirm-dialog__message')).not.toBeNull();
    expect(cancel).toBe(document.activeElement);
    expect(confirm).not.toBeNull();
    expect(confirm?.classList).toContain('destructive-confirm-action');

    await act(async () => confirm?.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('supports a named close control and a caller-owned portal landmark', async () => {
    portalTarget = document.createElement('main');
    portalTarget.id = 'manager-main';
    document.body.append(portalTarget);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        null,
        createElement(ConfirmDialog, {
          opened: true,
          title: 'Delete Session',
          message: 'Move this session to Trash?',
          confirmLabel: 'Delete Session',
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
          portalTarget: '#manager-main',
        } as never),
      ));
    });

    expect(portalTarget.querySelector('[role="dialog"]')).not.toBeNull();
    expect(portalTarget.querySelector('.mantine-Modal-close')?.getAttribute('aria-label'))
      .toBe('Close Delete Session');
  });

  it('uses explicit in-progress copy while confirmation is loading', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        null,
        createElement(ConfirmDialog, {
          opened: true,
          title: 'Remove Duplicate Tabs',
          message: 'Close duplicates?',
          confirmLabel: 'Remove Duplicate Tabs',
          loadingLabel: 'Removing Duplicate Tabs…',
          loading: true,
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }),
      ));
    });

    expect(document.querySelector<HTMLButtonElement>(
      'button[aria-label="Removing Duplicate Tabs…"]',
    )?.textContent).toContain('Removing Duplicate Tabs…');
  });
});
