import { vi } from 'vitest';
import type { TabBoardState } from '../model';
import { STATE_KEY } from '../model/constants';

// Only external Chrome storage/runtime APIs are substituted. The registered
// worker, StatePersistence, adapters, transport and Publication stay real.
export async function restoreWorkerHarness(initial: TabBoardState) {
  const data: Record<string, unknown> = { [STATE_KEY]: structuredClone(initial) };
  const writes: Record<string, unknown>[] = [];
  const requests: Record<string, unknown>[] = [];
  let worker: ((message: unknown, sender: unknown, reply: (value: unknown) => void) => unknown) | undefined;
  let dropNext = false;
  let beforeReceiptReply: (() => void) | undefined;
  let afterDroppedCommit: (() => void) | undefined;
  const event = () => {
    const listeners = new Set<(...args: unknown[]) => void>();
    return { addListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.add(listener)), removeListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.delete(listener)), emit: (...args: unknown[]) => listeners.forEach(listener => listener(...args)) };
  };
  const changed = event();
  const chromeMock = {
    action: { onClicked: event(), setPopup: vi.fn(async () => undefined), setTitle: vi.fn(async () => undefined) }, commands: { onCommand: event() },
    contextMenus: { onClicked: event() },
    omnibox: { setDefaultSuggestion: vi.fn(), onInputChanged: event(), onInputEntered: event() },
    runtime: {
      id: 'restore-test', getURL: (path: string) => `chrome-extension://restore-test/${path}`,
      onInstalled: event(), onStartup: event(),
      onMessage: { addListener: (listener: typeof worker) => { worker = listener; }, removeListener: vi.fn() },
      sendMessage: async (message: Record<string, unknown>) => {
        requests.push(structuredClone(message));
        return new Promise((resolve, reject) => {
          worker?.(message, { id: 'restore-test' }, value => {
            if (dropNext && message.type === 'tabboard-state-mutations') {
              dropNext = false;
              afterDroppedCommit?.();
              reject(new Error('The committed reply was lost'));
            } else {
              if (value && typeof value === 'object' && (('confirmedByReceipt' in value && value.confirmedByReceipt) || ('result' in value && (value.result as { confirmedByReceipt?: boolean })?.confirmedByReceipt))) beforeReceiptReply?.();
              resolve(value);
            }
          });
        });
      },
    },
    storage: {
      local: { get: async () => structuredClone(data), set: async (items: Record<string, unknown>) => {
        writes.push(structuredClone(items));
        const changes = Object.fromEntries(Object.entries(items).map(([key, value]) => [key, { oldValue: data[key], newValue: structuredClone(value) }]));
        Object.assign(data, structuredClone(items)); changed.emit(changes, 'local');
      } }, onChanged: changed,
    },
    tabs: { onUpdated: event(), get: vi.fn(), query: vi.fn(async () => []) },
    windows: { get: vi.fn() }, tabGroups: { get: vi.fn() },
  };
  vi.stubGlobal('chrome', chromeMock);
  await import('../../background/service-worker');
  return {
    data, writes, requests, chromeMock,
    dropReply: (onCommit?: () => void) => { dropNext = true; afterDroppedCommit = onCommit; },
    send: (message: Record<string, unknown>) => chromeMock.runtime.sendMessage(message),
    beforeReceiptReply: (callback: () => void) => { beforeReceiptReply = callback; },
    restart: async () => { vi.resetModules(); await import('../../background/service-worker'); },
  };
}
