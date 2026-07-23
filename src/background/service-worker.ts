import {
  createId,
  defaultGroupTitle,
  nowIso,
  ITEM_LINK,
  STATE_KEY,
  normalizeState,
  isRestorableTab,
  tabMatchesQuery,
  groupMatchesQuery,
  normalizeSearch,
  normalizeTab,
  normalizeGroup,
  normalizeBinEntry,
  normalizeBrowserGroup,
  getCaptureCandidateReason,
  matchesCustomUrlFilter,
  type CaptureCandidateReason,
  type TabItem,
  type Group,
  type TabBoardState,
  type BrowserGroup,
  type Settings,
  type TabRef,
} from '../shared/model';
import { getState, setState, getSettings, ensureState } from '../shared/store/chromeStorage';
import { createStatePersistence } from './statePersistence';
import {
  applyStateMutation,
  createDropMutationBatchContext,
  InvalidDropMutationError,
  markInvalidDropMutationForBatch,
  prepareDropMutationForBatch,
  validateMutationBatch,
  type StateMutation,
} from '../shared/store/stateMutations';
import {
  getDropOperationDigest,
  isDropIntentAlreadyApplied,
} from '../manager/core/commands';

const MANAGER_PAGE = 'manager.html';
const POPUP_PAGE = 'popup.html';
const statePersistence = createStatePersistence({ getState, setState, ensureState });
let restoreQueue: Promise<unknown> = Promise.resolve();

function enqueueRestore<T>(operation: () => Promise<T>): Promise<T> {
  const run = restoreQueue.then(operation);
  restoreQueue = run.then(() => undefined, () => undefined);
  return run;
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await enqueueRestore(() => statePersistence.ensureState());
  await refreshContextMenus();
  await applyActionPopup();
  if (reason === 'install') {
    await openManager();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshContextMenus();
  await applyActionPopup();
});

chrome.action.onClicked.addListener(async (tab) => {
  await enqueueRestore(() => captureTabs('current-window', tab));
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'capture-current-window') {
    await enqueueRestore(async () => captureTabs('current-window', await getActiveTab()));
  }
  if (command === 'open-manager') {
    await openManager();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  switch (info.menuItemId) {
    case 'open-manager':
      await openManager();
      break;
    case 'store-current-tab':
      await enqueueRestore(() => captureTabs('current-tab', tab));
      break;
    case 'store-current-window':
      await enqueueRestore(() => captureTabs('current-window', tab));
      break;
    case 'store-all-windows':
      await enqueueRestore(() => captureTabs('all-windows', tab));
      break;
    case 'store-highlighted-tabs':
      await enqueueRestore(() => captureTabs('highlighted-tabs', tab));
      break;
    case 'store-tabs-left':
      await enqueueRestore(() => captureTabs('tabs-left', tab));
      break;
    case 'store-tabs-right':
      await enqueueRestore(() => captureTabs('tabs-right', tab));
      break;
    case 'store-other-tabs':
      await enqueueRestore(() => captureTabs('other-tabs', tab));
      break;
    default:
      break;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const stateChange = changes[STATE_KEY];
  if (!stateChange) return;
  const previousActionClick = getStoredActionClick(stateChange.oldValue);
  const nextActionClick = getStoredActionClick(stateChange.newValue);
  if (previousActionClick !== nextActionClick) void applyActionPopup(nextActionClick);
});

chrome.omnibox.setDefaultSuggestion({
  description: 'Search TabBoard saved tabs',
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  void getOmniboxSuggestions(text).then(suggest);
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  if (text.startsWith('tabb://tab/')) {
    const [, , , source, groupId, tabId] = text.split('/');
    await restoreTab({ source, groupId, tabId });
    return;
  }
  await openManager({ query: text });
});

interface LiveOpenTabRequest {
  tabIds: readonly number[];
  windowId: number;
}

function getLiveOpenTabRequest(mutation: StateMutation): LiveOpenTabRequest | null {
  if (mutation.type !== 'drop-intent') return null;
  if (mutation.intent.kind === 'copy-open-tabs') {
    return { tabIds: mutation.intent.tabIds, windowId: mutation.intent.windowId };
  }
  if (mutation.intent.kind === 'create-session' && mutation.intent.source.kind === 'open-tabs') {
    return { tabIds: mutation.intent.source.tabIds, windowId: mutation.intent.source.windowId };
  }
  return null;
}

function recoverRecordedDropSnapshot(
  state: TabBoardState,
  mutation: StateMutation,
): StateMutation {
  if (mutation.type !== 'drop-intent' || mutation.openTabs.length !== 0) return mutation;
  const entry = state.dropOperationLedger.find((item) => item.operationId === mutation.operationId);
  if (!entry) return mutation;
  try {
    const parsed = JSON.parse(entry.digest) as { intent?: unknown; openTabs?: unknown };
    if (!Array.isArray(parsed.openTabs)
      || getDropOperationDigest(mutation.intent, parsed.openTabs as OpenTabInfo[]) !== entry.digest) {
      return mutation;
    }
    return { ...mutation, openTabs: parsed.openTabs as OpenTabInfo[] };
  } catch {
    return mutation;
  }
}

async function getVerifiedLiveOpenTabs(
  request: LiveOpenTabRequest,
  settings: Settings,
): Promise<OpenTabInfo[]> {
  if (!Number.isSafeInteger(request.windowId) || request.windowId <= 0
    || !Array.isArray(request.tabIds)
    || !request.tabIds.length
    || new Set(request.tabIds).size !== request.tabIds.length
    || request.tabIds.some((tabId) => !Number.isSafeInteger(tabId) || tabId <= 0)) {
    throw new Error('Open Tabs selection is invalid.');
  }
  let sourceWindow: chrome.windows.Window | undefined;
  try {
    if (typeof chrome.windows.get === 'function') {
      sourceWindow = await chrome.windows.get(request.windowId);
    } else {
      sourceWindow = (await chrome.windows.getAll()).find((item) => item.id === request.windowId);
    }
  } catch {
    sourceWindow = undefined;
  }
  if (!sourceWindow || sourceWindow.type !== 'normal' || sourceWindow.incognito === true) {
    throw new Error('Open Tabs window is unavailable or cannot be saved.');
  }

  const records: OpenTabInfo[] = [];
  for (const tabId of request.tabIds) {
    let tab: chrome.tabs.Tab | undefined;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      tab = undefined;
    }
    const url = tab ? resolveTabUrl(tab) : '';
    if (!tab || tab.id !== tabId || tab.windowId !== request.windowId || tab.incognito === true
      || !canCaptureTab(tab, settings)) {
      throw new Error(`Open tab ${tabId} is unavailable or cannot be saved.`);
    }
    records.push({
      id: tabId,
      windowId: request.windowId,
      title: String(tab.title || url || 'Untitled'),
      url,
      favIconUrl: String(tab.favIconUrl || ''),
      active: Boolean(tab.active),
      pinned: Boolean(tab.pinned),
      index: Number.isSafeInteger(tab.index) ? tab.index : 0,
      browserGroup: await readBrowserGroup(tab),
      storable: true,
      reason: null,
    });
  }
  return records;
}

