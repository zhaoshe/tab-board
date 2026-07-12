# Technical Architecture

本文档描述 ZipTab 的技术结构、模块边界、数据模型和关键流程。目标是帮助后续维护者快速判断“改哪里、注意什么、怎么验证”。

## 技术栈

ZipTab 是一个无构建步骤的 Chrome Manifest V3 extension。

运行环境：

- Chrome 115+。
- Manifest V3 service worker。
- 原生 ES modules。
- 原生 DOM API。
- 本地 self-host 的 Web Awesome `3.10.0` Web Components，仅用于稳定的通用 shell controls。
- `chrome.storage.local`。
- `chrome.tabs` / `chrome.tabGroups` / `chrome.contextMenus` / `chrome.omnibox`。

项目没有 React、Vue、bundler 或 TypeScript。所有页面直接加载 `src/*.js` 和 CSS。

## 文件结构

核心文件：

- `manifest.json`: extension 声明、权限、入口、newtab override、commands、omnibox。
- `src/background.js`: service worker，负责 Chrome API、保存、恢复、右键菜单、omnibox、消息处理。
- `src/manager.js`: manager page 的主要 UI 和业务逻辑。
- `src/model.js`: state schema、normalize、数据创建、导入导出、匹配和工具函数。
- `src/store.js`: `chrome.storage.local` 的 get/set/update 封装。
- `src/icons.js`: 本地 SVG icon registry、按钮 hydrate、tooltip。
- `src/webawesome-controls.js`: 设置本地 Web Awesome base path，并静态注册 Manager 使用的 input/select/option/dropdown controls。
- `vendor/webawesome/`: 固定版本 `3.10.0` 的完整本地 runtime、license、来源说明和最终文件 checksums。
- `src/manager-view.js`: manager open windows model、sidebar filter/sort、selection reconciliation、DnD zone、session reorder/target-lock、session card view model、floating menu positioning、session action layout 的纯 helper。
- `src/popup-view.js`: popup quick actions、recent sessions、hover preview、empty copy 的纯 helper。
- `src/options-view.js`: options Basic / Advanced section 分组 helper。
- `src/feedback-copy.js`: popup、manager、options 共享的反馈文案 helper，包括 capture result counts。
- `manager.html`: 主工作台。
- `popup.html` / `src/popup.js`: toolbar popup。
- `options.html` / `src/options.js`: 设置页。
- `src/styles.css`: 主要 UI 样式。
- `tests/*.test.mjs`: 数据模型、background hardening 和 UI helper 单元测试。
- `scripts/check-extension.mjs`: extension 文件存在性、JS 语法和测试聚合检查。

## Manifest 能力

`manifest.json` 声明：

- `background.service_worker`: `src/background.js`。
- `action`: toolbar action。
- `options_page`: `options.html`。
- `chrome_url_overrides.newtab`: `manager.html`。
- `omnibox.keyword`: `zt`。
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

### `model.js`

负责纯数据逻辑：

- State schema。
- 默认设置。
- normalize 旧数据。
- 创建 workspace/folder/group/tab/note/bin entry。
- 校验同一 workspace 内 category 名称冲突。
- import/export text 解析。
- query matching。
- restorable 判断。

它不依赖 DOM，也不直接调用 Chrome APIs。

### `store.js`

负责持久化：

- `getState()`。
- `setState(nextState)`。
- `updateState(updater)`。
- `getSettings()`。
- `ensureState()`。

所有写入都会经过 `normalizeState()`，并更新 `updatedAt`。

### `background.js`

负责 Chrome API 边界：

- extension install/startup 初始化。
- toolbar action 行为。
- context menu 创建和点击处理。
- commands。
- runtime message。
- omnibox search。
- tabs capture。
- tabs restore。
- Chrome tab group metadata read/restore。

### `manager.js`

负责 manager page：

