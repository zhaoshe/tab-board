# Batch One Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified drag/Open Tabs hot-path work and avoid selector-driven re-renders without changing TabBoard behavior.

**Architecture:** Keep all changes local to existing manager components, hooks, and service worker. Replace repeated collection allocation and scans with memoized values, one-pass candidate tracking, request-local Promise caching, and existing Zustand `useShallow` selectors. Preserve existing DnD contracts, Open Tabs runtime envelope, and Chrome API failure fallback.

**Tech Stack:** React 18, TypeScript, Zustand 4, `@dnd-kit/core`, Chrome Manifest V3 APIs, Vitest, happy-dom, Playwright.

---

## File map

| File | Responsibility | Change |
|---|---|---|
| `src/manager/components/shell/ManagerLayout.tsx` | DnD collision and drag replacement lifecycle | One-pass candidate selection; memoized snapshot. |
| `src/manager/components/shell/ManagerLayout.test.ts` | Shell pure-function regression tests | Collision selection and snapshot contracts. |
| `src/manager/hooks/useFilteredGroups.ts` | Visible session derivation | Memoize result for stable inputs. |
| `src/background/service-worker.ts` | Chrome Open Tabs response | Per-request browser-group Promise cache and parallel tab conversion. |
| `src/background/service-worker.test.ts` | Service-worker Chrome boundary tests | Query deduplication, failure fallback, ordering. |
| `src/manager/components/sidebar/OpenTabsPanel.tsx` | Open Tabs selection/drag UI | Panel-level memoized selection data and `Set` lookups. |
| `src/manager/core/open-tabs.test.ts` | Open Tabs behavior/source contracts | Drag selection derivation regression coverage. |
| `src/manager/components/workspace/WorkspaceContent.tsx` | Session board render | Shallow object selector. |
| `src/manager/components/sessions/SessionCard.tsx` | Session card folder selector | Shallow filtered-folder selector. |
| `src/manager/core/session-rendering.test.ts` | Session rendering contracts | Selector stability source contracts. |
| `tests/e2e/open-tab-preview.e2e.ts` | Existing large Open Tabs browser regression | Run unchanged after implementation. |

## Task 1: Optimize DnD collision selection and drag snapshot

**Files:**
- Modify: `src/manager/components/shell/ManagerLayout.tsx:95-127,204-254,342-347,485-504`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts:1-109`

- [ ] **Step 1: Write failing pure collision-selection tests**

Export a pure helper from `ManagerLayout.tsx` that accepts resolved candidates and locked target, then add tests without DOM geometry setup:

```ts
import {
  getCollisionSelection,
  // existing exports...
} from './ManagerLayout';

it('prefers the closest category target under the pointer', () => {
  const category = { kind: 'category-column', category: 'inbox', workspaceId: 'workspace_default' } as const;
  const group = { kind: 'group-insert', category: 'inbox', index: 0, workspaceId: 'workspace_default' } as const;

  expect(getCollisionSelection([candidate(group, 1), candidate(category, 9)], null)).toEqual(category);
});

it('retains a locked target inside the release margin', () => {
  const locked = { kind: 'group-insert', category: 'inbox', index: 0, workspaceId: 'workspace_default' } as const;
  const nearer = { kind: 'group-insert', category: 'inbox', index: 1, workspaceId: 'workspace_default' } as const;

  expect(getCollisionSelection([candidate(locked, 4), candidate(nearer, 1)], locked)).toEqual(locked);
});
```

Define test-local `candidate()` with a unique id/container stub and the exported `GeometryCandidate` type or an assignable object. Add cases for no candidates, closest non-category candidate, and locked candidate beyond `DROP_TARGET_RELEASE_MARGIN`.

- [ ] **Step 2: Run collision tests; verify RED**

Run:

```sh
npm test -- src/manager/components/shell/ManagerLayout.test.ts
```

Expected: TypeScript/Vitest failure because `getCollisionSelection` and `GeometryCandidate` do not exist.

- [ ] **Step 3: Add explicit candidate and snapshot helpers**

In `ManagerLayout.tsx`, below `targetEquals()`, add a narrow exported type and helpers:

```ts
export interface GeometryCandidate {
  container: DroppableContainer;
  target: DropTarget;
  distance: number;
}

function getNearestCandidate(
  current: GeometryCandidate | null,
  next: GeometryCandidate,
): GeometryCandidate {
  return !current || next.distance < current.distance ? next : current;
}

