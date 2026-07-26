# Technical Architecture

本文档描述 TabBoard 的技术结构、模块边界、数据模型和关键流程。目标是帮助后续维护者快速判断“改哪里、注意什么、怎么验证”。

## 技术栈

TabBoard 是 Chrome Manifest V3 extension，使用 React + TypeScript 开发，通过 Vite 构建，Manager 使用 Mantine，背景页和 shared model 保持明确边界。

运行环境：

- Chrome 115+。
- Manifest V3 service worker。
- Vite + `@crxjs/vite-plugin` 构建链；`manager.html` 的生产入口是 `src/manager/main.tsx`。
- React 18、Mantine v7、Zustand、`@dnd-kit`、`@tabler/icons-react`。
- `chrome.storage.local`（默认后端，也存放 bootstrap key）。
- File System Access API（可选本地文件后端）和 IndexedDB（持久化目录句柄）。
- `chrome.tabs` / `chrome.windows` / `chrome.tabGroups` / `chrome.contextMenus` / `chrome.omnibox` / `chrome.runtime`。

React Manager 是唯一 Manager 实现，由 `manager.html` 加载 `src/manager/main.tsx` 构建产物。

## 文件结构

核心文件：

- `manifest.json`: extension 声明、权限、入口、new-tab override、commands、omnibox。
- `manager.html`: 生产 Manager HTML shell，加载 `/src/manager/main.tsx`。
- `src/manager/main.tsx` / `src/manager/ManagerApp.tsx`: React Manager 启动和应用 composition。
- `src/manager/components/`: Mantine shell、workspace header、sidebar/Open Tabs、session board、Bin、import/export、search 和 overlays。
- `src/manager/core/`: selectors、SearchQueryStore、capture、Open Tabs workflow、typed DnD interaction resolution、overlay/focus 等纯 contracts，以及 core tests。
- `src/manager/hooks/`: hydration、saved-search/board projection、runtime message、Open Tabs 和 overlay 生命周期。
- `src/background/service-worker.ts`: Chrome API boundary、capture/restore、runtime messages、sender verification。
- `src/background/statePersistence.ts`: serialized mutation queue、optional Web Locks、normalized atomic writes。
- `src/shared/model/`: schema/types、normalize、category/session semantics、DropIntent contract/validation/execution/replay、capture policy、import/export 和 search。
- `src/shared/store/`: Storage Authority、Authoritative Publication、immutable state mutations、mutation validation 和 Zustand facade。
- `src/shared/styles/`: shared theme tokens。
- `scripts/check-extension.mjs`: extension 文件存在性、构建产物引用和 sanity checks。
- `scripts/check-import-cycles.mjs` / `scripts/check-search-architecture.mjs`: source dependency 与 saved-search/board ownership 静态门禁。

## Manifest 能力

`manifest.json` 声明：

- `background.service_worker`: `src/background/service-worker.ts`。
- `action`: toolbar action。
- `options_page`: `options.html`。
- `chrome_url_overrides.newtab`: `manager.html`。
- `omnibox.keyword`: `tb`。
- commands：
  - `capture-current-window`。
  - `open-manager`。

权限：

- `tabs`: 查询、创建、关闭 tabs。
- `tabGroups`: 读取和恢复 Chrome tab group 元数据。
- `storage`: 本地持久化。
- `unlimitedStorage`: 避免 sessions 较多时过早触达 quota。
- `contextMenus`: 右键菜单保存入口。
- `clipboardWrite`: 复制导出内容和链接。

## 模块边界

### `src/shared/model/`

负责纯数据逻辑：

- State schema、types、默认设置和 `normalizeState()`。
- workspace/folder/group/tab/note/bin invariants。
- capture eligibility、import/export text、query matching 和 restorable 判断。
- 同一 workspace 内 category 名称唯一性校验。
- `categories.ts` 统一 `CategoryFilter`、orphan-folder → Inbox、category ownership/order、session move和category insertion。
- `drop-intent.ts` 只定义持久化 DropIntent / SavedTabRef wire contract；不包含 DOM/DnD geometry。
- `drop-validation.ts` 验证 raw DropIntent、OpenTabInfo 和 payload limits。
- `drop-operations.ts` 执行五类 DropIntent，并拥有 operation digest、stable generated IDs 和 replay/ledger semantics。
- `session-operations.ts` 拥有 restore-from-bin 与 import parsing/application。
- `src/shared/validation.ts` 提供 byte/ID/timestamp/dense-array/canonical-JSON primitive validation；model 不反向依赖 store validation。

不依赖 DOM，也不直接调用 Chrome APIs。

### `src/shared/store/`

负责客户端状态和持久化边界：

- 持久化层抽象为 `StorageAdapter` 接口（`src/shared/store/storageAdapter.ts`，约定 `getState()` / `setState(state)` / `ensureState()` / `subscribeState()`），当前有两个实现：
  - `ChromeStorageAdapter`（`chromeStorageAdapter.ts`）：封装 `chrome.storage.local["tabboardState"]`，是默认后端。
  - `FileStorageAdapter`（`fileStorage.ts` + `fileSerialization.ts` + `fsAtomic.ts`）：通过 File System Access API 把数据写入用户选择的本地文件夹；详见下文「File Store Layout」。
