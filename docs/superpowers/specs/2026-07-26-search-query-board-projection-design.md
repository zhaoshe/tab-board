# Search Query Store + Board Projection 设计

## 背景

Shared Session Domain 完成后，session 的 category 归属已经由
`src/shared/model/categories.ts` 单一拥有，source dependency graph 也已经达到
零 cycle、零 forbidden edge。最新架构复盘仍发现两个相邻的 P1 问题：

1. saved-session search query 同时由 module global、React state、
   `sessionStorage` 和 `window` CustomEvent 同步；
2. `WorkspaceContent` 在已经拿到 filtered groups 后，又自行扫描全部 groups
   并复制 category membership，用于 DnD insertion index。

这两处问题共同影响 active category board：query 没有可直接测试的 owner，
filtered board 和 unfiltered DnD board 又可能使用不同的 category 规则。

## 目标

- 为 saved-session query 建立唯一、同步、可测试的 owner。
- 删除同页面组件间的 `tabboard-search-change` DOM event。
- 保持 SearchBar 的 150 ms 输入 debounce 和现有 clear/close 行为。
- 让 Open Tabs capture/filter 在 React effect 尚未运行时也能读取最新 query。
- 建立 canonical board projection，同时返回：
  - 当前 category 的未过滤 `categoryGroups`；
  - query 过滤后的 `visibleGroups`；
  - 当前 `searchQuery`。
- `WorkspaceContent` 不再读取全部 groups 或手写 category membership。
- orphan folder session 继续按 shared domain 规则归入 Inbox。
- 保持 query 只属于当前 Manager page session，不写入 TabBoard 持久化 state。

## 非目标

- 不改变 session search 的匹配字段或 normalization 规则。
- 不把 sidebar `openTabsQuery` 合并进 saved-session query。
- 不改变 Open Tabs URL filter 的产品语义。
- 不增加 React Context provider、第二个 Zustand store 或 runtime dependency。
- 不借本次改动拆分 `stateMutations.ts`、`authoritativePublication.ts`、
  `ManagerLayout.tsx` 等大型模块。
- 不建立跨 extension page 的 query 同步；该 query 仍是 Manager page 内的临时状态。

## 当前问题

### Query 的多重 owner

`useFilteredGroups.ts` 当前同时包含：

- module-level `globalQuery`；
- 每个 `useSearchQuery()` instance 的独立 React state；
- `sessionStorage["tabboardSearch"]`；
- `window.dispatchEvent(new CustomEvent("tabboard-search-change"))`；
- 一个被通知但没有 consumer 订阅的 `listeners` set。

`SearchBar.tsx` 又直接监听同一个 window event，把 external query 复制到
debounced local input。

结果是：

- query 的初始化和更新需要跨多个隐式 channel 推理；
- 同步 imperative command 与 React render 之间存在 effect window；
- direct test 必须挂载 hook 或模拟 window event；
- DOM event 被误用为同一 React page 内的状态总线。

### Board projection 的规则漂移

`useFilteredGroups(category)` 已通过 `categoryForGroup()` 计算 visible groups，
但 `WorkspaceContent` 又用 `starred`、`archived`、`folderId` 手写一遍
unfiltered category groups。其 Inbox 分支要求 `folderId === null`，没有继承
shared domain 的 orphan folder → Inbox 规则。

同一 board 因此存在两套 membership：

- render membership：`getVisibleGroups()`；
- DnD insertion membership：`WorkspaceContent` inline filter。

## 备选方案

### 方案一：React Context owner

在 Manager root 增加 `SearchQueryProvider`，Context value 包含 query 与 setter，
由 provider 负责 URL/sessionStorage 初始化。

优点：

- React ownership 直观；
- 测试可通过 provider 注入初始值；
- 不使用 module singleton。

缺点：

- 所有 consumer 必须位于 provider 下；
- Open Tabs async command 需要额外 ref 或 context imperative bridge，仍可能出现
  “setter 已调用、effect ref 未更新”的竞态；
- query 是 page-scoped singleton，却为此增加 provider lifecycle 和 context
  rerender surface；
- direct owner test仍依赖 React。

结论：不采用。它优化了组件注入，却没有自然解决同步 snapshot consumer。

### 方案二：Zustand UI slice

把 query 放进现有 `useTabBoardStore`，或建立第二个 UI-only Zustand store。

优点：

- 与现有 selector 使用方式一致；
- 同步 `getState()` 可服务 Open Tabs command；
- React subscription 已有成熟工具。

