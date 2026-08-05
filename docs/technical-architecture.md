# Technical Architecture

本文档描述 TabBoard 的技术结构、模块边界、数据模型和关键流程。目标是帮助后续维护者快速判断“改哪里、注意什么、怎么验证”。

## 技术栈

TabBoard 是 Chrome Manifest V3 extension，使用 React + TypeScript 开发，通过 Vite 构建，Manager 使用 Mantine，背景页和 shared model 保持明确边界。

运行环境：

- Chrome 115+。
- Manifest V3 service worker。
- Vite + `@crxjs/vite-plugin` 构建链；`manager.html` 的生产入口是 `src/manager/main.tsx`。
- React 18、Mantine v7、Zustand、`@dnd-kit`、`lucide-react`。
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
- `src/options/`: SettingsProjection-backed Options entry、Basic settings external store 和 lazy Advanced storage controls。
- `src/background/service-worker.ts`: Chrome API boundary、capture/restore、runtime messages、sender verification。
- `src/background/statePersistence.ts`: serialized mutation queue、optional Web Locks、normalized atomic writes。
- `src/shared/model/`: schema/types、normalize、category/session semantics、DropIntent contract/validation/execution/replay、capture policy、window duplicate classification、import/export 和 search。
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
- `activeAdapter` 是稳定的 Storage Authority。启动时读 `chrome.storage.local["tabboardStorageConfig"]`（BOOTSTRAP_KEY）中的 `StorageStatusProjection` 决定内部 backend；callers 可长期持有同一个 authority interface，backend 切换不会让 subscription 或缓存引用失效。旧 `{ mode }` 记录只作为兼容输入解析。
- `settingsProjection.ts` 持有可丢弃的 `tabboardSettingsProjection` read model（settings + mutationRevision + updatedAt）。Chrome commit 与 canonical state 原子写入 projection；File commit 在 final meta commit 后发布 projection。projection 缺失或损坏时只允许一次 canonical state repair，不成为第二写入真相。
- 同一模块还定义 `StorageStatusProjection`：`configuredTarget` 表达用户正式选择，`activeBackend` 表达当前实际 writer，并持久化 `folderName`、`fallbackReason` 和最后一次成功 File commit 的 `fileUpdatedAt`。DirectoryHandle 只存 IndexedDB，不进入该 projection。
- 页面 context 中，`activeAdapter` 只在 file bootstrap、迁移、reconnect 或 handle 清理分支通过 literal dynamic import 加载 `fileStorage` / `fsDirectory`；browser mode 不执行 file backend 模块。MV3 service worker 不支持 dynamic `import()`，因此 worker 入口静态导入这两个模块，并通过既有 module-loader seam 注入 Storage Authority。
- `storageEvents.ts` 独立承载 file commit ping 与跨 context fallback event；authority 只在 File backend 活跃时绑定这两类 transport，并按 event id 去重。
- File backend 在初始化、读取、写入或 ping reload 时失败，authority 会切换 backend、重绑 subscription 并通知 UI。本 context 首次发现故障时先把最后一次有效 snapshot 保存到 Chrome；收到其他 context 的 fallback event 时直接读取对方已提交的 Chrome state，禁止用旧 File snapshot 反向覆盖。本次失败写仍 reject，避免把未提交 mutation 误报为成功；既有 persistence retry 会在 Chrome backend 上重试。
- `authoritativePublication.ts` 是 Manager-side publication owner。它不依赖 Zustand、React、DOM event 或具体 Chrome adapter，独占 optimistic queue、in-flight batch、remote buffer、drop/category waiter、bounded retry、terminal isolation、authoritative reconciliation、structural sharing 和 hydration generation。
- `stateMutations.ts` 以 immutable commands 应用普通 state mutation，并拒绝无效引用、locked 目标和 link/note URL 形态错误。
- `mutationValidation.ts` 负责 mutation-batch candidate boundary；DropIntent/OpenTab raw shape由 shared model `drop-validation.ts` 负责。
- `stateMutationFeedback.ts` 把 committed `StateMutation` 纯映射为 typed `ApplicationFeedback`；不决定commit时机。
- `useTabBoardStore.ts` 只提供 Zustand UI projection、领域 action facade、restore/import/export 准备和publication ports；它在publication确认commit/surface error后publish typed feedback，不拥有 persistence queue、retry timer、waiter 或 hydration subscription。

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
- `core/managerNavigationPreference.ts` 只拥有 Manager 裸入口的 page-local category preference：显式 URL state 永远优先；裸入口按 workspace 恢复有效偏好或选择 category order 中第一个非空分类。该数据使用 versioned localStorage，不进入 canonical state 或 Storage Authority。
- `src/shared/openTabs.ts` 是 Open Tabs 跨 runtime protocol owner；background、preview、Manager 与 persistence 使用同一 tab/window/list/capture result contract。
- core modules 提供 selectors、capture snapshot ownership、Open Tabs workflow reducer/projection、typed DnD interaction resolution、overlay/focus contracts；这些模块可在无 Chrome DOM 的测试中执行。
- `core/searchQueryStore.ts` 是 framework-neutral saved-session query owner，只暴露 `getSnapshot()` / `subscribe()` / `set()`，通过注入 ports 初始化 URL/session storage；它不依赖 React、Zustand、DOM global 或 TabBoard store。
- `hooks/useSearchQuery.ts` 是 browser/React adapter，唯一持有 `tabboardSearch` storage key，并用 `useSyncExternalStore` 把同一 snapshot 提供给 React consumers。Open Tabs capture/filter 的 imperative path直接读该 owner，不依赖 effect-updated ref。
- `core/selectors.ts` 的 `getBoardProjection()` 先复用 shared `groupsForCategory()` 得到 canonical `categoryGroups`，再得到 query-filtered `visibleGroups`；`hooks/useBoardProjection.ts` 保持 query变化时未过滤 category projection引用稳定。
- `WorkspaceContent` 只消费 board projection；Zustand selector仅用于当前自定义 category标题，不再读取全部 groups或手写 `starred` / `archived` / `folderId` membership。render、card insertion index和end target因此共享 orphan-folder → Inbox语义。
- `src/shared/applicationFeedback.ts` 是 page-local application feedback owner，提供typed `publish()` / `subscribe()`；channel无DOM/React/Zustand/Chrome依赖、同步且不replay，listener异常被隔离。
- `useToastNotifications.ts` 只把 `ApplicationFeedback` discriminated union映射为现有toast copy；Store与Manager不再通过window event names通信。
- DnD 不复用未类型化 payload；resolver 先校验 workspace/ownership/URL/locked/index 边界，session body 不产生 merge intent。
- Manager production 不拥有 session/drop execution module；`src/manager/core/commands.ts` 已删除。Shared/background production modules不得导入 Manager。
- `ManagerLayout` 持有一个 Open Tabs workflow，并通过 `useManagerSelectionScope()` 只拥有当前 active `SelectionScope`。Open Tab IDs 仍由 workflow 持有，saved item IDs 仍由各 `SessionCard` 持有；clear callback 只用于 scope replacement / Exit 同步通知旧 owner，不进入 Zustand、canonical state 或 persistence。
- `Sidebar` / `OpenTabsPanel` 只消费 grouped workflow `model/commands` 与 Manager selection coordinator。capture 使用 selection snapshot 与 pending guard并直接返回 completion evidence；persisted Open Tabs drop 直接调用 `completeDrop()`，不使用全局 DOM event。
- `ManagerLayout` 也是唯一 `SessionTargetPicker` owner。Open Tabs `Save to` 和 Session toolbar `Move` 只上报 typed source/trigger；picker从 active workspace canonical category/session order生成choices，只保留能通过当前 DropIntent execution/locked/no-op语义的目标。展示label单独从Session title、Category name与before/between/after位置派生，不进入persistent wire。
- Target picker的preview index和`aria-live` announcement只属于portaled modal UI，不创建或修改Dnd `DropTarget`、collision geometry、Gap Anchor、auto-scroll或persistent state。Existing/New commit分别映射到既有 `move-tabs` / `copy-open-tabs` / `create-session` intents并统一调用 `applyDropIntent`；Saved All Source Tabs只抑制New choices。
- `useManagerRuntime.restoreTabs(refs)`只发送一次background `restore-refs`，并把`restoredTabs`成功证据返回给Session toolbar；runtime失败走现有toast并继续reject。Preview Chrome harness实现同一批量语义。
- Selected item批量删除使用单一`delete-tabs` mutation。Store facade在调用时复制refs与Bin snapshots，先拒绝locked/missing/duplicate输入，再由Authoritative Publication `commitChecked()`无optimistic地直接等待worker authority。worker在任何写入前验证整个batch；成功一次性更新groups/Bin，reject不产生部分删除，exact replay不重复Bin entries。
- `SessionSlot` 是普通 session 唯一的 group `useSortable` owner；`useSessionActivation` 保留所有 slot/insertion target，但只为初始、近视口、搜索/高亮或显式激活的 session 挂载完整 `SessionCard`。远端 `SessionCardShell` 不挂载 tab rows、tab sortables、per-row overlays 或 overflow observers。
- `CategoryNav` 让整个 category tab 同时拥有 navigation click 和 pointer/touch `useDraggable` activator，并持续挂载 `category-column` 与 before/after reorder targets；PointerSensor 的 5px activation constraint区分点击和mouse drag，TouchSensor提供200ms/5px long-press contract，不增加drag-handle focus stop。Keyboard排序由`CategoryManager`的Move Up / Move Down命令拥有。
- `WorkspaceMenu` 把 topbar trigger 分成 Mantine `leftSection` emoji、可截断 label 和 `rightSection` chevron 三个布局槽位；不能把 emoji、name 和 chevron 作为同一个 label 的普通 children 再把 gap 加到外层。`CategoryNav` 的 label/count gap 由真正包含两者的 Button label owner 持有，并在 selected Category 或 nav 尺寸变化时通过 `requestAnimationFrame` + `ResizeObserver` 将 active item 恢复到可视区。
- Compound-control rendered tests 测量相邻可见槽位的 `getBoundingClientRect()`，覆盖默认与 ZWJ emoji、长名称、desktop/compact、Category count 和 Session metadata。父容器无 overflow、axe 通过或 DOM boxes 存在不能单独证明彩色 emoji 字形和相邻文字之间有安全间距。
- Category rename/color 与完整 order 使用 compare-and-set mutation：Edit modal 在打开时捕获 expected `{name,color}`；Manage Move/native drop 从 rendered categories 捕获完整 expected order；topbar resolver 把其 state snapshot 的 canonical order 写入 typed `reorder-category` intent。Store facade 只复制并序列化这些快照，不重读最新 Zustand 来补 expected 值。
- Authority 在 replay 判定前验证 folder ownership、normalized supported name/color，以及 expected/target complete canonical order。Expected 匹配才应用；target 匹配还必须有同一 mutation timestamp witness（folder 使用 `folder.updatedAt`，order 使用 top-level `state.updatedAt`）才视为 exact replay且不推进 revision/timestamp。其它状态以 `CATEGORY_MUTATION_CONFLICT` 拒绝；unrelated mutation 推进 order witness 后允许保守冲突，安全优先于宽松 replay。
- `src/shared/components/Favicon.tsx` 是 Open Tabs、saved links 与 info overlays 的固定尺寸 favicon owner，统一 lazy loading、decorative alt 和 failure fallback；inactive `SessionCardShell` 不挂载图片。

