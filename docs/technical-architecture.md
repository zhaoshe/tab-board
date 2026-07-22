# Technical Architecture

本文档描述 TabBoard 的技术结构、模块边界、数据模型和关键流程。目标是帮助后续维护者快速判断“改哪里、注意什么、怎么验证”。

## 技术栈

TabBoard 是 Chrome Manifest V3 extension，使用 React + TypeScript 开发，通过 Vite 构建，Manager 使用 Mantine，背景页和 shared model 保持明确边界。

运行环境：

- Chrome 115+。
- Manifest V3 service worker。
- Vite + `@crxjs/vite-plugin` 构建链；`manager.html` 的生产入口是 `src/manager/main.tsx`。
- React 18、Mantine v7、Zustand、`@dnd-kit`、`@tabler/icons-react`。
- `chrome.storage.local`。
- `chrome.tabs` / `chrome.windows` / `chrome.tabGroups` / `chrome.contextMenus` / `chrome.omnibox` / `chrome.runtime`。

React Manager 是唯一 Manager 实现，由 `manager.html` 加载 `src/manager/main.tsx` 构建产物。

## 文件结构

核心文件：

- `manifest.json`: extension 声明、权限、入口、new-tab override、commands、omnibox。
- `manager.html`: 生产 Manager HTML shell，加载 `/src/manager/main.tsx`。
- `src/manager/main.tsx` / `src/manager/ManagerApp.tsx`: React Manager 启动和应用 composition。
- `src/manager/components/`: Mantine shell、workspace header、sidebar/Open Tabs、session board、Bin、import/export、search 和 overlays。
- `src/manager/core/`: selectors、commands、capture、open-tabs、typed DnD 等纯 contracts，以及 core tests。
- `src/manager/hooks/`: hydration、runtime message、Open Tabs、overlay 和 derived group 生命周期。
- `src/background/service-worker.ts`: Chrome API boundary、capture/restore、runtime messages、sender verification。
- `src/background/statePersistence.ts`: serialized mutation queue、optional Web Locks、normalized atomic writes。
- `src/shared/model/`: schema/types、normalize、capture policy、import/export 和 search。
- `src/shared/store/`: `chrome.storage.local` adapter、immutable state mutations、mutation validation、Zustand store。
- `src/shared/styles/`: shared theme tokens。
- `scripts/check-extension.mjs`: extension 文件存在性、构建产物引用和 sanity checks。

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

不依赖 DOM，也不直接调用 Chrome APIs。

### `src/shared/store/`

负责客户端状态和持久化边界：

- `chromeStorage.ts` 封装 `chrome.storage.local`。
- `stateMutations.ts` 以 immutable commands 应用普通 state mutation，并拒绝无效引用、locked 目标和 link/note URL 形态错误。
- `mutationValidation.ts` 负责 untrusted/raw mutation boundary。
- `useTabBoardStore.ts` 提供 React 状态投影和 mutation 入口。

所有写入先 normalize；跨页面更新按 revision/hydration 规则应用，不能让旧快照覆盖较新 state。

### `src/background/`

负责 Chrome API 和持久化队列边界：

- `service-worker.ts` 处理 install/startup、toolbar action、context menu、commands、runtime message、omnibox、capture、restore 和 Chrome tab-group metadata。
- runtime message 先验证 extension sender id 与内部 extension URL；不可信 sender 在 storage 或 Chrome side effect 前拒绝。
- `statePersistence.ts` 串行化 mutation batch，使用可用的 Web Locks，执行 normalized atomic writes，并返回 committed/invalid/replay evidence。

### `src/manager/`

负责唯一生产 Manager：

- `main.tsx` 挂载 React app；`ManagerApp.tsx` 组合 Mantine shell、store hydration、runtime hooks 和 overlays。
- components 渲染 workspace/category topbar、可折叠 sidebar、selected-window Open Tabs、horizontal active-category board、session cards、modals 和 feedback。
- core modules 提供 selectors、capture snapshot ownership、open-tabs policy、commands、typed DnD、overlay/focus contracts；这些模块可在无 Chrome DOM 的测试中执行。
- DnD 不复用未类型化 payload；resolver 先校验 workspace/ownership/URL/locked/index 边界，session body 不产生 merge intent。
- capture 使用 selection snapshot 与 pending guard；反馈由 committed/reconciled outcome 决定，避免 stale response 清空新 selection 或错误 reveal。