- `activeAdapter` 是稳定的 Storage Authority。启动时读 `chrome.storage.local["tabboardStorageConfig"]`（BOOTSTRAP_KEY，一个极小的 bootstrap key：`{ mode: 'browser' | 'file' }`）决定内部 backend；callers 可长期持有同一个 authority interface，backend 切换不会让 subscription 或缓存引用失效。
- `storageEvents.ts` 独立承载 file commit ping 与跨 context fallback event；authority 只在 File backend 活跃时绑定这两类 transport，并按 event id 去重。
- File backend 在初始化、读取、写入或 ping reload 时失败，authority 会切换 backend、重绑 subscription 并通知 UI。本 context 首次发现故障时先把最后一次有效 snapshot 保存到 Chrome；收到其他 context 的 fallback event 时直接读取对方已提交的 Chrome state，禁止用旧 File snapshot 反向覆盖。本次失败写仍 reject，避免把未提交 mutation 误报为成功；既有 persistence retry 会在 Chrome backend 上重试。
- `authoritativePublication.ts` 是 Manager-side publication owner。它不依赖 Zustand、React、DOM event 或具体 Chrome adapter，独占 optimistic queue、in-flight batch、remote buffer、drop/category waiter、bounded retry、terminal isolation、authoritative reconciliation、structural sharing 和 hydration generation。
- `stateMutations.ts` 以 immutable commands 应用普通 state mutation，并拒绝无效引用、locked 目标和 link/note URL 形态错误。
- `mutationValidation.ts` 负责 mutation-batch candidate boundary；DropIntent/OpenTab raw shape由 shared model `drop-validation.ts` 负责。
- `useTabBoardStore.ts` 只提供 Zustand UI projection、领域 action facade、restore/import/export 准备和 AppEvents 映射；它通过窄 ports 创建一个 publication instance，不拥有 persistence queue、retry timer、waiter 或 hydration subscription。

三类 ownership 不应混淆：

1. **Storage Authority** 决定 browser/file backend，维护稳定 adapter identity、backend migration、fallback 和 backend subscription。
2. **Authoritative Publication** 决定 Manager projection 的 optimistic/authoritative 时序，串行发送 mutation、处理 retry/waiter/remote publication/hydration。
3. **Worker State Persistence** 在 service worker 内对 mutation batch 做 validation、revision/replay 判定和 normalized atomic write。

所有写入最终交给 Storage Authority 当前 backend 原子提交；跨页面更新由 Authoritative Publication 按 revision/hydration 规则合并。Storage Authority 的 last-known snapshot 与 publication 的 last-authoritative projection 都按 revision/updatedAt 单调推进，不能让旧快照覆盖较新 state。

### `src/background/`

负责 Chrome API 和持久化队列边界：

- `service-worker.ts` 处理 install/startup、toolbar action、context menu、commands、runtime message、omnibox、capture、restore 和 Chrome tab-group metadata。
- runtime message 先验证 extension sender id 与内部 extension URL；不可信 sender 在 storage 或 Chrome side effect 前拒绝。
- `statePersistence.ts` 串行化 mutation batch，使用可用的 Web Locks，执行 normalized atomic writes，并返回 committed/invalid/replay evidence。

### `src/manager/`

负责唯一生产 Manager：

- `main.tsx` 挂载 React app；`ManagerApp.tsx` 组合 Mantine shell、store hydration、runtime hooks 和 overlays。
- components 渲染 workspace/category topbar、可折叠 sidebar、selected-window Open Tabs、horizontal active-category board、session cards、modals 和 feedback。
- `src/shared/openTabs.ts` 是 Open Tabs 跨 runtime protocol owner；background、preview、Manager 与 persistence 使用同一 tab/window/list/capture result contract。
- core modules 提供 selectors、capture snapshot ownership、Open Tabs workflow reducer/projection、typed DnD interaction resolution、overlay/focus contracts；这些模块可在无 Chrome DOM 的测试中执行。
- `core/searchQueryStore.ts` 是 framework-neutral saved-session query owner，只暴露 `getSnapshot()` / `subscribe()` / `set()`，通过注入 ports 初始化 URL/session storage；它不依赖 React、Zustand、DOM global 或 TabBoard store。
- `hooks/useSearchQuery.ts` 是 browser/React adapter，唯一持有 `tabboardSearch` storage key，并用 `useSyncExternalStore` 把同一 snapshot 提供给 React consumers。Open Tabs capture/filter 的 imperative path直接读该 owner，不依赖 effect-updated ref。
- `core/selectors.ts` 的 `getBoardProjection()` 先复用 shared `groupsForCategory()` 得到 canonical `categoryGroups`，再得到 query-filtered `visibleGroups`；`hooks/useBoardProjection.ts` 保持 query变化时未过滤 category projection引用稳定。
- `WorkspaceContent` 只消费 board projection；Zustand selector仅用于当前自定义 category标题，不再读取全部 groups或手写 `starred` / `archived` / `folderId` membership。render、card insertion index和end target因此共享 orphan-folder → Inbox语义。
- DnD 不复用未类型化 payload；resolver 先校验 workspace/ownership/URL/locked/index 边界，session body 不产生 merge intent。
- Manager production 不拥有 session/drop execution module；`src/manager/core/commands.ts` 已删除。Shared/background production modules不得导入 Manager。
- `ManagerLayout` 持有一个 Open Tabs workflow；`Sidebar` / `OpenTabsPanel` 只消费 grouped `model/commands`。capture 使用 selection snapshot 与 pending guard并直接返回 completion evidence；persisted Open Tabs drop 直接调用 `completeDrop()`，不使用全局 DOM event。

### 图标

- 使用 `@tabler/icons-react` 提供的 React icon 组件。
- 通过 Mantine `ActionIcon` / `Tooltip` 组合成 icon button 或 icon+text button。
- icon-only 按钮提供 tooltip 和 `aria-label`。

## State Schema

State canonical key 在浏览器存储后端下是 `chrome.storage.local["tabboardState"]`；当启用文件存储后端时，state 拆分为本地文件夹中的多个 JSON 文件（见「File Store Layout」），`chrome.storage.local` 仍保留一个极小的 bootstrap key `tabboardStorageConfig`（`BOOTSTRAP_KEY`，内容为 `{ mode: 'browser' | 'file' }`）用于启动时判定激活哪个后端。`quickList` 字段已从 schema 移除（Quick list / Pinned workflow 于 2026-07-06 下线）；`normalizeState()` 读到历史数据里的 `quickList` 时，会把其中的 items 迁移成一个名为 `Former Quick list` 的普通 session 插到 groups 头部，保证不丢数据，之后不再保留该字段。

顶层结构：