interface VerifiedMutationBatch {
  mutations: StateMutation[];
  originalIndexes: number[];
  invalidMutationIndexes: number[];
}

function sortIndexes(indexes: readonly number[]): number[] {
  return [...new Set(indexes)].sort((left, right) => left - right);
}

async function verifyDropMutations(
  state: TabBoardState,
  mutations: readonly StateMutation[],
  originalMutationIndexes: readonly number[] = mutations.map((_, index) => index),
  invalidDropIndexes: readonly number[] = [],
): Promise<VerifiedMutationBatch> {
  let workingState = state;
  let revisionContext = createDropMutationBatchContext(invalidDropIndexes);
  const invalidMutationIndexes: number[] = [];
  const verifiedMutations: StateMutation[] = [];
  const originalIndexes: number[] = [];
  for (const [index, rawMutation] of mutations.entries()) {
    const originalIndex = originalMutationIndexes[index] ?? index;
    const recoveredMutation = recoverRecordedDropSnapshot(workingState, rawMutation);
    const prepared = prepareDropMutationForBatch(workingState, recoveredMutation, revisionContext, originalIndex);
    revisionContext = prepared.context;
    const mutation = prepared.mutation;
    if (mutation.type === 'drop-intent'
      && isDropIntentAlreadyApplied(workingState, mutation.intent, mutation.openTabs, mutation.operationId)) {
      verifiedMutations.push(mutation);
      originalIndexes.push(index);
      continue;
    }
    const request = getLiveOpenTabRequest(mutation);
    try {
      if (prepared.stale) throw new InvalidDropMutationError('Drop mutation revision is stale.');
      const verifiedMutation = request && mutation.type === 'drop-intent'
        ? { ...mutation, openTabs: await getVerifiedLiveOpenTabs(request, workingState.settings) }
        : mutation;
      workingState = applyStateMutation(workingState, verifiedMutation);
      verifiedMutations.push(verifiedMutation);
      originalIndexes.push(index);
    } catch (error: unknown) {
      if (mutation.type === 'drop-intent') {
        invalidMutationIndexes.push(index);
        if (!prepared.stale) {
          revisionContext = markInvalidDropMutationForBatch(revisionContext);
        }
        continue;
      }
      throw error;
    }
  }
  return { mutations: verifiedMutations, originalIndexes, invalidMutationIndexes };
}

async function applyWorkerMutations(input: unknown): Promise<TabBoardState> {
  const validated = validateMutationBatch(input);
  const state = await getState();
  const verified = await verifyDropMutations(
    state,
    validated.mutations,
    validated.originalIndexes,
    validated.invalidDropIndexes,
  );
  const verifiedOriginalIndexes = verified.originalIndexes.map((index) => validated.originalIndexes[index]);
  const persistableMutations = verified.mutations;
  const persistableOriginalIndexes = verifiedOriginalIndexes;
  const invalidMutationIndexes = sortIndexes([
    ...validated.invalidDropIndexes,
    ...verified.invalidMutationIndexes.map((index) => validated.originalIndexes[index]),
  ]);
  let persisted = state;
  if (persistableMutations.length) {
    try {
      persisted = await statePersistence.applyMutations(persistableMutations);
    } catch (error: unknown) {
      if (!(error instanceof InvalidDropMutationError)) throw error;
      const mapIndexes = (indexes: readonly number[]): number[] => indexes.flatMap((index) => {
        const originalIndex = persistableOriginalIndexes[index];
        return originalIndex === undefined ? [] : [originalIndex];
      });
      throw new InvalidDropMutationError(
        error.message,
        sortIndexes([...invalidMutationIndexes, ...mapIndexes(error.invalidMutationIndexes)]),
        sortIndexes(mapIndexes(error.committedMutationIndexes)),
        error.committedState,
      );
    }
  }
  if (invalidMutationIndexes.length) {
    throw new InvalidDropMutationError(
      'Open Tabs selection is unavailable or cannot be saved.',
      invalidMutationIndexes,
      persistableOriginalIndexes,
      persisted,
    );
  }
  return persisted;
}

const UNTRUSTED_RUNTIME_SENDER = 'UNTRUSTED_RUNTIME_SENDER';

class UntrustedRuntimeSenderError extends Error {
  readonly code = UNTRUSTED_RUNTIME_SENDER;

  constructor() {
    super('Runtime sender is not trusted.');
    this.name = 'UntrustedRuntimeSenderError';
  }
}

function isTrustedRuntimeSender(sender: chrome.runtime.MessageSender | undefined): boolean {
  const extensionId = chrome.runtime.id;
  if (!sender || !extensionId || sender.id !== extensionId) return false;
  if (sender.url === undefined) return true;
  return typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const result = isTrustedRuntimeSender(sender)
    ? handleMessage(message)
    : Promise.reject(new UntrustedRuntimeSenderError());
  result
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error: unknown) => {
      const structured = error && typeof error === 'object' ? error as {
        code?: unknown;
        invalidMutationIndexes?: unknown;
        committedMutationIndexes?: unknown;
        committedState?: unknown;
      } : {};
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        ...(typeof structured.code === 'string' ? { code: structured.code } : {}),
        ...(Array.isArray(structured.invalidMutationIndexes)
          ? { invalidMutationIndexes: structured.invalidMutationIndexes }
          : {}),
        ...(Array.isArray(structured.committedMutationIndexes)
          ? { committedMutationIndexes: structured.committedMutationIndexes }
          : {}),
        ...(structured.committedState && typeof structured.committedState === 'object'
          ? { state: structured.committedState }
          : {}),
      });
    });
  return true;
});

