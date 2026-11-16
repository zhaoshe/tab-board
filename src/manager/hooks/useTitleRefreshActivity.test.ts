// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { titleRefreshActivityStore } from '../core/titleRefreshActivity';
import {
  useIsTitleRefreshing,
  useTitleRefreshActivityListener,
} from './useTitleRefreshActivity';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('title refresh activity runtime adapter', () => {
  it('bridges runtime activity messages to the keyed row subscription', async () => {
    let listener: ((message: unknown) => void) | undefined;
    const addListener = vi.fn((next: (message: unknown) => void) => {
      listener = next;
    });
    const removeListener = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener, removeListener },
      },
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    function Harness() {
      useTitleRefreshActivityListener();
      const active = useIsTitleRefreshing('group-a', 'tab-a');
      return createElement('span', null, String(active));
    }

    await act(async () => root.render(createElement(Harness)));
    expect(container.textContent).toBe('false');

    await act(async () => listener?.({
      type: 'tabboard-title-refresh-activity',
      groupId: 'group-a',
      tabId: 'tab-a',
      operationId: 'operation-a',
      status: 'start',
    }));
    expect(container.textContent).toBe('true');

    await act(async () => listener?.({
      type: 'tabboard-title-refresh-activity',
      groupId: 'group-a',
      tabId: 'tab-a',
      operationId: 'operation-a',
      status: 'finish',
    }));
    expect(container.textContent).toBe('false');

    await act(async () => root.unmount());
    expect(removeListener).toHaveBeenCalledWith(listener);
    container.remove();
  });
});