### `src/options/`

- `useOptionsSettings()` 通过 `useSyncExternalStore` 读取和订阅 SettingsProjection；Basic settings 不依赖 Zustand application store 或完整 `TabBoardState` hydration。
- Options 静态 shell 不以 projection I/O 为 render gate：header/Open Manager 立即挂载，Basic fieldset 在 hydration 前 disabled + `aria-busy`，Advanced 等 projection 可用后再出现。
- settings mutation 仍发送既有 worker mutation RPC，并以 authoritative response 更新 projection；optimistic failure 回滚到提交前 projection。
- `useOptionsSettings()` 同时拥有 settings mutation queue 的 `loading / idle / saving / saved / error` 状态和失败 retry patch；Options 不再用 component-local state 猜测 persistence 时序。自定义过滤草稿只在 debounce owner 中维护 draft pending。
- `RestoreSettingsSection` 把现有 `restoreGroupsInNewWindow` / `restoreNextToCurrent` booleans 投影为 Destination / Placement 策略；New window 只禁用不适用的 Placement UI，不改 schema，也不清除用户偏好。
- `OptionsApp` 只在 Advanced disclosure 打开时 lazy-load `AdvancedSettingsContent`。Storage location、file migration、disconnect/reset dialogs 和 Storage Authority 都不进入默认 Options preload graph；Advanced 打开后直接渲染 Storage、deletion confirmation、Keyboard shortcuts 和 Reset 四个 A2 setting rows，不增加单项二级 section。
- `DataStorageCard` 只读取/订阅 `StorageStatusProjection`，不读取 canonical state、Zustand 或 IndexedDB handle。Fallback 时 configured target 仍是 File，active backend 才是 Browser；UI 保留 folder identity、reason 和 `meta.json.updatedAt` freshness。