async function handleMessage(message: { type?: string; action?: string; [key: string]: unknown }) {
  const action = message?.type || message?.action;
  switch (action) {
    case 'tabboard-state-mutations':
      return enqueueRestore(() => applyWorkerMutations(message.mutations));
    case 'tabboard-ensure-state':
      return enqueueRestore(() => statePersistence.ensureState());
    case 'capture':
    case 'saveCurrentWindow': {
      const request = validateCaptureRequest(message, action === 'saveCurrentWindow');
      return enqueueRestore(async () => captureTabs(
        request.mode,
        await getActiveTab(),
        request.options,
      ));
    }
    case 'saveSelectedTabs': {
      if (
        message.workspaceId !== undefined
        && (
          typeof message.workspaceId !== 'string'
          || !message.workspaceId.trim()
          || message.workspaceId.trim() !== message.workspaceId
        )
      ) {
        throw new Error('workspaceId must be a canonical non-empty string.');
      }
      if (
        message.selectedWindowId !== undefined
        && (typeof message.selectedWindowId !== 'number'
          || !Number.isSafeInteger(message.selectedWindowId)
          || message.selectedWindowId <= 0)
      ) {
        throw new Error('selectedWindowId must be a positive safe integer.');
      }
      return enqueueRestore(() => saveSelectedTabs(
        message.tabIds as number[],
        message.selectedWindowId as number | undefined,
        message.workspaceId as string | undefined,
      ));
    }
    case 'list-open-tabs':
      return listOpenTabs();
    case 'create-window':
      return createWindow();
    case 'close-open-tab':
      return closeOpenTab(message.tabId as number);
    case 'close-open-tabs':
      return closeOpenTabs(message.tabIds as number[]);
    case 'pin-open-tab':
      return pinOpenTab(message.tabId as number);
    case 'pin-open-tabs':
      return pinOpenTabs(message.tabIds as number[]);
    case 'focus-open-tab':
      return focusOpenTab(message.tabId as number, message.windowId as number);
    case 'open-manager':
      return openManager({ query: (message.query as string) || '' });
    case 'open-options':
      return chrome.runtime.openOptionsPage();
    case 'count-window-duplicates':
      return countWindowDuplicates(message.windowId as number);
    case 'dedupe-window':
      return dedupeWindow(message.windowId as number);
    case 'delete-group':
      return deleteSavedGroup(message.groupId as string);
    case 'restore-tab':
      return restoreTab(message as unknown as TabRef & { tabId: string; groupId: string });
    case 'restore-group':
      return restoreGroup(message.groupId as string);
    case 'restore-refs':
      return restoreRefs((message.refs as TabRef[]) || []);
    case 'restore-all':
      return restoreAll();
    default:
      throw new Error(`Unknown message type: ${action}`);
  }
}

async function refreshContextMenus() {
  await new Promise<void>((resolve) => chrome.contextMenus.removeAll(() => resolve()));
  const contexts: chrome.contextMenus.ContextType[] = [
    'page',
    'selection',
    'link',
    'image',
    'video',
    'audio',
    'editable',
    'action',
  ];
  chrome.contextMenus.create({
    id: 'open-manager',
    title: 'Open TabBoard',
    contexts,
  });
  chrome.contextMenus.create({
    id: 'store-current-tab',
    title: 'Save this tab to TabBoard',
    contexts,
  });
  chrome.contextMenus.create({
    id: 'store-current-window',
    title: 'Save all tabs in this window',
    contexts,
  });
  chrome.contextMenus.create({
    id: 'store-highlighted-tabs',
    title: 'Save selected tabs',
    contexts: ['page', 'action'],
  });
  chrome.contextMenus.create({
    id: 'store-tabs-left',
    title: 'Save tabs to the left',
    contexts: ['page', 'action'],
  });
  chrome.contextMenus.create({
    id: 'store-tabs-right',
    title: 'Save tabs to the right',
    contexts: ['page', 'action'],
  });
  chrome.contextMenus.create({
    id: 'store-other-tabs',
    title: 'Save all tabs except this one',
    contexts: ['page', 'action'],
  });
  chrome.contextMenus.create({
    id: 'store-all-windows',
    title: 'Save tabs from all windows',
    contexts: ['page', 'action'],
  });
}

function getStoredActionClick(value: unknown): 'store' | 'popup' {
  if (!value || typeof value !== 'object') return 'store';
  const settings = (value as { settings?: unknown }).settings;
  if (!settings || typeof settings !== 'object') return 'store';
  return (settings as { actionClick?: unknown }).actionClick === 'popup' ? 'popup' : 'store';
}

async function applyActionPopup(actionClick?: 'store' | 'popup') {
  const mode = actionClick ?? (await getSettings()).actionClick;
  await chrome.action.setPopup({ popup: mode === 'popup' ? POPUP_PAGE : '' });
  await chrome.action.setTitle({
    title: mode === 'popup' ? 'Open TabBoard' : 'Save tabs to TabBoard',
  });
}

type CaptureMode =
  | 'current-window'
  | 'current-tab'
  | 'all-windows'
  | 'highlighted-tabs'
  | 'tabs-left'
  | 'tabs-right'
  | 'other-tabs'
  | 'tab-ids'
  | 'tab-id'
  | 'window-id';

const CAPTURE_MODES = new Set<CaptureMode>([
  'current-window',
  'current-tab',
  'all-windows',
  'highlighted-tabs',
  'tabs-left',
  'tabs-right',
  'other-tabs',
  'tab-ids',
  'tab-id',
  'window-id',
]);

interface CaptureOptions {
  openAfter?: boolean;
  tabId?: number;
  tabIds?: number[];
  tabSnapshots?: chrome.tabs.Tab[];
  windowId?: number;
  workspaceId?: string;
}

interface CaptureResult {
  storedTabs: number;
  storedGroups: number;
  cleanedDuplicates: number;
  createdGroupIds: string[];
}

function requireSafeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`A valid ${field} is required for capture mode.`);
  }
  return value;
}

function validateCaptureRequest(
  message: { [key: string]: unknown },
  allowDefaultMode = false,
): { mode: CaptureMode; options: CaptureOptions } {
  const rawMode = message.mode === undefined && allowDefaultMode ? 'current-window' : message.mode;
  if (typeof rawMode !== 'string' || !CAPTURE_MODES.has(rawMode as CaptureMode)) {
    throw new Error(`Unknown capture mode: ${String(rawMode)}`);
  }
  if (message.openAfter !== undefined && typeof message.openAfter !== 'boolean') {
    throw new Error('openAfter must be a boolean.');
  }
  if (
    message.workspaceId !== undefined
    && (
      typeof message.workspaceId !== 'string'
      || !message.workspaceId.trim()
      || message.workspaceId.trim() !== message.workspaceId
    )
  ) {
    throw new Error('workspaceId must be a canonical non-empty string.');
  }

  const mode = rawMode as CaptureMode;
  const options: CaptureOptions = {
    openAfter: message.openAfter !== false,
    workspaceId: message.workspaceId as string | undefined,
  };
  switch (mode) {
    case 'tab-id':
      options.tabId = requireSafeInteger(message.tabId, 'tabId');
      break;
    case 'tab-ids':
      if (!Array.isArray(message.tabIds) || !message.tabIds.length) {
        throw new Error('A non-empty tabIds array is required for capture mode.');
      }
      if (!message.tabIds.every((tabId) => typeof tabId === 'number' && Number.isSafeInteger(tabId) && tabId > 0)) {
        throw new Error('tabIds must contain only positive safe integer IDs.');
      }
      options.tabIds = [...message.tabIds] as number[];
      break;
    case 'window-id':
      options.windowId = requireSafeInteger(message.windowId, 'windowId');
      break;
    default:
      break;
  }
  return { mode, options };
}

