# ZipTab Chrome Extension UI Review & Redesign Spec

## Goal

用 `chrome-extension-ui` skill 的高优先级规则，重做 ZipTab 当前最影响体验的 UI 信息架构与交互层级，重点提升 manager/new tab 主工作台体验，同时让 popup 回到快动作入口、让 options 保持轻量配置页。

## Scope

本轮覆盖：

- `manager.html` / `src/manager.js` / `src/styles.css`
- `popup.html` / `src/popup.js` / `src/popup.css`
- `options.html` / `src/options.js` / `src/options.css`
- 必要时小改 `src/icons.js`

本轮不做：

- 产品模型重写
- 云同步、账号、side panel、新 content-script UI
- 新权限申请
- 复杂数据层重构

## Current Review Summary

### 当前优势

- 产品方向清楚：`new tab = manager`，主入口明确。
- Popup 已偏轻量，没有把深操作全塞进去。
- Options 已是 auto-save，本地持久化边界清楚。
- 最近一轮 hardening 已补上 restore、settings 和权限边界。

### 当前高影响问题

1. **Manager 职责过重但层级不够清楚**
   - 现在 header、sidebar、session cards 都在抢注意力。
   - session card 外露 icon-only 动作较多，扫描成本高。
   - 缺少一个稳定的详情/编辑区，导致很多次级操作只能塞进 card 或 menu。

2. **Popup 目标还不够单一**
   - 主 CTA 是对的，但 `Open` 文案过泛。
   - recent sessions 与搜索没有形成明确优先级。
   - 更像缩小版 manager，而不是“快动作入口”。

3. **Options 可配置但不够分层**
   - Basic 与 advanced 设置混在一起。
   - 设置条目虽不多，但理解成本仍高于必要值。

4. **反馈与 accessibility 规则未系统化**
   - toast、loading、error、empty state 还不是统一语言。
   - 键盘路径、focus visible、ARIA 语义更多是局部成立，不是整面统一。

## Chosen Direction

采用 **Manager-first redesign**：

- **Popup = trigger**
- **Manager / New Tab = workbench**
- **Options = configuration**

原因：

- 最符合 `chrome-extension-ui` 里 `comp-popup-vs-sidepanel`、`popup-size-constraints`、`popup-primary-action`、`comp-single-purpose` 的原则。
- ZipTab 的真实高价值场景不是“在 popup 里做管理”，而是“在稳定工作面里找、看、改、恢复 session”。
- 用户已明确接受明显改版 manager，而不是只做保守微调。

## Information Architecture

### 1. Popup

Popup 保持极简，只承载三类动作：

1. `Save window`（主按钮）
2. `Open workspace`（次按钮）
3. `Recent sessions / restore`

设计要求：

- 主按钮永远最明显。
- 搜索保留，但视觉优先级低于 capture。
- recent sessions 数量控制在 3-5 条，避免 popup 变成长列表。
- popup 不承担重命名、分类、编辑、批量操作。

### 2. Manager / New Tab

Manager 变成稳定主工作台，布局分成四区：

1. **Top command bar**
   - workspace switcher
   - 全局搜索 / command 入口
   - Import / Export / Bin / global actions
   - 当前上下文信息入口

2. **Sidebar**
   - Open Tabs
   - Categories
   - utility actions

3. **Session board**
   - 当前 category / filter / search 的主结果区
   - session cards 只保留最关键可扫信息与少量高频动作

4. **Inspector**
   - 当前聚焦 session 的详情与编辑入口
   - 标题、数量、category、note、restore、lock、rename、移动等集中到这里

### 3. Options

Options 保持轻量配置页，不做“第二个管理界面”。

分成：

- **Basic**：高频设置（capture、restore、theme）
- **Advanced**：特殊 URL、destructive 行为、toolbar action visibility/order

## UX Rules For This Redesign

### Popup Rules

- popup 打开后应立刻可用，不等待复杂计算。
- popup 主动作只能有一个：`Save window`。
- `Open` 改成明确语义，如 `Open workspace`。
- popup 成功动作应短确认；失败动作应可理解且不冗长。

### Manager Rules

- manager 是主屏，不是 landing page。
- session card 降噪：外露动作尽量少，`Restore` + `More` 为主。
- rename / note / lock / move 等次级动作优先进入 inspector 或 more menu。
- Open Tabs 更像“收件区”，主 CTA 明确是 `Create session`。
- 当前 filter / open-tab-filter / search / workspace 必须有清楚的 context strip 展示。

### Options Rules

- auto-save 保留。
- 成功默认轻提示，失败明确提示。
- 高风险设置放入 Advanced，减少误触与认知负担。

### Accessibility Rules

- icon-only 按钮必须保留明确 accessible name。
- focus visible 统一，不允许某些区块有、某些区块没有。
- modal / menu / inspector 的键盘顺序要连续可预期。
- 使用语义结构：header / nav / main / aside / section / button / label。