```js
{
  version,
  mutationRevision,
  workspaces,
  activeWorkspaceId,
  groups,
  folders,
  categoryOrderByWorkspace,
  bin,
  dropOperationLedger,
  settings,
  createdAt,
  updatedAt
}
```

### Workspaces

```js
{
  id,
  name,
  createdAt,
  updatedAt
}
```

默认 workspace：

- `id: "workspace_default"`。
- `name: "Personal"`。

### Groups / Sessions

```js
{
  id,
  title,
  note,
  workspaceId,
  folderId,
  locked,
  starred,
  archived,
  collapsed,
  tabs,
  createdAt,
  updatedAt
}
```

规则：

- `workspaceId` 必须指向有效 workspace。
- `folderId` 必须指向有效 folder，否则 normalize 为 `null`。
- 如果 `starred === true` 或 `archived === true`，`folderId` 会 normalize 为 `null`。
- session 的 category 是由 `starred`、`archived` 和 `folderId` 共同推导出来的单一归属。

### Folders / Custom Categories

```js
{
  id,
  name,
  workspaceId,
  createdAt,
  updatedAt
}
```

系统 categories 不存在 folders 中：

- Inbox。
- Saved。
- Archive。

### Tab Items

Link：

```js
{
  id,
  itemType: "link",
  title,
  url,
  favIconUrl,
  note,
  pinned,
  incognito,
  starred,
  taskStatus: "none",
  browserGroup,
  sourceWindowId,
  sourceTabId,
  createdAt,
  updatedAt
}
```

Note：

```js
{
  id,
  itemType: "note",
  title,
  url: "",
  note,
  createdAt,
  updatedAt
}
```

Legacy：

- `itemType: "todo"` 会 normalize 为 `itemType: "note"`。
- 旧 `taskStatus` 被重置为 `"none"`。

### Browser Group Metadata

Capture 时会尽量保存 Chrome tab group 信息：

```js
{
  sourceGroupId,
  title,
  color,
  collapsed
}
```

Restore 时会尝试用 `chrome.tabs.group` 和 `chrome.tabGroups.update` 重建。

### Bin

Bin entry 用于恢复删除内容。

约束：

- `BIN_LIMIT = 80`。
- `compactBin()` 只保留前 80 条。

### Settings

默认设置在 `DEFAULT_SETTINGS`：

```ts
{
  actionClick: 'store',
  closeTabsAfterSave: true,
  dedupeOnSave: true,
  deleteRestoredTabs: true,
  customUrlFilter: '',
  excludePinned: false,
  focusRestoredTabs: true,
  includeChromeUrls: false,
  includeFileUrls: false,
  openManagerAfterSave: true,
  restoreGroupsInNewWindow: false,
  restoreNextToCurrent: true,
  theme: 'system',
  confirmBeforeDestructive: true,
  storageMode: 'browser',
  storageFolderName: '',
}
```

`customUrlFilter` 由 shared capture policy 统一用于 Open Tabs、capture 和 DnD eligibility；命中规则的 open tab 不返回给列表，实际 Chrome 权限限制仍由平台决定。`storageMode` 与 `storageFolderName` 只记录 UI 展示用的当前存储模式与文件夹名；真正的启动判定以 `chrome.storage.local["tabboardStorageConfig"]`（`BOOTSTRAP_KEY`）中的 bootstrap key 为准。

### File Store Layout

当 `storageMode === 'file'` 时，`FileStorageAdapter` 在用户选择的目录下维护如下结构：

```text
<chosen-folder>/
  meta.json
  settings.json
  workspaces.json
  folders.json
  categoryOrder.json
  bin.json
  ledger.json
  sessions/
    <groupId>.json
    ...
```

- `meta.json` 是提交点（commit point），字段：`version`、`revision`、`pendingRevision?`、`createdAt`、`updatedAt`、`writeInProgress`。它是崩溃恢复的唯一判定点。
- 顶层文件分别对应 state 中同名字段；`categoryOrder.json` 存储 `categoryOrderByWorkspace`，`ledger.json` 存储 `dropOperationLedger`。
- `sessions/<id>.json` 存储单个 group/session 对象；文件名为 group id。

所有文件写入采用两阶段提交（参见「Persistence / 两阶段提交」）：

1. 写 `meta.json` 置 `writeInProgress: true`、记录 `pendingRevision`。
2. 对本次需要变更的每个数据文件，先写同目录临时文件（如 `settings.json.tmp-<uuid>`），完成后 rename 覆盖目标文件，保证单文件原子替换。
3. 最后写 `meta.json` 置 `writeInProgress: false`，把 `revision` 推进到 `pendingRevision`。

加载时若 `meta.json.writeInProgress === true`，表示上一次写入未完成，丢弃该批次，以上一次 `revision` 对应的文件集合为准。`sessions/` 中未被任何 workspace/group 索引引用的孤立文件不会被加载，也不会在正常写入中主动删除；清理动作通过显式的 garbage collect 路径触发。

文件夹句柄通过原生 IndexedDB（单 database、单 object store，仅 put/get/delete）持久化，不引入额外依赖。启动时由 `activeAdapter` 读取 bootstrap key 并解析句柄；若句柄缺失、权限被撤销或 IO 失败，自动降级为 `ChromeStorageAdapter`。

### Migration（存储后端切换）

Options 中连接本地文件夹时提供三种迁移模式（由 UI 派发迁移消息给 adapter 层执行）：

- `use-file`：加载文件夹现有数据并切换激活后端为 file；浏览器存储数据保留但不再是权威源。
- `export-browser`：把当前浏览器存储的完整 normalized state 写入文件夹（走两阶段提交），但保持激活后端为 `browser`，相当于手动备份。
- `merge`：读取文件夹数据 + 浏览器存储数据，按 ID 合并（同 ID 以文件侧为准，浏览器侧独有追加），合并结果写回文件夹后切换激活后端为 file。

Storage Authority 把 bootstrap/handle 当作 mode-switch commit point：

