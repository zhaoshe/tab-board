// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { createEmptyState, exportToJson } from '../../../shared/model';
import { ImportModal } from './ImportModal';
import * as importParsers from '../../../shared/model/session-operations';

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

beforeEach(() => vi.useFakeTimers());

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
  actions.importGroups.mockReset();
  actions.restoreBackup.mockReset();
  actions.currentRevision = 3;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
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
    await settlePreview();
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
    await settlePreview();
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
  await settlePreview();
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

async function settlePreview() {
  await act(async () => vi.advanceTimersByTime(150));
}

describe('ImportModal deferred preview', () => {
  it('parses only the final text after continuous typing and cannot submit stale preview', async () => {
    await renderImport();
    const parse = vi.spyOn(importParsers, 'parseImportedText');
    await enterText('[First](https://first.example)');
    expect(parse).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Updating preview…');
    expect(button('Import').disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(100));
    await enterText('[Final](https://final.example)');
    await act(async () => vi.advanceTimersByTime(149));
    expect(parse).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(parse).toHaveBeenCalledExactlyOnceWith('[Final](https://final.example)');
    expect(document.body.textContent).toContain('Will import');
    expect(button('Import').disabled).toBe(false);

    await enterText('[Next](https://next.example)');
    expect(button('Import').disabled).toBe(true);
    expect(document.body.textContent).not.toContain('Will import');
    await act(async () => button('Import').click());
    expect(actions.importGroups).not.toHaveBeenCalled();
  });

  it('recovers from malformed input and clears preview immediately', async () => {
    await renderImport();
    await enterText('{ malformed JSON');
    await settlePreview();
    expect(button('Import').disabled).toBe(true);
    expect(document.body.textContent).toContain('Check that the text');
    await enterText('[Corrected](https://corrected.example)');
    await settlePreview();
    expect(document.body.textContent).not.toContain('Check that the text');
    expect(button('Import').disabled).toBe(false);
    await enterText('');
    expect(document.querySelector('textarea')?.value).toBe('');
    expect(document.body.textContent).not.toContain('Will import');
    expect(document.body.textContent).not.toContain('Updating preview');
    expect(button('Import').disabled).toBe(true);
  });

  it('cancels pending preview immediately without parsing discarded text', async () => {
    const onClose = await renderImport();
    const parse = vi.spyOn(importParsers, 'parseImportedText');
    await enterText('[Discard](https://discard.example)');
    await act(async () => button('Cancel').click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('textarea')?.value).toBe('');
    await settlePreview();
    expect(parse).not.toHaveBeenCalled();
  });

  it('reuses unchanged complete parsing across mode changes and retains pending and failed restore input', async () => {
    const onClose = await renderImport();
    const parse = vi.spyOn(importParsers, 'parseCompleteBackup');
    const text = exportToJson(createEmptyState());
    await enterText(text);
    await settlePreview();
    expect(parse).toHaveBeenCalledExactlyOnceWith(text);
    await act(async () => document.querySelector<HTMLInputElement>('input[value="restore"]')?.click());
    let reject: ((error: Error) => void) | undefined;
    actions.restoreBackup.mockImplementation(() => new Promise<void>((_, fail) => { reject = fail; }));
    await act(async () => button('Restore Backup').click());
    expect(document.querySelector('textarea')?.readOnly).toBe(true);
    expect(document.querySelector('textarea')?.value).toBe(text);
    await act(async () => button('Cancel').click());
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => reject?.(new Error('Storage unavailable')));
    expect(document.querySelector('textarea')?.value).toBe(text);
    expect(document.querySelector<HTMLInputElement>('input[value="restore"]')?.checked).toBe(true);
    expect(document.body.textContent).toContain('Storage unavailable');
    expect(parse).toHaveBeenCalledOnce();
  });
});

it('preserves pending commit input when an earlier file read finishes late', async () => {
  await renderImport();
  const original = '[Original](https://original.example)';
  await enterText(original);
  await settlePreview();
  let finishRead: ((event: { target: { result: string } }) => void) | null = null;
  vi.stubGlobal('FileReader', class {
    onload: typeof finishRead = null;
    readAsText() { finishRead = this.onload; }
  });
  const drop = new Event('drop', { bubbles: true });
  Object.defineProperty(drop, 'dataTransfer', { value: { files: [new File(['late'], 'late.txt')] } });
  await act(async () => document.querySelector('[style*="dashed"]')?.dispatchEvent(drop));
  let reject: ((error: Error) => void) | undefined;
  actions.importGroups.mockImplementation(() => new Promise<void>((_, fail) => { reject = fail; }));
  await act(async () => button('Import').click());
  await act(async () => finishRead?.({ target: { result: '[Late](https://late.example)' } }));
  expect(document.querySelector('textarea')?.value).toBe(original);
  await act(async () => reject?.(new Error('Storage unavailable')));
  expect(document.querySelector('textarea')?.value).toBe(original);
  expect(document.body.textContent).toContain('Storage unavailable');
});

it('stops native autosize measurements at 65,536 characters and keeps large text in a six-row scrolling editor', async () => {
  // Mantine disables autosize in test mode; exercise its real browser branch.
  vi.stubEnv('NODE_ENV', 'development');
  const styles = document.createElement('style');
  styles.textContent = 'textarea { box-sizing: border-box; padding: 0; border: 0; }';
  document.body.append(styles);
  const measuredValues: string[] = [];
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
    measuredValues.push(this.value);
    return 20;
  });
  await renderImport();
  const small = 'x'.repeat(65_535);
  await enterText(small);
  expect(measuredValues).toContain(small);
  expect(document.querySelector('textarea[name="session-import-text"]')?.hasAttribute('data-no-overflow')).toBe(true);

  measuredValues.length = 0;
  const large = small + 'x';
  await enterText(large);
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="session-import-text"]')!;
  expect(measuredValues).toHaveLength(0);
  expect(textarea.value).toBe(large);
  expect(textarea.getAttribute('rows')).toBe('6');
  expect(textarea.hasAttribute('data-no-overflow')).toBe(false);
  expect(textarea.style.overflowY).toBe('auto');
  expect(textarea.style.resize).toBe('none');
  expect(textarea.getAttribute('maxlength')).toBeNull();
  expect(document.body.textContent).toContain('Updating preview…');
  expect(button('Import').disabled).toBe(true);

  await enterText(large + '\n');
  expect(document.querySelector<HTMLTextAreaElement>('textarea[name="session-import-text"]')?.value).toBe(large + '\n');
  expect(measuredValues).toHaveLength(0);
  await enterText('[Small](https://small.example)');
  expect(measuredValues).toContain('[Small](https://small.example)');
  await settlePreview();
  expect(button('Import').disabled).toBe(false);
});
