// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { managerTheme } from '../../../shared/styles/theme';
import { ManagerModal } from './ManagerModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let managerMain: HTMLElement | null = null;
let customTarget: HTMLElement | null = null;
let pageHeader: HTMLElement | null = null;

async function mountManagerModal(
  portalProps?: Parameters<typeof ManagerModal>[0]['portalProps'],
  headerAction?: Parameters<typeof ManagerModal>[0]['headerAction'],
  headerSubtitle?: Parameters<typeof ManagerModal>[0]['headerSubtitle'],
): Promise<void> {
  pageHeader = document.createElement('header');
  pageHeader.textContent = 'TabBoard';
  document.body.append(pageHeader);
  managerMain = document.createElement('main');
  managerMain.id = 'manager-main';
  document.body.append(managerMain);
  const mount = document.createElement('div');
  managerMain.append(mount);
  root = createRoot(mount);

  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme: managerTheme },
      createElement(
        ManagerModal,
        {
          opened: true,
          title: 'Workspace Dialog',
          onClose: () => undefined,
          portalProps,
          headerAction,
          headerSubtitle,
        },
        'Dialog content',
      ),
    ));
  });
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  managerMain?.remove();
  managerMain = null;
  customTarget?.remove();
  customTarget = null;
  pageHeader?.remove();
  pageHeader = null;
  document.body.innerHTML = '';
});

describe('ManagerModal portal ownership', () => {
  it('body-portals with one page banner and an associated heading', async () => {
    await mountManagerModal();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const header = dialog?.querySelector<HTMLElement>('.mantine-Modal-header');
    const title = dialog?.querySelector<HTMLHeadingElement>('h2');
    const bannerCandidates = [...document.querySelectorAll<HTMLElement>(
      'header, [role="banner"]',
    )].filter((element) => !['none', 'presentation'].includes(
      element.getAttribute('role') ?? '',
    ));

    expect(dialog).not.toBeNull();
    expect(managerMain?.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog?.closest('[data-portal]')?.parentElement).toBe(document.body);
    expect(bannerCandidates).toEqual([pageHeader]);
    expect(header?.getAttribute('role')).toBe('presentation');
    expect(title?.tagName).toBe('H2');
    expect(title?.id).toBeTruthy();
    expect(dialog?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(document.getElementById(title?.id ?? '')).toBe(title);
    expect(dialog?.querySelector('.mantine-Modal-close')?.getAttribute('aria-label'))
      .toBe('Close Workspace Dialog');
  });

  it('preserves an explicit caller portal target', async () => {
    customTarget = document.createElement('section');
    customTarget.id = 'custom-modal-target';
    document.body.append(customTarget);

    await mountManagerModal({ target: customTarget });

    expect(customTarget.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('renders an optional header action beside the title and before Close', async () => {
    await mountManagerModal(
      undefined,
      createElement('button', { type: 'button' }, 'New Workspace'),
    );

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const header = dialog.querySelector<HTMLElement>('.mantine-Modal-header')!;
    const title = header.querySelector('h2')!;
    const action = [...header.querySelectorAll('button')]
      .find((button) => button.textContent === 'New Workspace');
    const close = header.querySelector('.mantine-Modal-close');

    expect(action).not.toBeNull();
    expect(title.contains(action!)).toBe(false);
    expect(action?.parentElement?.classList).toContain(
      'tabboard-modal__header-action',
    );
    expect([...header.children].indexOf(action!.parentElement!))
      .toBeLessThan([...header.children].indexOf(close!));
  });

  it('renders an optional subtitle below but outside the associated heading', async () => {
    await mountManagerModal(
      undefined,
      undefined,
      '4 Workspaces · drag to reorder',
    );

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const title = dialog.querySelector<HTMLHeadingElement>('h2')!;
    const subtitle = dialog.querySelector<HTMLElement>(
      '.tabboard-modal__header-subtitle',
    );

    expect(subtitle?.textContent).toBe('4 Workspaces · drag to reorder');
    expect(title.contains(subtitle)).toBe(false);
    expect(subtitle?.previousElementSibling).toBe(title);
  });
});