- 切到 File：先创建并验证 File adapter、写入完整目标 state（暂不广播 ping），再保存 handle、写 bootstrap=`file`，最后安装 File backend 并广播 committed ping。
- 切回 Browser：如需 copy-back，先完成 Chrome state 写入，再写 bootstrap=`browser`、清 handle，最后安装 Chrome backend。
- Reconnect：先验证目录权限并读取 File state，再保存 handle 与 bootstrap，最后安装 File backend。

任何 pre-commit 步骤失败都会保留原 backend、bootstrap 和 handle；UI 不会把半完成切换显示为成功。

### Fallback（错误自动降级）

File backend 的初始化、读取、写入或 `reloadFromDisk()` 抛出错误（权限丢失、文件夹被删除/移动、IO 错误、配额不足等）时：

1. Storage Authority 记录 diagnostics，并保留最后一次成功读取/提交的 normalized snapshot。
2. 首个故障 context 将该 snapshot 写入 `ChromeStorageAdapter`，再原子替换内部 backend；收到 remote fallback event 的 context 直接读取已提交 Chrome state。authority object 本身不变。
3. Authority 重绑 backend subscription，向当前 context listeners 发布 Chrome state，并通过 `storageEvents.ts` 通知其他存活 context 同步降级。
4. 触发失败的 File 写仍 reject；现有 mutation retry 负责在新 Chrome backend 上重试，避免误报 commit。
5. Manager/Options 显示 toast 或 banner，告知用户已降级、原因，并提供"重新选择文件夹"或"保持使用浏览器存储"入口。

降级状态下，用户可在 Options 里重新选择文件夹触发 merge 迁移，或显式断开文件夹并正式切回浏览器存储。

## 关键流程

### 保存当前窗口

入口：

- Toolbar click。
- Context menu。
- Manager message。
- Popup message。
- Command。

流程：

1. 入口调用 `captureTabs(mode, anchorTab, options)`。
2. `getTabsForMode()` 根据 mode 取 tabs。
3. `getCaptureCandidateReason()` 拒绝 extension pages、没有 usable URL 的 rows 和命中 `customUrlFilter` 的 URL；pinned、Chrome 和 file URLs 与普通 tab 一样处理。
4. 如开启 `dedupeOnSave`，按符合保存资格的源 tab URL 去重，重复源 tabs 关闭。
5. `createTabRecord()` 转成 TabBoard tab records。
6. 按 windowId 分组。
7. `createGroupFromTabRecords()` 创建 session。
8. `updateState()` 将新 sessions 放到 groups 头部。
9. 根据 settings 打开或聚焦最近 manager tab，并带上 target group / feedback URL params。
10. 根据 settings 关闭已保存源 tabs。

重要边界：

- 如果没有 policy-eligible 的非 TabBoard tabs，会抛出 `No capturable tabs were found`，不会提交空 session；重复源 tabs 仍按 capture dedupe 设置处理。
- Source-tab dedupe 只针对本次 capture 的源 tabs，不因为历史 saved sessions 里已有同 URL 而跳过本次 session 内容。
- `dedupe-window` 是独立的当前窗口清理操作：按 URL 分桶，保留 active tab，若无 active tab 则保留 `lastAccessed` 最新的 tab，并关闭同桶其余 tabs。
- Capture 不提供自定义 URL pattern；pinned、Chrome 和 file URL 资格由 shared capture policy 和对应 settings 控制，实际保存和恢复能力仍是 Chrome 平台边界。
- 如果 manager tab 是保存过程中打开的，关闭源 tabs 时会排除 manager tab。

### Manager Open Tabs

流程：

1. `ManagerLayout` 创建一个 `useOpenTabsRuntime()` workflow，并把它传给 Sidebar；workflow 的 React adapter 调用 runtime message `list-open-tabs`。
2. Background 使用 `chrome.windows.getAll({ populate: true })`，先按当前 extension base URL 排除 TabBoard 自身 manager、popup、options 等页面，再为 window 返回过滤后可见 rows 的 `tabCount`。
3. `getCaptureCandidateReason()` 使用 shared capture policy 判定其余 tab 是否 storable；命中 `customUrlFilter` 的 rows 不返回，没有 usable URL 的 rows 被拒绝。
4. `openTabsWorkflow.ts` reducer 原子应用 windows、selected window 与 selection pruning；projection 一次派生 filtered rows、selected records 和 selected record IDs。
5. Manager 用 compact window selector 展示 window ordinal 和 tab count；Chrome raw window ID 只作为 option value 使用，不显示给用户。一次只渲染 selected window 的 Open Tabs body。Selected window 先用 sidebar `TextInput` query 过滤，再按 Chrome `tab.index` 排成单一纵向列表；pinned row 与普通 row 同处列表，并显示 inline badge/reason。
6. Selected window 可保存、从 More 清理重复 tabs、进入 select mode；已显示的普通 URL、pinned、Chrome 和 file rows 均可选择、拖拽和保存。
7. Select mode controls 位于 64px header rail 内，不改变 header 高度或移动 tab 列表；selected count 以 numeric badge 呈现并保留 aria-live 文本。
8. Selected capture 在请求前快照 selected tab ids、window、workspace 和 select mode，并以 pending guard 防止重复提交；返回 `CaptureCompletion` 后仅在 snapshot 与当前选择一致时清空。ManagerLayout 直接消费 completion 做 toast/reveal，不经过 window event。
9. `chrome.storage.onChanged` 直接恢复正常 manager render。
10. Open Tabs refresh 不清空当前 `windows` state，也不渲染 loading row；`loading` 只驱动顶部 Refresh icon 的旋转/`aria-busy` 状态。并发 refresh 保持一个 active run + 一个 queued rerun，请求成功后 reducer 一次替换 rows，请求失败则保留旧列表并显示错误。
11. Shared preview portal 的 layout measurement 只在 `position === null` 时提交一次定位 state；后续 commits 仍检查 trigger 是否已脱离 DOM，但不得重复派发同一 preview 的 position。Saved-link activation 会停止冒泡并先关闭 preview，避免 document-level preview click handler 在同一事件末尾将其重新打开。Window blur / document hidden 会关闭 overlay 并暂时抑制 CSS hover/focus disclosure；只有后续真实 pointer/keyboard interaction 才解除，避免 Chrome 返回前台时复用失焦前的 stale hover target。

