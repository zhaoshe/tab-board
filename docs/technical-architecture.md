# Technical Architecture

本文档描述 ZipTab 的技术结构、模块边界、数据模型和关键流程。目标是帮助后续维护者快速判断“改哪里、注意什么、怎么验证”。

## 技术栈

ZipTab 是一个无构建步骤的 Chrome Manifest V3 extension。

运行环境：

- Chrome 115+。
- Manifest V3 service worker。
- 原生 ES modules。
- 原生 DOM API。
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
- `src/manager-view.js`: manager context strip、inspector model、session action layout 的纯 helper。
- `src/popup-view.js`: popup CTA、recent sessions、empty copy 的纯 helper。
- `src/options-view.js`: options Basic / Advanced section 分组 helper。
- `src/feedback-copy.js`: popup、manager、options 共享的反馈文案 helper。
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

- 渲染 sidebar、workspace command bar、context strip、categories、session cards、inspector、modals。
- manager 页面事件分发。
- open tabs panel。
- session/category/tab drag and drop。
- focused session / inspector 本地 UI 状态。
- inline rename。
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

State 存储在 `chrome.storage.local["ziptabState"]`。

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
  confirmDestructive: true,
  dedupeOnSave: false,
  deleteRestoredTabs: true,
  focusRestoredTabs: true,
  includeChromeUrls: false,
  includeFileUrls: false,
  includePinnedTabs: false,
  openManagerAfterSave: true,
  restoreGroupsInNewWindow: false,
  restoreNextToCurrent: true,
  showFavicons: true,
  sessionActionOrder,
  sessionExternalActions,
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
3. `canCaptureTab()` 按 settings 过滤不可保存 tabs。
4. `createTabRecord()` 转成 ZipTab tab records。
5. 按 windowId 分组。
6. `createGroupFromTabRecords()` 创建 session。
7. `updateState()` 将新 sessions `unshift` 到 groups 头部。
8. 根据 settings 打开 manager。
9. 根据 settings 关闭源 tabs。

重要边界：

- 如果没有 storable tabs，会返回 `storedTabs: 0`。
- 如果开启 dedupe，已存在 URL 会跳过。
- 如果 manager tab 是保存过程中打开的，关闭源 tabs 时会排除 manager tab。

### Manager Open Tabs

流程：

1. Manager 调用 runtime message `list-open-tabs`。
2. Background 使用 `chrome.windows.getAll({ populate: true })`。
3. `canCaptureTab()` 过滤。
4. Manager 渲染当前 focused window。
5. Open tab 可勾选、右键筛选、拖拽。

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

- Manager sidebar Import。

流程：

1. `openImportModal()` 收集文本。
2. `parseImportPayload()` 尝试 JSON。
3. JSON 包含 `groups` 或数组时走 `normalizeState({ groups })`。
4. JSON 失败时走 `parseOneTabText(text)`。
5. `parseOneTabText()` 可解析 OneTab blocks；如果未解析出 groups，会回退 `parseImportText()`。
6. 导入 groups 加上当前 `workspaceId`，插入 groups 头部。

### Export

入口：

- Manager sidebar Export。

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
- Saved tab 插入使用上/下高亮线。
- Session 移动使用 `group-insert-marker` 作为 Move here placeholder。
- Session dragstart 会 seed marker 到源位置。
- Session drag image 使用源卡片位置的 visible clone，避免浏览器截不到 drag image。

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
  -> ensureFocusedGroup()
  -> renderWorkspaceSwitcher()
  -> renderStats()
  -> renderHeaderActions()
  -> renderContextStrip()
  -> renderActiveTabs()
  -> renderFolders()
  -> renderGroups()
  -> renderInspector()
```

状态更新后通常：

1. `updateState()` 写 storage。
2. 本地 `state = normalizeState(nextState)`。
3. 调用局部 render 或全量 render。

## Search

Manager search：

- `searchQuery` 来自 URL `?q=` 或 input。
- `visibleGroups()` 先按 workspace 过滤，再按 `groupMatchesQuery()` 和 open tab filter 过滤。
- `visibleTabsForGroup()` 决定 session 内预览哪些 tabs。

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
node --check src/manager.js
```

`npm test`：

- 运行 `node --test`。
- 当前主要覆盖 `model.js` 的 normalize、import/export、bin、settings 等纯数据逻辑。

`npm run check`：

- 检查 manifest 引用文件存在。
- 对 JS 文件执行 `node --check`。
- 运行完整测试。

当前测试空白：

- Manager DOM render 未自动化覆盖。
- Drag and drop 未自动化覆盖。
- Chrome API restore/capture 依赖浏览器环境，当前没有 e2e。

建议人工回归：

- 安装 unpacked extension。
- 保存当前窗口。
- 搜索、分类、拖拽、restore。
- 导入 OneTab 文本。
- 打开 Options 修改 capture/restore 设置。

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