async function captureTabs(
  mode: CaptureMode,
  anchorTab: chrome.tabs.Tab | null | undefined,
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const settings = await getSettings();
  const sourceTabs = sortCapturedTabs(await getTabsForMode(mode, anchorTab, options));
  const eligibleTabs = sourceTabs.filter((tab) => canCaptureTab(tab, settings));
  const { uniqueTabs, duplicateTabs } = dedupeSourceTabs(eligibleTabs, settings);
  const storableTabs = uniqueTabs;
  if (!storableTabs.length) {
    throw new Error('No capturable tabs were found.');
  }

  const recordsByWindow = new Map<number, TabItem[]>();
  for (const tab of storableTabs) {
    const record = createTabRecord(tab, {
      browserGroup: await readBrowserGroup(tab),
      url: resolveTabUrl(tab),
    });
    const windowId = tab.windowId ?? -1;
    recordsByWindow.set(windowId, [...(recordsByWindow.get(windowId) || []), record]);
  }

  const state = await getState();
  const targetWorkspaceId = options.workspaceId || state.activeWorkspaceId;
  if (!state.workspaces.some((workspace) => workspace.id === targetWorkspaceId)) {
    throw new Error('The capture workspace is no longer available.');
  }
  const groups: Group[] = [...recordsByWindow.entries()].map(([windowId, records]) =>
    createGroupFromTabRecords(records, {
      title: captureTitle(mode, records, windowId),
      workspaceId: targetWorkspaceId,
    })
  );
  let persistedGroupIds = new Set<string>();
  if (groups.length) {
    const persistedState = await statePersistence.applyMutations([
      { type: 'prepend-groups', groups, updatedAt: nowIso() },
    ]);
    const targetWorkspacePersisted = persistedState.workspaces.some(
      (workspace) => workspace.id === targetWorkspaceId,
    );
    const groupsPersistedInTarget = groups.every((group) =>
      persistedState.groups.some(
        (persistedGroup) => persistedGroup.id === group.id
          && persistedGroup.workspaceId === targetWorkspaceId,
      ),
    );
    if (!targetWorkspacePersisted || !groupsPersistedInTarget) {
      throw new Error('The capture workspace changed before the session was saved.');
    }
    persistedGroupIds = new Set(persistedState.groups.map((group) => group.id));
  }
  const persistedGroups = groups.filter((group) => persistedGroupIds.has(group.id));
  const result: CaptureResult = {
    storedTabs: persistedGroups.reduce((total, group) => total + group.tabs.length, 0),
    storedGroups: persistedGroups.length,
    cleanedDuplicates: duplicateTabs.length,
    createdGroupIds: persistedGroups.map((group) => group.id),
  };

  let managerTab: chrome.tabs.Tab | null = null;
  if (options.openAfter !== false && settings.openManagerAfterSave) {
    try {
      managerTab = await openManager({
        windowId: anchorTab?.windowId,
        targetGroupId: result.createdGroupIds[0] || '',
        feedback: result,
      });
    } catch {
      // Capture is already persisted; manager navigation must not turn it into a retryable failure.
    }
  }

  const persistedSourceTabIds = new Set(
    persistedGroups.flatMap((group) => group.tabs)
      .map((tab) => tab.sourceTabId)
      .filter((tabId): tabId is number => Number.isSafeInteger(tabId)),
  );
  const tabsToClose = [
    ...duplicateTabs,
    ...(settings.closeTabsAfterSave ? storableTabs.filter((tab) => persistedSourceTabIds.has(tab.id ?? -1)) : []),
  ].filter((tab) => tab.id !== managerTab?.id);
  await removeCapturedTabs(tabsToClose);

  return result;
}

const BLANK_URL_PATTERN = /^about:blank$/i;

function resolveTabUrl(tab: chrome.tabs.Tab): string {
  return String(tab?.pendingUrl || tab?.url || '').trim();
}

function isBlankTab(tab: chrome.tabs.Tab): boolean {
  return BLANK_URL_PATTERN.test(resolveTabUrl(tab));
}

function dedupeSourceTabs(tabs: chrome.tabs.Tab[], settings: Settings) {
  if (!settings.dedupeOnSave) {
    return { uniqueTabs: tabs, duplicateTabs: [] as chrome.tabs.Tab[] };
  }
  return tabs.reduce<{ seen: Set<string>; uniqueTabs: chrome.tabs.Tab[]; duplicateTabs: chrome.tabs.Tab[] }>(
    (result, tab) => {
      const url = resolveTabUrl(tab);
      if (!url || !result.seen.has(url)) {
        return {
          seen: url ? new Set([...result.seen, url]) : result.seen,
          uniqueTabs: [...result.uniqueTabs, tab],
          duplicateTabs: result.duplicateTabs,
        };
      }
      return { ...result, duplicateTabs: [...result.duplicateTabs, tab] };
    },
    { seen: new Set(), uniqueTabs: [], duplicateTabs: [] }
  );
}

function canDedupeTab(tab: chrome.tabs.Tab): boolean {
  const url = resolveTabUrl(tab);
  if (!tab?.id || !url) {
    return false;
  }
  const ownBase = chrome.runtime.getURL('');
  if (url.startsWith(ownBase)) {
    return false;
  }
  return !/^devtools:/i.test(url) && !isBlankTab(tab);
}

function collectWindowDuplicates(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
  const byUrl = new Map<string, chrome.tabs.Tab[]>();
  for (const tab of tabs.filter(canDedupeTab)) {
    const url = resolveTabUrl(tab);
    byUrl.set(url, [...(byUrl.get(url) || []), tab]);
  }
  return [...byUrl.values()].flatMap((matches) => matches
    .sort((left, right) => Number(right.active) - Number(left.active)
      || (right.lastAccessed || 0) - (left.lastAccessed || 0)
      || (left.index || 0) - (right.index || 0))
    .slice(1));
}