export function getDragReplacementSnapshot(
  workspaceId: string,
  category: CategoryFilter,
  showBin: boolean,
  groups: readonly Group[],
): DragReplacementSnapshot {
  return {
    workspaceId,
    category,
    view: showBin ? 'bin' : 'workspace',
    groups: groups.map((group) => `${group.id}:${group.updatedAt}:${group.tabs.map((tab) => `${tab.id}:${tab.updatedAt}`).join(',')}`).join('|'),
  };
}
```

Import `useMemo` from React and `Group` from shared model. Keep snapshot serialization identical to existing code.

- [ ] **Step 4: Implement pure collision selection with identical lock semantics**

Add helper using pre-computed closest candidates. Do not re-sort or scan after selection:

```ts
export function getCollisionSelection(
  candidates: readonly GeometryCandidate[],
  lockedTarget: DropTarget | null,
): GeometryCandidate | null {
  let closest: GeometryCandidate | null = null;
  let category: GeometryCandidate | null = null;
  let locked: GeometryCandidate | null = null;

  for (const candidate of candidates) {
    if (candidate.target.kind === 'category-column') category = getNearestCandidate(category, candidate);
    else closest = getNearestCandidate(closest, candidate);
    if (targetEquals(candidate.target, lockedTarget)) locked = candidate;
  }

  const fallback = category ?? closest;
  if (!fallback) return null;
  const target = category?.target ?? lockDropTarget(lockedTarget, fallback.target, {
    distance: locked?.distance ?? Number.POSITIVE_INFINITY,
    releaseMargin: DROP_TARGET_RELEASE_MARGIN,
  });
  return targetEquals(target, lockedTarget) ? locked ?? fallback : fallback;
}
```

In `createGeometryCollisionDetection()`, single-pass `droppableContainers` into three variables rather than an array: closest ordinary candidate, closest category candidate, and matching locked candidate. Pass only those non-null candidates to `getCollisionSelection()`. The collection must still reject category rects outside the pointer and must resolve tab edges before comparison.

- [ ] **Step 5: Memoize replacement snapshots**

Replace inline `dragReplacementKey` object with:

```ts
const dragReplacementKey = useMemo(
  () => getDragReplacementSnapshot(activeWorkspaceId, selectedCategory, showBin, groups),
  [activeWorkspaceId, groups, selectedCategory, showBin],
);
```

In the active-drag effect, replace the duplicate inline snapshot with `dragReplacementKey` and add it to effect dependencies. Do not change invalidation condition or `isDragSourceStillRendered()` call.

- [ ] **Step 6: Run focused shell tests; verify GREEN**

Run:

```sh
npm test -- src/manager/components/shell/ManagerLayout.test.ts
```

Expected: PASS. Existing category-target test must be updated from string matching to functional `getCollisionSelection()` assertions if source string changed.

- [ ] **Step 7: Commit DnD optimization**

```sh
git add src/manager/components/shell/ManagerLayout.tsx src/manager/components/shell/ManagerLayout.test.ts
git commit -m "perf: streamline drag collision detection" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Task 2: Stabilize visible group derivation

**Files:**
- Modify: `src/manager/hooks/useFilteredGroups.ts:1-42`
- Test: `src/manager/components/shell/ManagerLayout.test.ts:71-78`

- [ ] **Step 1: Write failing memoization source contract**

Extend `ManagerLayout.test.ts` with a source-level contract for the hook:

```ts
const filteredGroupsSource = readFileSync(
  resolve(process.cwd(), 'src/manager/hooks/useFilteredGroups.ts'),
  'utf8',
);

it('memoizes visible groups from stable store, category, and query inputs', () => {
  expect(filteredGroupsSource).toContain('useMemo(');
  expect(filteredGroupsSource).toContain('() => getVisibleGroups(state, category, searchQuery)');
  expect(filteredGroupsSource).toContain('[category, searchQuery, state]');
});
```

- [ ] **Step 2: Run focused shell tests; verify RED**

Run:

```sh
npm test -- src/manager/components/shell/ManagerLayout.test.ts
```

Expected: FAIL because `useFilteredGroups()` currently returns `getVisibleGroups()` directly and does not import `useMemo`.

- [ ] **Step 3: Add memoized visible group derivation**

Change React import and return expression in `useFilteredGroups.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';

return useMemo(
  () => getVisibleGroups(state, category, searchQuery),
  [category, searchQuery, state],
);
```

Keep `useShallow` selector unchanged. Do not memoize global search listener state or alter its event behavior.

- [ ] **Step 4: Run focused shell tests; verify GREEN**

Run:

```sh
npm test -- src/manager/components/shell/ManagerLayout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit stable group derivation**

```sh
git add src/manager/hooks/useFilteredGroups.ts src/manager/components/shell/ManagerLayout.test.ts
git commit -m "perf: memoize visible session groups" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Task 3: Parallelize and deduplicate browser group metadata reads

**Files:**
- Modify: `src/background/service-worker.ts:823-838,1348-1386`
- Modify: `src/background/service-worker.test.ts:97-176,235-258`

- [ ] **Step 1: Extend Chrome harness with configurable tab-group reads**

Change `ChromeHarnessOptions` and `createChromeHarness()`:

```ts
interface ChromeHarnessOptions {
  tabs?: chrome.tabs.Tab[];
  windows?: chrome.windows.Window[];
  getTab?: (tabId: number) => chrome.tabs.Tab | undefined | Promise<chrome.tabs.Tab | undefined>;
  getBrowserGroup?: (groupId: number) => chrome.tabGroups.TabGroup | Promise<chrome.tabGroups.TabGroup>;
}

const getBrowserGroup = options.getBrowserGroup
  ?? ((groupId: number) => ({ id: groupId, title: `Group ${groupId}`, color: 'blue', collapsed: false }));

// in chromeMock
 tabGroups: {
  get: vi.fn(async (groupId: number) => getBrowserGroup(groupId)),
 },
```

The resulting mock must retain `chrome.tabGroups.get` availability for existing `readBrowserGroup()` behavior.

- [ ] **Step 2: Write failing `list-open-tabs` group cache tests**

Add tests after extension-tab omission coverage:

```ts
it('reads each browser group once and preserves listed tab order', async () => {
  const first = createTab(1, 'First', { groupId: 9 });
  const second = createTab(2, 'Second', { groupId: 9 });
  const ungrouped = createTab(3, 'Third', { groupId: -1 });
  const harness = createChromeHarness(createState(), { tabs: [first, second, ungrouped] });
  vi.stubGlobal('chrome', harness.chromeMock);
  await import('./service-worker');

  const response = await sendMessage(harness.runtimeMessage.getListener(), { type: 'list-open-tabs' }) as {
    ok: boolean;
    result: { windows: Array<{ tabs: Array<{ id?: number; browserGroup: { sourceGroupId: number } | null }> }> };
  };

  expect(response.result.windows[0].tabs.map((tab) => tab.id)).toEqual([1, 2, 3]);
  expect(harness.chromeMock.tabGroups.get).toHaveBeenCalledTimes(1);
  expect(harness.chromeMock.tabGroups.get).toHaveBeenCalledWith(9);
  expect(response.result.windows[0].tabs.map((tab) => tab.browserGroup?.sourceGroupId ?? null)).toEqual([9, 9, null]);
});

it('keeps Open Tabs available when browser group lookup rejects', async () => {
  const harness = createChromeHarness(createState(), {
    tabs: [createTab(1, 'Grouped', { groupId: 4 })],
    getBrowserGroup: () => Promise.reject(new Error('group disappeared')),
  });
  vi.stubGlobal('chrome', harness.chromeMock);
  await import('./service-worker');

  const response = await sendMessage(harness.runtimeMessage.getListener(), { type: 'list-open-tabs' }) as {
    ok: boolean;
    result: { windows: Array<{ tabs: Array<{ browserGroup: unknown }> }> };
  };

  expect(response).toMatchObject({ ok: true, result: { windows: [{ tabs: [{ browserGroup: null }] }] } });
});
```

- [ ] **Step 3: Run service worker tests; verify RED**

Run:

```sh
npm test -- src/background/service-worker.test.ts
```

Expected: First new test fails because existing serial loop calls `chrome.tabGroups.get(9)` twice.

- [ ] **Step 4: Add request-local group Promise cache and concurrent conversion**

Replace `listOpenTabs()` body using these helpers inside function scope:

```ts
const browserGroupRequests = new Map<number, Promise<BrowserGroup | null>>();
const getBrowserGroup = (tab: chrome.tabs.Tab): Promise<BrowserGroup | null> => {
  if (!Number.isFinite(tab.groupId) || tab.groupId < 0) return Promise.resolve(null);
  const existing = browserGroupRequests.get(tab.groupId);
  if (existing) return existing;
  const request = readBrowserGroup(tab);
  browserGroupRequests.set(tab.groupId, request);
  return request;
};
```

Create each window with an async map that returns `null` for extension/custom-filter tabs, then removes null records after `Promise.all()`:

```ts
const tabs = (await Promise.all((window.tabs || []).map(async (tab) => {
  const url = resolveTabUrl(tab);
  if (url.toLowerCase().startsWith(extensionBaseUrl) || matchesCustomUrlFilter(url, settings)) return null;
  const reason = getCaptureCandidateReason({ id: tab.id, url, pinned: tab.pinned }, settings, extensionBaseUrl);
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
```

Use `await Promise.all(windows.map(async (window) => ({ ... })))` so group calls also overlap across browser windows. Keep the existing `OpenWindowInfo` output shape and filtered `tabCount` semantics.

- [ ] **Step 5: Run service worker tests; verify GREEN**

Run:

```sh
npm test -- src/background/service-worker.test.ts
```

Expected: PASS, including sender validation and extension-tab omission tests.

- [ ] **Step 6: Commit service-worker optimization**

```sh
git add src/background/service-worker.ts src/background/service-worker.test.ts
git commit -m "perf: batch browser group lookups" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Task 4: Derive Open Tabs selection once per panel

**Files:**
- Modify: `src/manager/components/sidebar/OpenTabsPanel.tsx:95-173,250-455`
- Modify: `src/manager/core/open-tabs.test.ts:134-208`

- [ ] **Step 1: Write failing source-contract tests for panel-level selection data**

Add to `Task107 source contracts`:

```ts
it('derives Open Tabs selection once at panel scope', () => {
  const panel = read('manager/components/sidebar/OpenTabsPanel.tsx');

  expect(panel).toContain('const selectedTabIdSet = useMemo(');
  expect(panel).toContain('const closingTabIdSet = useMemo(');
  expect(panel).toContain('const selectedStorableRecords = useMemo(');
  expect(panel).toContain('selectedTabIdSet.has(tab.id)');
  expect(panel).toContain('closingTabIdSet.has(tab.id)');
  expect(panel).not.toContain('availableTabs.filter((record)');
});
```

- [ ] **Step 2: Run Open Tabs core tests; verify RED**

Run:

```sh
npm test -- src/manager/core/open-tabs.test.ts
```

Expected: FAIL because no `selectedTabIdSet`, `closingTabIdSet`, or `selectedStorableRecords` declarations exist.

- [ ] **Step 3: Replace row-level scans with memoized shared data**

Change trigger props:

```ts
interface OpenTabContentTriggerProps {
  tab: OpenTabInfo;
  workspaceId: string;
  selectedTabIdSet: ReadonlySet<number>;
  selectedStorableRecords: readonly OpenTabInfo[];
  selectedStorableTabIds: readonly number[];
  previewKey: string;
  onCloseTab: (tabId: number | undefined) => Promise<void>;
  onPinTab: (tabId: number | undefined) => Promise<void>;
}
```

Replace row-local selection scan:

```ts
const isSelectedDrag = isValidTabId(tab.id) && selectedTabIdSet.has(tab.id);
const dragRecords = isSelectedDrag && selectedStorableRecords.length > 0
  ? selectedStorableRecords
  : [tab];
const dragTabIds = isSelectedDrag && selectedStorableTabIds.length > 0
  ? selectedStorableTabIds
  : isValidTabId(tab.id) ? [tab.id] : [];
```

At `OpenTabsPanel` function top, after overlay lifecycle setup, add:

```ts
const selectedTabIdSet = useMemo(() => new Set(selectedTabIds), [selectedTabIds]);
const closingTabIdSet = useMemo(() => new Set(closingTabIds), [closingTabIds]);
const selectedStorableRecords = useMemo(
  () => (selectedWindow?.tabs ?? []).filter((tab) => (
    tab.storable === true && isValidTabId(tab.id) && selectedTabIdSet.has(tab.id)
  )),
  [selectedTabIdSet, selectedWindow?.tabs],
);
const selectedStorableTabIds = useMemo(
  () => selectedStorableRecords.flatMap((tab) => isValidTabId(tab.id) ? [tab.id] : []),
  [selectedStorableRecords],
);
```

Use `selectedTabIdSet.has(tab.id)` and `closingTabIdSet.has(tab.id)` in row rendering. Pass shared values to `OpenTabContentTrigger`; remove `selectedTabIds` and `availableTabs` trigger props.

- [ ] **Step 4: Run Open Tabs core tests; verify GREEN**

Run:

```sh
npm test -- src/manager/core/open-tabs.test.ts
```

Expected: PASS. Existing presentational boundary checks must remain green.

- [ ] **Step 5: Commit Open Tabs selection optimization**

```sh
git add src/manager/components/sidebar/OpenTabsPanel.tsx src/manager/core/open-tabs.test.ts
git commit -m "perf: share open tab selection data" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Task 5: Stabilize workspace and session selectors

