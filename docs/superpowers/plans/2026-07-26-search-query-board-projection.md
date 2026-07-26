# Search Query Store + Board Projection 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用唯一、同步、可测试的 SearchQueryStore 替换 saved-session query 的 module global/DOM event 多重同步，并让 active board 的 render 与 DnD insertion 共用 canonical category projection。

**Architecture:** `manager/core/searchQueryStore.ts` 是 framework-neutral query owner；`manager/hooks/useSearchQuery.ts` 只提供 browser ports 与 `useSyncExternalStore` adapter。`manager/core/selectors.ts` 统一 category/query projection，`useBoardProjection.ts` 组合 Zustand 与 query snapshots，`WorkspaceContent` 只消费 projection，不再手写 category membership。

**Tech Stack:** TypeScript, React 18, Zustand 4, Mantine 7, `useSyncExternalStore`, Vitest, happy-dom, Node test runner.

## Global Constraints

- 不改变 saved-session search 的匹配字段、normalization、clear/close 产品语义。
- URL `?q=` 仅在非空时优先于 `sessionStorage["tabboardSearch"]`；缺失或空值回退 session storage。
- 非空 initial snapshot 写回 session storage；空初始化不创建 storage key。
- SearchBar 继续使用 150 ms input debounce；match count 继续按 local input 即时更新。
- sidebar `openTabsQuery` 与 saved-session query 保持分离。
- Open Tabs URL filter 的 command/capture 路径必须可在同一 call stack 读取刚写入的 query snapshot。
- query 不进入 `TabBoardState`、Storage Authority 或 Authoritative Publication。
- orphan/cross-workspace folder reference 继续按 shared `categoryForGroup()` 归 Inbox。
- `WorkspaceContent` 不得读取全部 groups 或手写 `starred` / `archived` / `folderId` membership。
- `searchQueryStore.ts` 不依赖 React、Zustand、DOM global 或 TabBoard store。
- 不新增 runtime dependency，不修改 DnD geometry、target resolution 或 persistence semantics。
- 已是 linked git worktree，不创建嵌套 worktree。
- 每个 production change 先有 direct failing test 或 static-contract RED。
- 每个 commit message 末尾必须恰好一次 `Co-authored-by: TRAE CLI <noreply@bytedance.com>`。

---

### Task 1: 建立 framework-neutral SearchQueryStore

**Files:**
- Create: `src/manager/core/searchQueryStore.ts`
- Create: `src/manager/core/searchQueryStore.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export interface SearchQueryStore {
    getSnapshot(): string;
    subscribe(listener: () => void): () => void;
    set(value: string): void;
  }

  export interface SearchQueryStorePorts {
    locationSearch(): string;
    readStoredQuery(): string | null;
    writeStoredQuery(value: string): void;
  }

  export function createSearchQueryStore(
    ports: SearchQueryStorePorts,
  ): SearchQueryStore;
  ```

- `getSnapshot`, `subscribe`, and `set` are closure-backed functions and never depend on `this`.
- Port read/write errors are contained by the owner; listeners still observe in-memory updates.

- [ ] **Step 1: 写初始化优先级 RED**

  新建 direct test，以内存 ports 覆盖：

  ```ts
  const writes: string[] = [];
  const store = createSearchQueryStore({
    locationSearch: () => '?q=url%20needle',
    readStoredQuery: () => 'stored needle',
    writeStoredQuery: (value) => writes.push(value),
  });

  expect(store.getSnapshot()).toBe('url needle');
  expect(writes).toEqual(['url needle']);
  ```

  另加：

  ```ts
  expect(createStore({ search: '?q=', stored: 'stored' }).getSnapshot())
    .toBe('stored');
  expect(createStore({ search: '', stored: null }).getSnapshot()).toBe('');
  expect(emptyWrites).toEqual([]);
  ```

- [ ] **Step 2: 运行初始化 RED**

  Run:

  ```bash
  npx vitest run src/manager/core/searchQueryStore.test.ts
  ```

  Expected: FAIL because `./searchQueryStore` does not exist.

