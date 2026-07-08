# ZipTab UI Rework Design

## Goal

修复最新 Chrome 手动验收暴露的 Popup、Manager、Options、capture、DnD 问题，同时把 UI 风格和 icon 统一成一套稳定的 Chrome extension 工作台体验。

## Scope

本轮采用“聚焦重做”：保留当前无构建、原生 ES modules、原生 DOM、Chrome MV3 架构，不引入 React/Vue/bundler/TypeScript，不做大规模 `manager.js` 拆分。只替换失败设计和修正已确认交互。

本轮包含：

- Popup quick actions 和 recent sessions 行为。
- Manager 信息架构、Open Tabs、workspace 顶栏、DnD 反馈、保存后定位提示。
- Capture 去重、空白页清理、excluded URL 处理。
- Options 设置模型和设置页信息架构。
- 统一视觉系统和 icon 系统。

## Product Decisions

### 1. Manager 使用 Board-first 结构

Manager 采用 Board-first，无常驻 inspector。

布局：

- 顶栏：`ZipTab` brand、workspace switcher、workspace 更多菜单、search、Import、Export、Bin、Options。
- 左侧：Open Tabs · All windows + Categories。
- 右侧：Saved sessions board。

移除：

- 语义不清的 context strip。
- 常驻 inspector。
- 顶栏 `Save window`。
- 顶栏 `Collapse`。

原因：Manager 是主工作台，应该优先展示 session board 和 open tabs。Inspector 占空间但价值低，context strip 用户难理解。

### 2. Workspace controls 放在 search 前

Search 前显示当前 workspace。Workspace switcher 外露切换；rename、新建、删除放进 workspace 更多菜单。

行为：

- 点击 workspace 名称：切换 workspace。
- 点击更多：Rename workspace、New workspace、Delete workspace。
- 删除 workspace 属于危险操作，始终确认。

### 3. Open Tabs 展示所有窗口

Open Tabs 不再只显示 current window。

行为：

- 左侧显示所有 Chrome windows。
- 一次只展开一个选中的 window。
- 其他 window 自动折叠，只展示 window 名称和 tab count。
- 折叠 window 的展开按钮表示“选中并展开该 window”。
- Current window 初始选中。

Open Tabs 区域动作：

- `Open Tabs · All windows` 标题右侧按钮：保存所有窗口里的所有可保存 tabs。
- 展开 window 标题行按钮：保存该 window、清理该 window 重复 tabs、进入/退出 select mode。
- 当前窗口去重只清理该 window，不影响其他 window。

### 4. Select mode 不造成布局跳变

Select mode 只覆盖展开 window 的 title 行，不覆盖 tab 列表。

覆盖层内容：

- Selected count。
- Create session action。
- Exit select mode action。

Tab 列表仍可见、可滚动、可操作。显示/隐藏 select mode 不改变 window card 高度，不挤开 tabs。

### 5. Session DnD 使用轻量空间反馈

Session 拖拽不再让原卡片消失。

规则：

- Drag image 始终可见。
- 原卡片保持占位，不因 dragstart 消失。
- 创建新 session 的落点用卡片前/后的竖线高亮，不使用文案提示。
- 如果目标位置是卡片原本位置，不显示高亮条。
- 拖到 session 中间 50%：提示添加到该 session。
- 拖到 session 左/右各 25%：提示在前/后创建新 session。
- Drop 前不挤开已有 session；drop 后再更新顺序并动画过渡。

### 6. Popup 保持 quick trigger

Popup 不做小型 manager。

顶部结构：

- Header：ZipTab + Settings。
- Quick row：横排三个等宽等高按钮：Save、Open、Dedupe。
- Search recent sessions。
- Recent sessions list。

Quick actions：

- Save：保存当前窗口，完成后关闭 popup，打开/聚焦最近访问的 ZipTab manager tab。
- Open：打开/聚焦最近访问的 ZipTab manager tab。
- Dedupe：清理当前窗口重复 tabs。
- Settings：打开 Options。

Recent sessions：

- 每行展示 title、tab count、workspace/category metadata。
- 每行右侧有 Restore 和 Delete。
- Delete 属于危险操作，始终确认。
- Hover 延迟展示该 session 的全部 tabs，仅作为提示，不提供复杂操作。

保存后反馈：

- Popup 内不显示保存结果 toast。
- Save 完成后 popup 关闭。
- Manager 打开/聚焦后滚动定位到刚保存 session。
- Manager 内显示浮层 toast：saved count、cleaned duplicate count、closed blank count。
- Toast 使用 `position: absolute/fixed` 类浮层，不进入文档流，不推开 board，不造成布局跳变。

### 7. Open workspace 打开最近访问的 ZipTab tab

多个 ZipTab manager tab 存在时：

1. 优先打开最近访问/最近聚焦的 ZipTab manager tab。
2. 没有最近记录时，优先当前 Chrome window 内的 ZipTab manager tab。
3. 再找其他 window 的 ZipTab manager tab。
4. 都没有才新开 manager。

### 8. Save window 先清理，再保存关闭

Save window 行为：

1. 收集目标 window tabs。
2. 关闭所有 `about:blank` / blank tabs。
3. 按 URL 对源 tabs 去重。
4. 可保存 URL 只进入新 session 一次。
5. 被 exclude URL list 排除的 URL 不进入 session，但重复项仍只保留一个。
6. 保存成功后关闭已保存源 tabs。
7. 保留 excluded URL 的单个实例。
8. 打开/聚焦 manager，定位新 session。

去重设置只作用于本次 capture 的源浏览器 tabs，不因为旧 saved sessions 中已有同 URL 就静默跳过新 session 内容。

