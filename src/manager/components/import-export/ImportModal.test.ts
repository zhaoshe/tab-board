// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { createEmptyState, exportToJson } from '../../../shared/model';
import { ImportModal } from './ImportModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const actions = vi.hoisted(() => ({ importGroups: vi.fn(), restoreBackup: vi.fn(), currentRevision: 3 }));
vi.mock('../../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: Object.assign((selector: (state: unknown) => unknown) => selector({
    activeWorkspaceId: 'workspace',
    mutationRevision: 3,
    ...actions,
  }), { getState: () => ({ mutationRevision: actions.currentRevision }) }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  actions.importGroups.mockReset();
  actions.restoreBackup.mockReset();
  actions.currentRevision = 3;
});

describe('ImportModal form semantics', () => {
  it('labels import text and uses non-auth autocomplete with ellipsis copy', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(
        MantineProvider,
        null,
        createElement(ImportModal, { opened: true, onClose: vi.fn() }),
      ));
    });

    const input = document.querySelector<HTMLTextAreaElement>('textarea');
    expect(input?.name).toBe('session-import-text');
    expect(input?.getAttribute('aria-label')).toBe('Session import text');
    expect(input?.autocomplete).toBe('off');
    expect(input?.getAttribute('spellcheck')).toBe('false');
    expect(input?.placeholder).toBe('Paste import text here…');

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput?.name).toBe('session-import-file');
    expect(fileInput?.getAttribute('aria-label')).toBe('Import Session File');
  });
});

async function renderImport(onClose = vi.fn()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(MantineProvider, null, createElement(ImportModal, { opened: true, onClose }))));
  return onClose;
}
async function enterText(text: string) {
  const textarea = document.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function button(label: string): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find(button => button.textContent === label)!;
}

describe('ImportModal authority confirmation', () => {
  it('retains session input on commit failure and closes only after retry succeeds', async () => {
    const onClose = await renderImport();
    await enterText('[Example](https://example.com)');
    actions.importGroups.mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValueOnce(undefined);
    await act(async () => button('Import').click());
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('textarea')?.value).toBe('[Example](https://example.com)');
    expect(document.body.textContent).toContain('Storage unavailable');
    await act(async () => button('Import').click());
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('defaults to add sessions and offers explicit full restore for empty complete JSON', async () => {
    const onClose = await renderImport();
    const text = exportToJson(createEmptyState());
    await enterText(text);
    const radio = document.querySelector<HTMLInputElement>('input[value="restore"]');
    expect(radio).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[value="sessions"]')?.checked).toBe(true);
    await act(async () => radio?.click());
    let resolve: (() => void) | undefined;
    actions.restoreBackup.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    await act(async () => button('Restore Backup').click());
    expect(actions.restoreBackup).toHaveBeenCalledWith(text, 3);
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('textarea')?.value).toBe(text);
    await act(async () => resolve?.());
    expect(onClose).toHaveBeenCalledOnce();
    expect(actions.importGroups).not.toHaveBeenCalled();
  });
});

it('retains restore mode and retries against the reconciled current revision after a conflict', async () => {
  const onClose = await renderImport();
  const text = exportToJson(createEmptyState());
  await enterText(text);
  await act(async () => document.querySelector<HTMLInputElement>('input[value="restore"]')?.click());
  actions.restoreBackup.mockRejectedValueOnce(new Error('Data changed. Review and retry.')).mockResolvedValueOnce(undefined);
  actions.currentRevision = 4;
  await act(async () => button('Restore Backup').click());
  expect(onClose).not.toHaveBeenCalled();
  expect(document.querySelector('textarea')?.value).toBe(text);
  expect(document.querySelector<HTMLInputElement>('input[value="restore"]')?.checked).toBe(true);
  await act(async () => button('Restore Backup').click());
  expect(actions.restoreBackup.mock.calls.map(call => call[1])).toEqual([3, 4]);
  expect(onClose).toHaveBeenCalledOnce();
});