- [ ] **Step 3: 写 mutation/subscription RED**

  增加：

  ```ts
  const notifications: string[] = [];
  const unsubscribe = store.subscribe(() => {
    notifications.push(store.getSnapshot());
  });
  store.set('next');
  store.set('next');
  unsubscribe();
  store.set('after-unsubscribe');

  expect(notifications).toEqual(['next']);
  expect(writes).toEqual(['next', 'after-unsubscribe']);
  ```

  覆盖两个 store instance 隔离，以及 `writeStoredQuery()` 抛错时 snapshot/notification
  仍更新。

- [ ] **Step 4: 实现最小 owner**

  实现：

  ```ts
  function safelyReadInitialQuery(ports: SearchQueryStorePorts): string {
    let search = '';
    try {
      search = ports.locationSearch();
    } catch {
      search = '';
    }
    const urlQuery = new URLSearchParams(search).get('q');
    if (urlQuery) return urlQuery;
    try {
      return ports.readStoredQuery() || '';
    } catch {
      return '';
    }
  }
  ```

  创建 instance 时只初始化一次；非空 initial snapshot 做 best-effort write。
  `set()` 对同值 no-op，对新值先更新 snapshot，再 best-effort write，最后同步遍历
  listener snapshot。

- [ ] **Step 5: 运行 GREEN**

  Run:

  ```bash
  npx vitest run src/manager/core/searchQueryStore.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add src/manager/core/searchQueryStore.ts \
    src/manager/core/searchQueryStore.test.ts
  git commit -m "refactor(search): own saved query state" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 2: 建立 browser/React adapter 并收敛 Open Tabs 同步读取

**Files:**
- Create: `src/manager/hooks/useSearchQuery.ts`
- Create: `src/manager/hooks/useSearchQuery.test.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.dom.test.ts`
- Modify: query imports in `src/manager/components/workspace/WorkspaceHeader.tsx`
- Modify: query imports/mocks in `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`

**Interfaces:**
- Consumes: `createSearchQueryStore()` from Task 1.
- Produces:

  ```ts
  export const savedSearchQueryStore: SearchQueryStore;
  export function useSearchQuery(): string;
  export function useSetSearchQuery(): (value: string) => void;
  ```

- Browser adapter owns the constant `tabboardSearch`; no other production module reads/writes this key.
- Open Tabs imperative paths use `savedSearchQueryStore.getSnapshot()` rather than an
  effect-updated query ref.

- [ ] **Step 1: 写 React shared-snapshot RED**

  在 happy-dom test 中挂载两个 probe：

  ```ts
  function Probe({ id }: { id: string }) {
    const value = useSearchQuery();
    return createElement('output', { id }, value);
  }
  ```

  在 `act()` 中调用：

  ```ts
  savedSearchQueryStore.set('shared');
  ```

  断言两个 output 同时变为 `shared`，并在 unmount 后无 React update。

- [ ] **Step 2: 运行 adapter RED**

  Run:

  ```bash
  npx vitest run src/manager/hooks/useSearchQuery.test.ts
  ```

  Expected: FAIL because `./useSearchQuery` does not exist.

- [ ] **Step 3: 实现 browser ports 与 hooks**

  browser ports 必须只在 adapter 中引用 global，并允许非浏览器 import：

  ```ts
  const SEARCH_KEY = 'tabboardSearch';

  export const savedSearchQueryStore = createSearchQueryStore({
    locationSearch: () => typeof window === 'undefined' ? '' : window.location.search,
    readStoredQuery: () => typeof sessionStorage === 'undefined'
      ? null
      : sessionStorage.getItem(SEARCH_KEY),
    writeStoredQuery: (value) => {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(SEARCH_KEY, value);
      }
    },
  });
  ```

  `useSearchQuery()` 使用 `useSyncExternalStore`；server snapshot 与 client snapshot
  都来自同一 owner。`useSetSearchQuery()` 直接返回稳定的 `set`。

- [ ] **Step 4: 迁移 Open Tabs RED**

  更新 DOM test 的 query mock，使它提供：

  ```ts
  savedSearchQueryStore: {
    getSnapshot: () => testHarness.savedSearchQuery,
    set: testHarness.setSavedSearchQuery,
    subscribe: () => () => undefined,
  }
  ```

  `setSavedSearchQuery` mock 同步更新 `savedSearchQuery`。新增 regression：

  1. 调用 `filterSessionsByTab(tab)`；
  2. 不等待额外 React effect；
  3. 立即调用 capture；
  4. 断言 capture filter snapshot 使用 tab URL，而不是旧 query。

- [ ] **Step 5: 迁移 Open Tabs implementation**

  `useOpenTabsRuntime.ts`：

  - 从 `./useSearchQuery` import hook/store；
  - 删除 `savedSearchQueryRef`；
  - workspace filter clear、capture start、capture completion/ownership checks 都通过
    `savedSearchQueryStore.getSnapshot()` 读取；
  - query render subscription继续用于 model；
  -所有写入仍通过 `useSetSearchQuery()` 返回的同一 owner setter。

- [ ] **Step 6: 更新非-board query imports**

  `WorkspaceHeader.tsx` 与 `ManagerLayout.tsx` 从 `useSearchQuery.ts` import query
  hooks；相应 tests 的 mock 路径改为新 module。此任务不迁移 board projection。

- [ ] **Step 7: 运行 GREEN**

  Run:

  ```bash
  npx vitest run src/manager/hooks/useSearchQuery.test.ts
  npx vitest run src/manager/hooks/useOpenTabsRuntime.dom.test.ts
  npx vitest run src/manager/components/shell/ManagerLayout.test.ts
  npx vitest run src/manager/components/workspace/WorkspaceHeader.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **Step 8: Commit**

  ```bash
  git add src/manager/hooks/useSearchQuery.ts \
    src/manager/hooks/useSearchQuery.test.ts \
    src/manager/hooks/useOpenTabsRuntime.ts \
    src/manager/hooks/useOpenTabsRuntime.dom.test.ts \
    src/manager/components/workspace/WorkspaceHeader.tsx \
    src/manager/components/shell/ManagerLayout.tsx \
    src/manager/components/shell/ManagerLayout.test.ts
  git commit -m "refactor(search): adapt query consumers" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 3: 建立 canonical board selector

**Files:**
- Modify: `src/manager/core/selectors.ts`
- Modify: `src/manager/core/selectors.test.ts`

**Interfaces:**
- Consumes: shared `groupsForCategory()` and existing search model helpers.
- Produces:

  ```ts
  export type BoardProjectionState = Pick<
    TabBoardState,
    'activeWorkspaceId' | 'workspaces' | 'folders' | 'groups'
  >;

  export interface BoardProjection {
    workspaceId: string;
    categoryGroups: Group[];
    visibleGroups: Group[];
    searchQuery: string;
  }

  export function filterGroupsByQuery(
    groups: Group[],
    searchQuery: string,
  ): Group[];

  export function getBoardProjection(
    state: BoardProjectionState,
    category: CategoryFilter,
    searchQuery: string,
  ): BoardProjection;
  ```

- Existing `getVisibleGroups()` remains a thin compatibility wrapper around
  `getBoardProjection(...).visibleGroups`.

- [ ] **Step 1: 写 canonical membership RED**

  扩展 selector tests：

  ```ts
  const projection = getBoardProjection(state, 'inbox', '');
  expect(projection.workspaceId).toBe('workspace-1');
  expect(projection.categoryGroups).toEqual([
    groups.inbox,
    groups.orphan,
    groups.crossWorkspaceFolder,
  ]);
  expect(projection.visibleGroups).toBe(projection.categoryGroups);
  expect(projection.searchQuery).toBe('');
  ```

  同时覆盖 Saved precedence、Archive precedence、自定义 folder 和 invalid active
  workspace fallback。

- [ ] **Step 2: 写 query projection RED**

  增加：

  ```ts
  const categoryGroups = [matching, hidden];
  expect(filterGroupsByQuery(categoryGroups, '')).toBe(categoryGroups);
  expect(filterGroupsByQuery(categoryGroups, 'needle')).toEqual([matching]);
  expect(getBoardProjection(state, 'inbox', 'needle').visibleGroups)
    .toEqual([matching]);
  ```

  明确 query filtering 只作用于 canonical category groups。

- [ ] **Step 3: 运行 RED**

  Run:

  ```bash
  npx vitest run src/manager/core/selectors.test.ts
  ```

  Expected: FAIL because projection/helper exports do not exist.

- [ ] **Step 4: 实现 selector**

  `getBoardProjection()`：

  ```ts
  const { workspaceId } = getActiveWorkspaceState(state);
  const categoryGroups = groupsForCategory(state, category, workspaceId);
  return {
    workspaceId,
    categoryGroups,
    visibleGroups: filterGroupsByQuery(categoryGroups, searchQuery),
    searchQuery,
  };
  ```

  `filterGroupsByQuery()` 为空 normalized query 时原样返回 input；非空时使用
  `groupMatchesQuery()`。删除 `getVisibleGroups()` 内自己的 category scan。

- [ ] **Step 5: 运行 GREEN**

  Run:

  ```bash
  npx vitest run src/manager/core/selectors.test.ts
  npx vitest run src/shared/model/categories.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add src/manager/core/selectors.ts src/manager/core/selectors.test.ts
  git commit -m "refactor(board): centralize category projection" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 4: 建立 React board projection 并迁移 SearchBar