缺点：

- 放进 `useTabBoardStore` 会把 URL/sessionStorage 的页面临时状态重新混入
  authoritative TabBoard projection；
- 第二个 Zustand store只为一个 string 增加 library-specific owner；
- direct test和 portability 不如三方法的 framework-neutral interface；
- 容易让 query 被误认为持久化 domain state。

结论：不采用。query 不属于 Storage Authority 或 TabBoard state schema。

### 方案三：独立 SearchQueryStore + `useSyncExternalStore`

建立一个不依赖 React、Zustand 或 DOM event 的小型 external store。browser
adapter 注入 URL/sessionStorage ports，React hook 使用
`useSyncExternalStore`，imperative consumer 直接调用同一 instance 的
`getSnapshot()` / `set()`。

优点：

- query 只有一个 snapshot；
- React 和 imperative command 共享相同同步语义；
- owner 可使用内存 ports 做 direct test；
- 不污染 persistent state，也不新增 provider；
- 与项目已有 overlay fine-grained external-store 模式一致。

缺点：

- browser page 仍有一个 module singleton；
- 必须明确初始化时机和测试 reset/injection seam；
- consumer 需要区分 render subscription 与 imperative snapshot。

结论：采用。它以最小 API 同时解决 ownership、测试和竞态问题。

## 设计

### 1. Framework-neutral SearchQueryStore

新增 `src/manager/core/searchQueryStore.ts`：

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

owner 的规则：

1. instance 创建时只初始化一次；
2. `new URLSearchParams(ports.locationSearch()).get("q")` 返回非空字符串时，
   URL query 优先；
3. URL query 缺失或为空时，使用 `readStoredQuery()`，再回退 `""`；
4. 非空 initial snapshot 写回 storage，使 URL deep link 成为本页后续刷新时的
   session query；空初始化不创建 storage key，写入失败按下述降级规则忽略；
5. `set(value)` 同步更新内存 snapshot；
6. snapshot 实际变化时才写 storage 并同步通知 listeners；
7. query 不 trim，保持 input 和 deep-link 原值；匹配时继续由
   `normalizeSearch()` 处理；
8. `subscribe()` 返回精确 unsubscribe，listener set 不暴露。

`searchQueryStore.ts` 不导入 React、Zustand、`window`、`sessionStorage` 或
TabBoard store。URL parsing 属于初始化规则，但 browser global 通过 port 提供。

### 2. Browser adapter 与 React hooks

新增 `src/manager/hooks/useSearchQuery.ts`，创建唯一 browser instance：

```ts
export const savedSearchQueryStore: SearchQueryStore;
export function useSearchQuery(): string;
export function useSetSearchQuery(): (value: string) => void;
```

browser ports：

- `locationSearch()` 读取 `window.location.search`；
- `readStoredQuery()` 读取 `sessionStorage["tabboardSearch"]`；
- `writeStoredQuery()` 写回同一 key；
- 无 `window` 或 storage 抛错时退化为 in-memory query，不能阻止 Manager render。

`useSearchQuery()` 使用：

```ts
useSyncExternalStore(
  savedSearchQueryStore.subscribe,
  savedSearchQueryStore.getSnapshot,
  savedSearchQueryStore.getSnapshot,
);
```

`useSetSearchQuery()` 返回稳定的 `savedSearchQueryStore.set`。不再创建
per-hook state，不再注册 window listener，也不再 dispatch CustomEvent。

### 3. SearchBar input lifecycle

`SearchBar` 保留两层有意的值：

- `query`：external store 已提交的 saved-session query；
- `localValue`：用户当前正在输入的值。

生命周期：

1. `localValue` 以 query snapshot 初始化；
2. external query 改变时，effect 把 `localValue` 同步为 snapshot；
3. 用户输入改变 `localValue`；
4. 150 ms timer 后调用 store `set(localValue)`；
5. timer cleanup 防止旧输入覆盖更新的 external query；
6. clear/close 继续同时立即清 local value 和 store，避免 UI 等待 debounce。

`SearchBar` 不再知道 storage、DOM event 或 query global。match badge 继续使用
local value即时计算，避免输入时 badge 延迟 150 ms。

### 4. Open Tabs capture/filter race

`useOpenTabsRuntime` 在 render 中继续调用 `useSearchQuery()`，用于
`isTabFilterActive` 等 React model。竞态敏感的 command 路径改为直接读取
`savedSearchQueryStore.getSnapshot()`：

