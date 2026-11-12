// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { theme } from '../../../shared/styles/theme';
import {
  FirstSavedHint,
  FIRST_SAVED_HINT_STORAGE_KEY,
} from './FirstSavedHint';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function renderHint(savedSessionCount: number): Promise<void> {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(createElement(
      MantineProvider,
      { theme },
      createElement(FirstSavedHint, { savedSessionCount }),
    ));
  });
}

async function renderStrictHint(savedSessionCount: number): Promise<void> {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(createElement(
      StrictMode,
      null,
      createElement(
        MantineProvider,
        { theme },
        createElement(FirstSavedHint, { savedSessionCount }),
      ),
    ));
  });
}

describe('FirstSavedHint', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('stays hidden until the first saved session context exists', async () => {
    await renderHint(0);

    expect(document.body.textContent).not.toContain('Saved sessions are drag-and-drop surfaces');
    expect(localStorage.getItem(FIRST_SAVED_HINT_STORAGE_KEY)).toBeNull();

    await renderHint(1);

    expect(document.body.textContent).toContain('Saved sessions are drag-and-drop surfaces');
    expect(localStorage.getItem(FIRST_SAVED_HINT_STORAGE_KEY)).toBe('shown');
  });

  it('shows only once across reloads after first surfacing', async () => {
    await renderHint(1);
    expect(document.body.textContent).toContain('Saved sessions are drag-and-drop surfaces');

    await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = '';

    await renderHint(2);

    expect(document.body.textContent).not.toContain('Saved sessions are drag-and-drop surfaces');
    expect(localStorage.getItem(FIRST_SAVED_HINT_STORAGE_KEY)).toBe('shown');
  });

  it('persists dismissal and does not resurface after later saves', async () => {
    await renderHint(1);

    const dismiss = document.querySelector<HTMLButtonElement>('[aria-label="Dismiss saved sessions help"]');
    expect(dismiss).not.toBeNull();

    await act(async () => {
      dismiss?.click();
    });

    expect(localStorage.getItem(FIRST_SAVED_HINT_STORAGE_KEY)).toBe('dismissed');
    expect(document.body.textContent).not.toContain('Saved sessions are drag-and-drop surfaces');

    await renderHint(3);
    expect(document.body.textContent).not.toContain('Saved sessions are drag-and-drop surfaces');
  });

  it('shows once on an initial StrictMode mount when saved sessions already exist', async () => {
    await renderStrictHint(1);

    expect(document.body.textContent).toContain('Saved sessions are drag-and-drop surfaces');
    expect(localStorage.getItem(FIRST_SAVED_HINT_STORAGE_KEY)).toBe('shown');
  });

  it('shows once after the first saved session appears later under StrictMode', async () => {
    await renderStrictHint(0);
    expect(document.body.textContent).not.toContain('Saved sessions are drag-and-drop surfaces');

    await renderStrictHint(1);

    expect(document.body.textContent).toContain('Saved sessions are drag-and-drop surfaces');
    expect(localStorage.getItem(FIRST_SAVED_HINT_STORAGE_KEY)).toBe('shown');
  });
});