- 渲染 tabExtend-style 两栏 shell、右侧 workspace/category topbar、可折叠全高 sidebar、Open Tabs selected window、horizontal active category board、session cards、modals。
- manager 页面事件分发、compact window selector、workspace dropdown 和 sidebar localStorage UI preference。
- 稳定 shell controls 使用本地 Web Awesome `wa-input`、`wa-select` / `wa-option`、`wa-dropdown` / `wa-dropdown-item`；session cards、category tabs、saved/open tab rows、DnD targets 和 native context menu 保持 ZipTab 自定义 DOM。
- open tabs panel 顶部通过 compact window selector 和 actions 选择/操作 window，一次只渲染一个 selected window；所有有 URL 的非 ZipTab tabs 按 `tab.index` 进入单一纵向列表，pinned row 只以内联 badge 标记，底部 Filter tabs 只作用于当前 selected window。
- session/category/tab drag and drop。
- 保存后 target session 定位和 floating toast；selected open-tab capture 使用 selection snapshot 与 pending guard，只有 snapshot 仍匹配时才清空选择，并在同一 workspace 内切到 Inbox/highlight 新 session。
- inline rename。
- category create/rename 在 manager 的 Web Lock（可用时）保护下基于最新 state 做唯一性校验。
- bin modal。
- import/export modal。
- search modal。

纯 UI 决策尽量放在 `manager-view.js`，避免继续把可测试逻辑塞进 `manager.js`。

### `icons.js`

负责：

- 本地 SVG icon 定义。
- 将 `data-icon` 元素 hydrate 成 icon button 或 icon+text button。
- icon-only tooltip。

## State Schema

State 存储在 `chrome.storage.local["ziptabState"]`。`quickList` 仍保留为 legacy migration compatibility 字段，用于接收旧数据并迁移成普通 session；当前 UI 不读写 Quick list / Pinned workflow。

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
  collapsed,
  tabs,
  createdAt,
  updatedAt
}
```

规则：

- `workspaceId` 必须指向有效 workspace。
- `folderId` 必须指向有效 folder，否则 normalize 为 `null`。
- 如果 `starred === true`，`folderId` 会 normalize 为 `null`。
- session 的 category 是由 `starred` 和 `folderId` 共同推导出来的单一归属。

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
- Starred。

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

```js
{
  actionClick: "store",
  closeTabsAfterSave: true,
  dedupeOnSave: true,
  deleteRestoredTabs: true,
  focusRestoredTabs: true,
  openManagerAfterSave: true,
  restoreGroupsInNewWindow: false,
  restoreNextToCurrent: true,
  theme: "system"
}
```

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
3. `canCaptureTab()` 只排除没有 usable URL 或 ZipTab 自身 extension 页；pinned、`about:blank` 和其它特殊 URL 都进入 capture 尝试。
4. 如开启 `dedupeOnSave`，按符合保存资格的源 tab URL 去重，重复源 tabs 关闭。
5. `createTabRecord()` 转成 ZipTab tab records。
6. 按 windowId 分组。
7. `createGroupFromTabRecords()` 创建 session。
8. `updateState()` 将新 sessions 放到 groups 头部。
9. 根据 settings 打开或聚焦最近 manager tab，并带上 target group / feedback URL params。
10. 根据 settings 关闭已保存源 tabs。

重要边界：

- 如果没有有 URL 的非 ZipTab tabs，会返回 `storedTabs: 0`；重复源 tabs 仍按 capture dedupe 设置处理。
- Source-tab dedupe 只针对本次 capture 的源 tabs，不因为历史 saved sessions 里已有同 URL 而跳过本次 session 内容。
- Capture 不提供自定义 URL 或 pinned 过滤设置；Chrome 对受限 URL 的实际保存/恢复能力仍是平台边界。
- 如果 manager tab 是保存过程中打开的，关闭源 tabs 时会排除 manager tab。

### Manager Open Tabs

流程：

1. Manager 调用 runtime message `list-open-tabs`。
2. Background 使用 `chrome.windows.getAll({ populate: true })`，为 window 返回原始 `tabCount`。
3. `canCaptureTab()` 只排除没有 URL 或 ZipTab 自身 extension 页；其它有 URL 的 tabs（包括 pinned）都标记为可保存。
4. Manager 用 compact `wa-select` 展示 window ordinal 和 tab count；Chrome raw window ID 只作为 option value 使用，不显示给用户。一次只渲染 selected window 的 Open Tabs body。
5. Selected window 先用 `filterOpenTabs()` 过滤 sidebar `wa-input` query，再用 `sortOpenTabs()` 按 Chrome `tab.index` 排成单一纵向列表；pinned row 与普通 row 同处列表，只保留 inline badge。
6. Selected window 可保存、从 More 清理重复 tabs、进入 select mode；有 URL 的 row 都可进入选择、拖拽和 URL session filter。
7. Select mode controls 位于 64px header rail 内，不改变 header 高度或移动 tab 列表；selected count 以 numeric badge 呈现并保留 aria-live 文本。
8. Selected capture 在请求前快照 selected tab ids、window、workspace 和 select mode，并以 pending guard 防止重复提交；返回后仅在 snapshot 与当前选择一致时清空，避免覆盖用户在请求期间的新选择。
9. `chrome.storage.onChanged` 直接恢复正常 manager render。

### Manager 启动与降级

Manager 启动先同步生成 `normalizeState()` 默认 state，准备并渲染可用 shell，同时发起 Open Tabs 请求；storage state 在后台异步读取，完成后再应用到当前页面。`src/webawesome-controls.js` 作为独立的本地 Web Awesome module boundary 加载，失败只影响通用 shell controls，不应阻断 Manager 空 shell 首屏。

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
starred true       -> Starred
folderId exists    -> folder:<folderId>
otherwise          -> Inbox
```