- 建立 capture filter snapshot；
- capture 完成后判断 filter 是否仍由当前 operation 拥有；
- workspace change 清理 URL filter；
- tab context action 设置 URL filter 后的同步读取。

store `set()` 在返回前已更新 snapshot，因此：

```text
filterSessionsByTab(url)
  -> savedSearchQueryStore.set(url)
  -> captureSelectedTabs()
  -> savedSearchQueryStore.getSnapshot() === url
```

不再依赖 `useEffect` 才更新的 `savedSearchQueryRef`。这消除“command 已写入，
紧接着 capture 仍读到旧 query”的 window。

### 5. Canonical Board Projection

在 `src/manager/core/selectors.ts` 增加：

```ts
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
  state: Pick<
    TabBoardState,
    "activeWorkspaceId" | "workspaces" | "folders" | "groups"
  >,
  category: CategoryFilter,
  searchQuery: string,
): BoardProjection;
```

projection 流程：

1. `getActiveWorkspaceState()` 得到 canonical workspace；
2. `groupsForCategory()` 使用 shared `categoryForGroup()` 产生
   `categoryGroups`；
3. `filterGroupsByQuery()` 统一 normalize 和 `groupMatchesQuery()`；query 为空时
   原样返回输入 groups，以保留 stable reference；
4. query 非空时，只从 `categoryGroups` 过滤得到 `visibleGroups`；
5. 返回原始 `searchQuery` 给 UI 高亮和 empty state。

`getVisibleGroups()` 保留为兼容 pure wrapper，转调
`getBoardProjection(...).visibleGroups`，避免已有 consumer 同时维护另一套规则。

### 6. React Board Projection

将 `useFilteredGroups.ts` 收敛为 board hook，或按实施时的最小 churn 重命名为
`useBoardProjection.ts`。对外接口为：

```ts
export function useBoardProjection(
  category: CategoryFilter,
): BoardProjection;
```

它复用当前 memoized Zustand selector：

- 只订阅 active workspace identity、workspaces、active workspace folders 和 groups；
- `useShallow` 忽略其它 workspace folder 的无关更新；
- `useMemo` 在 state/category/query 都稳定时复用 projection；
- query 通过 external store subscription 获取。

迁移期可保留：

```ts
export function useFilteredGroups(category: CategoryFilter): Group[] {
  return useBoardProjection(category).visibleGroups;
}
```

该 wrapper 只用于尚未需要 unfiltered category data 的 consumer，不拥有任何
projection 规则。

### 7. WorkspaceContent

`WorkspaceContent` 改为一次消费：

```ts
const {
  workspaceId,
  categoryGroups,
  visibleGroups,
  searchQuery,
} = useBoardProjection(category);
```

用途：

- `visibleGroups`：SortableContext 和 SessionCard render；
- `categoryGroups`：unfiltered DnD insertion index 和 end target index；
- `workspaceId`：DnD target workspace；
- `searchQuery`：empty state 和 tab highlighting。

组件可继续使用一个窄 folder selector读取当前自定义 category 的名称，但不得：

- 读取全部 groups；
- 按 `starred` / `archived` / `folderId` 手写 membership；
- 为 Inbox 特判 `folderId === null`。

因此 orphan folder group 在 render、index 和 end target 三处都属于 Inbox。

### 8. SearchBar 与其它 consumer

- `SearchBar` 使用 `useBoardProjection(category).categoryGroups` 取得 canonical
  unfiltered groups，再以 `localValue` 调用 `filterGroupsByQuery()` 计算即时
  match count；不能直接使用 projection 中已按 debounced store query 过滤的
  `visibleGroups`。
- `ManagerLayout` 暂时可继续使用 `useFilteredGroups()` compatibility wrapper，
  因为它只需要当前 visible groups 建立 drag replacement snapshot。
- `WorkspaceHeader` 继续单独订阅 query 来控制 search expanded state。
- `SessionCard` 仍接收 exact `searchQuery`，不改变 tab highlight 逻辑。

## 数据流

### 初始化

```text
Manager module load
  -> createSearchQueryStore(browser ports)
  -> non-empty URL ?q= value
       or sessionStorage["tabboardSearch"]
       or ""
  -> one in-memory snapshot
  -> useSyncExternalStore subscribers render
```

### 用户输入

```text
TextInput onChange
  -> SearchBar.localValue
  -> 150 ms debounce
  -> SearchQueryStore.set(value)
  -> sessionStorage write
  -> synchronous listener notification
  -> board projection recomputes visibleGroups
```

