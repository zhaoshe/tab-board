// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionItemComposer } from './SessionItemComposer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(
  mode: 'link' | 'note',
  onAddLink = vi.fn(),
  onAddNote = vi.fn(),
): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      null,
      createElement(SessionItemComposer, {
        mode,
        onClose: vi.fn(),
        onAddLink,
        onAddNote,
      }),
    ));
  });
}

function getButton(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

describe('SessionItemComposer', () => {
  it('labels link fields and focuses the invalid URL with an actionable error', async () => {
    const onAddLink = vi.fn();
    await mount('link', onAddLink);

    const url = document.querySelector<HTMLInputElement>('input[name="session-link-url"]');
    const title = document.querySelector<HTMLInputElement>('input[name="session-link-title"]');
    expect(url?.type).toBe('url');
    expect(url?.autocomplete).toBe('off');
    expect(url?.getAttribute('spellcheck')).toBe('false');
    expect(url?.placeholder).toBe('https://example.com…');
    expect(title?.autocomplete).toBe('off');
    expect(title?.placeholder).toBe('Optional title…');

    await act(async () => getButton('Add Link').click());
    expect(onAddLink).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Enter an HTTP or HTTPS URL.');
    expect(document.activeElement).toBe(url);
  });

  it('submits a normalized link and uses its URL as the default title', async () => {
    const onAddLink = vi.fn();
    await mount('link', onAddLink);
    const url = document.querySelector<HTMLInputElement>('input[name="session-link-url"]')!;

    await act(async () => {
      url.value = ' https://example.com/path ';
      url.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => getButton('Add Link').click());

    expect(onAddLink).toHaveBeenCalledWith({
      url: 'https://example.com/path',
      title: 'https://example.com/path',
    });
  });

  it('requires note text and submits the trimmed value', async () => {
    const onAddNote = vi.fn();
    await mount('note', vi.fn(), onAddNote);
    const note = document.querySelector<HTMLTextAreaElement>('textarea[name="session-note-text"]');
    expect(note?.autocomplete).toBe('off');
    expect(note?.placeholder).toBe('Write a note…');

    await act(async () => getButton('Add Note').click());
    expect(onAddNote).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Enter note text.');
    expect(document.activeElement).toBe(note);

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setValue?.call(note, '  Review this later  ');
      note!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => getButton('Add Note').click());
    expect(onAddNote).toHaveBeenCalledWith('Review this later');
  });
});
