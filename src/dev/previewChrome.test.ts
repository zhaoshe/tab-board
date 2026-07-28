import { afterEach, describe, expect, it } from 'vitest';
import {
  createGroupFromTabRecords,
  createTabRecord,
  normalizeState,
} from '../shared/model';
import { installPreviewChrome } from './previewChrome';
import type { PreviewChromeOptions, PreviewResponse, PreviewTab } from './previewChrome';

const installed: Array<{ uninstall: () => void }> = [];

function uninstallInstalledHarnesses(): void {
  installed.splice(0).reverse().forEach((harness) => harness.uninstall());
}

afterEach(uninstallInstalledHarnesses);

function install(options: PreviewChromeOptions = {}) {
  const harness = installPreviewChrome(options);
  installed.push(harness);
  return harness;
}

describe('preview Chrome fixture', () => {
  it('contains throwing and rejected listeners without rejecting the API operation', async () => {
    const harness = install();
    const afterListenerCalls: string[] = [];
    harness.chrome.tabs.onCreated.addListener(() => {
      throw new Error('listener failure');
    });
    harness.chrome.tabs.onCreated.addListener(() => Promise.reject(new Error('async listener failure')));
    harness.chrome.tabs.onCreated.addListener(() => {
      afterListenerCalls.push('called');
    });

    await expect(harness.chrome.tabs.create({ url: 'https://event-listener.example/' })).resolves.toMatchObject({
      url: 'https://event-listener.example/',
    });
    expect(afterListenerCalls).toEqual(['called']);
  });

  it('omits tabs unless windows queries request populate', async () => {
    const harness = install();

    await expect(harness.chrome.windows.get(1)).resolves.not.toHaveProperty('tabs');
    await expect(harness.chrome.windows.getAll()).resolves.toEqual(
      expect.arrayContaining([expect.not.objectContaining({ tabs: expect.anything() })]),
    );
    await expect(harness.chrome.windows.get(1, { populate: true })).resolves.toMatchObject({
      id: 1,
      tabs: expect.any(Array),
    });
    await expect(harness.chrome.windows.getAll({ populate: true })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ tabs: expect.any(Array) })]),
    );
  });

  it('snapshots runtime messages before queued restore work reads them', async () => {
    const harness = install();
    const group = harness.state.groups[0];
    const message = { type: 'restore-group', groupId: group.id };

    const request = harness.chrome.runtime.sendMessage(message);
    message.groupId = 'mutated-after-send';

    await expect(request).resolves.toMatchObject({ ok: true, result: { restoredTabs: 1 } });
  });

  it('uninstalls nested harnesses in LIFO order', () => {
    const originalChrome = (globalThis as { chrome?: unknown }).chrome;
    install();
    install();

    uninstallInstalledHarnesses();

    expect((globalThis as { chrome?: unknown }).chrome).toBe(originalChrome);
  });

  it('normalizes partial custom tabs with unique default IDs and indexes', () => {
    const harness = install({
      tabs: [
        { url: 'https://partial-one.example/' },
        { id: undefined, index: undefined, url: 'https://partial-two.example/' },
        { windowId: undefined, url: 'https://partial-three.example/' },
      ],
    });
    const customTabs = harness.tabs.filter((tab) => tab.windowId === 1);

    expect(new Set(customTabs.map((tab) => tab.id)).size).toBe(customTabs.length);
    expect(customTabs.map((tab) => tab.index).sort((left, right) => left - right)).toEqual([0, 1, 2]);
  });

  it('normalizes custom windows and parent-relative partial tabs', () => {
    const harness = install({
      windows: [
        { tabs: [{ url: 'https://custom-window-one.example/' }] },
        { tabs: [{ id: undefined, index: undefined, url: 'https://custom-window-two.example/' }] },
      ],
    });
    const windows = harness.windows;
    const customTabs = windows.flatMap((window) => window.tabs ?? []);

    expect(new Set(windows.map((window) => window.id)).size).toBe(2);
    expect(new Set(customTabs.map((tab) => tab.id)).size).toBe(2);
    expect(customTabs.map((tab) => tab.windowId)).toEqual(windows.map((window) => window.id));
    expect(customTabs.map((tab) => tab.index)).toEqual([0, 0]);
    expect(windows.filter((window) => window.focused)).toHaveLength(1);
  });

  it('creates windows for custom tabs whose window IDs are outside the default fixture', () => {
    const harness = install({
      tabs: [{ windowId: 77, url: 'https://custom-window-id.example/' }],
    });

    expect(harness.windows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 77, tabs: [expect.objectContaining({ windowId: 77 })] }),
    ]));
  });

  it('replaces invalid custom tab identity and index values with safe defaults', () => {
    const harness = install({
      tabs: [
        { id: 0, windowId: 0, index: -1, url: 'https://invalid-tab-fields.example/' },
        { id: undefined, windowId: undefined, index: undefined, url: 'https://valid-defaults.example/' },
      ],
    });

    expect(harness.tabs.every((tab) => tab.id > 0 && tab.windowId > 0 && tab.index >= 0)).toBe(true);
    expect(new Set(harness.tabs.map((tab) => tab.id)).size).toBe(harness.tabs.length);
  });

  it('deep-clones populated window tab payloads', async () => {
    const harness = install({
      tabs: [{
        id: 301,
        windowId: 1,
        index: 0,
        url: 'https://nested-tab.example/',
        mutedInfo: { muted: true },
      } as Partial<PreviewTab>],
    });
    const populated = await harness.chrome.windows.get(1, { populate: true });
    const tab = populated.tabs![0] as PreviewTab & { mutedInfo: { muted: boolean } };
    tab.mutedInfo.muted = false;

    expect((harness.tabs.find((item) => item.id === 301) as PreviewTab & {
      mutedInfo: { muted: boolean };
    }).mutedInfo.muted).toBe(true);
  });

  it('defaults the first partial custom tab active in its focused window', async () => {
    const harness = install({
      tabs: [
        { url: 'https://partial-active-one.example/' },
        { url: 'https://partial-active-two.example/' },
      ],
    });

    await expect(harness.chrome.tabs.query({ windowId: 1, active: true })).resolves.toMatchObject([
      { url: 'https://partial-active-one.example/', active: true },
    ]);
  });

  it('keeps an empty custom tab fixture usable with a focused empty window', async () => {
    const harness = install({ tabs: [] });

    expect(harness.windows).toEqual([
      expect.objectContaining({ id: 1, focused: true, tabs: [] }),
    ]);
    await expect(harness.chrome.tabs.create({ url: 'https://empty-fixture.example/' })).resolves.toMatchObject({
      windowId: 1,
      active: true,
    });
  });

  it('returns state snapshots that cannot bypass persistence', () => {
    const harness = install();
    const snapshot = harness.state;
    snapshot.settings.excludePinned = true;
    snapshot.groups.pop();

    expect(harness.state.settings.excludePinned).toBe(false);
    expect(harness.state.groups).toHaveLength(2);
  });

  it('starts with a normalized fixture covering manager state and browser surfaces', () => {
    const harness = install();

    expect(harness.state).toEqual(normalizeState(harness.state));
    expect(harness.state.activeWorkspaceId).toBe('workspace_default');
    expect(harness.state.workspaces).toHaveLength(1);
    expect(harness.state.folders).toHaveLength(1);
    expect(harness.state.groups).toHaveLength(2);
    expect(harness.state.groups.map((group) => [group.starred, group.locked])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(harness.state.groups.flatMap((group) => group.tabs).some((tab) => tab.itemType === 'note')).toBe(true);
    expect(harness.state.groups.some((group) => group.note)).toBe(true);
    expect(harness.windows).toHaveLength(6);
    expect(harness.tabs.some((tab) => tab.active && /^https?:/.test(tab.url || ''))).toBe(true);
    expect(harness.tabs.some((tab) => tab.pinned)).toBe(true);
    expect(harness.tabs.filter((tab) => tab.url === 'https://duplicate.example/')).toHaveLength(2);
    expect(harness.tabs.some((tab) => tab.url?.startsWith('chrome://'))).toBe(true);
    expect(harness.tabs.some((tab) => tab.url?.startsWith('file://'))).toBe(true);
    expect(harness.tabs.some((tab) => !tab.favIconUrl)).toBe(true);
  });

  it('returns worker-style ensure and list envelopes', async () => {
    const harness = install();

    await expect(harness.chrome.runtime.sendMessage({ type: 'tabboard-ensure-state' })).resolves.toMatchObject({
      ok: true,
      result: { activeWorkspaceId: 'workspace_default' },
    });
    const response = await harness.chrome.runtime.sendMessage({ type: 'list-open-tabs' }) as PreviewResponse<{ windows: Array<{ tabs: Array<Record<string, unknown>> }> }>;

    expect(response).toMatchObject({ ok: true, result: { windows: expect.any(Array) } });
    expect(response.result!.windows[0].tabs[0]).toMatchObject({
      id: expect.any(Number),
      windowId: expect.any(Number),
      storable: expect.any(Boolean),
      reason: null,
    });
  });

  it('applies real state mutations and broadcasts storage changes', async () => {
    const harness = install();
    const changes: unknown[] = [];
    const listener = (change: unknown) => changes.push(change);
    harness.chrome.storage.onChanged.addListener(listener);
    const tab = createTabRecord({ id: 900, windowId: 1, title: 'Mutation tab', url: 'https://mutation.example/' });
    const group = createGroupFromTabRecords([tab], { workspaceId: 'workspace_default' });
    const before = harness.state.mutationRevision;

    const response = await harness.chrome.runtime.sendMessage({
      type: 'tabboard-state-mutations',
      mutations: [{ type: 'prepend-groups', groups: [group], updatedAt: new Date().toISOString() }],
    });

    expect(response).toMatchObject({ ok: true, result: { mutationRevision: before + 1 } });
    expect(harness.state.groups.some((item) => item.id === group.id)).toBe(true);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ tabboardState: { newValue: harness.state } });
    harness.chrome.storage.onChanged.removeListener(listener);
    expect(harness.listenerCount('storage.onChanged')).toBe(0);
  });

  it('honors storage.local.get defaults and preserves failed mutation envelopes', async () => {
    const harness = install();

    await expect(harness.chrome.storage.local.get({ missingPreviewKey: 'fallback' })).resolves.toEqual({
      missingPreviewKey: 'fallback',
    });
    await expect(harness.chrome.runtime.sendMessage({
      type: 'tabboard-state-mutations',
      mutations: [{ type: 'not-a-real-mutation' }],
    })).resolves.toMatchObject({
      ok: false,
      error: expect.any(String),
    });
  });

  it('restores preview storage from the browser session persistence port', async () => {
    const writes: string[] = [];
    const storage = new Map<string, string>();
    const first = installPreviewChrome({
      storagePersistence: {
        read: () => storage.get('preview') ?? null,
        write: (value) => {
          writes.push(value);
          storage.set('preview', value);
        },
      },
    });
    installed.push(first);
    await first.chrome.storage.local.set({ tabboardDiagnostics: [{ message: 'before reload' }] });
    first.uninstall();
    installed.pop();

    const second = installPreviewChrome({
      storagePersistence: {
        read: () => storage.get('preview') ?? null,
        write: (value) => storage.set('preview', value),
      },
    });
    installed.push(second);

    await expect(second.chrome.storage.local.get('tabboardDiagnostics')).resolves.toEqual({
      tabboardDiagnostics: [{ message: 'before reload' }],
    });
    expect(writes).toHaveLength(1);
  });

  it('cleans unlocked restored groups and tabs without restoring them twice', async () => {
    const harness = install();
    const group = harness.state.groups[0];
    const link = group.tabs.find((tab) => tab.itemType === 'link')!;

    await expect(harness.chrome.runtime.sendMessage({ type: 'restore-group', groupId: group.id }))
      .resolves.toMatchObject({ ok: true, result: { restoredTabs: 1 } });
    expect(harness.state.groups.find((item) => item.id === group.id)?.tabs.some((tab) => tab.id === link.id)).toBe(false);
    await expect(harness.chrome.runtime.sendMessage({ type: 'restore-group', groupId: group.id }))
      .resolves.toMatchObject({ ok: true, result: { restoredTabs: 0 } });

    const tabHarness = install();
    const tabGroup = tabHarness.state.groups[0];
    const tab = tabGroup.tabs.find((item) => item.itemType === 'link')!;
    await expect(tabHarness.chrome.runtime.sendMessage({
      type: 'restore-tab',
      groupId: tabGroup.id,
      tabId: tab.id,
    })).resolves.toMatchObject({ ok: true, result: { restoredTabs: 1 } });
    expect(tabHarness.state.groups.find((item) => item.id === tabGroup.id)?.tabs.some((item) => item.id === tab.id)).toBe(false);
    await expect(tabHarness.chrome.runtime.sendMessage({
      type: 'restore-tab',
      groupId: tabGroup.id,
      tabId: tab.id,
    })).resolves.toMatchObject({ ok: false, error: 'Saved tab not found' });
  });

  it('keeps inserted tabs ordered and reindexes the remaining tabs after removal', async () => {
    const harness = install();

    const first = await harness.chrome.tabs.create({
      windowId: 1,
      index: 1,
      active: false,
      url: 'https://inserted-one.example/',
    });
    const second = await harness.chrome.tabs.create({
      windowId: 1,
      index: 2,
      active: false,
      url: 'https://inserted-two.example/',
    });
    const listed = await harness.chrome.runtime.sendMessage({ type: 'list-open-tabs' }) as PreviewResponse<{
      windows: Array<{ id: number; tabs: Array<{ id: number; index: number; url: string }> }>;
    }>;
    const listedTabs = listed.result!.windows.find((window) => window.id === 1)!.tabs;

    expect(listedTabs.map((tab) => tab.url).slice(0, 4)).toEqual([
      'https://active.example/',
      first.url,
      second.url,
      'https://pinned.example/',
    ]);
    expect(listedTabs.map((tab) => tab.index)).toEqual(listedTabs.map((_, index) => index));
    expect(harness.tabs.find((tab) => tab.id === 102)?.index).toBe(3);

    await harness.chrome.tabs.remove(first.id);
    const remaining = harness.tabs.filter((tab) => tab.windowId === 1).sort((left, right) => left.index - right.index);
    expect(remaining.map((tab) => tab.index)).toEqual(remaining.map((_, index) => index));
    expect(remaining.find((tab) => tab.id === second.id)?.index).toBe(1);
  });

  it('restores multiple tabs next to the active tab in saved order', async () => {
    const seed = install();
    const state = structuredClone(seed.state);
    const group = createGroupFromTabRecords([
      createTabRecord({ id: 7001, windowId: 1, title: 'Restore one', url: 'https://restore-one.example/' }),
      createTabRecord({ id: 7002, windowId: 1, title: 'Restore two', url: 'https://restore-two.example/' }),
    ], { workspaceId: state.activeWorkspaceId });
    state.groups = [group];
    state.settings = { ...state.settings, deleteRestoredTabs: false, restoreNextToCurrent: true };
    seed.uninstall();
    installed.pop();
    const harness = install({ state });

    await expect(harness.chrome.runtime.sendMessage({ type: 'restore-group', groupId: group.id }))
      .resolves.toMatchObject({ ok: true, result: { restoredTabs: 2 } });

    const ordered = harness.tabs
      .filter((tab) => tab.windowId === 1)
      .sort((left, right) => left.index - right.index);
    expect(ordered.slice(0, 4).map((tab) => tab.url)).toEqual([
      'https://active.example/',
      'https://restore-one.example/',
      'https://restore-two.example/',
      'https://pinned.example/',
    ]);
    expect(ordered.map((tab) => tab.index)).toEqual(ordered.map((_, index) => index));
  });

  it('removes a virtual window when its last tab closes with closing lifecycle events', async () => {
    const harness = install();
    const created = await harness.chrome.windows.create({ url: 'https://last-tab.example/', focused: false });
    const createdTab = created.tabs![0];
    const removedTabs: Array<{ tabId: number; windowId: number; isWindowClosing: boolean }> = [];
    const removedWindows: number[] = [];
    harness.chrome.tabs.onRemoved.addListener((tabId, info) => {
      const removeInfo = info as { windowId: number; isWindowClosing: boolean };
      removedTabs.push({ tabId: tabId as number, ...removeInfo });
    });
    harness.chrome.windows.onRemoved.addListener((windowId) => removedWindows.push(windowId as number));

    await harness.chrome.tabs.remove(createdTab.id);

    expect(harness.windows.some((window) => window.id === created.id)).toBe(false);
    await expect(harness.chrome.windows.getAll()).resolves.not.toContainEqual(expect.objectContaining({ id: created.id }));
    expect(removedTabs).toEqual([{
      tabId: createdTab.id,
      windowId: created.id,
      isWindowClosing: true,
    }]);
    expect(removedWindows).toEqual([created.id]);
  });

  it('keeps a non-focused window unfocused while its first tab is active and emits creation events', async () => {
    const harness = install();
    const createdTabs: number[] = [];
    const createdWindows: number[] = [];
    const removedWindows: number[] = [];
    harness.chrome.tabs.onCreated.addListener((tab) => createdTabs.push((tab as { id: number }).id));
    harness.chrome.windows.onCreated.addListener((window) => createdWindows.push((window as { id: number }).id));
    harness.chrome.windows.onRemoved.addListener((windowId) => removedWindows.push(windowId as number));

    const created = await harness.chrome.windows.create({ url: 'https://unfocused-window.example/', focused: false });
    const createdTab = created.tabs![0];

    expect(created.focused).toBe(false);
    expect(createdTab.active).toBe(true);
    expect(createdTabs).toEqual([createdTab.id]);
    expect(createdWindows).toEqual([created.id]);
    expect(harness.windows.find((window) => window.id === created.id)?.focused).toBe(false);

    await harness.chrome.windows.remove(created.id);
    expect(removedWindows).toEqual([created.id]);
  });

  it('hides extension pages from listings while keeping them uncapturable', async () => {
    const harness = install();
    const preview = await harness.chrome.tabs.create({
      windowId: 1,
      active: false,
      url: '/dev/manager-preview.html?source=test#preview',
    });
    const options = await harness.chrome.tabs.create({
      windowId: 1,
      active: false,
      url: 'chrome-extension://preview/options.html',
    });
    const otherExtension = await harness.chrome.tabs.create({
      windowId: 1,
      active: false,
      url: 'chrome-extension://other-extension/options.html',
    });
    const external = await harness.chrome.tabs.create({
      windowId: 1,
      active: false,
      url: 'https://external.example/dev/manager-preview.html?source=test#preview',
    });
    const listed = await harness.chrome.runtime.sendMessage({ type: 'list-open-tabs' }) as PreviewResponse<{
      windows: Array<{ tabs: Array<{ id: number; storable: boolean; reason: string | null; url: string }> }>;
    }>;
    const listedTabs = listed.result!.windows.find((window) => window.tabs.some((tab) => tab.id === external.id))!.tabs;

    expect(listedTabs.some((tab) => tab.id === preview.id)).toBe(false);
    expect(listedTabs.some((tab) => tab.id === options.id)).toBe(false);
    expect(listedTabs.some((tab) => tab.id === otherExtension.id)).toBe(false);
    expect(listedTabs.find((tab) => tab.id === external.id)).toMatchObject({
      url: 'https://external.example/dev/manager-preview.html?source=test#preview',
      storable: true,
      reason: null,
    });
    await expect(harness.chrome.runtime.sendMessage({
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [preview.id],
      workspaceId: 'workspace_default',
    })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('cannot be saved') });
  });

  it('serializes concurrent restore requests so a saved reference is restored once', async () => {
    const harness = install();
    const group = harness.state.groups[0];
    const record = group.tabs.find((tab) => tab.itemType === 'link')!;

    const [groupRestore, tabRestore] = await Promise.all([
      harness.chrome.runtime.sendMessage({ type: 'restore-group', groupId: group.id }),
      harness.chrome.runtime.sendMessage({ type: 'restore-tab', groupId: group.id, tabId: record.id }),
    ]);

    expect(groupRestore).toMatchObject({ ok: true, result: { restoredTabs: 1 } });
    expect(tabRestore).toMatchObject({ ok: false, error: 'Saved tab not found' });
    expect(harness.tabs.filter((tab) => tab.url === 'https://preview.example/')).toHaveLength(1);
  });

  it('creates and removes virtual windows with lifecycle events and honors new-window restore', async () => {
    const seed = install();
    const state = structuredClone(seed.state);
    state.settings = { ...state.settings, restoreGroupsInNewWindow: true };
    seed.uninstall();
    installed.pop();
    const harness = install({ state });
    const createdWindows: number[] = [];
    const removedWindows: number[] = [];
    harness.chrome.windows.onCreated.addListener((window) => createdWindows.push((window as { id: number }).id));
    harness.chrome.windows.onRemoved.addListener((windowId) => removedWindows.push(windowId as number));

    const created = await harness.chrome.windows.create({ url: 'https://created-window.example/', focused: true });
    expect(createdWindows).toEqual([created.id]);
    expect(harness.windows.some((window) => window.id === created.id)).toBe(true);
    await harness.chrome.windows.remove(created.id);
    expect(removedWindows).toEqual([created.id]);
    expect(harness.windows.some((window) => window.id === created.id)).toBe(false);

    const group = harness.state.groups[1];
    const restoredUrl = group.tabs.find((tab) => tab.itemType === 'link')!.url;
    const restore = await harness.chrome.runtime.sendMessage({ type: 'restore-group', groupId: group.id });
    expect(restore).toMatchObject({ ok: true, result: { restoredTabs: 1 } });
    expect(harness.windows.length).toBeGreaterThan(1);
    expect(harness.tabs.some((tab) => tab.url === restoredUrl && tab.windowId !== 1)).toBe(true);
  });

  it('captures selected tabs into a factory-built group and reports duplicate cleanup', async () => {
    const harness = install();

    const response = await harness.chrome.runtime.sendMessage({
      type: 'saveSelectedTabs',
      selectedWindowId: 1,
      tabIds: [103, 104],
      workspaceId: 'workspace_default',
    }) as PreviewResponse<{ createdGroupIds: string[]; storedTabs: number; storedGroups: number; cleanedDuplicates: number }>;

    expect(response).toMatchObject({
      ok: true,
      result: {
        storedTabs: 1,
        storedGroups: 1,
        cleanedDuplicates: 1,
        createdGroupIds: [expect.any(String)],
      },
    });
    expect(harness.state.groups.some((group) => group.id === response.result!.createdGroupIds[0])).toBe(true);
    expect(harness.tabs.some((tab) => tab.id === 103)).toBe(false);
    expect(harness.tabs.some((tab) => tab.id === 104)).toBe(false);
  });

  it('changes virtual tabs for focus, pin, close, and restore operations', async () => {
    const harness = install();
    const target = harness.tabs.find((tab) => tab.id === 101)!;

    await expect(harness.chrome.runtime.sendMessage({
      type: 'focus-open-tab',
      tabId: target.id,
      windowId: target.windowId,
    })).resolves.toMatchObject({ ok: true, result: { tabId: target.id, windowId: target.windowId } });
    expect(harness.tabs.find((tab) => tab.id === target.id)?.active).toBe(true);
    await expect(harness.chrome.runtime.sendMessage({ type: 'pin-open-tab', tabId: target.id })).resolves.toMatchObject({
      ok: true,
      result: { tabId: target.id, pinned: true },
    });
    expect(harness.tabs.find((tab) => tab.id === target.id)?.pinned).toBe(true);
    await expect(harness.chrome.runtime.sendMessage({ type: 'close-open-tab', tabId: target.id })).resolves.toMatchObject({
      ok: true,
      result: { tabId: target.id },
    });
    expect(harness.tabs.some((tab) => tab.id === target.id)).toBe(false);

    const group = harness.state.groups[1];
    const groupId = group.id;
    const restoredUrl = group.tabs.find((tab) => tab.itemType === 'link')!.url;
    const restore = await harness.chrome.runtime.sendMessage({ type: 'restore-group', groupId });
    expect(restore).toMatchObject({ ok: true, result: { restoredTabs: 1 } });
    expect(harness.tabs.some((tab) => tab.url === restoredUrl)).toBe(true);
  });

  it('returns an error envelope for unknown messages', async () => {
    const harness = install();

    await expect(harness.chrome.runtime.sendMessage({ type: 'not-a-real-message' })).resolves.toEqual({
      ok: false,
      error: 'Unknown message type: not-a-real-message',
    });
  });

  it('maps manager creation to the dev preview URL while keeping other tabs virtual', async () => {
    const harness = install();

    const manager = await harness.chrome.tabs.create({ url: 'manager.html' });
    const external = await harness.chrome.tabs.create({ url: 'https://external.example/' });

    expect(manager.url).toBe('/dev/manager-preview.html');
    expect(external.url).toBe('https://external.example/');
    expect(harness.tabs.some((tab) => tab.id === manager.id && tab.url === manager.url)).toBe(true);
    expect(harness.tabs.some((tab) => tab.id === external.id && tab.url === external.url)).toBe(true);
  });

  it('registers and removes Chrome event listeners through event hubs', () => {
    const harness = install();
    const listener = () => undefined;

    harness.chrome.tabs.onActivated.addListener(listener);
    harness.chrome.tabs.onCreated.addListener(listener);
    harness.chrome.windows.onFocusChanged.addListener(listener);
    expect(harness.listenerCount('tabs.onActivated')).toBe(1);
    expect(harness.listenerCount('tabs.onCreated')).toBe(1);
    expect(harness.listenerCount('windows.onFocusChanged')).toBe(1);

    harness.chrome.tabs.onActivated.removeListener(listener);
    harness.chrome.tabs.onCreated.removeListener(listener);
    harness.chrome.windows.onFocusChanged.removeListener(listener);
    expect(harness.listenerCount('tabs.onActivated')).toBe(0);
    expect(harness.listenerCount('tabs.onCreated')).toBe(0);
    expect(harness.listenerCount('windows.onFocusChanged')).toBe(0);
  });
});