### 图标

- 使用 `@tabler/icons-react` 提供的 React icon 组件。
- 通过 Mantine `ActionIcon` / `Tooltip` 组合成 icon button 或 icon+text button。
- icon-only 按钮提供 tooltip 和 `aria-label`。

## State Schema

State canonical key 是 `chrome.storage.local["tabboardState"]`。`quickList` 字段已从 schema 移除（Quick list / Pinned workflow 于 2026-07-06 下线）；`normalizeState()` 读到历史数据里的 `quickList` 时，会把其中的 items 迁移成一个名为 `Former Quick list` 的普通 session 插到 groups 头部，保证不丢数据，之后不再保留该字段。

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
}
```

`customUrlFilter` 由 shared capture policy 统一用于 Open Tabs、capture 和 DnD eligibility；命中规则的 open tab 不返回给列表，实际 Chrome 权限限制仍由平台决定。

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
3. `getCaptureCandidateReason()` 只拒绝 TabBoard 自身 extension 页、没有 usable URL 的 rows 和命中 `customUrlFilter` 的 URL；pinned、Chrome 和 file URLs 与普通 tab 一样处理。
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

1. Manager 调用 runtime message `list-open-tabs`。
2. Background 使用 `chrome.windows.getAll({ populate: true })`，先按当前 extension base URL 排除 TabBoard 自身 manager、popup、options 等页面，再为 window 返回过滤后可见 rows 的 `tabCount`。
3. `getCaptureCandidateReason()` 使用 shared capture policy 判定其余 tab 是否 storable；命中 `customUrlFilter` 的 rows 不返回，没有 usable URL 的 rows 被拒绝。
4. Manager 用 Mantine `Select` 展示 window ordinal 和 tab count；Chrome raw window ID 只作为 option value 使用，不显示给用户。一次只渲染 selected window 的 Open Tabs body。
5. Selected window 先用 sidebar `TextInput` query 过滤，再用 `sortOpenTabs()` 按 Chrome `tab.index` 排成单一纵向列表；pinned row 与普通 row 同处列表，并显示 inline badge/reason。
6. Selected window 可保存、从 More 清理重复 tabs、进入 select mode；已显示的普通 URL、pinned、Chrome 和 file rows 均可选择、拖拽和保存。
7. Select mode controls 位于 64px header rail 内，不改变 header 高度或移动 tab 列表；selected count 以 numeric badge 呈现并保留 aria-live 文本。
8. Selected capture 在请求前快照 selected tab ids、window、workspace 和 select mode，并以 pending guard 防止重复提交；返回后仅在 snapshot 与当前选择一致时清空，避免覆盖用户在请求期间的新选择。
9. `chrome.storage.onChanged` 直接恢复正常 manager render。
10. Open Tabs refresh 不清空当前 `windows` state，也不渲染 loading row；`loading` 只驱动顶部 Refresh icon 的旋转/`aria-busy` 状态，请求成功后一次替换 rows，请求失败则保留旧列表并显示错误。
11. Shared preview portal 的 layout measurement 只在 `position === null` 时提交一次定位 state；后续 commits 仍检查 trigger 是否已脱离 DOM，但不得重复派发同一 preview 的 position。Saved-link activation 会停止冒泡并先关闭 preview，避免 document-level preview click handler 在同一事件末尾将其重新打开。Window blur / document hidden 会关闭 overlay 并暂时抑制 CSS hover/focus disclosure；只有后续真实 pointer/keyboard interaction 才解除，避免 Chrome 返回前台时复用失焦前的 stale hover target。

### Manager 启动与降级

Manager 启动先由 React shell 和 `useStoreHydration()` 生成 normalized default state，准备并渲染可用 layout，同时由 `useOpenTabsRuntime()` 发起 Open Tabs 请求；storage state 在后台异步读取，完成后再应用到当前页面。Mantine render 或 runtime message 失败只影响对应 surface，不应阻断基础 Manager shell。

Hydration 不依赖 MV3 service worker：manager 作为页面可直接读写 `chrome.storage.local`，worker 只在**写入**时用于跨页面串行化。`store.hydrate()` 通过 `ensureStateForHydration()` 读取初始 state——优先发 `tabboard-ensure-state` 给 worker（顺便唤醒它、给空存储播种默认值），但**如果 worker 处于空闲挂起、冷启动竞态或消息通道断开**（典型报错 `Could not establish connection` / `message port closed`），则 catch 后降级为本地 `ensureState()` 直接读 `chrome.storage.local`。这样 worker 不可达时页面仍能正常起来，避免此前"单次 `sendMessage` 失败 → `hydrated` 永远为 false → 无限 loading 白屏"的问题。只有当 worker 与本地存储读取**同时失败**时，`hydrate()` 才会 reject，此时 `useStoreHydration` 记录错误并允许重试。

异步 storage apply 记录启动 revision；`chrome.storage.onChanged` 到达时先递增 revision 并应用新 state，旧的 storage 快照完成后若 revision 已变化则丢弃，避免旧快照覆盖新 state。错误按阶段降级：popover 失败只关闭信息浮层，storage 失败保留默认 normalized state，migration 失败保留已加载 sessions，shell 失败停止后续启动，Open Tabs 失败保留空面板并提示；loaded/render 失败则保留已启动的基础界面并提示。

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

TabBoard 的 DnD 基于 `@dnd-kit`（`@dnd-kit/core` + `@dnd-kit/sortable`），不再使用原生 HTML5 `draggable` / `dataTransfer` / `setDragImage`。单个 `DndContext` 位于 `src/manager/components/shell/ManagerLayout.tsx`，纯逻辑（payload/target 类型、intent resolver、几何锁定）集中在 `src/manager/core/dnd.ts`，可在 DOM 之外用 Vitest 覆盖。

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
- 提交走 `useTabBoardStore.applyDropIntent(intent, openTabs)` → `commitDropMutation`（带 `operationId` 与 `expectedRevision`），在 background persistence 队列内做 normalized 原子写入；`persistDropWithFeedback()` 统一 success/error toast。

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

1. UI 事件生成 typed `StateMutation` 或 typed `DropIntent`。
2. shared mutation layer 验证 immutable state preconditions，包括 ownership、locked、URL、index 和 workspace。
3. `useTabBoardStore` 与 background persistence queue 应用 normalized state。
4. `chrome.storage.onChanged` 通过 hydration/runtime hooks 回流；revision guard 丢弃过期快照。
5. React 根据 authoritative state 重绘，并由 capture outcome/overlay lifecycle 恢复 feedback 与 focus。

### 大 board 性能

`WorkspaceContent` 一次渲染当前 active category 的全部 session card（横向 track），不做 JS 虚拟化，以保持 `@dnd-kit` 的 collision/measurement、浏览器 find-in-page 与 `scrollIntoView` 正常工作。为控制成本，`.session-board__group-slot` 使用 CSS `content-visibility: auto` + `contain-intrinsic-size`：滚出视口的 session slot 跳过 layout/paint，但仍留在 DOM 中，可被拖拽 measurement、搜索定位和滚动命中。该行为由 `src/manager/core/layout.test.ts` 的 CSS 契约和 `tests/e2e/large-board.e2e.ts`（60 sessions 全部在 DOM、远端 card 可滚动可见）守护。若单 category 达到数百 session 仍出现压力，再评估引入真正的虚拟列表及其与 `@dnd-kit` 的兼容性。

## Search

Manager search：

- `searchQuery` 来自 URL `?q=` 或顶部 input，过滤当前 workspace 的 saved sessions。
- `openTabsQuery` 来自 sidebar footer，只过滤 selected browser window 的 pinned/regular rows。
- `openTabFilter` 来自可保存 open tab 的右键菜单，按 URL 过滤 saved sessions；window 切换和 Open Tabs refresh 不自动清除它。
- `visibleGroups()` 先按 workspace 过滤，再按 `groupMatchesQuery()` 和 `openTabFilter` 过滤。
- `getVisibleGroupTabs()` 决定 session 内 matching tabs；不做预览数量截断。

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

- `npm test`（Vitest，happy-dom）：React/core contracts，包括 selectors、state mutations、persistence queue、replay、capture ownership/feedback、typed DnD、Open Tabs policy、overlays、layout 和 hydration。
- `build`：`tsc --noEmit` 类型检查加 Vite/CRX 产物构建。
- `check`：先 `build`，再由 `scripts/check-extension.mjs` 校验 Manifest entry、构建产物引用和 extension sanity。

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