async function getTabsForMode(
  mode: CaptureMode,
  anchorTab: chrome.tabs.Tab | null | undefined,
  options: CaptureOptions = {}
): Promise<chrome.tabs.Tab[]> {
  if (mode === 'tab-ids' && options.tabSnapshots) {
    return options.tabSnapshots.map((tab) => ({ ...tab }));
  }
  const current = anchorTab || (await getActiveTab());
  if (mode === 'all-windows') {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    return windows.flatMap((window) => window.tabs || []);
  }
  if (mode === 'window-id' && Number.isFinite(options.windowId)) {
    return chrome.tabs.query({ windowId: options.windowId });
  }
  if (mode === 'current-tab') {
    return current ? [current] : [];
  }
  if (mode === 'tab-id' && Number.isFinite(options.tabId)) {
    try {
      return [await chrome.tabs.get(options.tabId as number)];
    } catch {
      return [];
    }
  }
  if (mode === 'tab-ids' && Array.isArray(options.tabIds)) {
    const tabs: chrome.tabs.Tab[] = [];
    for (const tabId of [...new Set(options.tabIds)]) {
      if (!Number.isSafeInteger(tabId)) {
        continue;
      }
      try {
        const tab = await chrome.tabs.get(tabId);
        if (options.windowId === undefined || tab.windowId === options.windowId) {
          tabs.push(tab);
        }
      } catch {
        // Ignore tabs that closed before the save action completed.
      }
    }
    return tabs;
  }

  const windowId = current?.windowId;
  const tabs = windowId
    ? await chrome.tabs.query({ windowId })
    : await chrome.tabs.query({ currentWindow: true });

  if (!current) {
    return tabs;
  }
  if (mode === 'highlighted-tabs') {
    const highlighted = tabs.filter((tab) => tab.highlighted);
    return highlighted.length > 1 ? highlighted : [current];
  }
  if (mode === 'tabs-left') {
    return tabs.filter((tab) => (tab.index ?? 0) < (current.index ?? 0));
  }
  if (mode === 'tabs-right') {
    return tabs.filter((tab) => (tab.index ?? 0) > (current.index ?? 0));
  }
  if (mode === 'other-tabs') {
    return tabs.filter((tab) => tab.id !== current.id);
  }
  return tabs;
}

async function readBrowserGroup(tab: chrome.tabs.Tab): Promise<BrowserGroup | null> {
  if (!Number.isFinite(tab.groupId) || tab.groupId < 0 || !chrome.tabGroups?.get) {
    return null;
  }
  try {
    const group = await chrome.tabGroups.get(tab.groupId);
    return {
      sourceGroupId: tab.groupId,
      title: group.title || '',
      color: group.color || 'grey',
      collapsed: Boolean(group.collapsed),
    };
  } catch {
    return null;
  }
}

function canCaptureTab(tab: chrome.tabs.Tab, settings: Settings): boolean {
  return getCaptureCandidateReason(
    { id: tab?.id, url: resolveTabUrl(tab), pinned: tab?.pinned },
    settings,
    chrome.runtime.getURL(''),
  ) === null;
}

function captureTitle(mode: string, records: TabItem[], windowId: number): string {
  const base = defaultGroupTitle();
  const count = records.length;
  if (mode === 'current-tab') {
    return records[0]?.title || base;
  }
  if (mode === 'all-windows') {
    return `${base} - window ${windowId} - ${count} tabs`;
  }
  if (mode === 'window-id') {
    return `${base} - window ${windowId} - ${count} tabs`;
  }
  if (mode === 'tab-id') {
    return records[0]?.title || base;
  }
  if (mode === 'tab-ids') {
    return `${base} - selected tabs`;
  }
  if (mode === 'highlighted-tabs') {
    return `${base} - selected tabs`;
  }
  if (mode === 'tabs-left') {
    return `${base} - tabs to the left`;
  }
  if (mode === 'tabs-right') {
    return `${base} - tabs to the right`;
  }
  if (mode === 'other-tabs') {
    return `${base} - other tabs`;
  }
  return `${base} - ${count} tabs`;
}

interface TabRefWithSource {
  source: string;
  groupId: string;
  tabId: string;
}

interface FoundTabRef {
  source: string;
  group: Group;
  tab: TabItem;
}

async function restoreTabInternal({ source = 'group', groupId = '', tabId = '' }: TabRefWithSource) {
  const state = await getState();
  const settings = state.settings;
  const found = findTabRef(state, { source, groupId, tabId });
  if (!found) {
    throw new Error('Saved tab not found');
  }
  if (!isRestorableTab(found.tab)) {
    throw new Error('This item is not a restorable link');
  }
  const created = await createChromeTabs([found.tab], { newWindow: false, settings });
  if (settings.deleteRestoredTabs && !found.group?.locked && created.length) {
    await removeRestoredRefs([{ source, groupId, tabId }]);
  }
  return { restoredTabs: created.length };
}

async function restoreGroupInternal(groupId: string) {
  const state = await getState();
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) {
    throw new Error('Saved group not found');
  }
  const tabs = group.tabs.filter(isRestorableTab);
  const created = await createChromeTabs(tabs, {
    newWindow: state.settings.restoreGroupsInNewWindow,
    settings: state.settings,
  });
  if (state.settings.deleteRestoredTabs && !group.locked && created.length) {
    await removeRestoredRefs(
      created.map(({ record }) => ({ source: 'group', groupId, tabId: record.id }))
    );
  }
  return { restoredTabs: created.length };
}

async function restoreRefsInternal(refs: TabRef[]) {
  const state = await getState();
  const settings = state.settings;
  const found = refs.map((ref) => findTabRef(state, ref)).filter(Boolean) as FoundTabRef[];
  const restorable = found.filter((item) => isRestorableTab(item.tab));
  const tabs = restorable.map((item) => item.tab);
  const created = await createChromeTabs(tabs, { newWindow: false, settings });
  if (settings.deleteRestoredTabs && created.length) {
    const createdIds = new Set(created.map(({ record }) => record.id));
    const removableRefs = restorable
      .filter((item) => createdIds.has(item.tab.id) && !item.group?.locked)
      .map((item) => ({ source: item.source, groupId: item.group?.id || '', tabId: item.tab.id }));
    await removeRestoredRefs(removableRefs);
  }
  return { restoredTabs: created.length };
}

async function restoreAllInternal() {
  const state = await getState();
  const restorable: { group: Group; tab: TabItem }[] = state.groups.flatMap((group) =>
    group.tabs.filter(isRestorableTab).map((tab) => ({ group, tab }))
  );
  const created = await createChromeTabs(restorable.map(({ tab }) => tab), {
    newWindow: state.settings.restoreGroupsInNewWindow,
    settings: state.settings,
  });
  if (state.settings.deleteRestoredTabs && created.length) {
    const createdIds = new Set(created.map(({ record }) => record.id));
    const refs = restorable
      .filter(({ group, tab }) => createdIds.has(tab.id) && !group.locked)
      .map(({ group, tab }) => ({ source: 'group', groupId: group.id, tabId: tab.id }));
    await removeRestoredRefs(refs);
  }
  return { restoredTabs: created.length };
}

function restoreTab(ref: TabRefWithSource) {
  return enqueueRestore(() => restoreTabInternal(ref));
}

function restoreGroup(groupId: string) {
  return enqueueRestore(() => restoreGroupInternal(groupId));
}

