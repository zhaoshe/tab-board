// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { managerTheme } from '../styles/theme';
import { ConfirmDialog } from './ConfirmDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let portalTarget: HTMLElement | null = null;

function InteractionHarness({ onCancel }: { onCancel: () => void }) {
  const [opened, setOpened] = useState(false);

  return createElement(
    'div',
    null,
    createElement('button', {
      type: 'button',
      onClick: () => setOpened(true),
    }, 'Open confirmation'),
    createElement(ConfirmDialog, {
      opened,
      title: 'Delete Session',
      message: 'Move this session to Trash?',
      confirmLabel: 'Delete Session',
      onCancel: () => {
        onCancel();
        setOpened(false);
      },
      onConfirm: vi.fn(),
    }),
  );
}

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
  it('body-portals with one page banner and an associated heading', async () => {
    const pageHeader = document.createElement('header');
    pageHeader.textContent = 'TabBoard';
    document.body.append(pageHeader);
    portalTarget = document.createElement('main');
    portalTarget.id = 'manager-main';
    document.body.append(portalTarget);
    container = document.createElement('div');
    portalTarget.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        { theme: managerTheme },
        createElement(ConfirmDialog, {
          opened: true,
          title: 'Delete Workspace',
          message: 'Delete this Workspace?',
          confirmLabel: 'Delete Workspace',
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }),
      ));
    });

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const header = dialog?.querySelector<HTMLElement>('.mantine-Modal-header');
    const title = dialog?.querySelector<HTMLHeadingElement>('h2');
    const bannerCandidates = [...document.querySelectorAll<HTMLElement>(
      'header, [role="banner"]',
    )].filter((element) => !['none', 'presentation'].includes(
      element.getAttribute('role') ?? '',
    ));

    expect(dialog).not.toBeNull();
    expect(portalTarget.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog?.closest('[data-portal]')?.parentElement).toBe(document.body);
    expect(bannerCandidates).toEqual([pageHeader]);
    expect(header?.getAttribute('role')).toBe('presentation');
    expect(title?.tagName).toBe('H2');
    expect(title?.id).toBeTruthy();
    expect(dialog?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(document.getElementById(title?.id ?? '')).toBe(title);
    expect(dialog?.querySelector('.mantine-Modal-close')?.getAttribute('aria-label'))
      .toBe('Close Delete Workspace');
  });

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
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
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

  it('traps focus, cancels on Escape, and returns focus to the trigger', async () => {
    const onCancel = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        { theme: managerTheme },
        createElement(InteractionHarness, { onCancel }),
      ));
    });

    const trigger = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Open confirmation');
    await act(async () => {
      trigger?.focus();
      trigger?.click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Delete Session');
    const close = document.querySelector<HTMLButtonElement>('.mantine-Modal-close');
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel');

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      confirm?.focus();
      confirm?.dispatchEvent(tabEvent);
    });
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement))
      .toBe(true);

    await act(async () => {
      close?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
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