**Files:**
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx:1-10,73-77`
- Modify: `src/manager/components/sessions/SessionCard.tsx:1-20,113-118`
- Modify: `src/manager/core/session-rendering.test.ts:1-80`

- [ ] **Step 1: Write failing selector contracts**

Add tests that read component sources:

```ts
it('uses shallow equality for workspace board state', () => {
  expect(workspace).toMatch(/useTabBoardStore\(\s*useShallow\(\(state\) => \(\{/);
});

it('uses shallow equality for session workspace folders', () => {
  expect(card).toMatch(/useTabBoardStore\(\s*useShallow\(\(state\) =>\s*state\.folders\.filter/);
});
```

- [ ] **Step 2: Run session rendering tests; verify RED**

Run:

```sh
npm test -- src/manager/core/session-rendering.test.ts
```

Expected: FAIL because neither target selector is wrapped by `useShallow`.

- [ ] **Step 3: Wrap both selectors with existing Zustand shallow helper**

Add same import in both components:

```ts
import { useShallow } from 'zustand/react/shallow';
```

Change WorkspaceContent selector:

```ts
const { activeWorkspaceId, groups: allGroups, folders } = useTabBoardStore(
  useShallow((state) => ({
    activeWorkspaceId: state.activeWorkspaceId,
    groups: state.groups,
    folders: state.folders,
  })),
);
```

Change SessionCard folder selector:

```ts
const folders = useTabBoardStore(
  useShallow((state) => state.folders.filter((folder) => folder.workspaceId === group.workspaceId)),
);
```

Do not move folder ownership to props or alter action selectors.

- [ ] **Step 4: Run session rendering tests; verify GREEN**

Run:

```sh
npm test -- src/manager/core/session-rendering.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit selector optimization**

```sh
git add src/manager/components/workspace/WorkspaceContent.tsx src/manager/components/sessions/SessionCard.tsx src/manager/core/session-rendering.test.ts
git commit -m "perf: stabilize workspace selectors" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Task 6: Verify integrated behavior and document outcome

**Files:**
- Modify: `docs/performance-optimization-review.md:1-124`
- Test: `tests/e2e/open-tab-preview.e2e.ts`

- [ ] **Step 1: Run all unit and DOM tests**

Run:

```sh
npm test
```

Expected: every Vitest file passes. Expected fallback stderr from hydration tests remains non-failing.

- [ ] **Step 2: Run production type/build validation**

Run:

```sh
npm run build && npm run check
```

Expected: TypeScript compilation, Vite build, and extension output validation pass.

- [ ] **Step 3: Run existing Open Tabs Playwright regression**

Run:

```sh
npx playwright test tests/e2e/open-tab-preview.e2e.ts
```

Expected: PASS; 80-row Open Tabs list remains stable, saved/open preview closes and reopens correctly, ErrorBoundary remains absent.

- [ ] **Step 4: Perform Chrome DnD and browser-group smoke matrix**

In a Chrome profile with TabBoard loaded, execute and record each result in the review document:

1. Drag a session before/after another session in Inbox.
2. Drag a session from Inbox to a custom category.
3. Drag one saved tab into another session.
4. Drag one Open Tab into an existing session.
5. Select multiple storable Open Tabs and drag into an existing session.
6. Select multiple storable Open Tabs and drag to a new-session insertion target.
7. Refresh Open Tabs where two tabs share a Chrome group and one tab has no group.

Append this status section only after all checks pass:

```md
## 批次一实施结果

- 状态：已完成。
- 验证：`npm test`、`npm run build`、`npm run check`、Open Tabs Playwright 回归通过；Chrome DnD 与 browser group 手测通过。
- 已实施：P0 #1–#4，P1 #5。
```

- [ ] **Step 5: Commit verification documentation**

```sh
git add docs/performance-optimization-review.md
git commit -m "docs: record performance optimization results" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Plan self-review

- Spec coverage: Task 1 covers DnD collision and drag snapshot; Task 2 covers stable visible groups; Task 3 covers browser-group parallelism and fallback; Task 4 covers Open Tabs selection derivation; Task 5 covers both selector sites; Task 6 covers automated and manual acceptance.
- Placeholder scan: every task contains exact files, test cases, commands, and implementation snippets.
- Type consistency: `GeometryCandidate`, `getCollisionSelection`, and `getDragReplacementSnapshot` are defined in Task 1 before later use. `OpenTabContentTriggerProps` changes are fully specified in Task 4.