### `src/popup/`

- `popup.html` 在 React 执行前直接提供 320×180 的不可交互静态 loading shell，让 Chrome 能立即确定原生 Popup 尺寸并绘制启动反馈；React 首次 commit 后替换该内容。
- `usePopupSettings()` 只读并订阅 `tabboardSettingsProjection`。投影有效时不导入 Zustand application store、Authoritative Publication 或 Storage Authority；投影缺失或损坏时才动态导入 `activeAdapter` 执行一次 canonical repair。
- `PopupApp` 首次挂载时并行启动 settings projection 和 `chrome.tabs.query({ currentWindow: true })`。同一在途读取和查询在 Strict Mode effect replay 中复用；新的 Popup page generation 仍重新读取当前窗口。
- 两项输入 settle 前保持 loading；settings 失败时使用 `DEFAULT_SETTINGS` 并显示错误，Tab 查询失败时以 0 tabs 渲染并显示错误。Save/Remove 继续使用既有 worker actions。

### 图标

- 使用 `lucide-react`；`TabBoardIcon` 固定 18px toolbar / 16px menu / 48px empty glyph 与 1.75 stroke。
- `AccessibleIconAction` 通过 Mantine `ActionIcon` / `Tooltip` 统一 32px desktop、44px coarse hit area、accessible name 和 selected/danger/disabled states。
- icon-only 按钮提供 tooltip 和 `aria-label`。
- A1 Light / D1 Graphite semantic CSS tokens桥接 Mantine body/default/border/primary variables；Manager Canvas、Sidebar、Toolbar、Session/overlay surface分别使用命名层级。

## State Schema