移动 category 时：

- 目标是 Starred：`starred = true`, `folderId = null`。
- 目标是 Inbox：`starred = false`, `folderId = null`。
- 目标是 folder：`starred = false`, `folderId = folder.id`。

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
- 左侧 sidebar 使用 `sidebar-collapsed` shell class 和 `ziptab.sidebarCollapsed` localStorage preference；该状态不进入业务 state。`renderSidebarRail()` 复用 `buildSidebarRailModel()`，只投影 selected window 的 tab identity，不拥有 selection 或 DnD state。collapsed content 通过 absolute hover/focus overlay 显示，因此不改变 board grid geometry。
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

UI 使用手写 DOM：

- `h(tag, attrs, ...children)` 创建 DOM。
- `render()` 驱动 manager 页面重绘。
- 事件主要通过 document-level delegation 分发。
- Modals 使用原生 `<dialog>`。

主要渲染路径：

```text
render()
  -> renderSidebarState()
  -> renderWorkspaceSwitcher()
  -> renderStats()
  -> renderHeaderActions()
  -> renderActiveTabs()
  -> renderFolders()
  -> renderGroups()
```

状态更新后通常：

1. `updateState()` 写 storage。
2. 本地 `state = normalizeState(nextState)`。
3. 调用局部 render 或全量 render。

## Search

Manager search：

- `searchQuery` 来自 URL `?q=` 或顶部 input，过滤当前 workspace 的 saved sessions。
- `openTabsQuery` 来自 sidebar footer，只过滤 selected browser window 的 pinned/regular rows。
- `openTabFilter` 来自可保存 open tab 的右键菜单，按 URL 过滤 saved sessions；window 切换和 Open Tabs refresh 不自动清除它。
- `visibleGroups()` 先按 workspace 过滤，再按 `groupMatchesQuery()` 和 `openTabFilter` 过滤。
- `getVisibleGroupTabs()` 决定 session 内 matching tabs；不做预览数量截断。

Omnibox search：

- Background 的 `getOmniboxSuggestions()` 遍历 groups 和 restorable tabs。
- 命中后返回 `ziptab://tab/group/<groupId>/<tabId>` content。
- onInputEntered 收到该 content 后调用 `restoreTab()`。