### Open tab URL filter

```text
Open Tabs context command
  -> SearchQueryStore.set(tab.url)
  -> Open Tabs workflow sets tabFilterUrl
  -> React consumers observe the same query snapshot
  -> async capture reads SearchQueryStore.getSnapshot() directly
```

### Board render / DnD

```text
Zustand state + category + search snapshot
  -> getBoardProjection()
  -> shared groupsForCategory/categoryForGroup
  -> categoryGroups
  -> visibleGroups
  -> WorkspaceContent render and canonical insertion indexes
```

## 错误与降级

- `sessionStorage.getItem` 失败：以 URL query 或空字符串启动。
- `sessionStorage.setItem` 失败：保留内存 snapshot 并继续通知 UI；搜索本页仍可用，
  仅刷新后无法恢复。
- malformed URL encoding 由 `URLSearchParams` 按平台规则处理，不自行 decode。
- listener unsubscribe 后不再收到通知；同值 `set` 不重复通知。
- invalid/orphan folder 不产生错误，继续由 shared `categoryForGroup()` 归 Inbox。
- active workspace id 无效时继续使用 `getActiveWorkspaceState()` 的 first-workspace
  fallback。

## 测试策略

### SearchQueryStore direct tests

覆盖：

- non-empty URL query 优先于 stored query；
- URL query 缺失或为空时回退 stored query；
- 两者均缺失时为空；
- 非空 initial snapshot 写回 storage，空初始化不写，storage 失败不阻止初始化；
- `set()` 同步更新 snapshot、持久化并通知；
- 同值 set 不重复写入或通知；
- unsubscribe；
- 两个 store instance 状态隔离。

### React adapter tests

使用 happy-dom 覆盖：

- 两个 `useSearchQuery()` consumer 观察同一 snapshot；
- imperative `savedSearchQueryStore.set()` 同步驱动 subscriber；
- SearchBar external update 同步 local input；
- 150 ms debounce 前 store 不变、到时后更新；
- external update 会 cleanup 旧 timer，不被 stale local input 覆盖。

### Board projection tests

覆盖：

- query 为空时 `visibleGroups === categoryGroups`；
- query 非空只过滤 canonical category groups；
- starred、archived、folder 和 Inbox precedence；
- orphan folder group 同时出现在 Inbox 的 category/visible projection；
- invalid active workspace fallback；
- stable input rerender保持 projection/group references。

### WorkspaceContent regression

覆盖：

- orphan folder session 在 Inbox 渲染；
-其 SessionCard `groupIndex` 使用 canonical Inbox index；
- end insertion target index 等于 unfiltered category group 数量；
- search hidden groups 不改变 visible group 在 canonical category 中的 insertion index。

### Static source gates

- 新增 `scripts/check-search-architecture.mjs` 并由 `npm run check` 调用，使这些
  规则不依赖测试作者记得运行某个 focused suite；
- production `src/` 不再包含 `tabboard-search-change`；
- `SearchBar` 不注册 search query window listener；
- `WorkspaceContent` 不读取 `state.groups` / `allGroups`，也不包含 inline
  `starred` / `archived` / `folderId` membership；
- `searchQueryStore.ts` 不依赖 React、Zustand 或 TabBoard store；
- strict import-cycle gate继续为零 cycle / 零 forbidden edge。

## 文档更新

- `docs/technical-architecture.md`：记录 SearchQueryStore owner、board projection、
  Open Tabs imperative snapshot 以及 query degradation。
- `docs/feature-evolution.md`：记录从 DOM event 与重复 membership 迁移到单一 owner。
- `docs/product-decisions.md`：记录为何不使用 React Context 或 Zustand UI slice。
- `docs/feature-spec.md` 仅在验证发现现有 query 初始化/clear 说明与实际产品行为不一致时
  做最小修正；本轮不主动改变产品语义。

## 完成标准

- saved-session query 只有一个 runtime snapshot owner。
- `tabboard-search-change` 从 production source 中消失。
- Open Tabs command 可在同一 call stack 读取刚写入的 query。
- `WorkspaceContent` 不再拥有 category membership 规则。
- orphan folder → Inbox 在 board render 和 DnD index 中一致。
- focused tests、`npm run build`、`npm run check`、`npm test`、
  `git diff --check` 全部通过。
- 完成后重新执行全仓架构复盘，而不是直接结束优化循环。