State canonical key 在浏览器存储后端下是 `chrome.storage.local["tabboardState"]`；当启用文件存储后端时，state 拆分为本地文件夹中的多个 JSON 文件（见「File Store Layout」）。`chrome.storage.local` 仍保留极小的 `tabboardStorageConfig` status projection，用于启动判定、Options 展示和 fallback recovery。`quickList` 字段已从 schema 移除（Quick list / Pinned workflow 于 2026-07-06 下线）；`normalizeState()` 读到历史数据里的 `quickList` 时，会把其中的 items 迁移成一个名为 `Former Quick list` 的普通 session 插到 groups 头部，保证不丢数据，之后不再保留该字段。

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
  emoji,
  createdAt,
  updatedAt
}
```

默认 workspace：

- `id: "workspace_default"`。
- `name: "Personal"`。
- legacy/missing emoji normalize 为 `DEFAULT_WORKSPACE_EMOJI`；Create/Edit 使用一个 NFC 单 grapheme emoji。

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
  actionClick: 'popup',
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

`customUrlFilter` 由 shared capture policy 统一用于 Open Tabs、capture 和 DnD eligibility；命中规则的 open tab 不返回给列表，实际 Chrome 权限限制仍由平台决定。`storageMode` 与 `storageFolderName` 是 legacy-compatible canonical settings，不用于启动或 Options status；真正的权威是 `chrome.storage.local["tabboardStorageConfig"]` 中的 `StorageStatusProjection`。

### File Store Layout

当 configured target 与 active backend 都为 File 时，`FileStorageAdapter` 在用户选择的目录下维护如下结构：

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

- `meta.json` 是提交点（commit point），字段包括 `version`、`mutationRevision`、`createdAt`、`updatedAt`、`sessionOrder`、`writeInProgress`。`sessionOrder` 持久化 `sessions/<id>.json` 对应的 canonical Session 顺序，读取时不得依赖文件系统目录枚举顺序；旧数据缺少该字段时先兼容加载，并在下一次成功提交时自动回填。
- 顶层文件分别对应 state 中同名字段；`categoryOrder.json` 存储 `categoryOrderByWorkspace`，`ledger.json` 存储 `dropOperationLedger`。
- `sessions/<id>.json` 存储单个 group/session 对象；文件名为 group id。

所有文件写入采用两阶段提交（参见「Persistence / 两阶段提交」）：

1. 写 `meta.json` 置 `writeInProgress: true`、记录 `pendingRevision`。
2. 对本次需要变更的每个数据文件，先写同目录临时文件（如 `settings.json.tmp-<uuid>`），完成后 rename 覆盖目标文件，保证单文件原子替换。
3. 最后写 `meta.json` 置 `writeInProgress: false`，把 `revision` 推进到 `pendingRevision`。

加载时若 `meta.json.writeInProgress === true`，表示上一次写入未完成，丢弃该批次，以上一次 `revision` 对应的文件集合为准。`sessions/` 中未被任何 workspace/group 索引引用的孤立文件不会被加载，也不会在正常写入中主动删除；清理动作通过显式的 garbage collect 路径触发。

文件夹句柄通过原生 IndexedDB（单 database、单 object store，仅 put/get/delete）持久化，不引入额外依赖。启动时 `activeAdapter` 先读取 status projection 的 `activeBackend`，只有 File 时才加载 IndexedDB handle/file modules；若句柄缺失、权限被撤销或 IO 失败，自动降级为 `ChromeStorageAdapter`，同时保持 configured target 为 File。

### Migration（存储后端切换）

Options 中连接本地文件夹时提供三种迁移模式（由 UI 派发迁移消息给 adapter 层执行）：

- `use-file`：加载文件夹现有数据并切换激活后端为 file；浏览器存储数据保留但不再是权威源。
- `export-browser`：把当前浏览器存储的完整 normalized state 写入空文件夹（走两阶段提交），提交 status projection 后切换激活后端为 File。
- `merge`：读取文件夹数据 + 浏览器存储数据，按 ID 合并（同 ID 以文件侧为准，浏览器侧独有追加），合并结果写回文件夹后切换激活后端为 file。

Storage Authority 把 bootstrap/handle 当作 mode-switch commit point：

- 切到 File：先创建并验证 File adapter、写入完整目标 state（暂不广播 ping），再保存 handle、写完整 File status projection，最后安装 File backend 并广播 committed ping。
- 切回 Browser：如需 copy-back，先完成 Chrome state 写入，再写 Browser status projection、清 handle，最后安装 Chrome backend。
- Reconnect：先验证目录权限并读取 File state，再保存 handle 与包含 folder name / file freshness 的 File projection，最后安装 File backend。

任何 pre-commit 步骤失败都会保留原 backend、bootstrap 和 handle；UI 不会把半完成切换显示为成功。

### Fallback（错误自动降级）

File backend 的初始化、读取、写入或 `reloadFromDisk()` 抛出错误（权限丢失、文件夹被删除/移动、IO 错误、配额不足等）时：

1. Storage Authority 记录 diagnostics，并保留最后一次成功读取/提交的 normalized snapshot。
2. 首个故障 context 将该 snapshot 写入 `ChromeStorageAdapter`，再原子替换内部 backend；收到 remote fallback event 的 context 直接读取已提交 Chrome state。authority object 本身不变。
3. Authority 将 status projection 更新为 `configuredTarget: file` + `activeBackend: browser`，保留 folder name、fallback reason 和最后一次成功 `meta.json.updatedAt`。
4. Authority 重绑 backend subscription，向当前 context listeners 发布 Chrome state，并通过 `storageEvents.ts` 通知其他存活 context 同步降级。
5. 触发失败的 File 写仍 reject；现有 mutation retry 负责在新 Chrome backend 上重试，避免误报 commit。
6. Manager toast提示降级；Options 仍把 Local Folder 作为主上下文，并提供 `Reconnect folder` 与 `Use browser storage`。

降级状态下，`Reconnect folder` 重新授权并验证 File state；`Use browser storage` 走安全 copy-back 后正式把 configured target 改成 Browser。

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
4. 如开启 `dedupeOnSave`，按符合保存资格的源 tab URL 去重，重复的非 pinned 源 tabs 关闭；pinned duplicates 保持打开。
5. `createTabRecord()` 转成 TabBoard tab records。
6. 按 windowId 分组。
7. `createGroupFromTabRecords()` 创建 session。
8. `updateState()` 将新 sessions 放到 groups 头部。
9. 根据 settings 打开或聚焦最近 manager tab，并带上 target group / feedback URL params。
10. 根据 settings 关闭已保存的非 pinned 源 tabs；pinned 源 tabs 即使已保存也保持打开。

重要边界：

- 如果没有 policy-eligible 的非 TabBoard tabs，会抛出 `No capturable tabs were found`，不会提交空 session；重复源 tabs 仍按 capture dedupe 设置处理。
- Source-tab dedupe 只针对本次 capture 的源 tabs，不因为历史 saved sessions 里已有同 URL 而跳过本次 session 内容。
- `dedupe-window` 是独立的当前窗口清理操作，只统计/关闭非 pinned duplicates。若桶内存在 pinned copy，保留全部 pinned 并关闭 regular copies；否则保留 active tab，若无 active tab则保留 `lastAccessed` 最新的 tab。`src/shared/model/window-dedupe.ts` 是 worker、Popup 和 preview harness 共用的纯分类 owner，避免可见计数、测试环境和真实执行分叉。
- Popup Save scope 使用 capture policy（包括 Exclude URL rules）；Remove duplicate scope 使用 window-dedupe eligibility，不受 capture filter 影响。两个 scope 分别从同一当前窗口快照派生，但不会互相复用过滤结果。
- Capture 不提供自定义 URL pattern；pinned、Chrome 和 file URL 资格由 shared capture policy 和对应 settings 控制，实际保存和恢复能力仍是 Chrome 平台边界。
- 如果 manager tab 是保存过程中打开的，关闭源 tabs 时会排除 manager tab。

### Manager Open Tabs

流程：

1. `ManagerLayout` 创建一个 `useOpenTabsRuntime()` workflow，并把它传给 Sidebar；workflow 的 React adapter 调用 runtime message `list-open-tabs`。
2. Background 使用 `chrome.windows.getAll({ populate: true })`，先按当前 extension base URL 排除 TabBoard 自身 manager、popup、options 等页面，再为 window 返回过滤后可见 rows 的 `tabCount`。`OpenTabInfo` 不携带 Chrome `active` 字段；UI 不表达 Active Tab。
3. `getCaptureCandidateReason()` 使用 shared capture policy 判定其余 tab 是否 storable；命中 `customUrlFilter` 的 rows 不返回，没有 usable URL 的 rows 被拒绝。
4. `openTabsWorkflow.ts` reducer 原子应用 windows、selected window 与 selection pruning；projection 一次派生 filtered rows、selected records 和 selected record IDs，但不再从 ID count 派生 `selection.active`。
5. Manager 用 `OpenTabsWindowBar` 展示 window glyph/tab count、focused badge 与 disclosure command；不渲染 ordinal、raw ID、手动 Refresh 或整窗保存动作。唯一整窗 capture 入口由 `OpenTabsSelectionBar` 的 normal context bar 以 Save All 提供。`OpenTabsList` 一次只渲染 selected window rows，`OpenTabsFilterFooter` 持有 page-local query input，`OpenTabsSelectionBar` 同位渲染 normal / selection / collapsed 三种 context bar。
6. `OpenTabRow` 将 checkbox-over-favicon、`Go to <tab title>` 与 fine-pointer Close 分成独立控制。Peek/pinned/drawer 的 row surface 负责 pointer drag，title button 负责 keyboard Go to；collapsed rail 不渲染 title button，只保留无 role/tab stop/accessible label 的 favicon row 作为 pointer switch/drag surface。Collapsed keyboard tab order 只有 selected window glyph 与 context Expand，Filter/checkbox/Close 不挂载或不进入 tab order。
7. 任意 Open/saved checkbox 先通过 `useManagerSelectionScope()` 进入对应 `{windowId}` / `{groupId}` scope，再由 owner-local command 切换 ID。进入不同 scope 时 coordinator 同步调用旧 owner 的 clear callback；取消最后一个 ID 只改变 owner-local IDs，不退出 active scope。
8. Open Tabs Exit、sidebar collapse 或 selected source window 改变/失效会 exit + clear。Same-window refresh 即使把 selected IDs prune 到 0，也保留 active scope；drag overlay `SessionCard` 不接收 coordinator，因此不注册 saved clear callback。Selection/Filter 从 `peek` 开始时调用不写 preference 的 `promote()` 并 reflow；只有显式 Expand/Pin 调用 `pin()` 或 desktop `toggle(true)` 更新下次启动偏好，只有 `drawer` 让 topbar/main surface `inert`。
9. Selected window 使用与 selected capture 相同的 `saveSelectedTabs` worker contract。`captureWindow()` 只建立 selection/capture snapshot，不建立第二条 persistence path；completion 经 `Sidebar.onCaptureCompleted()` 进入 authoritative reveal。
10. Selected capture 在请求前快照 selected tab ids、window、workspace 和 select mode，并以 pending guard 防止重复提交；返回 `CaptureCompletion` 后仅在 snapshot 与当前选择一致时清空 IDs。ManagerLayout 直接消费 completion 做 toast/reveal，不经过 window event。
11. `chrome.storage.onChanged` 直接恢复正常 manager render。
12. Open Tabs refresh 不清空当前 `windows` state，也不渲染 loading row。并发 refresh 保持一个 active run + 一个 queued rerun，请求成功后 reducer 一次替换 rows，请求失败则保留旧列表并显示错误；UI 不提供手动 Refresh command。
13. Shared preview portal 的 layout measurement 只在 `position === null` 时提交一次定位 state；后续 commits 仍检查 trigger 是否已脱离 DOM，但不得重复派发同一 preview 的 position。Saved-link activation 会停止冒泡并先关闭 preview，避免 document-level preview click handler 在同一事件末尾将其重新打开。Window blur / document hidden 会关闭 overlay 并暂时抑制 CSS hover/focus disclosure；只有后续真实 pointer/keyboard interaction 才解除，避免 Chrome 返回前台时复用失焦前的 stale hover target。
14. `OpenTabsPanel` 只保留 workflow、selection coordinator、confirmation 与 focus orchestration；它不拥有 Chrome API、ScrollArea、row rendering 或 filter input。Open Tab info actions复用 overlay focus lifecycle，但使用命名普通 button 语义，不伪装成 menuitem。

### Manager UI ownership

- `ManagerDndCoordinator` 只组合 drag lifecycle；pure collision/marker geometry 在 `managerDndGeometry.ts`，Pointer/Touch sensors 在 `useManagerDndSensors.ts`，preview rendering 在 `ManagerDragOverlay.tsx`。Keyboard 结果由 Manage commands / Session target picker 提供，不注册 `KeyboardSensor`。
- `SessionCard` 只拥有 local state、store commands 与 menu model；header/actions/meta、note editor、sortable tab list 分别由 `SessionCardHeader`、`SessionCardMeta`、`SessionCardEditor`、`SessionTabList` 负责。
- `OpenTabsPanel` 组合 window bar、selection bar、list 和 filter footer；row 拖拽与动作由 `OpenTabRow` 负责。
- `useOverflowCues()` 统一监听 board/session/Open Tabs scroll owner，使用 passive scroll、ResizeObserver 和 MutationObserver投影 start/end data attributes；它不拦截 wheel。
- `AccessibleIconAction` 统一 icon-only action 的 accessible name、Tooltip、默认 neutral `subtle` variant 与 compact/touch density；只有显式 selected/danger/filled caller 改写其状态。Session Header 和 Open/Saved trailing X 均复用该 owner，fine pointer 使用 32px、drawer/coarse 使用 44px。普通页面 confirmation 可提供显式 `finalFocusRef`；Manager destructive flow 继续使用 overlay focus-intent owner。

### Manager 启动与降级

Manager 启动由 `useStoreHydration()` 委托 Authoritative Publication。publication 先订阅 Storage Authority，再调用一次 `initializeAuthoritativeState()`；当前 browser/file backend 的 `ensureActiveState()` 同时完成初始化和 canonical read。read/subscribe gap 中到达的 state 先 buffer，最后按 mutationRevision 优先、updatedAt 次优选取最新值并做 structural sharing。页面 hydration 不发送 `tabboard-ensure-state`，也不经 worker 往返完整 state；worker 继续拥有 mutation serialization、capture/restore 和 Chrome API。

`useOpenTabsRuntime()` 与 hydration 并行发起一次 initial request。focus、visibility、tab/window lifecycle event 经过 75ms coalescer：同一时刻只有一个 active run，in-flight burst 最多生成一个 trailing run；Manager 自己的 extension page created/updated event 被忽略。UI 不提供手动 Refresh。

`releaseHydration()` 只使当前 UI generation 和旧 subscription callback 失效，不 teardown Storage Authority backend，也不破坏正在持久化的 mutation。页面或测试 context 整体替换时，publication generation 会拒绝旧 waiter、取消旧 timer、回滚真正未完成的 optimistic projection，并让旧 RPC continuation 无法覆盖新 context。错误按阶段降级：popover 失败只关闭信息浮层，storage 失败保留默认 normalized state，migration 失败保留已加载 sessions，shell 失败停止后续启动，Open Tabs 失败保留空面板并提示；loaded/render 失败则保留已启动的基础界面并提示。

### Popup 启动

Popup 正常启动不进入 Manager 的 Authoritative Publication。`popup.html` 先绘制静态首帧，随后 `usePopupSettings()` 与 current-window Tab query 并行。设置投影是可修复 read model，不是第二写入真相；只有缺失或损坏时才读取 canonical state。生产门禁要求正常路径 canonical read 为 0、projection read 为 1、current-window query 为 1，并禁止 `popup.html` 同步 preload `useTabBoardStore` 或 `activeAdapter`。

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
- `new-session-insert`：Saved/Open tabs 精确命中 start / between / end Gap Anchor 或 empty Category first slot 后，在指定 index 创建 Session。

DnD 生命周期（React 侧，`ManagerLayout`）：

- Sensors：`useManagerDndSensors()` 只注册 `PointerSensor`（`activationConstraint.distance = 5px`）与 `TouchSensor`（`delay 200ms` + `tolerance 5px`）。各 surface 将 touch pointer 从 PointerSensor 排除并显式转发 `onTouchStart`，避免 5px pointer path 抢先于 long-press contract。
- 不注册 `KeyboardSensor`，也不保留 visible/hidden activator focus stop。Keyboard 等价结果由 Manage Move Up/Down、Session named Before/After picker、Saved Move 与 Open Save to picker提供。
- Session 的 group `useSortable` 仍唯一位于 `SessionSlot`；`SessionSortableBindings` 只向 card/shell 提供 listeners、node ref 和 style，不向 surface spread sortable attributes，也不提供 activator focus ref。完整 card 的 title、metadata、只读 note 与空白转发 pointer/touch listeners；actions、编辑控件、selection toolbar 与 tab list 被明确排除。Inactive `SessionCardShell` 的非交互表面使用同一规则。
- Open/Saved rows 与 Category tab 同样拆分 pointer/touch event routing；交互子控件不启动 drag。Resting UI 只用 `grab` / `grabbing`，不显示 drag icon。
- Collision detection：自定义 `createGeometryCollisionDetection()` 取代默认算法。它按指针到候选 rect 的距离排序、用 `isCompatibleTarget()` 过滤掉当前 payload 不支持的 target（例如 session drag 不会被 tab row 抢走），并对 `tab-before` 用 `getTabDropPlacement()`（上/下 25% 边缘 → before/after，中间 50% → 收敛为 `group-body`）细化落点。
- Target 锁定：`lockDropTarget()` 用 `DROP_TARGET_RELEASE_MARGIN`（12px）hysteresis 保持已选 target，减少横向 board 重排导致的边界回闪；`category-column` 命中时优先直接选中，不参与锁定。
- Exact Gap Anchor：`new-session-insert` 只在真实 `pointerCoordinates` 位于 measured 20x20px rect 内时胜出，不经过 nearest-distance 或 12px lock。离开 rect 立即失活；`getDragEndTarget()` 只在 drag-end over 与 UI active exact target相同后返回它。
- `onDragStart` 记录 `event.active.rect.current.initial` 作为 `sourceRect`，并快照 `dragReplacementKey`（workspace + category + view + groups 指纹）。`onDragOver` 由 collision 结果算出 `target` 与 `markerForTarget()` 生成的插入标记。`onDragEnd` 用 `getDragEndTarget()` 取最终 target。
- Overlay：`DragOverlay`（`dropAnimation={null}`）渲染跟随指针的 immutable preview。Saved/Open items 在 drag start 快照 `previewItems` 和 bounded geometry；pickup、Existing、Gap Anchor 与 empty target 之间不更换模板或尺寸。Item preview 半透明且 `pointer-events: none`，overlay z-index 高于所有 plus。
- Board auto-scroll：`useBoardDragAutoScroll()` 是唯一 owner，`DndContext autoScroll={false}`。它从 native pointer/touch viewport coordinate ref读取位置，在 Board 左右 48px edge zone内按 3–12px/frame 线性滚动，并在每帧后 remeasure droppables。Exact plus active时暂停，离开后通过 imperative wake恢复；普通 pointermove hot path只写ref，不重渲染Manager subtree。

Intent 解析与提交：

- `resolveDrop({ payload, target, state, openTabs })` 是唯一裁决点，先校验 workspace 边界（`isValidWorkspaceBoundary`，且 `target.workspaceId === payload.workspaceId`），再按 payload 类型分派，产出 typed `DropIntent`（`move-session` / `reorder-category` / `move-tabs` / `copy-open-tabs` / `create-session`）或返回 `null`。
- Ownership/边界校验全部在 resolver 内：group/tab 必须属于当前 workspace（`getOwnedGroup` / `getOwnedTab`），category 必须存在（`isOwnedCategory`），插入 index 必须合法（`isValidInsertionIndex`），open-tabs 必须仍是 storable candidate（复用 `isStorableCaptureCandidate`）。同 session 内移动会用 `isSavedTabMoveNoOp()` 剔除 no-op，避免误删或空提交。
- session body 不会产出 merge intent：拖 session 只能落到 `group-insert` / `category-column`，不能落进另一张 session 内部，从根本上排除"把 A 合并进 B"的误操作。
- `new-session-insert` 只接受 `tab` / `tabs` / `open-tabs`。若 `tabs` 是一个源 Session 的全部 canonical tabs，`isAllSourceTabs()` 同时从 pointer Gap Anchors 与 keyboard New choices移除创建路径，但保留 Existing Session merge。
- 提交走 `useTabBoardStore.applyDropIntent(intent, openTabs)` → `AuthoritativePublication.commitDrop()`（带 `operationId` 与 `expectedRevision`）。publication 的 Promise 等待 worker authoritative commit；worker `statePersistence` 调用 shared `stateMutations`，最终由 `drop-operations.ts` 执行 intent并生成replay evidence。`persistDropWithFeedback()` 统一 success/error toast。

拖拽期间的一致性保护：

- `shouldInvalidateDragReplacement()`：拖拽进行中若 workspace/category/view/groups 指纹变化，或拖拽源已不再渲染（`isDragSourceStillRendered`），则调用 `finishDrag()` 主动收尾，避免落到过期布局。
- `handleOpenTabsSourceKeyChange()`：Open Tabs 列表在拖拽中被刷新替换时，取消进行中的 `open-tabs` 拖拽。
- `Escape` 键与组件卸载都会触发 `finishDrag()`；`onDragStart` 通过 `useDndMonitor` 关闭所有 info overlay，避免浮层遮挡 drop target。

板面与 sidebar 布局（与 DnD 相关的部分）：

- 顶部 category tabs 按 `categoryOrderByWorkspace` 排序，点击切换 `selectedCategory`；右侧 board 只渲染当前 active category，单行横向滚动，每张 session card 全高、card 内 `tab-list` 独立纵向滚动。
- 非空 Category 在 start / between / end 各挂载 20x20px fine-pointer `NewSessionGapTarget`；active只改变 plus material并产生 delayed pointer tip，不插入临时 Session。Canonical empty Category使用完整第一条 340px Session slot作为 target，居中 plus仅是 affordance。
- 左侧 sidebar disclosure 使用 `collapsed / peek / pinned / drawer` state；`tabboard.sidebarCollapsed` 只记录 explicit desktop pinned/collapsed preference，不记录 transient state。Collapsed rail 只投影 selected window 的 tab identity，favicon row仍复用现有 pointer drag/focus commands，但不进入 accessibility tree/tab order；active drag 期间通过 `manager-shell--open-tabs-drag-active` 让 sidebar overlay 让出 pointer events。

已知敏感点：

- DnD 逻辑仍是最脆弱的区域之一，但脆弱点已从"原生事件时序"转移到"collision detection 几何 + target 锁定 hysteresis + 拖拽中布局失效"三者的交互。
- `resolveDrop` 是行为契约的中心，任何落点语义调整都应先在 `src/manager/core/dnd.test.ts` 加用例，再改 UI。
- `drop-operations.ts` 是持久化执行/replay契约中心；wire shape、stable identity或execution调整先在 shared direct tests加用例。
- 自动化覆盖 typed resolver、exact/ordinary geometry、auto-scroll、replacement cleanup 与 Hybrid Commands；`tests/e2e/session-dnd.e2e.ts` / `dnd-acceptance.e2e.ts` 串行覆盖 Workspace/Category/Session/Saved/Open pointer paths 和 keyboard command结果。更细的 extension lifecycle 仍需 unpacked Chrome 手工验证。

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

Manager page-local navigation state 由 `src/manager/core/managerPageState.ts` 纯 owner 与 `src/manager/hooks/useManagerPageState.ts` React adapter 负责。它只管理 URL 中的 `workspace/category/view/q`，不进入 `TabBoardState`、Storage Authority 或 Zustand persistent projection。Navigation 使用 `pushState`，搜索使用 `replaceState`，`popstate` 反向恢复页面；history side effect 在 state updater 外执行，避免 StrictMode 重放 updater 时重复写入。Workspace create/select 以一个 atomic state push workspace/category/view，active delete replacement 以一个 atomic replace 覆盖已失效 entry；ManagerLayout 只把仍存在于 workspace projection 的 page Workspace 同步到 store。validation 复用 shared category ownership，拒绝不存在或跨 workspace 的 folder category。

Workspace create/rename UI 由 `WorkspaceMenu` 管理 validated modal；不使用 `window.prompt`。Sidebar disclosure 由 `useSidebarDisclosure` 单一拥有 `collapsed / peek / pinned / drawer`：desktop pointer/focus intent 共享可清理的 350ms timer，任一 intent 保持时 peek 不收回；pinned 进入 grid，peek/drawer 使用 overlay，只有 drawer 产生 inert。Selection/Filter 使用 `promote()` 从 peek 进入本次页面的 pinned layout 但不写 preference；只有显式 Expand/Pin 或 desktop Collapse 更新 `tabboard.sidebarCollapsed`。Header global actions 固定为 direct Bin + More，More 只包含 Import、Export、Options。

Sidebar motion 由 CSS 负责，不增加 animation-specific React state。`manager-shell` 的 grid track 与 `.manager-sidebar__overlay` width 共享 180ms C1 easing；Peek/Drawer 只改变 overlay width 和 shadow。Open Tab Focus、Filter、context/header utilities 常驻 DOM，由 `.manager-sidebar__expanded-content` 统一做 75ms delayed 80ms opacity reveal；collapsed 时它们 disabled / `aria-hidden` / `tabIndex=-1` / inert，不进入 pointer 或 keyboard path。Overlay 使用 `overflow: clip`，避免成为 `scrollIntoView()` 的意外横向 scroll owner；Window switcher 和 Open Tabs list 保持各自的滚动 ownership。Rendered E2E 必须采样中间帧、快速反向、icon center、Drawer gaps 和 reduced motion，不能只断言最终 class/offset。

Manage Workspaces / Manage Categories 的 nested editor 在打开与 exit transition 期间保持 parent dialog inert、trap disabled。Child exit 完成后，parent owner 先把 exact Edit trigger 的 row action 恢复为 visible/tabbable，并临时加 `data-autofocus`，再启用 parent FocusTrap；浏览器最终焦点因此回到触发对象而不是 parent Close。

`TabBoardModal` 还拥有可选 `headerSubtitle` / `headerAction` 插槽。Title 与 subtitle 位于独立 copy block，dialog 仍只由 H2 的 id 关联；header action 是 H2 的兄弟节点并位于 Close 前。Workspace/Category management 复用该 owner 展示动态对象数量和 New/Add，底部 `manager-management-footer` 单独承载 Done。Coarse pointer 只放大带 header action 的 management modal targets，不全局改变普通确认弹窗。

Options 的 Advanced disclosure 使用页面 URL 中的 `advanced=1`，通过 `replaceState` 同步，不进入 persistent settings。`useColorScheme` 在首个 client render 直接读取 system preference，`usePageTheme` 同步 native `color-scheme` 与匹配实际 body 背景的 `theme-color`。Manager 使用专属 Mantine theme：Tooltip/Menu portal 到 `#manager-main`；fixed Modal/Confirm 由 shared `TabBoardModal` portal 到 `body`，避免 flex/grid main 中的 fixed content 被偏移到视口外。该 compound owner 将 Mantine `Modal.Header` 标记为 `role="presentation"`，同时保留 `Modal.Title` 的 H2/id 和 dialog `aria-labelledby`。Floating transitions 仍为 0ms，避免关闭过渡留下半透明的可访问性节点。