## Proposed Screen Changes

### Popup

- 保留品牌头部，但缩短视觉高度。
- 主按钮：`Save window`
- 次按钮：`Open workspace`
- 搜索框保留，但放在 recent 之前且更紧凑。
- recent list 改成更清晰的一行式：title + link count + restore。
- 没有结果时，文案更明确区分“没有保存内容”和“搜索无结果”。

### Manager / New Tab

#### Top Command Bar

新增/强化：

- workspace selector
- search / command input
- global action cluster
- context strip

目标：让用户在顶部就理解“我在哪、当前筛选了什么、可以做什么”。

#### Sidebar

保留现有 open tabs + categories 思路，但更明确层级：

- Open Tabs 是行动区
- Categories 是导航区
- Bin / Import / Export / Options 是 utility 区

#### Session Board

- session cards 降低按钮密度
- card 主要承载：title、count、少量 meta、preview
- selection / drag / hover / active 视觉态更明显
- empty / filtered / no-results 状态分别设计

#### Inspector

新增右侧 inspector：

- 空态：提示选择一个 session
- 选中态：展示 session 元信息与编辑动作
- 支持 restore、rename、note、lock、move、copy 等

这样可减少 card 表面噪音，并提升键盘与 focus 管理一致性。

### Options

- Header 保留
- Settings 改成 Basic / Advanced 两层
- `session toolbar` 配置挪入 Advanced
- 保持 auto-save，不引入 Save 按钮

## Data & State Boundaries

### 持久化状态

继续使用现有 `chrome.storage.local` state，不新增复杂持久层概念。

### 页面本地状态

新增或强化以下**页面本地** UI 状态：

- current focused session id
- inspector open / closed
- command bar transient state
- 更明确的 loading / error / empty / success presentation state

原则：

- 纯视觉状态不进入持久层
- 产品数据仍通过现有 store/model 流转

## Error Handling & Feedback

统一四类反馈：

1. **Loading**
   - open tabs loading
   - import/export/restore 进行中

2. **Empty**
   - 无 sessions
   - 无搜索结果
   - 当前 category 空

3. **Success**
   - save / restore / import / setting saved

4. **Error**
   - runtime message fail
   - import invalid
   - restore partial fail

设计规则：

- success 简短
- error 可执行
- destructive action 保留 confirm
- 反馈文案在 popup / manager / options 里统一语气

## File-Level Change Plan

### Primary files

- `manager.html`
  - 新增 inspector / command-bar / context-strip 结构位
- `src/manager.js`
  - 重排 render 逻辑与交互入口
  - 引入 focused session / inspector state
  - 简化 session card 外露动作
- `src/styles.css`
  - 支撑四区布局、card 降噪、focus、状态态

### Secondary files

- `popup.html`
- `src/popup.js`
- `src/popup.css`
- `options.html`
- `src/options.js`
- `src/options.css`

### Optional support file

- `src/icons.js`
  - 仅在 tooltip / icon button 语义统一需要时小改

### Avoid unless required

- `src/model.js`
- `src/store.js`

除非实现 inspector / command bar 时发现必须补非常小的数据边界，否则不主动改产品模型。

## Testing & Verification

### Automated

- `npm test`
- `npm run check`

### Manual review checklist

1. popup 打开后是否一眼看懂主动作
2. popup restore / open workspace / search 是否自然
3. manager 顶部 command bar 是否清楚表达上下文
4. session card 是否明显降噪
5. inspector 是否真正减少了 card 上的次级按钮负担
6. open tabs 批量创建 session 是否更清楚
7. keyboard navigation 是否覆盖 popup / manager / options / modal / inspector
8. focus visible 是否统一
9. empty / loading / error / success 四类状态是否一致
10. options basic / advanced 是否更易懂

## Success Criteria

本轮成功标准：

- popup 更像快动作入口，不像缩小版 manager
- manager/new tab 成为更强主工作台
- session card 噪音下降，但高频操作更快找到
- options 更轻、更清楚
- 反馈状态和 accessibility 从“局部成立”变成“系统成立”
- 不破坏现有数据模型和主流程稳定性

## Risks

1. `src/manager.js` 已很大，改版时容易继续膨胀
2. inspector 引入后，焦点与 selection 语义需要统一
3. 拖拽与 selection mode 已脆弱，UI 改版不能破坏现有 DnD 心智模型
4. manager / new tab 是同一界面，改视觉时要同时兼顾“日常入口”和“新标签页瞬时使用”

## Recommendation

先做一轮 **高影响 UX restructuring**，不急着拆技术架构。优先级：

1. manager 信息架构与 inspector
2. popup 主次动作与反馈
3. options basic / advanced 分层
4. accessibility / unified feedback sweep

这条路线最符合当前 ZipTab 的产品定位，也最符合 `chrome-extension-ui` skill 的高优先级规则。