### Manager 启动与降级

Manager 启动先由 React shell 和 `useStoreHydration()` 生成 normalized default state，准备并渲染可用 layout，同时由 `useOpenTabsRuntime()` 发起 Open Tabs 请求；storage state 在后台异步读取，完成后再应用到当前页面。Mantine render 或 runtime message 失败只影响对应 surface，不应阻断基础 Manager shell。

Hydration 不依赖 MV3 service worker：manager 页面可以通过 Storage Authority 直接读取当前 backend，worker 只在**写入**时用于跨页面串行化。`store.hydrate()` 委托 Authoritative Publication；publication 先调用 `ensureStateForHydration()`——优先发 `tabboard-ensure-state` 给 worker（顺便唤醒它、给空存储播种默认值），但**如果 worker 处于空闲挂起、冷启动竞态或消息通道断开**（典型报错 `Could not establish connection` / `message port closed`），则 catch 后降级为 authority `ensureState()`。publication 在 initial read 前订阅 authority publication，缓冲 read/subscribe gap 中到达的 state，并用 revision 优先、timestamp 次优选择最新 state。这样 worker 不可达时页面仍能正常起来，避免此前"单次 `sendMessage` 失败 → `hydrated` 永远为 false → 无限 loading 白屏"的问题。只有当 worker 与当前 backend 读取**同时失败**时，`hydrate()` 才会 reject；本 generation subscription 会释放、错误以 `notify: false` 投影，下一次调用可以重试。

`releaseHydration()` 只使当前 UI generation 和旧 subscription callback 失效，不 teardown Storage Authority backend，也不破坏正在持久化的 mutation。页面或测试 context 整体替换时，publication generation 会拒绝旧 waiter、取消旧 timer、回滚真正未完成的 optimistic projection，并让旧 RPC continuation 无法覆盖新 context。错误按阶段降级：popover 失败只关闭信息浮层，storage 失败保留默认 normalized state，migration 失败保留已加载 sessions，shell 失败停止后续启动，Open Tabs 失败保留空面板并提示；loaded/render 失败则保留已启动的基础界面并提示。

### Restore

单 tab：

1. `restoreTab({ source, groupId, tabId })`。
2. 找到对应 tab。
3. `createChromeTabs()` 创建浏览器 tab。
4. 如开启 `deleteRestoredTabs` 且 group 未 lock，移除 saved record。

Session：

1. `restoreGroup(groupId)`。
2. 过滤 `isRestorableTab()`。
3. `createChromeTabs()` 按设置恢复到新窗口或当前窗口。
4. 尝试 `restoreBrowserGroups()`。
5. 根据 delete/lock 规则清理。

All：

1. 收集所有 groups 中 restorable links。
2. 按 restore settings 创建 tabs。
3. 可删除非 locked groups 中已恢复 records。

### Import

入口：

- Manager top toolbar Import。

流程：

1. `openImportModal()` 收集文本。
2. `parseImportPayload()` 尝试 JSON。
3. JSON 包含 `groups` 或数组时走 `normalizeState({ groups })`。
4. JSON 失败时走 `parseOneTabText(text)`。
5. `parseOneTabText()` 可解析 OneTab blocks；如果未解析出 groups，会回退 `parseImportText()`。
6. 导入 groups 加上当前 `workspaceId`，插入 groups 头部。

### Export

入口：

- Manager top toolbar Export。

流程：

1. `openExportModal(state.groups)`。
2. `groupsToText()` 生成文本。
3. JSON 形态为 `{ exportedAt, groups }`。
4. 用户可 copy text、download text、download JSON。

### Category 归属

Session category 推导规则：

```text
archived true      -> Archive
starred true       -> Saved
folderId exists    -> folder:<folderId>
otherwise          -> Inbox
```

移动 category 时：

- 目标是 Archive：`archived = true`, `starred = false`, `folderId = null`。
- 目标是 Saved：`starred = true`, `archived = false`, `folderId = null`。
- 目标是 Inbox：`archived = false`, `starred = false`, `folderId = null`。
- 目标是 folder：`archived = false`, `starred = false`, `folderId = folder.id`。

创建或重命名 category 时，manager 通过 `withCategoryMutationLock()`（优先使用 `navigator.locks`）包住基于最新 state 的 `validateFolderName()` 检查和写入；normalize 仍不合并历史重复 category。

### Drag and Drop

TabBoard 的 DnD 基于 `@dnd-kit`（`@dnd-kit/core` + `@dnd-kit/sortable`），不再使用原生 HTML5 `draggable` / `dataTransfer` / `setDragImage`。单个 `DndContext` 位于 `src/manager/components/shell/ManagerLayout.tsx`；interaction logic（drag payload/target、intent resolver、几何锁定）集中在 `src/manager/core/dnd.ts`。Persistent `DropIntent` contract、validation、execution与replay分别由 shared model modules拥有。

Drag payload 类型（`DragPayload`，由各可拖拽组件通过 `useDraggable` / `useSortable` 的 `data.dnd.payload` 声明）：

- `group`：拖拽整张 session card。
- `category`：拖拽顶部 category tab 重排。
- `tab`：拖拽单个 saved tab item。
- `tabs`：拖拽 session 内多选的 saved tabs。
- `open-tabs`：从 sidebar 拖拽一个或多个 open tabs。

Drop target 类型（`DropTarget`，由 `useDroppable` 容器通过 `data.dnd.targets` 声明，一个容器可暴露多个候选 target）：

- `group-body`：落入 session 主体，追加到末尾。
- `tab-before`：落在某个 tab 行的 before/after 边缘，用于精确插入。
- `group-insert`：落在两张 session card 之间的指定 index。
- `category-column`：落在某个 category 的空白列区域，追加到该 category 末尾。
- `category-reorder`：落在顶部某个 category tab 的 before/after，用于重排 category。