状态更新路径：

1. UI DnD resolver生成 shared typed `DropIntent`；其他 UI action生成 typed `StateMutation`。
2. shared drop validation / mutation layer验证 immutable state preconditions，包括 ownership、locked、URL、index 和 workspace。
3. `useTabBoardStore` 领域 facade 把 action 交给唯一 Authoritative Publication instance；publication 同步发布 optimistic projection，并按 ordinary/drop/category/restore 语义调度 mutation。
4. worker `statePersistence` 串行验证并提交 mutation batch，返回 authoritative state、partial commit indexes 或 semantic error evidence。
5. Storage Authority publication 回流到 publication subscription；有 pending/in-flight work 时先缓冲，batch settle 后按 revision/timestamp 选最新 remote base并安全重放 committed mutation。
6. Publication 在发布 reconciled state 前执行 semantic structural sharing，复用未变化的 workspace/folder/group/tab 等实体引用；drop/category waiter 只在 authoritative outcome 后 settle。
7. Publication确认mutation committed或决定surface error后，Zustand adapter通过pure mapper发布typed `ApplicationFeedback`。Partial commit只映射committed indexes，transient retry与`notify: false`不publish。
8. Manager page的toast hook订阅同页feedback channel；Options/Popup无subscriber，publish为no-op。Channel不跨page、不replay，listener失败不影响persistence结果。
9. React 根据共享后的 projection 重绘，并由capture outcome/overlay lifecycle恢复focus；capture/drop等caller-owned feedback继续直接返回结果，不重复经过channel。

