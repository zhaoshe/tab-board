// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installPreviewChrome, type PreviewChromeHarness } from '../dev/previewChrome';
import { useTabBoardStore } from '../shared/store/useTabBoardStore';
import { ManagerApp } from './ManagerApp';
import { normalizeState } from '../shared/model';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let harness: PreviewChromeHarness | null = null;
const isolatedPreviewStorage = {
  read: () => null,
  write: () => undefined,
};

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

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState(null, '', '/manager.html');
  container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  harness = installPreviewChrome({
    storagePersistence: isolatedPreviewStorage,
  });
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  harness?.uninstall();
  harness = null;
  vi.restoreAllMocks();
});

describe('ManagerApp hydration', () => {
  it.each(['sessions', 'restore'])('keeps URL and canonical workspace aligned after explicit %s import', async (mode) => {
    history.replaceState(null, '', '/manager.html?workspace=workspace_default&category=inbox&view=board');
    root = createRoot(container!);
    await act(async () => root?.render(createElement(StrictMode, null, createElement(ManagerApp))));
    await vi.waitFor(() => expect(document.querySelector('.manager-shell')).not.toBeNull());
    const before = normalizeState(useTabBoardStore.getState());
    const research = { ...before.workspaces[0], id: 'workspace_research', name: 'Research' };
    const backup = normalizeState({ ...before, mutationRevision: 90, workspaces: [...before.workspaces, research], activeWorkspaceId: research.id });
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="More Actions"]')?.click());
    const importEntry = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent === 'Import');
    expect(importEntry).toBeDefined();
    await act(async () => importEntry?.click());
    const textarea = await vi.waitFor(() => {
      const element = document.querySelector<HTMLTextAreaElement>('textarea[name="session-import-text"]');
      expect(element).not.toBeNull();
      return element!;
    });
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, JSON.stringify(backup));
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (mode === 'restore') await act(async () => document.querySelector<HTMLInputElement>('input[value="restore"]')?.click());
    const submit = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(item => item.textContent === (mode === 'restore' ? 'Restore Backup' : 'Import'));
    expect(submit?.disabled).toBe(false);
    await act(async () => submit?.click());
    await vi.waitFor(() => expect(document.querySelector('textarea[name="session-import-text"]')).toBeNull());
    const expectedWorkspace = mode === 'restore' ? 'workspace_research' : 'workspace_default';
    await vi.waitFor(() => expect(new URLSearchParams(location.search).get('workspace')).toBe(expectedWorkspace));
    expect(useTabBoardStore.getState().activeWorkspaceId).toBe(expectedWorkspace);
    expect(harness?.state.activeWorkspaceId).toBe(expectedWorkspace);
    const oldSnapshot = await harness!.chrome.storage.local.get('tabboardBackupBeforeRestore');
    if (mode === 'restore') expect(oldSnapshot.tabboardBackupBeforeRestore).toEqual(before);
    else expect(oldSnapshot).toEqual({});
  });

  it('provides a skip link and page heading for keyboard navigation', async () => {
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(ManagerApp));
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.manager-shell')).not.toBeNull();
    });

    const skipLink = document.querySelector<HTMLAnchorElement>('a.skip-link');
    expect(skipLink?.getAttribute('href')).toBe('#manager-main');
    expect(skipLink?.textContent).toBe('Skip to Saved Sessions');
    expect(document.querySelector('h1')?.textContent).toBe('TabBoard Tab Manager');
  });

  it.each(['Enter', 'F2'])('starts session rename with %s', async (key) => {
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(ManagerApp));
    });

    const savedCategory = await vi.waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>('[data-category-id="saved"]');
      expect(element).not.toBeNull();
      return element!;
    });
    await act(async () => savedCategory.click());

    const title = await vi.waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>('.session-card__title');
      expect(element).not.toBeNull();
      return element!;
    });
    await act(async () => {
      title.focus();
      title.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    });

    const input = document.querySelector<HTMLInputElement>('.session-card__heading input');
    expect(input?.value).toBe('Starred preview session');
  });

  it('renders an existing session note as a keyboard button', async () => {
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(ManagerApp));
    });

    const customCategory = await vi.waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>('[data-category-id^="folder:"]');
      expect(element).not.toBeNull();
      return element!;
    });
    await act(async () => customCategory.click());

    const note = await vi.waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>('button.session-card__note');
      expect(element).not.toBeNull();
      return element!;
    });
    expect(note.textContent).toContain('A group-level note for the locked fixture.');
  });

  it('mounts once under StrictMode without exceeding React update depth', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(StrictMode, null, createElement(ManagerApp)));
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.manager-shell')).not.toBeNull();
    }, { timeout: 2_000, interval: 10 });

    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/maximum update depth|error #185/i);
  });

  it('enters open-tab selection mode without exceeding React update depth', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(StrictMode, null, createElement(ManagerApp)));
    });

    const checkbox = await vi.waitFor(() => {
      const element = document.querySelector<HTMLInputElement>('input[aria-label="Select Active HTTP tab"]');
      expect(element).not.toBeNull();
      return element!;
    }, { timeout: 2_000, interval: 10 });

    await act(async () => {
      checkbox.click();
    });

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('1 Selected');
    }, { timeout: 2_000, interval: 10 });

    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/maximum update depth|error #185/i);
  });

  it('creates and navigates to a custom-emoji workspace once under StrictMode', async () => {
    history.replaceState(
      null,
      '',
      '/manager.html?workspace=workspace_default&category=inbox&view=board',
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const setActiveWorkspace = vi.spyOn(
      useTabBoardStore.getState(),
      'setActiveWorkspace',
    );
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(StrictMode, null, createElement(ManagerApp)));
    });

    const workspaceTrigger = await vi.waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>(
        '[aria-label="Workspace: Personal"]',
      );
      expect(element).not.toBeNull();
      return element!;
    }, { timeout: 2_000, interval: 10 });
    await act(async () => workspaceTrigger.click());

    const createWorkspace = await vi.waitFor(() => {
      const element = [...document.querySelectorAll<HTMLButtonElement>('.mantine-Menu-item')]
        .find((candidate) => candidate.textContent?.includes('New Workspace'));
      expect(element).toBeDefined();
      return element!;
    });
    await act(async () => createWorkspace.click());

    const name = document.querySelector<HTMLInputElement>('input[name="workspace-name"]');
    expect(name).not.toBeNull();
    await changeInput(name!, 'Engineering');
    const custom = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Custom');
    expect(custom).toBeDefined();
    await act(async () => custom?.click());
    const emoji = document.querySelector<HTMLInputElement>('input[name="workspace-emoji"]');
    expect(emoji).not.toBeNull();
    await changeInput(emoji!, '👩🏽‍💻');

    const submit = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent?.trim() === 'Create Workspace');
    expect(submit?.disabled).toBe(false);
    await act(async () => submit?.click());

    await vi.waitFor(() => {
      expect(document.querySelector('[aria-label="Workspace: Engineering"]')).not.toBeNull();
      expect(document.querySelector('.tabboard-error-boundary')).toBeNull();
    }, { timeout: 2_000, interval: 10 });
    await vi.waitFor(() => {
      expect(harness?.state.activeWorkspaceId).not.toBe('workspace_default');
    }, { timeout: 2_000, interval: 10 });

    const created = harness?.state.workspaces.find(({ name: workspaceName }) =>
      workspaceName === 'Engineering');
    expect(created?.emoji).toBe('👩🏽‍💻');
    expect(setActiveWorkspace).toHaveBeenCalledTimes(1);
    expect(setActiveWorkspace).toHaveBeenCalledWith(created?.id);
    expect(harness?.state.activeWorkspaceId).toBe(created?.id);
    expect(new URLSearchParams(window.location.search).get('workspace')).toBe(created?.id);
    expect(new URLSearchParams(window.location.search).get('category')).toBe('inbox');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('board');
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(
      /maximum update depth|error #185|sync render loop/i,
    );
  });

  it('keeps overlay positioning stable after opening a saved tab and returning focus', async () => {
    harness?.uninstall();
    harness = installPreviewChrome({
      storagePersistence: isolatedPreviewStorage,
      tabs: Array.from({ length: 80 }, (_, index) => ({
        id: index + 1,
        windowId: 1,
        index,
        active: index === 0,
        title: `Open tab ${index + 1}`,
        url: `https://example.test/${index + 1}`,
      })),
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    root = createRoot(container!);

    await act(async () => {
      root?.render(createElement(StrictMode, null, createElement(ManagerApp)));
    });

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.manager-open-tab-row')).toHaveLength(80);
    }, { timeout: 2_000, interval: 10 });

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-category-id="saved"]')?.click();
    });
    const savedLink = await vi.waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>('.tab-item-row__title');
      expect(element).not.toBeNull();
      return element!;
    }, { timeout: 2_000, interval: 10 });
    await act(async () => {
      savedLink?.click();
    });

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.manager-open-tab-row')).toHaveLength(81);
    }, { timeout: 2_000, interval: 10 });
    expect(document.querySelector('.manager-info-popover')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new FocusEvent('focus'));
      window.dispatchEvent(new FocusEvent('focus'));
    });

    const openTabTrigger = document.querySelector<HTMLButtonElement>('[data-info-popover="open"]');
    expect(openTabTrigger).not.toBeNull();
    await act(async () => {
      openTabTrigger?.focus();
    });

    expect(document.querySelector('.manager-info-popover')).not.toBeNull();
    expect(document.querySelector('.tabboard-error-boundary')).toBeNull();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/maximum update depth|error #185|sync render loop/i);
  });
});