### 9. Options 简化

Options 分组调整：

Capture：

- Capture 时 tab 去重，默认开启。
- Close tabs after save。
- Open manager after save。
- Include pinned tabs。

Capture edge cases：

- Exclude URL list。
- 默认规则：`chrome://*`、`file://*`。
- 支持简单前缀/通配符 pattern：`chrome://*`、`file://*`、`about:blank`、`https://example.com/*`。
- 不使用正则表达式。

Restore：

- Delete restored tabs。
- Restore groups in new window。
- Restore next to current。
- Focus restored tabs。

Interface：

- Theme。
- 删除 Show favicons 设置；favicons 始终展示。
- 删除 session toolbar 外露动作设置。
- 删除 Confirm destructive actions 设置；危险操作始终确认。

### 10. 统一视觉和 icon 系统

所有页面使用同一套视觉语言：

- 同一 border radius 阶梯。
- 同一 button height 和 icon button size。
- 同一 hover/focus/active 状态。
- 同一 muted text、surface、border、accent token。
- 同一 empty/loading/error/success feedback 规则。

Icon 规则：

- 只使用 `src/icons.js` 本地图标 registry。
- 不使用 emoji 作为 action icon。
- Popup、Manager、Options 复用同名 icon。
- 删除按钮使用统一 trash icon。
- Restore/Open 使用统一 arrow/open icon。
- Dedupe 使用统一 duplicate/merge icon。
- Settings 使用统一 gear icon。
- Icon-only button 必须有 tooltip 和 `aria-label`。

## Architecture

### Existing boundaries stay

- `src/model.js`：settings schema、pattern matching、dedupe helper、state normalize。
- `src/background.js`：Chrome API capture/open/restore/cleanup boundary。
- `src/store.js`：state read/write/update。
- `src/manager.js`：Manager DOM render and event flow。
- `src/popup.js`：Popup event flow。
- `src/options.js`：Options settings form。
- `src/icons.js`：唯一 icon registry。

### Helper modules

保留现有 helper 思路，但修正语义：

- `src/popup-view.js`：Popup quick actions、recent sessions、hover preview model。
- `src/options-view.js`：Options sections and setting descriptors。
- `src/manager-view.js`：Manager header/open-tabs/session-board view helpers；移除 context strip / inspector helper 或改成新 helper。
- `src/feedback-copy.js`：Manager toast 文案。

## Data and Flow

### Capture flow

Runtime message returns structured result:

```js
{
  storedTabs,
  storedGroups,
  cleanedDuplicates,
  closedBlankTabs,
  skippedByExclude,
  createdGroupIds
}
```

Manager can use `createdGroupIds[0]` to locate and highlight the new session.

### Manager refresh after capture

When capture opens/focuses manager, manager receives target group context through URL params or runtime message state.

Expected behavior:

- Re-fetch open tabs.
- Re-render selected window.
- Scroll target session into view.
- Apply temporary highlight to target session.
- Show floating toast without layout shift.

### URL pattern matching

Pattern support is intentionally simple:

- Exact string: `about:blank`。
- Prefix wildcard ending with `*`: `chrome://*`。
- URL prefix path wildcard: `https://example.com/*`。

Invalid empty patterns are ignored in UI validation and not saved.

## Error Handling

- Capture partial failures report actionable manager toast.
- Chrome tab close/create failures do not corrupt saved state.
- Exclude pattern validation shows inline error in Options before save.
- Delete/clear/workspace destructive actions always confirm.
- Popup runtime failures render compact inline error only if popup remains open.

## Accessibility

- All icon-only buttons get `aria-label` and tooltip.
- Focus rings remain visible across Popup, Manager, Options.
- Hover preview must also be reachable by keyboard focus.
- Select mode overlay must not trap focus.
- Toast uses `aria-live="polite"` and does not steal focus.
- Confirm dialogs use existing modal/dialog pattern with clear action labels.

## Testing Plan

Automated tests:

- `tests/model.test.mjs` for URL pattern matching, settings normalization, capture dedupe helpers。
- `tests/background.test.mjs` for capture result counts, blank cleanup, duplicate cleanup, excluded URL retention, manager targeting。
- `tests/popup-view.test.mjs` for three quick actions, recent session delete action, hover preview model。
- `tests/options-view.test.mjs` for removed settings and new sections。
- `tests/manager-view.test.mjs` for Board-first view helpers, open windows collapsed model, DnD target-zone decisions。

Verification commands:

```sh
npm test
npm run check
```

Manual Chrome checks:

- Popup Save closes popup, opens/focuses recent manager tab, manager highlights new session。
- Popup Open focuses recent manager tab, not always rightmost/new tab。
- Popup Dedupe cleans current window duplicates。
- Recent sessions hover/focus preview lists all tabs。
- Recent sessions Delete confirms before deleting。
- Manager Open Tabs lists all windows, only selected window expanded。
- Select mode overlay covers only window title row and does not move tab list。
- Save all windows button captures all windows。
- Session drag start does not hide original card。
- New session insertion uses vertical line with no text。
- Original-position drop target shows no insertion line。
- Middle 50% session drop adds to session; outer 25% creates before/after。
- Options defaults show capture dedupe on and exclude URL list with `chrome://*`, `file://*`。
- Show favicons, session toolbar, confirm destructive settings no longer appear。

## Out of Scope

- Rewriting Manager in React/Vue。
- Adding build tooling。
- Full `manager.js` decomposition。
- Browser-side E2E framework adoption。
- New side panel UI。
- Sync storage or cloud sync。