**Files:**
- Create: `src/manager/hooks/useBoardProjection.ts`
- Create: `src/manager/hooks/useBoardProjection.test.ts`
- Create: `src/manager/hooks/useWorkspaceState.ts`
- Modify: `src/manager/components/search/SearchBar.tsx`
- Create: `src/manager/components/search/SearchBar.test.ts`
- Modify: `src/manager/components/workspace/WorkspaceHeader.test.ts`
- Modify: `src/manager/components/shell/ManagerLayout.tsx`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`

**Interfaces:**
- Consumes: `getBoardProjection()`, `filterGroupsByQuery()`, `useSearchQuery()`,
  and `useTabBoardStore`.
- Produces:

  ```ts
  export function useBoardProjection(
    category: CategoryFilter,
  ): BoardProjection;

  export function useFilteredGroups(
    category: CategoryFilter,
  ): Group[];

  export function useCurrentWorkspace(): Workspace | undefined;
  ```

- `useFilteredGroups()` is a no-rule compatibility wrapper.
- Unused `useWorkspaceFolders()` and `useWorkspaceStats()` are removed rather than moved.

- [ ] **Step 1: 写 board hook RED**

  创建 happy-dom test，挂载 hook probe。覆盖：

  - stable state/category/query 下 force rerender 返回同一 projection；
  - other-workspace folder rename 不改变 active workspace folder slice/reference；
  - query store change 更新 `visibleGroups`，但 canonical `categoryGroups` 保持来自
    same Zustand state/category。

- [ ] **Step 2: 运行 hook RED**

  Run:

  ```bash
  npx vitest run src/manager/hooks/useBoardProjection.test.ts
  ```

  Expected: FAIL because hook module does not exist.

- [ ] **Step 3: 实现 board/workspace hooks**

  从旧 `useFilteredGroups.ts` 迁移并重命名 memoized active-workspace selector。
  `useBoardProjection()`：

  ```ts
  const selectBoardState = useMemo(createBoardStateSelector, []);
  const state = useTabBoardStore(useShallow(selectBoardState));
  const searchQuery = useSearchQuery();
  return useMemo(
    () => getBoardProjection(state, category, searchQuery),
    [state, category, searchQuery],
  );
  ```

  将仅有 consumer 的 `useCurrentWorkspace()` 移到 `useWorkspaceState.ts`。

- [ ] **Step 4: 写 SearchBar debounce RED**

  happy-dom test mock `useBoardProjection()` 返回 canonical groups，使用真实
  `useSearchQuery` store，mock Mantine input 为 native input。覆盖：

  ```ts
  expect(savedSearchQueryStore.getSnapshot()).toBe('');
  changeInput('local');
  await act(async () => vi.advanceTimersByTime(149));
  expect(savedSearchQueryStore.getSnapshot()).toBe('');
  await act(async () => vi.advanceTimersByTime(1));
  expect(savedSearchQueryStore.getSnapshot()).toBe('local');
  ```

  另加 external `savedSearchQueryStore.set('external')` 同步 local input；若 external
  update 在旧 debounce 到期前发生，旧 local value 不得覆盖 external value。

- [ ] **Step 5: 迁移 SearchBar**

  - query hooks 从 `useSearchQuery.ts` import；
  - `categoryGroups` 从 `useBoardProjection(category)` 取得；
  - match count 使用 `filterGroupsByQuery(categoryGroups, localValue)`；
  - 删除 `useTabBoardStore` / `useShallow`；
  - 删除 `tabboard-search-change` listener；
  - 新增 `[query]` effect同步 local input；
  - 保留 150 ms timer和 immediate clear/close。

- [ ] **Step 6: 迁移 ManagerLayout**

  - `useFilteredGroups` 从 `useBoardProjection.ts` import；
  - `useCurrentWorkspace` 从 `useWorkspaceState.ts` import；
  - query hooks保持来自 `useSearchQuery.ts`；
  - 更新 tests 的 module mocks；
  - 将既有 visible-group stable-reference test迁到 board hook direct test，避免 shell
    test拥有 hook内部实现契约。

- [ ] **Step 7: 更新 header source contract**

  `WorkspaceHeader.test.ts` 不再读取旧 `useFilteredGroups.ts`；改为读取
  `useBoardProjection.ts` 并断言 memoized concrete selector，以及 SearchBar 不再
  direct subscribe完整 Zustand state。

- [ ] **Step 8: 运行 GREEN**

  Run:

  ```bash
  npx vitest run src/manager/hooks/useBoardProjection.test.ts
  npx vitest run src/manager/components/search/SearchBar.test.ts
  npx vitest run src/manager/components/workspace/WorkspaceHeader.test.ts
  npx vitest run src/manager/components/shell/ManagerLayout.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **Step 9: Commit**

  ```bash
  git add src/manager/hooks/useBoardProjection.ts \
    src/manager/hooks/useBoardProjection.test.ts \
    src/manager/hooks/useWorkspaceState.ts \
    src/manager/components/search/SearchBar.tsx \
    src/manager/components/search/SearchBar.test.ts \
    src/manager/components/workspace/WorkspaceHeader.test.ts \
    src/manager/components/shell/ManagerLayout.tsx \
    src/manager/components/shell/ManagerLayout.test.ts
  git commit -m "refactor(board): expose canonical projection" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 5: 迁移 WorkspaceContent 并删除旧多重 owner

**Files:**
- Modify: `src/manager/components/workspace/WorkspaceContent.tsx`
- Modify: `src/manager/components/workspace/WorkspaceContent.test.ts`
- Delete: `src/manager/hooks/useFilteredGroups.ts`
- Modify remaining imports/tests found by:

  ```bash
  rg -n "useFilteredGroups|tabboard-search-change|tabboardSearch" src
  ```

**Interfaces:**
- Consumes: one `useBoardProjection(category)` result.
- `WorkspaceContent` may use a narrow folder-name selector, but not `state.groups`.
- DnD `GroupInsertionTarget` receives canonical unfiltered indexes.

- [ ] **Step 1: 写 orphan/index RED**

  扩展 WorkspaceContent harness：

  - SessionCard mock记录 `group.id` 与 `groupIndex`；
  - `useDroppable` mock记录每个 target 的 `data.dnd.targets[0].index`；
  - Inbox state包含：
    - normal Inbox group；
    - orphan folder group；
    - hidden-by-query Inbox group。

  断言：

  ```ts
  expect(renderedCards).toContainEqual({
    groupId: 'orphan',
    groupIndex: 1,
  });
  expect(endTargetIndex).toBe(3);
  ```

  query 只显示 orphan 时，其 `groupIndex` 仍为 canonical index 1，而不是 visible
  index 0。

- [ ] **Step 2: 运行 RED**

  Run:

  ```bash
  npx vitest run src/manager/components/workspace/WorkspaceContent.test.ts
  ```

  Expected: FAIL because current inline Inbox membership drops orphan groups and uses its own scan.

- [ ] **Step 3: 迁移 WorkspaceContent**

  使用：

  ```ts
  const {
    workspaceId,
    categoryGroups,
    visibleGroups,
    searchQuery,
  } = useBoardProjection(category);
  ```

  将所有 render `groups` 替换为 `visibleGroups`，所有 insertion lookup/end target
  使用 `categoryGroups`。Zustand selector仅保留 current custom folder name。

- [ ] **Step 4: 删除旧 owner**

  删除 `useFilteredGroups.ts`。确保：

  ```bash
  rg -n "tabboard-search-change|globalQuery|setGlobalQuery|SEARCH_CHANGE_EVENT" src
  ```

  无 production 命中；`tabboardSearch` 只在 `useSearchQuery.ts`。

- [ ] **Step 5: 运行 focused GREEN**

  Run:

  ```bash
  npx vitest run src/manager/components/workspace/WorkspaceContent.test.ts
  npx vitest run src/manager/hooks/useBoardProjection.test.ts
  npx vitest run src/manager/components/search/SearchBar.test.ts
  npx vitest run src/manager/components/shell/ManagerLayout.test.ts
  npx vitest run src/manager/hooks/useOpenTabsRuntime.dom.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add src/manager/components/workspace/WorkspaceContent.tsx \
    src/manager/components/workspace/WorkspaceContent.test.ts \
    src/manager/hooks/useFilteredGroups.ts
  git add -u src
  git commit -m "refactor(board): consume canonical session indexes" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 6: 固化静态架构门禁

