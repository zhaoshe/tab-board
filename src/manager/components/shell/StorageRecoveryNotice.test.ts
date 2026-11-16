// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../../shared/styles/theme';
import type { StorageStatusProjection } from '../../../shared/store/settingsProjection';
import { StorageRecoveryNotice } from './StorageRecoveryNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  status: null as StorageStatusProjection | null,
}));

vi.mock('../../../shared/hooks/useStorageStatusProjection', () => ({
  useStorageStatusProjection: () => harness.status,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderNotice(): Promise<void> {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme },
      createElement(StorageRecoveryNotice),
    ));
  });
}

describe('StorageRecoveryNotice', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    harness.status = null;
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn(async () => ({ ok: true })),
      },
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('shows the manager recovery notice and opens Options from the CTA', async () => {
    harness.status = {
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'TabBoard',
      fallbackReason: null,
      fileUpdatedAt: '2026-11-12T12:00:00.000Z',
      unreadSessionCount: 2,
    };

    await renderNotice();

    expect(document.body.textContent).toContain('Incomplete folder data');
    expect(document.body.textContent).toContain('2 saved sessions could not be read');

    const openSettings = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Open settings');
    expect(openSettings).toBeDefined();

    await act(async () => {
      openSettings?.click();
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'open-options' });
  });

  it('stays dismissed for the same count and reappears only after the unread count changes', async () => {
    harness.status = {
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'TabBoard',
      fallbackReason: null,
      fileUpdatedAt: '2026-11-12T12:00:00.000Z',
      unreadSessionCount: 1,
    };

    await renderNotice();

    const dismiss = document.querySelector<HTMLButtonElement>('[aria-label="Dismiss storage notice"]');
    expect(dismiss).not.toBeNull();

    await act(async () => {
      dismiss?.click();
    });

    expect(document.body.textContent).not.toContain('1 saved session could not be read');

    await renderNotice();
    expect(document.body.textContent).not.toContain('1 saved session could not be read');

    harness.status = {
      ...harness.status,
      unreadSessionCount: 2,
    };
    await renderNotice();
    expect(document.body.textContent).toContain('2 saved sessions could not be read');

    harness.status = {
      ...harness.status,
      unreadSessionCount: 0,
    };
    await renderNotice();
    expect(document.body.textContent).not.toContain('saved sessions could not be read');
  });
});
