// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreRefKey } from '../../shared/model';
import {
  useManagerRuntime,
  type ManagerRuntime,
} from './useManagerRuntime';

const testHarness = vi.hoisted(() => ({
  showError: vi.fn(),
}));

vi.mock('./useToast', () => ({
  useToast: () => ({
    showError: testHarness.showError,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let runtime: ManagerRuntime | null = null;

function RuntimeHarness() {
  const value = useManagerRuntime();
  useEffect(() => {
    runtime = value;
    return () => {
      runtime = null;
    };
  }, [value]);
  return null;
}

async function mountRuntime(): Promise<ManagerRuntime> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(RuntimeHarness));
  });
  if (!runtime) throw new Error('Manager runtime did not mount.');
  return runtime;
}

beforeEach(() => {
  testHarness.showError.mockReset();
  runtime = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useManagerRuntime restoreTabs', () => {
  it('uses one restore-refs message and returns worker success evidence', async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      result: {
        restoredTabs: 2,
        outcomes: [
          {
            key: restoreRefKey({ groupId: 'session-a', tabId: 'link-a' }),
            groupId: 'session-a',
            tabId: 'link-a',
            status: 'restored',
          },
          {
            key: restoreRefKey({ groupId: 'session-a', tabId: 'link-b' }),
            groupId: 'session-a',
            tabId: 'link-b',
            status: 'restored',
          },
        ],
      },
    }));
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      tabs: { create: vi.fn() },
    });
    const managerRuntime = await mountRuntime();

    await expect(managerRuntime.restoreTabs([
      { groupId: 'session-a', tabId: 'link-a' },
      { groupId: 'session-a', tabId: 'link-b' },
    ])).resolves.toEqual({
      restoredTabs: 2,
      outcomes: [
        {
          key: restoreRefKey({ groupId: 'session-a', tabId: 'link-a' }),
          groupId: 'session-a',
          tabId: 'link-a',
          status: 'restored',
        },
        {
          key: restoreRefKey({ groupId: 'session-a', tabId: 'link-b' }),
          groupId: 'session-a',
          tabId: 'link-b',
          status: 'restored',
        },
      ],
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'restore-refs',
      refs: [
        { source: 'group', groupId: 'session-a', tabId: 'link-a' },
        { source: 'group', groupId: 'session-a', tabId: 'link-b' },
      ],
    });
    expect(testHarness.showError).not.toHaveBeenCalled();
  });

  it('surfaces the existing toast error and rejects so selection can retry', async () => {
    const sendMessage = vi.fn(async () => ({
      ok: false,
      error: 'Restore service unavailable.',
    }));
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      tabs: { create: vi.fn() },
    });
    const managerRuntime = await mountRuntime();

    await expect(managerRuntime.restoreTabs([
      { groupId: 'session-a', tabId: 'link-a' },
    ])).rejects.toThrow('Restore service unavailable.');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(testHarness.showError).toHaveBeenCalledWith(
      'Restore service unavailable.',
    );
  });

  it('rejects mismatched per-ref outcomes instead of clearing the wrong IDs', async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      result: {
        restoredTabs: 1,
        outcomes: [{
          key: restoreRefKey({
            groupId: 'other-session',
            tabId: 'link-a',
          }),
          groupId: 'other-session',
          tabId: 'link-a',
          status: 'restored',
        }],
      },
    }));
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      tabs: { create: vi.fn() },
    });
    const managerRuntime = await mountRuntime();

    await expect(managerRuntime.restoreTabs([
      { groupId: 'session-a', tabId: 'link-a' },
    ])).rejects.toThrow('mismatched per-item outcomes');
    expect(testHarness.showError).toHaveBeenCalledWith(
      'Restore service returned mismatched per-item outcomes.',
    );
  });
});