`delete-tabs`是该默认 optimistic规则的窄例外：`commitChecked()`不先改Zustand projection，Promise只在authoritative batch确认后resolve；terminal/retry exhaustion reject时projection保持或恢复为authority snapshot。该边界让Session toolbar遵守“实际成功才清selection”，同时避免把多个`delete-tab` ordinary mutations拆分提交造成部分成功。

### 大 board 性能

`WorkspaceContent` 为当前 category 的每个 session 保留一个稳定 `SessionSlot` 和全部 group insertion targets，维持 `@dnd-kit` horizontal collision/measurement 与 reorder geometry。`useSessionActivation()` 初始激活前 6 个 session，并以 board 为 root、左右 720px overscan 的 `IntersectionObserver` 单调激活接近视口的 slot；搜索/高亮/显式 shell title activation会强制升级目标，当前 active saved selection scope 的 group 也进入 forced set，避免仍在 board 中的 owner 因 activation context reset 被卸载。若 filter/category 使 active owner 真正离开 render tree，其 unregister cleanup 会同步 exit scope。active slot 渲染完整 `SessionCard`，inactive slot 渲染 `SessionCardShell`，后者保留 whole-surface pointer/touch drag、title与summary，但不创建 tab rows、tab sortables、row subscriptions 或 observers。缺少 IntersectionObserver 时退化为全部激活。

