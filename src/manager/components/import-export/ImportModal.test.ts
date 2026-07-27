// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { ImportModal } from './ImportModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../../shared/store/useTabBoardStore', () => ({
  useTabBoardStore: (selector: (state: unknown) => unknown) => selector({
    activeWorkspaceId: 'workspace',
    importGroups: vi.fn(),
  }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
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