DnD 生命周期（React 侧，`ManagerLayout`）：

- Sensors：`PointerSensor`（`activationConstraint.distance = 5px`，避免点击误触发拖拽）、`TouchSensor`（`delay 200ms` + `tolerance 5px`）、`KeyboardSensor`（`coordinateGetter: sortableKeyboardCoordinates`，让方向键按 sortable 位置跨越整列 session，而不是固定像素步进）。
- Session 拖拽 activator 是 session card header 内的独立 handle button（`.session-card__drag-handle`，携带 `setActivatorNodeRef` + `attributes` + `listeners`）。它提供 `role="button"`、`tabindex=0`、`aria-roledescription="sortable"` 与描述性 `aria-label`，因此 pointer 与键盘（Space 拿起 / 方向键移动 / Space 放下 / Esc 取消）两条路径都能拖拽；header 自身保留 pointer listeners，整块 header 仍可鼠标拖拽。
- Collision detection：自定义 `createGeometryCollisionDetection()` 取代默认算法。它按指针到候选 rect 的距离排序、用 `isCompatibleTarget()` 过滤掉当前 payload 不支持的 target（例如 session drag 不会被 tab row 抢走），并对 `tab-before` 用 `getTabDropPlacement()`（上/下 25% 边缘 → before/after，中间 50% → 收敛为 `group-body`）细化落点。
- Target 锁定：`lockDropTarget()` 用 `DROP_TARGET_RELEASE_MARGIN`（12px）hysteresis 保持已选 target，减少横向 board 重排导致的边界回闪；`category-column` 命中时优先直接选中，不参与锁定。
- `onDragStart` 记录 `event.active.rect.current.initial` 作为 `sourceRect`，并快照 `dragReplacementKey`（workspace + category + view + groups 指纹）。`onDragOver` 由 collision 结果算出 `target` 与 `markerForTarget()` 生成的插入标记。`onDragEnd` 用 `getDragEndTarget()` 取最终 target。
- Overlay：`DragOverlay`（`dropAnimation={null}`）渲染跟随指针的预览，尺寸取 `sourceRect`；不同 payload 渲染不同预览（session card / tab row / "N saved tabs" / "N open tabs" 剪影 / category label）。这取代了原生实现里"截取源卡片 clone 当 drag image"的做法，视口外元素不再出现"一拖就消失"。

Intent 解析与提交：

- `resolveDrop({ payload, target, state, openTabs })` 是唯一裁决点，先校验 workspace 边界（`isValidWorkspaceBoundary`，且 `target.workspaceId === payload.workspaceId`），再按 payload 类型分派，产出 typed `DropIntent`（`move-session` / `reorder-category` / `move-tabs` / `copy-open-tabs` / `create-session`）或返回 `null`。
- Ownership/边界校验全部在 resolver 内：group/tab 必须属于当前 workspace（`getOwnedGroup` / `getOwnedTab`），category 必须存在（`isOwnedCategory`），插入 index 必须合法（`isValidInsertionIndex`），open-tabs 必须仍是 storable candidate（复用 `isStorableCaptureCandidate`）。同 session 内移动会用 `isSavedTabMoveNoOp()` 剔除 no-op，避免误删或空提交。
- session body 不会产出 merge intent：拖 session 只能落到 `group-insert` / `category-column`，不能落进另一张 session 内部，从根本上排除"把 A 合并进 B"的误操作。
- 提交走 `useTabBoardStore.applyDropIntent(intent, openTabs)` → `AuthoritativePublication.commitDrop()`（带 `operationId` 与 `expectedRevision`）。publication 的 Promise 等待 worker authoritative commit；worker `statePersistence` 调用 shared `stateMutations`，最终由 `drop-operations.ts` 执行 intent并生成replay evidence。`persistDropWithFeedback()` 统一 success/error toast。

拖拽期间的一致性保护：

- `shouldInvalidateDragReplacement()`：拖拽进行中若 workspace/category/view/groups 指纹变化，或拖拽源已不再渲染（`isDragSourceStillRendered`），则调用 `finishDrag()` 主动收尾，避免落到过期布局。
- `handleOpenTabsSourceKeyChange()`：Open Tabs 列表在拖拽中被刷新替换时，取消进行中的 `open-tabs` 拖拽。
- `Escape` 键与组件卸载都会触发 `finishDrag()`；`onDragStart` 通过 `useDndMonitor` 关闭所有 info overlay，避免浮层遮挡 drop target。

板面与 sidebar 布局（与 DnD 相关的部分）：

- 顶部 category tabs 按 `categoryOrderByWorkspace` 排序，点击切换 `selectedCategory`；右侧 board 只渲染当前 active category，单行横向滚动，每张 session card 全高、card 内 `tab-list` 独立纵向滚动。
- 左侧 sidebar 折叠状态用 `manager-shell--sidebar-collapsed` class 和 `tabboard.sidebarCollapsed` localStorage preference，不进入业务 state；collapsed rail 只投影 selected window 的 tab identity，不拥有 selection 或 DnD state；active drag 期间通过 `manager-shell--open-tabs-drag-active` 让 collapsed overlay 让出 pointer events。

已知敏感点：

- DnD 逻辑仍是最脆弱的区域之一，但脆弱点已从"原生事件时序"转移到"collision detection 几何 + target 锁定 hysteresis + 拖拽中布局失效"三者的交互。
- `resolveDrop` 是行为契约的中心，任何落点语义调整都应先在 `src/manager/core/dnd.test.ts` 加用例，再改 UI。
- `drop-operations.ts` 是持久化执行/replay契约中心；wire shape、stable identity或execution调整先在 shared direct tests加用例。
- 自动化覆盖 typed resolver / 几何 / 生命周期契约，加上 `tests/e2e/`（Playwright）里的 pointer 与键盘拖拽冒烟；更细的真实事件时序仍建议在 unpacked extension 手工验证。修改拖拽逻辑时应同时手工验证：
  - 拖 session 起始位置。
  - 拖 session 到同 category 前/后。
  - 拖 session 到其它 category。
  - 拖 saved tab 到已有 session。
  - 拖 saved tab 到新 session placeholder。
  - 多选 saved tabs 拖拽。
  - 多选 open tabs 拖入已有 session 与新建 session。
  - 键盘拖拽：Tab 聚焦 session 的 `.session-card__drag-handle`，Space 拿起、方向键移动、Space 放下、Esc 取消。

