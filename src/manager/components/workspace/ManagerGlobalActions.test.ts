// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { ManagerGlobalActions } from './ManagerGlobalActions';

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
  it('keeps Import, Export, Trash, and Options available in the compact menu', async () => {
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
    expect(menu?.textContent).toContain('Import');
    expect(menu?.textContent).toContain('Export');
    expect(menu?.textContent).toContain('Trash');
    expect(menu?.textContent).toContain('Options');
    expect(menu?.querySelector('a[href="options.html"]')).not.toBeNull();
  });
});