## Theme and Icons

Theme：

- `system` / `light` / `dark`。
- CSS 使用 `prefers-color-scheme` 和 `:root[data-theme]`。

Icons：

- 不依赖外部 icon package。
- `icons.js` 内置 SVG path registry。
- HTML 使用 `data-icon` 和 `data-icon-text`。
- icon-only 按钮自动生成 tooltip 和 `aria-label`。

## Testing and Verification

常用命令：

```sh
npm test
npm run check
npm run verify:vendor
npm run check:release
node --check src/manager.js
```

`npm test`：

- 运行 `node --test tests/*.test.mjs`，避免递归发现 vendored declaration files。
- 当前覆盖 model/import/export、background capture/restore、popup/options view、manager view/DnD helper、Nord token/source contracts、Header/Board CSS contracts、Web Awesome local production wiring、vendor path/checksum contracts。

`npm run check`：

- 检查 manifest 和页面引用文件存在。
- 对项目与 vendored runtime JavaScript 执行 `node --check`。
- 拒绝 vendor symlink、项目根路径逃逸和 checksum mismatch。
- 校验 Web Awesome 1,066 个最终 vendored 文件 checksums；该清单用于检测 checkout drift，不作为独立供应链信任锚。
- 运行 `tests/*.test.mjs` 完整测试。

`npm run verify:vendor`：

- 需要网络访问；以 verifier 内的 executable version/URL/SRI/SHA-256 pins 为基线，从 npm registry 获取固定版本的 metadata 与 tarball。
- 对 response、archive entry 和 extracted tree 设置 timeout、byte、file-count、path、symlink 与 entry-type 边界。
- 验证 registry SHA-512 integrity 和固定 tarball SHA-256。
- 只应用已记录的远程字体 import 删除 patch，再比较完整目录、文件类型和文件内容。

`npm run check:release` 串联离线 extension sanity/test 和联网 vendor provenance verification，用于 release/security gate；日常 `npm run check` 保持离线可重复。

当前测试空白：

- Manager 的真实 custom-element lifecycle、Shadow DOM keyboard/focus 和完整 DOM render 未自动化覆盖；当前主要使用纯 helper 与 source-contract tests。
- 原生 Drag and drop 的浏览器事件时序未自动化覆盖，只有 geometry/helper/source contracts。
- Chrome API restore/capture 依赖浏览器环境，当前没有 Playwright/Chrome e2e。

建议人工回归：

- 安装 unpacked extension。
- 展开/折叠 sidebar，并刷新确认 UI preference 保留；窄屏下确认 rail、compact window selector 和 toggle 仍可达。
- 切换多个 compact window selector，确认一次只显示 selected window，tab count 与 Chrome window 原始总数一致；新建 Chrome window 后自动选中。
- 确认 compact window selector 和 actions 位于 sidebar 顶部，切换 window 后只显示 selected window 的单一纵向 Open Tabs 列表；pinned row 与普通 row 同处列表并显示 inline badge。
- 确认所有有 URL 的非 ZipTab tabs 都尝试保存，且 pinned tabs 不因 badge 被排除。
- 输入 sidebar Filter tabs，确认只过滤当前 window rows；切换 window 或刷新 tabs 后，已有 `openTabFilter` 仍保留。
- 确认 sessions 单行横向滚动、每张 card 全高、tab list 在 card 内滚动。
- 在横向滚动前后测试 session target-slot、saved/open tabs 和 category DnD。
- 打开第一张/最后一张 session 的 More，确认 fixed menu 不被裁切。
- 保存当前窗口、搜索、分类、restore、导入 OneTab 文本。

## 维护建议

1. 优先拆分 `manager.js`

推荐拆分方向：

- open tabs panel。
- category navigation。
- session card rendering。
- drag/drop controller。
- modals。
- bin。

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