## UI 架构

生产 Manager 使用 React component tree 和 Mantine primitives；业务 state 由 Zustand store 提供，纯 projection/command contracts 保持在 `src/manager/core/` 与 `src/shared/`。

主要渲染路径：

```text
manager.html
  -> src/manager/main.tsx
  -> ManagerApp
  -> ManagerLayout
     -> WorkspaceHeader / SearchBar
     -> Sidebar / OpenTabsPanel
     -> WorkspaceContent
        -> SessionCard / TabItemRow
```

状态更新路径：

1. UI DnD resolver生成 shared typed `DropIntent`；其他 UI action生成 typed `StateMutation`。
2. shared drop validation / mutation layer验证 immutable state preconditions，包括 ownership、locked、URL、index 和 workspace。
3. `useTabBoardStore` 领域 facade 把 action 交给唯一 Authoritative Publication instance；publication 同步发布 optimistic projection，并按 ordinary/drop/category/restore 语义调度 mutation。
4. worker `statePersistence` 串行验证并提交 mutation batch，返回 authoritative state、partial commit indexes 或 semantic error evidence。
5. Storage Authority publication 回流到 publication subscription；有 pending/in-flight work 时先缓冲，batch settle 后按 revision/timestamp 选最新 remote base并安全重放 committed mutation。
6. Publication 在发布 reconciled state 前执行 semantic structural sharing，复用未变化的 workspace/folder/group/tab 等实体引用；drop/category waiter 只在 authoritative outcome 后 settle。
7. React 根据共享后的 projection 重绘，并由 capture outcome/overlay lifecycle 恢复 feedback 与 focus。

### 大 board 性能

`WorkspaceContent` 一次渲染当前 active category 的全部 session card（横向 track），不做 JS 虚拟化，以保持 `@dnd-kit` 的 collision/measurement、浏览器 find-in-page 与 `scrollIntoView` 正常工作。为控制成本，`.session-board__group-slot` 使用 CSS `content-visibility: auto` + `contain-intrinsic-size`：滚出视口的 session slot 跳过 layout/paint，但仍留在 DOM 中，可被拖拽 measurement、搜索定位和滚动命中。该行为由 `src/manager/core/layout.test.ts` 的 CSS 契约和 `tests/e2e/large-board.e2e.ts`（60 sessions 全部在 DOM、远端 card 可滚动可见）守护。若单 category 达到数百 session 仍出现压力，再评估引入真正的虚拟列表及其与 `@dnd-kit` 的兼容性。

Open Tabs 同样保留全部 rows 与每行的 DnD/focus/preview hooks。`useOpenTabsRuntime()` 用 `useDeferredValue` 延后 query，`openTabsWorkflow.ts` projection 统一派生 filtered rows 与 selection drag records；`.manager-open-tab-row` 使用 `content-visibility: auto` 与 intrinsic size 跳过 off-screen layout/paint。Overlay provider 的 document/window listeners 在生命周期内只绑定一次；commands 与 menu/preview observable state 分离，普通 row/card 只订阅自身 key 的 open boolean。

## Search

Manager search：

- `searchQuery` 由 `SearchQueryStore` 单一拥有。初始化时非空 URL `?q=` 优先；URL缺失或为空时回退 `sessionStorage["tabboardSearch"]`。非空 initial snapshot会best-effort写回session storage，空初始化不创建key。
- 顶部 SearchBar 保留本地 input value和150ms debounce；external store更新会同步local value，clear/close立即更新两者。match count使用local input即时过滤canonical category groups，不等待debounce。
- `openTabsQuery` 来自 sidebar footer，只过滤 selected browser window 的 pinned/regular rows。
- `openTabFilter` 来自可保存 open tab 的右键菜单：workflow记录 `tabFilterUrl`，同一 command同步把URL写入 `SearchQueryStore`。window切换和 Open Tabs refresh不自动清除它；capture snapshot直接读取owner，避免setter与React effect之间的竞态。
- `getBoardProjection()` 先按fallback-safe active workspace和shared category semantics产生未过滤 `categoryGroups`，再用 `filterGroupsByQuery()`产生 `visibleGroups`。空normalized query直接复用category array引用。
- orphan或跨workspace folder reference在render、search、card insertion index和end target中都按shared `categoryForGroup()`归Inbox。
- `getVisibleGroupTabs()` 决定 session 内 matching tabs；不做预览数量截断。
- `sessionStorage`读取/写入失败时，query owner保留当前page的in-memory snapshot并继续通知React；只丢失刷新后的恢复能力。

Omnibox search：

- Background 的 `getOmniboxSuggestions()` 遍历 groups 和 restorable tabs。
- 命中后返回 `tabb://tab/group/<groupId>/<tabId>` content。
- onInputEntered 收到该 content 后调用 `restoreTab()`。

## Theme and Icons

Theme：

- `system` / `light` / `dark`。
- CSS 使用 `prefers-color-scheme` 和 `:root[data-theme]`。

Icons：

- 使用 `@tabler/icons-react` 提供的 React icon 组件。
- 通过 Mantine `ActionIcon` / `Tooltip` 组合成 icon button 或 icon+text button。
- icon-only 按钮提供 tooltip 和 `aria-label`。

## Testing and Verification

常用命令：

```sh
npm test
npm run build
npm run check
git diff --check
```

自动化 proof 当前覆盖：

- `npm test`（Vitest，happy-dom）：React/core contracts，包括 selectors、state mutations、Authoritative Publication queue/retry/waiter/reconciliation/lifecycle、worker persistence、capture ownership/feedback、typed DnD、Open Tabs policy、overlays、layout 和 hydration。
- `build`：`tsc --noEmit` 类型检查加 Vite/CRX 产物构建。
- `check`：先 `build`，再由 `scripts/check-extension.mjs` 校验 Manifest entry、构建产物引用和 extension sanity；strict import graph gate拒绝任何 source SCC，并禁止 publication依赖UI/concrete storage、shared/background反向依赖Manager。