function restoreRefs(refs: TabRef[]) {
  return enqueueRestore(() => restoreRefsInternal(refs));
}

function restoreAll() {
  return enqueueRestore(() => restoreAllInternal());
}

interface CreatedTab {
  tab: chrome.tabs.Tab;
  record: TabItem;
}

async function createChromeTabs(
  records: TabItem[],
  { newWindow, settings }: { newWindow: boolean; settings: Settings }
): Promise<CreatedTab[]> {
  records = records.filter(isRestorableTab);
  if (!records.length) {
    return [];
  }
  const created: CreatedTab[] = [];
  const focusFirst = settings.focusRestoredTabs !== false;

  if (newWindow) {
    let targetWindowId: number | undefined = undefined;
    for (const record of records) {
      try {
        if (!Number.isFinite(targetWindowId)) {
          const nextWindow = await chrome.windows.create({
            url: record.url,
            focused: focusFirst && !created.length,
          });
          targetWindowId = nextWindow.id;
          const firstTab = nextWindow.tabs?.[0];
          if (firstTab) {
            created.push({ tab: firstTab, record });
          }
          continue;
        }
        const tab = await chrome.tabs.create({
          windowId: targetWindowId,
          url: record.url,
          active: false,
        });
        created.push({ tab, record });
      } catch {
        // Keep failed records saved so users can retry or copy the URL.
      }
    }
  } else {
    const activeTab = await getActiveTab();
    let nextIndex = settings.restoreNextToCurrent && Number.isFinite(activeTab?.index ?? undefined)
      ? (activeTab?.index ?? 0) + 1
      : -1;
    for (const record of records) {
      const createProperties: chrome.tabs.CreateProperties = {
        url: record.url,
        active: focusFirst && !created.length,
      };
      if (activeTab?.windowId) {
        createProperties.windowId = activeTab.windowId;
      }
      if (nextIndex >= 0) {
        createProperties.index = nextIndex++;
      }
      try {
        const tab = await chrome.tabs.create(createProperties);
        created.push({ tab, record });
      } catch {
        // Keep failed records saved so users can retry or copy the URL.
      }
    }
  }

  await restoreBrowserGroups(created);
  return created;
}

