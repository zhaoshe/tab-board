// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyState,
  createGroupFromTabRecords,
  createTabRecord,
  restoreRefKey,
  type Group,
  type TabBoardState,
} from '../shared/model';
import {
  installPreviewChrome,
  type PreviewChromeHarness,
  type PreviewResponse,
} from '../dev/previewChrome';
import { ManagerApp } from './ManagerApp';
import { ManagerFrame } from './components/shell/ManagerFrame';
import { savedSearchQueryStore } from './hooks/useSearchQuery';

const testStorage = vi.hoisted(() => {
  function createStorage(): Storage {
    const values = new Map<string, string>();
    return {
      get length() {
        return values.size;
      },
      clear() {
        values.clear();
      },
      getItem(key: string) {
        return values.get(String(key)) ?? null;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(String(key));
      },
      setItem(key: string, value: string) {
        values.set(String(key), String(value));
      },
    };
  }

  const local = createStorage();
  const session = createStorage();
  const targets = typeof window === 'undefined' || window === globalThis
    ? [globalThis]
    : [globalThis, window];
  const originalDescriptors = targets.map((target) => ({
    target,
    localStorage: Object.getOwnPropertyDescriptor(target, 'localStorage'),
    sessionStorage: Object.getOwnPropertyDescriptor(target, 'sessionStorage'),
  }));

  const install = () => {
    for (const target of targets) {
      Object.defineProperty(target, 'localStorage', {
        configurable: true,
        value: local,
      });
      Object.defineProperty(target, 'sessionStorage', {
        configurable: true,
        value: session,
      });
    }
  };
  const restore = () => {
    for (const descriptors of originalDescriptors) {
      for (const key of ['localStorage', 'sessionStorage'] as const) {
        const descriptor = descriptors[key];
        if (descriptor) {
          Object.defineProperty(descriptors.target, key, descriptor);
        } else {
          Reflect.deleteProperty(descriptors.target, key);
        }
      }
    }
  };

  install();
  return { install, local, restore, session };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const isolatedPreviewStorage = {
  read: () => null,
  write: () => undefined,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let harness: PreviewChromeHarness | null = null;
let savedGroups: Group[] = [];
let animationFrames: FrameRequestCallback[] = [];

function deferMutationAuthority() {
  if (!harness) throw new Error('Preview harness is not installed.');
  const originalSendMessage = harness.chrome.runtime.sendMessage.bind(
    harness.chrome.runtime,
  );
  let pendingMessage: unknown;
  let resolvePending: ((response: PreviewResponse<unknown>) => void) | null = null;
  vi.spyOn(harness.chrome.runtime, 'sendMessage').mockImplementation(
    async (message: unknown) => {
      if ((message as { type?: string })?.type !== 'tabboard-state-mutations') {
        return originalSendMessage(message);
      }
      pendingMessage = structuredClone(message);
      return new Promise((resolve) => {
        resolvePending = resolve;
      });
    },
  );
  return {
    waitForRequest: async () => {
      await vi.waitFor(() => expect(pendingMessage).toBeDefined());
    },
    reject: async () => {
      if (!resolvePending) throw new Error('No deferred mutation request.');
      resolvePending({
        ok: false,
        code: 'INVALID_DROP_INTENT',
        error: 'Deferred Hybrid authority rejected.',
        invalidMutationIndexes: [0],
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
    resolve: async () => {
      if (!resolvePending || !pendingMessage) {
        throw new Error('No deferred mutation request.');
      }
      resolvePending(await originalSendMessage(pendingMessage));
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
}

function createSelectionState(): TabBoardState {
  const state = createEmptyState();
  savedGroups = Array.from({ length: 8 }, (_, index) => createGroupFromTabRecords([
    createTabRecord({
      id: 9_000 + index,
      windowId: 1,
      title: `Saved item ${index + 1}`,
      url: `https://saved-${index + 1}.example/`,
    }),
  ], {
    title: `Owner session ${index + 1}`,
    workspaceId: state.activeWorkspaceId,
    starred: true,
  }));
  savedGroups[0] = {
    ...savedGroups[0]!,
    tabs: [
      ...savedGroups[0]!.tabs,
      createTabRecord({
        id: 9_100,
        windowId: 1,
        title: 'Saved item 1 failed',
        url: 'https://saved-1-failed.example/',
      }),
    ],
  };
  return { ...state, groups: savedGroups };
}

async function mountManager(): Promise<void> {
  root = createRoot(container!);
  await act(async () => {
    root?.render(createElement(ManagerApp));
  });
  await vi.waitFor(() => {
    expect(document.querySelector('.manager-shell')).not.toBeNull();
    expect(document.querySelectorAll('.session-board__group-slot')).toHaveLength(8);
  }, { timeout: 2_000, interval: 10 });
}

function checkbox(label: string): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  expect(element, `Expected checkbox ${label}`).not.toBeNull();
  return element!;
}

function button(label: string): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  expect(element, `Expected button ${label}`).not.toBeNull();
  return element!;
}

function menuItem(label: string): HTMLButtonElement {
  const element = [...document.querySelectorAll<HTMLButtonElement>(
    '[role="menuitem"]',
  )].find((candidate) => candidate.textContent?.trim() === label);
  expect(element, `Expected menu item ${label}`).not.toBeUndefined();
  return element!;
}

async function clickAsUser(element: HTMLElement): Promise<void> {
  expect(
    element.closest('[inert]'),
    'A browser user cannot click a control below an inert Manager surface',
  ).toBeNull();
  await act(async () => element.click());
}

async function clickAndSettleAsUser(
  element: HTMLElement,
  assertion: () => void,
): Promise<void> {
  expect(
    element.closest('[inert]'),
    'A browser user cannot click a control below an inert Manager surface',
  ).toBeNull();
  await act(async () => element.click());
  let lastError: unknown;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });
    try {
      assertion();
      return;
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw lastError;
}

async function expectChecked(label: string, checked: boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(checkbox(label).checked).toBe(checked);
  });
}

async function flushAnimationFrames(): Promise<void> {
  await act(async () => {
    const pending = animationFrames;
    animationFrames = [];
    for (const callback of pending) callback(performance.now());
  });
}

beforeEach(() => {
  testStorage.install();
  testStorage.local.clear();
  testStorage.session.clear();
  animationFrames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    animationFrames.push(callback);
    return animationFrames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  document.body.innerHTML = '';
  history.replaceState(
    null,
    '',
    '/manager.html?workspace=workspace_default&category=saved&view=board',
  );
  savedSearchQueryStore.set('');
  container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  harness = installPreviewChrome({
    state: createSelectionState(),
    storagePersistence: isolatedPreviewStorage,
  });
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
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
  savedSearchQueryStore.set('');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  testStorage.restore();
});

describe('Manager selection scope integration', () => {
  it('keeps visual sidebar expansion interactive while a real overlay stays inert', async () => {
    const renderFrame = async (sidebarState: 'peek' | 'drawer') => {
      const props: ComponentProps<typeof ManagerFrame> = {
        dragActive: false,
        sidebarState,
        openTabsDragActive: false,
        onSidebarPointerIntent: vi.fn(),
        onSidebarFocusIntent: vi.fn(),
        header: createElement('button', null, 'Header action'),
        sidebar: createElement('div', null, 'Sidebar'),
        main: createElement('button', null, 'Saved action'),
      };
      await act(async () => {
        root?.render(createElement(ManagerFrame, props));
      });
    };
    root = createRoot(container!);

    await renderFrame('peek');
    expect(document.querySelector('.manager-shell--sidebar-peek')).not.toBeNull();
    expect(document.querySelector('.manager-topbar')?.hasAttribute('inert')).toBe(false);
    expect(document.querySelector('.manager-main-surface')?.hasAttribute('inert')).toBe(false);

    await renderFrame('drawer');
    expect(document.querySelector('.manager-topbar')?.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.manager-main-surface')?.hasAttribute('inert')).toBe(true);
  });

  it('moves Open to Saved and Saved back to Open while clearing the old IDs', async () => {
    await mountManager();
    await clickAsUser(checkbox('Select Active HTTP tab'));
    await expectChecked('Select Active HTTP tab', true);

    const saved = checkbox('Select Saved item 1');
    expect(document.querySelector('.manager-main-surface')?.hasAttribute('inert'))
      .toBe(false);
    await clickAsUser(saved);
    await expectChecked('Select Active HTTP tab', false);
    await expectChecked('Select Saved item 1', true);

    await clickAsUser(checkbox('Select Active HTTP tab'));
    await expectChecked('Select Saved item 1', false);
    await expectChecked('Select Active HTTP tab', true);
  });

  it('moves Saved A to Saved B and keeps zero-selected mode after clearing B', async () => {
    await mountManager();
    await clickAsUser(checkbox('Select Saved item 1'));
    await expectChecked('Select Saved item 1', true);

    await clickAsUser(checkbox('Select Saved item 2'));
    await expectChecked('Select Saved item 1', false);
    await expectChecked('Select Saved item 2', true);

    await clickAsUser(checkbox('Select Saved item 2'));
    await expectChecked('Select Saved item 2', false);
    expect(
      checkbox('Select Saved item 2')
        .closest('.tab-item-row__content')
        ?.hasAttribute('data-selection-mode'),
    ).toBe(true);
  });

  it('enters zero-selected Session mode from More and focuses the in-place toolbar', async () => {
    await mountManager();
    const firstSession = document.querySelector<HTMLElement>(
      `#session-card-${savedGroups[0]?.id}`,
    );
    const more = firstSession?.querySelector<HTMLButtonElement>(
      'button[aria-label="More"]',
    );
    expect(more).not.toBeNull();

    await clickAsUser(more!);
    await clickAsUser(menuItem('Select Tabs'));

    const toolbar = firstSession?.querySelector<HTMLElement>(
      '.session-selection-toolbar',
    );
    expect(toolbar?.textContent).toContain('0 Selected');
    const firstAction = toolbar?.querySelector<HTMLButtonElement>(
      'button[aria-label="Select All Visible Items"]',
    );
    expect(firstAction).not.toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(firstAction));
    expect(firstSession?.querySelector('.session-card__actions')).toBeNull();
  });

  it('clears only successful restored IDs and keeps failed links selected in mode', async () => {
    await mountManager();
    const originalSendMessage = harness!.chrome.runtime.sendMessage.bind(
      harness!.chrome.runtime,
    );
    const sendMessage = vi.spyOn(harness!.chrome.runtime, 'sendMessage')
      .mockImplementation(async (message: unknown) => {
        if ((message as { type?: string })?.type !== 'restore-refs') {
          return originalSendMessage(message);
        }
        const refs = (message as {
          refs: Array<{ source: 'group'; groupId: string; tabId: string }>;
        }).refs;
        return {
          ok: true,
          result: {
            restoredTabs: 1,
            outcomes: [
              {
                key: restoreRefKey(refs[0]!),
                groupId: refs[0]!.groupId,
                tabId: refs[0]!.tabId,
                status: 'restored',
              },
              {
                key: restoreRefKey(refs[1]!),
                groupId: refs[1]!.groupId,
                tabId: refs[1]!.tabId,
                status: 'failed',
                error: 'create-failed',
              },
            ],
          },
        };
      });
    await clickAsUser(checkbox('Select Saved item 1'));
    await clickAsUser(checkbox('Select Saved item 1 failed'));
    await expectChecked('Select Saved item 1', true);
    await expectChecked('Select Saved item 1 failed', true);

    await clickAsUser(button('Restore Selected Links'));

    await vi.waitFor(() => {
      expect(checkbox('Select Saved item 1').checked).toBe(false);
      expect(checkbox('Select Saved item 1 failed').checked).toBe(true);
      expect(document.querySelector('.session-selection-toolbar')?.textContent)
        .toContain('1 Selected');
    });
    expect(sendMessage.mock.calls.filter(([message]) =>
      (message as { type?: string })?.type === 'restore-refs')).toHaveLength(1);
    expect(document.body.textContent).toContain(
      '1 link could not be restored and remains selected',
    );
  });

  it('keeps every selected link and shows actionable feedback when all restores fail', async () => {
    await mountManager();
    const originalSendMessage = harness!.chrome.runtime.sendMessage.bind(
      harness!.chrome.runtime,
    );
    vi.spyOn(harness!.chrome.runtime, 'sendMessage')
      .mockImplementation(async (message: unknown) => {
        if ((message as { type?: string })?.type !== 'restore-refs') {
          return originalSendMessage(message);
        }
        const refs = (message as {
          refs: Array<{ source: 'group'; groupId: string; tabId: string }>;
        }).refs;
        return {
          ok: true,
          result: {
            restoredTabs: 0,
            outcomes: refs.map((ref) => ({
              key: restoreRefKey(ref),
              groupId: ref.groupId,
              tabId: ref.tabId,
              status: 'failed',
              error: 'create-failed',
            })),
          },
        };
      });
    await clickAsUser(checkbox('Select Saved item 1'));
    await clickAsUser(checkbox('Select Saved item 1 failed'));

    await clickAsUser(button('Restore Selected Links'));

    await vi.waitFor(() => {
      expect(checkbox('Select Saved item 1').checked).toBe(true);
      expect(checkbox('Select Saved item 1 failed').checked).toBe(true);
      expect(document.querySelector('.session-selection-toolbar')?.textContent)
        .toContain('2 Selected');
    });
    expect(document.body.textContent).toContain(
      '2 links could not be restored and remain selected',
    );
  });

  it('safely unmounts an empty source after every selected link restores', async () => {
    await mountManager();
    await clickAsUser(checkbox('Select Saved item 2'));
    await expectChecked('Select Saved item 2', true);

    await clickAsUser(button('Restore Selected Links'));

    await vi.waitFor(() => {
      expect(document.querySelector(`#session-card-${savedGroups[1]?.id}`))
        .toBeNull();
      expect(document.querySelector('.session-selection-toolbar')).toBeNull();
    });
  });

  it('commits Open Save to as one copy-open-tabs DropIntent and then clears IDs', async () => {
    await mountManager();
    await clickAsUser(checkbox('Select Active HTTP tab'));
    await expectChecked('Select Active HTTP tab', true);

    await clickAsUser(button('Save Selected Tabs To'));
    const target = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    )].find((candidate) => candidate.textContent?.trim() === 'Owner session 1');
    expect(target).not.toBeUndefined();
    expect(target?.textContent).not.toContain(savedGroups[0]?.id);
    await clickAndSettleAsUser(target!, () => {
      const mutationMessage = [...(harness?.sentMessages ?? [])]
        .reverse()
        .find((message) =>
          (message as { type?: string }).type === 'tabboard-state-mutations') as {
            mutations?: Array<{ type?: string; intent?: { kind?: string } }>;
          } | undefined;
      expect(mutationMessage?.mutations?.[0]).toMatchObject({
        type: 'drop-intent',
        intent: {
          kind: 'copy-open-tabs',
          targetGroupId: savedGroups[0]?.id,
        },
      });
      expect(checkbox('Select Active HTTP tab').checked).toBe(false);
      expect(document.activeElement).toBe(
        document.querySelector('[data-open-tabs-panel]'),
      );
    });
  });

  it('commits Saved Move as move-tabs and exits safely when the source disappears', async () => {
    await mountManager();
    await clickAsUser(checkbox('Select Saved item 1'));
    await clickAsUser(checkbox('Select Saved item 1 failed'));
    await expectChecked('Select Saved item 1', true);
    await expectChecked('Select Saved item 1 failed', true);

    await clickAsUser(button('Move Selected Items'));
    const target = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    )].find((candidate) => candidate.textContent?.trim() === 'Owner session 2');
    expect(target).not.toBeUndefined();
    await clickAndSettleAsUser(target!, () => {
      const mutationMessage = [...(harness?.sentMessages ?? [])]
        .reverse()
        .find((message) =>
          (message as { type?: string }).type === 'tabboard-state-mutations') as {
            mutations?: Array<{ type?: string; intent?: { kind?: string } }>;
          } | undefined;
      expect(mutationMessage?.mutations?.[0]).toMatchObject({
        type: 'drop-intent',
        intent: {
          kind: 'move-tabs',
          targetGroupId: savedGroups[1]?.id,
        },
      });
      expect(document.querySelector(`#session-card-${savedGroups[0]?.id}`))
        .toBeNull();
      expect(document.querySelector('.session-selection-toolbar')).toBeNull();
      expect(document.activeElement?.closest('.session-card')).not.toBeNull();
    });
  });

  it('retains Saved picker scope and selected IDs when checked authority rejects', async () => {
    await mountManager();
    const authority = deferMutationAuthority();
    await clickAsUser(checkbox('Select Saved item 1'));
    await expectChecked('Select Saved item 1', true);

    await clickAsUser(button('Move Selected Items'));
    const target = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    )].find((candidate) => candidate.textContent?.trim() === 'Owner session 2');
    expect(target).not.toBeUndefined();
    await act(async () => target?.click());
    await authority.waitForRequest();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector(`#session-card-${savedGroups[0]?.id}`))
      .not.toBeNull();
    expectChecked('Select Saved item 1', true);

    await authority.reject();

    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(document.querySelector(`#session-card-${savedGroups[0]?.id}`))
        .not.toBeNull();
      expect(checkbox('Select Saved item 1').checked).toBe(true);
      expect(document.querySelector('.session-selection-toolbar')).not.toBeNull();
      expect(document.querySelector<HTMLButtonElement>(
        '[role="option"][aria-selected="true"]',
      )?.disabled).toBe(false);
    });
  });

  it('keeps Open Save to selected IDs and picker when checked authority rejects', async () => {
    await mountManager();
    const authority = deferMutationAuthority();
    await clickAsUser(checkbox('Select Active HTTP tab'));
    await expectChecked('Select Active HTTP tab', true);

    await clickAsUser(button('Save Selected Tabs To'));
    const target = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    )].find((candidate) => candidate.textContent?.trim() === 'Owner session 1');
    expect(target).not.toBeUndefined();
    const targetTabCount = harness?.state.groups.find(
      ({ id }) => id === savedGroups[0]?.id,
    )?.tabs.length;
    await act(async () => target?.click());
    await authority.waitForRequest();
    expect(harness?.state.groups.find(
      ({ id }) => id === savedGroups[0]?.id,
    )?.tabs).toHaveLength(targetTabCount ?? 0);
    await authority.reject();

    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(checkbox('Select Active HTTP tab').checked).toBe(true);
      expect(document.querySelector('.manager-open-tabs-selection-actions'))
        .not.toBeNull();
      expect(document.querySelector<HTMLButtonElement>(
        '[role="option"][aria-selected="true"]',
      )?.disabled).toBe(false);
    });
    expect(harness?.state.groups.find(
      ({ id }) => id === savedGroups[0]?.id,
    )?.tabs).toHaveLength(targetTabCount ?? 0);
  });

  it('applies a checked Saved move once and exits only after authority success', async () => {
    await mountManager();
    const authority = deferMutationAuthority();
    await clickAsUser(checkbox('Select Saved item 1'));
    await clickAsUser(checkbox('Select Saved item 1 failed'));
    await expectChecked('Select Saved item 1', true);
    await expectChecked('Select Saved item 1 failed', true);

    await clickAsUser(button('Move Selected Items'));
    const target = [...document.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    )].find((candidate) => candidate.textContent?.trim() === 'Owner session 2');
    expect(target).not.toBeUndefined();
    await act(async () => target?.click());
    await authority.waitForRequest();

    expect(document.querySelector(`#session-card-${savedGroups[0]?.id}`))
      .not.toBeNull();
    await expectChecked('Select Saved item 1', true);

    await authority.resolve();
    await vi.waitFor(() => {
      expect(document.querySelector(`#session-card-${savedGroups[0]?.id}`))
        .toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
    const mutationMessages = (harness?.sentMessages ?? []).filter((message) =>
      (message as { type?: string }).type === 'tabboard-state-mutations');
    expect(mutationMessages).toHaveLength(1);
  });

  it('explicitly exits Open selection and clears its IDs', async () => {
    await mountManager();
    await clickAsUser(checkbox('Select Active HTTP tab'));
    await expectChecked('Select Active HTTP tab', true);

    const exit = document.querySelector<HTMLButtonElement>(
      '[aria-label="Exit Tab Selection Mode"]',
    );
    expect(exit).not.toBeNull();
    await clickAsUser(exit!);

    await expectChecked('Select Active HTTP tab', false);
    expect(document.querySelector('.manager-open-tabs-selection-actions')).toBeNull();
  });

  it('blurs the final Open checkbox after unchecking without an async error', async () => {
    await mountManager();
    const open = checkbox('Select Active HTTP tab');
    await clickAsUser(open);
    await expectChecked('Select Active HTTP tab', true);
    open.focus();
    expect(document.activeElement).toBe(open);

    await clickAsUser(open);
    await expectChecked('Select Active HTTP tab', false);
    await expect(flushAnimationFrames()).resolves.toBeUndefined();
    expect(document.activeElement).not.toBe(open);
  });

  it('keeps the active saved owner mounted across activation context reset', async () => {
    await mountManager();
    const group = savedGroups[7]!;
    const shellTitle = document.querySelector<HTMLButtonElement>(
      `#session-shell-${group.id} .session-card__title`,
    );
    expect(shellTitle).not.toBeNull();
    await clickAsUser(shellTitle!);

    await vi.waitFor(() => {
      expect(document.querySelector(`#session-card-${group.id}`)).not.toBeNull();
    });
    await clickAsUser(checkbox('Select Saved item 8'));
    await expectChecked('Select Saved item 8', true);

    await act(async () => {
      savedSearchQueryStore.set('Owner');
    });

    await vi.waitFor(() => {
      expect(document.querySelector(`#session-shell-${group.id}`)).toBeNull();
      expect(document.querySelector(`#session-card-${group.id}`)).not.toBeNull();
      expect(checkbox('Select Saved item 8').checked).toBe(true);
    });
  });

  it('exits saved scope when filtering unmounts its owner', async () => {
    await mountManager();
    await clickAsUser(checkbox('Select Saved item 1'));
    await expectChecked('Select Saved item 1', true);

    await act(async () => {
      savedSearchQueryStore.set('no saved owner matches this query');
    });
    await vi.waitFor(() => {
      expect(document.querySelector('[aria-label="Select Saved item 1"]')).toBeNull();
    });

    await act(async () => {
      savedSearchQueryStore.set('');
    });
    await vi.waitFor(() => {
      expect(checkbox('Select Saved item 1').checked).toBe(false);
      expect(
        checkbox('Select Saved item 1')
          .closest('.tab-item-row__content')
          ?.hasAttribute('data-selection-mode'),
      ).toBe(false);
    });
  });
});