所有 session slot 仍留在 DOM，完整 tab row 不再常驻。TabBoard search 继续扫描 canonical state并激活匹配 session；浏览器 find-in-page 只能看到已激活 tab rows和远端 shell summary，这是用初次 mount 上限换取的明确取舍。Trash 最多保留 80 项，并继续使用 `content-visibility`。该行为由 `useSessionActivation.test.ts`、session ownership tests 和 `tests/e2e/large-board.e2e.ts`（60 slots、6 initial cards、远端 shell upgrade）守护。

Open Tabs 同样保留全部 rows 与每行的 DnD/focus/preview hooks。`useOpenTabsRuntime()` 用 `useDeferredValue` 延后 query，`openTabsWorkflow.ts` projection 统一派生 filtered rows 与 selection drag records；`.manager-open-tab-row` 使用 `content-visibility: auto` 与 intrinsic size 跳过 off-screen layout/paint。Overlay provider 的 document/window listeners 在生命周期内只绑定一次；commands 与 menu/preview observable state 分离，普通 row/card 只订阅自身 key 的 open boolean。

Board、session tab list 与 Open Tabs list使用同一条件 overflow cue模型。Cue 只在对应方向存在更多内容时出现，不改变 scroll position，也不接管纵向 wheel。Session header保持在独立 tab-list scroll owner之外。`SessionSlot` 继续拥有完整 DnD geometry，但普通 group slot 在 full-height track 内使用 `height: calc(100% - 8px)` 与 `margin-block: 3px 5px` 给极轻 elevation 留出可见空间；Empty Category full-slot target 仍保持 100% 高。Session Header action 使用 opacity/pointer progressive disclosure，键盘 focus 与 menu-open 继续保持可达。

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
- `useColorScheme` 首帧读取 `matchMedia`，并监听后续 system theme 变化。
- `usePageTheme` 同步 `color-scheme` 与 `meta[name=theme-color]`。Shared CSS 使用 A1 Light canvas `#f3f5f8` 与 D1 Graphite canvas `#1a1e24`，并将 Surface/Sidebar/Toolbar/Text/Accent 语义桥接到 Mantine variables。
- 日期、相对时间和可见计数分别由共享 `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` / `Intl.NumberFormat` owner 格式化。