async function restoreBrowserGroups(created: CreatedTab[]) {
  if (!chrome.tabs.group || !chrome.tabGroups?.update) {
    return;
  }
  const buckets = new Map<
    string,
    { browserGroup: BrowserGroup; tabIds: number[]; windowId: number }
  >();
  for (const item of created) {
    const browserGroup = item.record.browserGroup;
    if (!browserGroup) {
      continue;
    }
    const key = `${browserGroup.sourceGroupId || browserGroup.title || 'group'}:${item.tab.windowId}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        browserGroup,
        tabIds: [],
        windowId: item.tab.windowId ?? -1,
      });
    }
    const bucket = buckets.get(key)!;
    if (item.tab.id) {
      bucket.tabIds.push(item.tab.id);
    }
  }

  for (const bucket of buckets.values()) {
    if (!bucket.tabIds.length) {
      continue;
    }
    try {
      const groupId = await chrome.tabs.group({
        tabIds: bucket.tabIds,
        createProperties: { windowId: bucket.windowId },
      });
      await chrome.tabGroups.update(groupId, {
        title: bucket.browserGroup.title,
        color: (bucket.browserGroup.color || 'grey') as chrome.tabGroups.ColorEnum,
        collapsed: bucket.browserGroup.collapsed,
      });
    } catch {
      // Some Chromium builds restrict grouping restored internal pages.
    }
  }
}

function findTabRef(state: TabBoardState, ref: TabRefWithSource): FoundTabRef | null {
  const group = state.groups.find((item) => item.id === ref.groupId);
  const tab = group?.tabs.find((item) => item.id === ref.tabId);
  return group && tab ? { source: 'group', group, tab } : null;
}

async function removeRestoredRefs(refs: TabRefWithSource[]) {
  if (!refs.length) {
    return;
  }
  await statePersistence.applyMutations([
    { type: 'remove-restored-refs', refs, updatedAt: nowIso() },
  ]);
}

async function removeTabs(tabIds: number[]) {
  for (const id of tabIds) {
    try {
      await chrome.tabs.remove(id);
    } catch {
      // The tab may already be closed by the user or Chrome may refuse an internal page.
    }
  }
}

async function removeCapturedTabs(capturedTabs: chrome.tabs.Tab[]) {
  for (const capturedTab of capturedTabs) {
    const tabId = capturedTab.id;
    if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId)) continue;
    try {
      const currentTab = await chrome.tabs.get(tabId) as chrome.tabs.Tab | undefined;
      if (
        !currentTab
        || currentTab.windowId !== capturedTab.windowId
        || resolveTabUrl(currentTab) !== resolveTabUrl(capturedTab)
      ) {
        continue;
      }
      await chrome.tabs.remove(tabId);
    } catch {
      // The tab may already be closed or Chrome may refuse an internal page.
    }
  }
}

async function countWindowDuplicates(windowId?: number) {
  const query = Number.isFinite(windowId) ? { windowId } : { currentWindow: true };
  const tabs = sortCapturedTabs(await chrome.tabs.query(query));
  return { duplicateTabCount: collectWindowDuplicates(tabs).length };
}

async function dedupeWindow(windowId?: number) {
  const query = Number.isFinite(windowId) ? { windowId } : { currentWindow: true };
  const tabs = sortCapturedTabs(await chrome.tabs.query(query));
  const duplicateTabs = collectWindowDuplicates(tabs);
  await removeTabs(
    duplicateTabs.map((tab) => tab.id).filter((id): id is number => typeof id === 'number')
  );
  return { removedTabs: duplicateTabs.length };
}

async function deleteSavedGroupInternal(groupId: string) {
  const id = String(groupId || '');
  if (!id) {
    return { deleted: false };
  }
  const state = await getState();
  const group = state.groups.find((item) => item.id === id);
  if (!group) {
    return { deleted: false };
  }
  const groupIndex = state.groups.findIndex((item) => item.id === id);
  const workspace = state.workspaces.find((item) => item.id === group.workspaceId);
  const folder = group.folderId
    ? state.folders.find((item) => item.id === group.folderId)
    : undefined;
  const binEntry = createBinEntry('group', group, {
    label: group.title,
    groupId: group.id,
    groupTitle: group.title,
    originalIndex: groupIndex >= 0 ? groupIndex : undefined,
    originalWorkspaceId: group.workspaceId,
    originalFolderId: group.folderId,
    originalWorkspaceName: workspace?.name,
    originalFolderName: folder?.name,
  });
  if (!binEntry) {
    return { deleted: false };
  }
  await statePersistence.applyMutations([
    { type: 'delete-group', id, binEntry, updatedAt: nowIso() },
  ]);
  return { deleted: true };
}

function deleteSavedGroup(groupId: string) {
  return enqueueRestore(() => deleteSavedGroupInternal(groupId));
}

interface OpenManagerOptions {
  windowId?: number;
  query?: string;
  targetGroupId?: string;
  feedback?: { storedTabs?: number; cleanedDuplicates?: number } | null;
}

async function openManager({
  windowId,
  query = '',
  targetGroupId = '',
  feedback = null,
}: OpenManagerOptions = {}) {
  const baseUrl = chrome.runtime.getURL(MANAGER_PAGE);
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  if (targetGroupId) {
    params.set('targetGroupId', targetGroupId);
  }
  if (feedback) {
    params.set('saved', String(feedback.storedTabs || 0));
    params.set('duplicates', String(feedback.cleanedDuplicates || 0));
  }
  const targetUrl = params.toString() ? `${baseUrl}?${params}` : baseUrl;
  const tabs = await chrome.tabs.query({});
  const existing = chooseManagerTab(tabs, baseUrl, windowId);

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url: targetUrl });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return existing;
  }

  return chrome.tabs.create({
    url: targetUrl,
    active: true,
    ...(windowId ? { windowId } : {}),
  });
}

function chooseManagerTab(
  tabs: chrome.tabs.Tab[],
  baseUrl: string,
  preferredWindowId?: number
): chrome.tabs.Tab | null {
  const managers = tabs.filter((tab) => tab.url?.startsWith(baseUrl));
  return (
    managers.find((tab) => tab.active && tab.windowId === preferredWindowId) ||
    managers.find((tab) => tab.windowId === preferredWindowId) ||
    managers.find((tab) => tab.active) ||
    [...managers].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] ||
    null
  );
}

async function createWindow() {
  const window = await chrome.windows.create({ focused: true, type: 'normal' });
  return { windowId: window?.id || null };
}

async function closeOpenTab(tabId: number) {
  const normalizedTabId = Number(tabId);
  if (!Number.isSafeInteger(normalizedTabId) || normalizedTabId < 0) {
    throw new Error('A valid tab ID is required');
  }
  await chrome.tabs.remove(normalizedTabId);
  return { tabId: normalizedTabId };
}

async function pinOpenTab(tabId: number) {
  const normalizedTabId = Number(tabId);
  if (!Number.isSafeInteger(normalizedTabId) || normalizedTabId < 0) {
    throw new Error('A valid tab ID is required');
  }
  await chrome.tabs.update(normalizedTabId, { pinned: true });
  return { tabId: normalizedTabId, pinned: true };
}

function normalizeOpenTabIds(tabIds: unknown): number[] {
  if (!Array.isArray(tabIds) || !tabIds.length) {
    throw new Error('At least one valid tab ID is required');
  }
  const ids = [...new Set(tabIds.map(Number))];
  if (ids.some((tabId) => !Number.isSafeInteger(tabId) || tabId < 0)) {
    throw new Error('At least one valid tab ID is required');
  }
  return ids;
}

async function closeOpenTabs(tabIds: number[]) {
  const ids = normalizeOpenTabIds(tabIds);
  await chrome.tabs.remove(ids);
  return { tabIds: ids };
}

async function pinOpenTabs(tabIds: number[]) {
  const ids = normalizeOpenTabIds(tabIds);
  await Promise.all(ids.map((tabId) => chrome.tabs.update(tabId, { pinned: true })));
  return { tabIds: ids, pinned: true };
}

async function focusOpenTab(tabId: number, windowId: number) {
  const normalizedTabId = Number(tabId);
  if (!Number.isSafeInteger(normalizedTabId) || normalizedTabId < 0) {
    throw new Error('A valid tab ID is required');
  }
  const normalizedWindowId = Number(windowId);
  if (!Number.isSafeInteger(normalizedWindowId) || normalizedWindowId < 0) {
    throw new Error('A valid window ID is required');
  }
  let currentTab: chrome.tabs.Tab | undefined;
  try {
    currentTab = await chrome.tabs.get(normalizedTabId);
  } catch {
    currentTab = undefined;
  }
  if (!currentTab || currentTab.windowId !== normalizedWindowId) {
    throw new Error('The tab is no longer in the requested window');
  }
  await chrome.tabs.update(normalizedTabId, { active: true });
  await chrome.windows.update(normalizedWindowId, { focused: true });
  return { tabId: normalizedTabId, windowId: normalizedWindowId };
}

interface OpenTabInfo {
  id: number | undefined;
  windowId: number | undefined;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
  pinned: boolean;
  index: number;
  browserGroup: BrowserGroup | null;
  storable: boolean;
  reason: CaptureCandidateReason | null;
}

interface OpenWindowInfo {
  id: number | undefined;
  focused: boolean;
  incognito: boolean;
  tabCount: number;
  tabs: OpenTabInfo[];
}

async function listOpenTabs(): Promise<{ windows: OpenWindowInfo[] }> {
  const settings = await getSettings();
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const extensionBaseUrl = chrome.runtime.getURL('').toLowerCase();
  const browserGroupReads = new Map<number, Promise<BrowserGroup | null>>();
  const getBrowserGroup = (tab: chrome.tabs.Tab): Promise<BrowserGroup | null> => {
    if (!Number.isFinite(tab.groupId) || tab.groupId < 0) return Promise.resolve(null);
    const existing = browserGroupReads.get(tab.groupId);
    if (existing) return existing;
    const read = readBrowserGroup(tab);
    browserGroupReads.set(tab.groupId, read);
    return read;
  };
  const openWindows = await Promise.all(windows.map(async (window): Promise<OpenWindowInfo> => {
    const tabs = (await Promise.all((window.tabs || []).map(async (tab): Promise<OpenTabInfo | null> => {
      const url = resolveTabUrl(tab);
      if (url.toLowerCase().startsWith(extensionBaseUrl)) return null;
      if (matchesCustomUrlFilter(url, settings)) return null;
      const reason = getCaptureCandidateReason(
        { id: tab?.id, url, pinned: tab?.pinned },
        settings,
        extensionBaseUrl,
      );
      return {
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title || url || 'Untitled',
        url,
        favIconUrl: tab.favIconUrl || '',
        active: Boolean(tab.active),
        pinned: Boolean(tab.pinned),
        index: tab.index || 0,
        browserGroup: await getBrowserGroup(tab),
        storable: reason === null,
        reason,
      };
    }))).filter((tab): tab is OpenTabInfo => tab !== null);
    return {
      id: window.id,
      focused: Boolean(window.focused),
      incognito: Boolean(window.incognito),
      tabCount: tabs.length,
      tabs,
    };
  }));
  return { windows: openWindows };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function getOmniboxSuggestions(text: string): Promise<chrome.omnibox.SuggestResult[]> {
  const query = normalizeSearch(text);
  if (!query) {
    return [];
  }
  const state = normalizeState(await getState());
  const suggestions: chrome.omnibox.SuggestResult[] = [];

  for (const group of state.groups) {
    if (!groupMatchesQuery(group, query)) {
      continue;
    }
    for (const tab of group.tabs) {
      if (!isRestorableTab(tab)) {
        continue;
      }
      if (!tabMatchesQuery(tab, query) && !group.title.toLowerCase().includes(query.toLowerCase())) {
        continue;
      }
      suggestions.push({
        content: `tabb://tab/group/${group.id}/${tab.id}`,
        description: `${escapeXml(tab.title)} <dim>${escapeXml(tab.url)}</dim>`,
      });
      if (suggestions.length >= 6) {
        return suggestions;
      }
    }
  }

  suggestions.push({
    content: query,
    description: `Open TabBoard search for <match>${escapeXml(query)}</match>`,
  });
  return suggestions;
}