当前测试空白：

- 真实 Chrome custom-element/extension lifecycle、Shadow DOM keyboard/focus、完整 DOM render 未自动化覆盖。
- `@dnd-kit` 拖拽的真实指针/键盘事件时序未由 Vitest 覆盖，只有 typed resolver、geometry、lifecycle 和 cleanup contracts；浏览器级冒烟见 `tests/e2e/`（Playwright，需本地按需运行）。
- Chrome capture/restore 与 sender integration 仍需要 unpacked extension 手工验证。

建议人工回归：

- 安装 unpacked extension。
- 展开/折叠 sidebar，并刷新确认 UI preference 保留；窄屏下确认 rail、compact window selector 和 toggle 仍可达。
- 切换多个 compact window selector，确认一次只显示 selected window，tab count 与 Chrome window 原始总数一致；新建 Chrome window 后自动选中。
- 确认 compact window selector 和 actions 位于 sidebar 顶部，切换 window 后只显示 selected window 的单一纵向 Open Tabs 列表；pinned row 与普通 row 同处列表并显示 inline badge。
- 按 Options policy 验证 pinned、Chrome 和 file URL rows 的 storable reason、checkbox、DnD 与 capture 结果保持一致。
- 输入 sidebar Filter tabs，确认只过滤当前 window rows；切换 window 或刷新 tabs 后，已有 `openTabFilter` 仍保留。
- 确认 sessions 单行横向滚动、每张 card 全高、tab list 在 card 内滚动。
- 在横向滚动前后测试 session target-slot、saved/open tabs 和 category DnD。
- 打开第一张/最后一张 session 的 More，确认 fixed menu 不被裁切。
- 保存当前窗口、搜索、分类、restore、导入 OneTab 文本。

## Diagnostics (Crash-Surviving Log)

白屏会销毁页面 console，因此 TabBoard 将一条轻量的面包屑/错误轨迹持久化到 `chrome.storage.local` 中独立于应用状态的 key（`tabboardDiagnostics`），即使 React 树挂掉或状态损坏也能在刷新后读回来排查。

**核心模块**：`src/shared/utils/diagnostics.ts`

- 入口：`logBreadcrumb(scope, message, detail?)`、`logWarning(...)`、`logError(...)`
- 读取：`readDiagnostics()` → `DiagnosticEntry[]`，会等待 in-flight 写入完成后再读
- 清除：`clearDiagnostics()`
- 全局捕获：`installGlobalErrorCapture(scope)` 安装 `error` + `unhandledrejection` 监听
- Ring buffer 上限：`DIAGNOSTICS_LIMIT = 100`，最新 100 条
- 写入串行化：内部 `writeChain` 保证并发日志不会互相覆盖
- **永不抛错**：所有 storage 访问都被 try/catch 包裹，diagnostics 本身不能成为第二故障源

**白屏后取回日志的方式**：

1. 在管理器页面（即使白屏/ErrorBoundary 页）打开 DevTools Console。
2. 执行：
   ```js
   chrome.storage.local.get('tabboardDiagnostics', r => console.table(r.tabboardDiagnostics))
   ```
3. 或点击 ErrorBoundary 恢复面板上的「Copy diagnostics」按钮。

**已埋点的关键轨迹**：
- `manager: manager entry script loaded` — 入口脚本已执行
- `manager: ManagerApp mounted` — React 根组件已挂载
- `hydration: ensured state via service worker` / `via local storage fallback` — 水合走了哪条路径
- 全局未捕获错误 / unhandled rejection

**ErrorBoundary**：`src/manager/components/shell/ErrorBoundary.tsx` 包裹整个 ManagerApp，在 React 渲染级崩溃时展示错误信息、刷新按钮、复制诊断日志按钮，以及可展开的完整日志详情。

**Hydration 看门狗**：`ManagerApp` 中有 8 秒看门狗（`HYDRATION_WATCHDOG_MS`），如果 `useStoreHydration` 超过 8 秒仍未完成，不再显示空 LoadingOverlay，而是展示一个「页面加载停滞」面板，附刷新按钮和诊断信息。

## 维护建议

1. 按 React Manager 边界维护功能

推荐拆分方向：

- UI 结构放在 `src/manager/components/`，按 shell、workspace、sidebar、session 和 overlay surface 保持高内聚。
- 页面生命周期与 Chrome runtime 适配放在 `src/manager/hooks/`。
- selectors、commands、capture、open-tabs 和 typed DnD 规则放在 `src/manager/core/`，优先保持纯函数和可执行测试。
- 状态 schema、normalize、mutation validation 与 persistence adapter 继续留在 `src/shared/` 和 `src/background/` 边界内。

2. 扩充 drag/drop 的浏览器级测试

`tests/e2e/`（Playwright）已提供 manager 加载与 `@dnd-kit` 键盘拖拽的冒烟骨架；继续扩充时优先覆盖 session 跨 category 重排、saved/open tabs 落点 placeholder 与键盘拖拽路径。指针拖拽在 Playwright 中需模拟 pointer move 序列，建议同时保留 `src/manager/core/dnd.test.ts` 的纯 resolver 用例作为主回归。

3. 数据 schema 改动必须经过 normalize

新增字段时：

- 更新 `DEFAULT_SETTINGS` 或 normalize 函数。
- 更新 import/export 兼容。
- 更新 tests。
- 更新本技术文档。

4. 权限保持最小可解释

新增 Chrome permission 前必须记录：

- 为什么需要。
- 是否可以通过已有 permission 实现。
- 用户隐私解释成本。

5. 产品方向变化同步文档

明显功能变化后更新：

- `feature-evolution.md`。
- 必要时 `product-decisions.md`。
- 影响卖点时 `product-story.md`。