Icons：

- 生产图标只使用 `lucide-react`；全局 stroke 1.75，toolbar/row 18px，menu leading 16px，empty state 48px。
- `TabBoardIcon` 与 `AccessibleIconAction` 统一几何/状态；icon-only 按钮提供 tooltip 和 `aria-label`。
- `TabBoardTooltip` 是普通 control tooltip 的唯一 owner：不附加 native `title`，pointerdown/click 清除可见层和 pending timer，并抑制当前 target 到真实 pointer move 或 leave。业务组件不得在 `AccessibleIconAction` 外再包 Tooltip。Tab hover 180ms 与 C3 description 550ms 仍由 Manager overlay 独立拥有。
- `tipLifecycle.ts` 是 page realm 的跨类型 ownership owner。Compact action、menu
  description、rich preview 和 drag hint 仍各自渲染，但 claim/release 共用一个
  pending timer/current owner；新 claim 会关闭旧 owner。Mantine menu trigger 通过
  `useManagerMenuOpening()` 区分 pointer 与 keyboard open。
- Window count/focused dot 与 favicon property badge 由 CSS 绘制，不混入第二套 icon library。

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
- `dev` / `build` / `preview` 显式使用 `vite.config.ts`；跟踪的 `vite.config.js` 只 re-export 该配置，防止 CLI 默认配置与程序化测试配置分叉。页面继续保留 modulepreload 与 file-only lazy chunks；生产 service worker chunk 必须静态引用 file/fs chunks，且不得包含指向它们的 dynamic `import()`。
- `check`：先 `build`，再由 `scripts/check-extension.mjs` 校验 Manifest entry、构建产物引用和 extension sanity；strict import graph gate拒绝任何 source SCC，并禁止 publication依赖UI/concrete storage、shared/background反向依赖Manager。

当前测试空白：

- 真实 Chrome custom-element/extension lifecycle、Shadow DOM keyboard/focus 和 file picker permission prompt 未由 Vitest 覆盖。
- `@dnd-kit` 的真实指针/touch 时序不能由 Vitest完整模拟；Playwright已覆盖 pointer paths、source replacement与reduced-motion auto-scroll，真实 touch long-press仍建议在设备或 DevTools touch emulation验证。
- Chrome capture/restore 与 sender integration 仍需要 unpacked extension 手工验证。

建议人工回归：

- 安装 unpacked extension。
- 展开/折叠 sidebar，并刷新确认 UI preference 保留；窄屏下确认 rail、compact window selector 和 toggle 仍可达。
- 切换多个 compact window selector，确认一次只显示 selected window，tab count 与 Chrome window 原始总数一致；新建 Chrome window 后自动选中。
- 确认 compact window selector 和 actions 位于 sidebar 顶部，切换 window 后只显示 selected window 的单一纵向 Open Tabs 列表；pinned row 与普通 row 同处列表并显示 inline badge。
- 按 Options policy 验证 pinned、Chrome 和 file URL rows 的 storable reason、checkbox、DnD 与 capture 结果保持一致。
- 输入 sidebar Filter tabs，确认只过滤当前 window rows；切换 window 或刷新 tabs 后，已有 `openTabFilter` 仍保留。
- 确认 sessions 单行横向滚动、每张 card 全高、tab list 在 card 内滚动。
- 从 Session title、metadata、note、空白分别起拖，确认 Restore/More/input/tab list不启动 Session drag；确认页面无 resting/hidden drag handle。
- 拖 Session 在同 Category重排、跨 Category移动；拖 Saved Tab在同 Session追加/重排、跨 Existing Session移动。
- 拖 Saved/Open单项与多选项到 Existing Session；分别精确命中 start / between / end `+` 和 empty Category first slot创建 Session。
- 全选一个源 Session 的 Saved Tabs，确认全部 New anchors / New picker choices隐藏，但 Existing merge仍可用。
- 在 Board左右48px edge验证渐进滚动；精确命中 `+` 时暂停，离开恢复；确认页面、Sidebar与Session tab list不滚动。
- 在 drag 中创建/关闭/更新 Chrome tab触发Open source replacement，确认旧 drag立即取消。
- 使用 `prefers-reduced-motion` 验证动画收敛但Board drag auto-scroll仍工作。
- 用键盘执行 Workspace/Category Move Up/Down、Session named Before/After、Saved Move与Open Save to；确认Escape不改数据且focus返回。
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
- 写入串行化：内部 `writeChain` 保证并发日志不会互相覆盖；info breadcrumb 在 250ms 内合并为一次 storage read/write，warn/error 立即触发当前 batch flush
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
- `file-storage: init` — 当前 Storage Authority backend 已完成初始化
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

`tests/e2e/`（Playwright）已提供Manager加载、pointer DnD、source replacement、reduced-motion auto-scroll与Hybrid Commands矩阵。Pointer拖拽在Playwright中模拟真实move序列并串行运行；`src/manager/core/dnd.test.ts`继续作为ownership/index/no-op resolver的主回归。真实touch long-press与unpacked extension lifecycle保留为手工Chrome验收。

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