function createTabRecord(tab: chrome.tabs.Tab, overrides: { browserGroup?: BrowserGroup | null; url?: string } = {}): TabItem {
  const timestamp = nowIso();
  const url = String(overrides.url || tab.url || '');
  return normalizeTab({
    id: createId('tab'),
    itemType: ITEM_LINK,
    title: tab.title || url,
    url,
    favIconUrl: tab.favIconUrl ?? '',
    pinned: Boolean(tab.pinned),
    incognito: Boolean(tab.incognito),
    sourceWindowId: tab.windowId ?? null,
    sourceTabId: tab.id ?? null,
    browserGroup: overrides.browserGroup ?? null,
    starred: false,
    taskStatus: 'none',
    note: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }) as TabItem;
}

function createGroupFromTabRecords(
  tabs: TabItem[],
  options: { title?: string; workspaceId?: string; folderId?: string } = {}
): Group {
  const timestamp = nowIso();
  return normalizeGroup({
    id: createId('group'),
    title: options.title || defaultGroupTitle(),
    note: '',
    workspaceId: options.workspaceId,
    folderId: options.folderId || null,
    locked: false,
    starred: false,
    collapsed: false,
    tabs: tabs.map((tab) => normalizeTab(tab)).filter(Boolean),
    createdAt: timestamp,
    updatedAt: timestamp,
  }) as Group;
}

function createBinEntry(
  kind: 'group' | 'tab',
  item: Group | TabItem,
  meta: {
    label?: string;
    groupId?: string;
    groupTitle?: string;
    source?: string;
    originalWorkspaceId?: string;
    originalFolderId?: string | null;
    originalIndex?: number;
    originalWorkspaceName?: string;
    originalFolderName?: string;
  } = {}
) {
  const timestamp = nowIso();
  const normalizedKind = kind === 'group' ? 'group' : 'tab';
  const normalizedItem = normalizedKind === 'group' ? normalizeGroup(item) : normalizeTab(item);
  if (!normalizedItem) {
    return null;
  }
  return normalizeBinEntry({
    id: createId('bin'),
    kind: normalizedKind,
    label: meta.label || normalizedItem.title,
    groupId: meta.groupId || '',
    groupTitle: meta.groupTitle || '',
    source: meta.source || 'group',
    originalWorkspaceId: meta.originalWorkspaceId,
    originalFolderId: meta.originalFolderId,
    originalIndex: meta.originalIndex,
    originalWorkspaceName: meta.originalWorkspaceName,
    originalFolderName: meta.originalFolderName,
    item: normalizedItem,
    deletedAt: timestamp,
  });
}

function sortCapturedTabs(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
  return [...tabs].sort((a, b) => {
    if ((a.windowId || 0) !== (b.windowId || 0)) {
      return (a.windowId || 0) - (b.windowId || 0);
    }
    return (a.index || 0) - (b.index || 0);
  });
}

function escapeXml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveSelectedNormalWindow(
  windows: chrome.windows.Window[],
  selectedWindowId: number | undefined,
): chrome.windows.Window | null {
  const normalWindows = windows.filter(
    (window) => (!window.type || window.type === 'normal') && !window.incognito,
  );
  return normalWindows.find((window) => window.id === selectedWindowId)
    ?? normalWindows.find((window) => window.focused)
    ?? normalWindows[0]
    ?? null;
}

async function saveSelectedTabs(
  tabIds: number[],
  selectedWindowId?: number,
  workspaceId?: string,
) {
  if (
    !Array.isArray(tabIds)
    || tabIds.length === 0
    || !tabIds.every((tabId) => typeof tabId === 'number' && Number.isSafeInteger(tabId) && tabId > 0)
  ) {
    throw new Error('A non-empty tabIds array containing safe integer IDs is required.');
  }
  if (
    selectedWindowId !== undefined
    && (!Number.isSafeInteger(selectedWindowId) || selectedWindowId <= 0)
  ) {
    throw new Error('selectedWindowId must be a positive safe integer.');
  }

  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const selectedWindow = resolveSelectedNormalWindow(windows, selectedWindowId);
  const resolvedWindowId = selectedWindow?.id;
  if (!selectedWindow || typeof resolvedWindowId !== 'number' || !Number.isSafeInteger(resolvedWindowId)) {
    throw new Error('A normal browser window is required');
  }

  const settings = await getSettings();
  const requestedTabIds = [...new Set(Array.isArray(tabIds) ? tabIds : [])];
  const validatedTabs: chrome.tabs.Tab[] = [];
  for (const tabId of requestedTabIds) {
    const isValidId = typeof tabId === 'number' && Number.isSafeInteger(tabId);
    if (!isValidId) {
      throw new Error(`Selected tab ${String(tabId)} is not available in the selected normal window or cannot be saved.`);
    }

    const listedTab = selectedWindow.tabs?.find((tab) => tab.id === tabId);
    let currentTab: chrome.tabs.Tab | null = null;
    try {
      currentTab = await chrome.tabs.get(tabId);
    } catch {
      currentTab = null;
    }
    if (
      !listedTab
      || !currentTab
      || currentTab.windowId !== resolvedWindowId
      || !canCaptureTab(currentTab, settings)
    ) {
      throw new Error(`Selected tab ${tabId} is not available in the selected normal window or cannot be saved.`);
    }
    validatedTabs.push({ ...currentTab });
  }
  const anchorTab = validatedTabs.find((tab) => tab.active) || await getActiveTab();

  return captureTabs('tab-ids', anchorTab, {
    tabIds: requestedTabIds,
    tabSnapshots: validatedTabs,
    windowId: resolvedWindowId,
    workspaceId,
    openAfter: true,
  });
}
