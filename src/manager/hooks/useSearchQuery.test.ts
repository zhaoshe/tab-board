// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  savedSearchQueryStore,
  useSearchQuery,
  useSetSearchQuery,
} from './useSearchQuery';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function QueryProbe({ id }: { id: string }) {
  const query = useSearchQuery();
  return createElement('output', { id }, query);
}

function SetterProbe() {
  const setQuery = useSetSearchQuery();
  return createElement('button', {
    id: 'set-query',
    onClick: () => setQuery('from-hook'),
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  savedSearchQueryStore.set('');
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  savedSearchQueryStore.set('');
});

describe('saved search query React adapter', () => {
  it('publishes one imperative snapshot to every React subscriber', async () => {
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(
        'div',
        null,
        createElement(QueryProbe, { id: 'first' }),
        createElement(QueryProbe, { id: 'second' }),
      ));
    });

    await act(async () => {
      savedSearchQueryStore.set('shared');
    });

    expect(document.getElementById('first')?.textContent).toBe('shared');
    expect(document.getElementById('second')?.textContent).toBe('shared');
    expect(sessionStorage.getItem('tabboardSearch')).toBe('shared');
  });

  it('routes hook setters through the same synchronous owner', async () => {
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(
        'div',
        null,
        createElement(QueryProbe, { id: 'query' }),
        createElement(SetterProbe),
      ));
    });

    await act(async () => {
      document.getElementById('set-query')?.click();
    });

    expect(savedSearchQueryStore.getSnapshot()).toBe('from-hook');
    expect(document.getElementById('query')?.textContent).toBe('from-hook');
  });
});
