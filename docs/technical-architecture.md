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

State canonical key 是 `chrome.storage.local["tabboardState"]`。`quickList` 仍作为 state schema 字段保留（normalize 会补齐为空数组），但当前 UI 不读写 Quick list / Pinned workflow，也不再有历史数据迁移逻辑。

顶层结构：

```js
{
  version,
  workspaces,
  activeWorkspaceId,
  groups,
  folders,
  categoryOrderByWorkspace,
  quickList,
  bin,
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

### Manager 启动与降级

Manager 启动先由 React shell 和 `useStoreHydration()` 生成 normalized default state，准备并渲染可用 layout，同时由 `useOpenTabsRuntime()` 发起 Open Tabs 请求；storage state 在后台异步读取，完成后再应用到当前页面。Mantine render 或 runtime message 失败只影响对应 surface，不应阻断基础 Manager shell。

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

Drag payload 类型：

- `group`
- `category`
- `open-tabs`
- `tab`
- `tabs`

Drop target 类型：

- `category-column`
- `group-body`
- `group-insert`
- `tab-before`
- `category-reorder`

重要实现点：

- `closestSupportedDropTarget()` 会跳过当前 drag kind 不支持的内部 drop target，避免 session drag 被 tab row 抢走。
- Saved tab 插入使用上/下高亮线；单个或批量移动通过 model 的 `moveGroupTabs()` 原子验证目标、移除和插入，避免同 session 移动最后一项时误删 session。
- 左侧 sidebar 使用 `sidebar-collapsed` shell class 和 `tabboard.sidebarCollapsed` localStorage preference；该状态不进入业务 state。`renderSidebarRail()` 复用 `buildSidebarRailModel()`，只投影 selected window 的 tab identity，不拥有 selection 或 DnD state。collapsed content 通过 absolute hover/focus overlay 显示，因此不改变 board grid geometry。
- Open Tabs body 使用单一纵向列表和 Filter tabs footer；pinned row 与普通 row共用列表，只显示 inline badge。rail 只聚焦既有 row/filter control，不生成 drag/drop target 或 payload。
- `managerInfoPopover` 是单例 interactive overlay；来自其 action slot 的 delegated click 在 mutation 前调用 `hide()`，并在下一帧把 focus 恢复到仍可用的 row、session 或 Open Tabs fallback，避免 DOM 重绘后出现断连 trigger、旧内容或隐藏 keyboard focus。active drag 会隐藏 collapsed overlay 并临时禁用其 pointer events，让 board drop target 继续接收 dragover/drop。
- 顶部 category tabs 复用 `folderList` 和 `category-row`，按 `categoryOrderByWorkspace` 排序，点击后切换 `activeFilter`。
- 右侧 board 只渲染当前 active category；`category-section-grid` 使用单行 column-flow，sessions 横向滚动。
- Session card 充满 board 高度，`tab-list` 负责 card 内部纵向滚动。
- Session card 的视觉数据来自 `buildSessionCardView()`，favicon stack、link/note counts、status chips 和 overflow counts 可在 DOM 外测试。
- Action menu 使用 fixed positioning 和 `getFloatingMenuPosition()`，避免被 horizontal board overflow 裁切。
- Session 移动使用 `group-insert-marker` 作为 Move here placeholder。
- Session dragstart 会 seed marker 到源位置，并记录源卡片 rect，避免隐藏后的源卡片实时 rect 抢回 placeholder。
- Session drag image 使用源卡片位置的 visible clone，避免浏览器截不到 drag image。
- Session hover 到目标卡左右 25% 时按 before/after 插入；进入目标卡中间 50% 时使用 target slot 语义，让被拖拽 session 占目标位置、目标卡回填源空位。
- Target slot 进入后会记录目标卡原始 rect，并用 hysteresis margin 保持锁定，减少原生 DnD 与 grid 重排导致的边界回闪。

已知敏感点：

- HTML DnD 事件时序在 Chrome 中比较脆，尤其是原元素隐藏、drag image、placeholder 重排三者叠加时。
- 修改拖拽逻辑时应同时验证：
  - 拖 session 起始位置。
  - 拖 session 到同 category 前/后。
  - 拖 session 到其它 category。
  - 拖 saved tab 到已有 session。
  - 拖 saved tab 到新 session placeholder。
  - 多选 open tabs 拖拽。

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
- 原生 Drag and drop 浏览器事件时序未自动化覆盖，只有 typed resolver、geometry、lifecycle 和 cleanup contracts。
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

## 维护建议

1. 按 React Manager 边界维护功能

推荐拆分方向：

- UI 结构放在 `src/manager/components/`，按 shell、workspace、sidebar、session 和 overlay surface 保持高内聚。
- 页面生命周期与 Chrome runtime 适配放在 `src/manager/hooks/`。
- selectors、commands、capture、open-tabs 和 typed DnD 规则放在 `src/manager/core/`，优先保持纯函数和可执行测试。
- 状态 schema、normalize、mutation validation 与 persistence adapter 继续留在 `src/shared/` 和 `src/background/` 边界内。

2. 给 drag/drop 增加浏览器级测试

如果引入 Playwright 或 Chrome extension e2e，优先覆盖 session drag 起始位置、目标 placeholder 和 saved/open tabs 拖拽。

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