**Files:**
- Create: `scripts/check-search-architecture.mjs`
- Create: `scripts/check-search-architecture.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Script supports `--root <fixture-or-repo-root>`.
- It ignores `*.test.ts` / `*.test.tsx` when scanning production source.
- It exits non-zero with the exact violated file/rule.
- `npm run check:architecture` runs Node tests, then the real repository scan.
- `npm run check` invokes `check:architecture` after build/extension/cycle checks.

- [ ] **Step 1: 写 checker CLI RED**

  Node test fixture分别构造：

  1. production source包含 `tabboard-search-change` → fail；
  2. SearchBar含 query `window.addEventListener` → fail；
  3. WorkspaceContent含 `state.groups` / `allGroups` / `group.starred` → fail；
  4. core owner引用 `window` / `sessionStorage` 或 import React/Zustand/store → fail；
  5. clean fixture，且同样 strings 只在 test file → pass。

- [ ] **Step 2: 运行 checker RED**

  Run:

  ```bash
  node --test scripts/check-search-architecture.test.mjs
  ```

  Expected: FAIL because checker does not exist.

- [ ] **Step 3: 实现 checker**

  用 Node built-ins recursively读取：

  - `src/**/*.{ts,tsx}` production files；
  - exact SearchBar/WorkspaceContent/core owner paths；
  - 每条 violation输出 `Search architecture violation: <path>: <rule>`。

  不用 brittle AST dependency；import direction仍由已有 graph checker负责。

- [ ] **Step 4: 接入 package scripts**

  新增：

  ```json
  "check:architecture": "node --test scripts/check-search-architecture.test.mjs && node scripts/check-search-architecture.mjs"
  ```

  `check` 变为：

  ```json
  "check": "npm run build && node scripts/check-extension.mjs && npm run check:cycles && npm run check:architecture"
  ```

  同时在 `check:cycles` 增加：

  ```text
  --deny-imports src/manager/core/searchQueryStore.ts,react,zustand,src/shared/store
  ```

- [ ] **Step 5: 运行 GREEN**

  Run:

  ```bash
  node --test scripts/check-search-architecture.test.mjs
  npm run check:architecture
  npm run check:cycles
  ```

  Expected: PASS，source graph仍为零 cycle / 零 forbidden edge。

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/check-search-architecture.mjs \
    scripts/check-search-architecture.test.mjs \
    package.json
  git commit -m "test(architecture): guard search ownership" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 7: 更新架构决策与完成全量验证

**Files:**
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `.planning/2026-07-26-architecture-optimization/{task_plan.md,findings.md,progress.md` (ignored operational files)

**Interfaces:**
- Docs must name the production owners and current behavior, not the migration plan.
- No product behavior change is claimed beyond eliminating hidden synchronization and category drift.

- [ ] **Step 1: 更新 current architecture**

  在 Search section记录：

  - `SearchQueryStore` interface/ownership；
  - URL/session initialization precedence；
  - React `useSyncExternalStore` adapter；
  - Open Tabs imperative snapshot read；
  - board projection的 categoryGroups/visibleGroups 分工；
  - storage failure的 in-memory degradation。

- [ ] **Step 2: 更新 evolution/decision**

  `feature-evolution.md` 记录：

  - 删除 module global + DOM CustomEvent；
  - `WorkspaceContent` 删除 category duplicate；
  - orphan Inbox render/DnD统一。

  `product-decisions.md` 新增决策：

  - 不使用 React Context，因为 imperative capture需要同步 snapshot；
  - 不使用 Zustand slice，因为 query 不属于 authoritative/persistent state；
  - 选择 framework-neutral external store + board projection。

- [ ] **Step 3: 运行 focused suite**

  Run:

  ```bash
  npx vitest run \
    src/manager/core/searchQueryStore.test.ts \
    src/manager/core/selectors.test.ts \
    src/manager/hooks/useSearchQuery.test.ts \
    src/manager/hooks/useBoardProjection.test.ts \
    src/manager/hooks/useOpenTabsRuntime.dom.test.ts \
    src/manager/components/search/SearchBar.test.ts \
    src/manager/components/workspace/WorkspaceContent.test.ts \
    src/manager/components/workspace/WorkspaceHeader.test.ts \
    src/manager/components/shell/ManagerLayout.test.ts
  ```

  Expected: PASS.

- [ ] **Step 4: 运行 fresh full verification**

  依次运行，避免 build/test/E2E artifact race：

  ```bash
  npm run build
  npm run check
  npm test
  git diff --check
  rg -n "tabboard-search-change|globalQuery|setGlobalQuery|SEARCH_CHANGE_EVENT" src
  rg -n "from .*manager" src/shared src/background
  ```

  Expected:

  - build PASS；
  - extension check + graph tests + search architecture gate PASS；
  - all Vitest files/tests PASS；
  - diff check无输出；
  - removed search globals/events无 source 命中；
  - shared/background production imports Manager = 0。

- [ ] **Step 5: 更新 persistent plan evidence**

  在 ignored planning files记录：

  - 每条 fresh command和实际 file/test count；
  - Search Query + Board Projection phase完成；
  - next step切换为 fresh architecture analysis；
  - 所有错误与修正。

- [ ] **Step 6: Commit docs**

  ```bash
  git add docs/technical-architecture.md \
    docs/feature-evolution.md \
    docs/product-decisions.md
  git commit -m "docs(search): record canonical board ownership" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

- [ ] **Step 7: 检查 phase commit stack**

  Run:

  ```bash
  git status --short
  git log -8 --format='%h %s%n%b'
  ```

  Expected:

  - tracked working tree clean；
  -每个本轮 commit trailer恰好一次且位于 commit message末尾；
  - ignored `.planning` files保留本地运行证据。

## Plan Self-Review

- Spec coverage：URL/storage precedence、single snapshot、150 ms debounce、Open Tabs
  race、canonical board projection、orphan Inbox、DOM event removal、direct/static tests
  分别由 Tasks 1–6覆盖。
- Type consistency：`SearchQueryStore`、`savedSearchQueryStore`、
  `filterGroupsByQuery`、`getBoardProjection`、`useBoardProjection` 名称与 design spec
  一致。
- Ownership check：query core、browser adapter、board selector、React board hook、
  workspace read hook各有一个职责；旧 `useFilteredGroups.ts` 最终删除。
- Scope check：不修改产品 search matching、Open Tabs sidebar query、DnD resolver 或
  persistence modules。
- Placeholder scan：计划中没有 TBD/TODO/“类似处理”等未定义步骤。
