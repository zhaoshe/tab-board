// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { ManagerGlobalActions } from './ManagerGlobalActions';
import * as managerMenuPolicy from './managerMenuPolicy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let main: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  main?.remove();
  main = null;
  document.body.innerHTML = '';
});

describe('ManagerGlobalActions', () => {
  it.each([
    ['desktop', 1280],
    ['compact', 600],
  ])('uses one More menu for Import, Export, and Options on %s layouts', async (_layout, viewportWidth) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: viewportWidth,
    });
    main = document.createElement('main');
    main.id = 'manager-main';
    container = document.createElement('div');
    main.append(container);
    document.body.append(main);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        null,
        createElement(ManagerGlobalActions, {
          showBin: false,
          onOpenImport: vi.fn(),
          onOpenExport: vi.fn(),
          onToggleBin: vi.fn(),
        }),
      ));
    });

    expect(document.querySelectorAll('button[aria-label="More Actions"]')).toHaveLength(1);
    const bin = document.querySelector('button[aria-label="Bin"]');
    expect(bin).not.toBeNull();
    expect(bin?.querySelector('.lucide-trash')).not.toBeNull();
    expect(bin?.querySelector('.lucide-trash-2')).toBeNull();
    expect(document.querySelector('button[aria-label="Trash"]')).toBeNull();
    expect(document.querySelector('button[aria-label="Import"]')).toBeNull();
    expect(document.querySelector('button[aria-label="Export"]')).toBeNull();
    expect(document.querySelector('a[aria-label="Options"]')).toBeNull();

    const more = document.querySelector<HTMLButtonElement>('button[aria-label="More Actions"]');
    expect(more).not.toBeNull();
    expect(more?.getAttribute('aria-expanded')).toBe('false');
    expect(more?.hasAttribute('aria-controls')).toBe(false);
    await act(async () => more?.click());

    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(more?.getAttribute('aria-expanded')).toBe('true');
    expect(more?.hasAttribute('aria-controls')).toBe(false);
    expect(menu?.id).toBe('manager-global-actions-menu');
    expect(menu?.querySelector('[data-autofocus]')).toBeNull();
    expect(
      Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [], (item) => item.textContent?.trim()),
    ).toEqual(['Import', 'Export', 'Options']);
    expect(menu?.textContent).not.toContain('Bin');
    expect(menu?.textContent).not.toContain('Trash');
    const options = menu?.querySelector('a[href="options.html"]');
    expect(options).not.toBeNull();
    expect(options?.querySelector('.lucide-settings-2')).not.toBeNull();
    expect(options?.querySelector('.lucide-settings')).toBeNull();
    expect(document.activeElement).not.toBe(menu?.querySelector('[role="menuitem"]'));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('publishes the shared 190px dense menu policy', () => {
    const denseMenuProps = (
      managerMenuPolicy as typeof managerMenuPolicy & {
        MANAGER_DENSE_MENU_PROPS?: { width?: number };
      }
    ).MANAGER_DENSE_MENU_PROPS;

    expect(denseMenuProps).toMatchObject({
      width: 190,
    });
  });

  it('shows C3 item explanations after pointer dwell', async () => {
    vi.useFakeTimers();
    main = document.createElement('main');
    main.id = 'manager-main';
    container = document.createElement('div');
    main.append(container);
    document.body.append(main);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        null,
        createElement(ManagerGlobalActions, {
          showBin: false,
          onOpenImport: vi.fn(),
          onOpenExport: vi.fn(),
          onToggleBin: vi.fn(),
        }),
      ));
    });
    await act(async () => document.querySelector<HTMLButtonElement>(
      'button[aria-label="More Actions"]',
    )?.click());
    const importItem = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent?.trim() === 'Import');

    await act(async () => {
      importItem?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(550);
    });

    const tip = document.querySelector<HTMLElement>(
      '.manager-menu-item__description-tip[role="tooltip"]',
    );
    expect(tip?.textContent).toBe('Bring sessions into TabBoard');
    expect(importItem?.getAttribute('aria-describedby')).toBe(tip?.id);
    expect(getComputedStyle(tip!).pointerEvents).toBe('none');
    expect(tip?.closest('#manager-main')).toBe(main);
    vi.useRealTimers();
  });

  it('keeps keyboard-open quiet until the first arrow navigation', async () => {
    main = document.createElement('main');
    main.id = 'manager-main';
    container = document.createElement('div');
    main.append(container);
    document.body.append(main);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        null,
        createElement(ManagerGlobalActions, {
          showBin: false,
          onOpenImport: vi.fn(),
          onOpenExport: vi.fn(),
          onToggleBin: vi.fn(),
        }),
      ));
    });
    const more = document.querySelector<HTMLButtonElement>(
      'button[aria-label="More Actions"]',
    )!;

    await act(async () => {
      more.focus();
      more.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
      }));
      more.click();
    });
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(document.activeElement).toBe(items[0]);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();

    await act(async () => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowDown',
      }));
    });
    expect(document.activeElement).toBe(items[1]);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(document.querySelector('[role="tooltip"]')?.textContent)
      .toBe('Download a TabBoard backup');
  });
});
