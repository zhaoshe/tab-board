# Project Overview

本文档总结 TabBoard 的项目定位、产品目标、边界、当前状态和后续观察点。历史变迁请看 [Feature Evolution](feature-evolution.md)，关键取舍请看 [Product Decisions](product-decisions.md)。

## 一句话定位

TabBoard 是一个 local-first 的 Chrome tab manager：用 OneTab 式的一键收纳清理窗口，再用 workspace、顶部 category navigation、横向 session board 和拖拽整理，把临时浏览上下文变成可恢复的工作记忆。

## 项目目标

TabBoard 要解决的不是“收藏网页”，而是“保存和找回一次浏览现场”。

核心目标：

- 快速清空浏览器窗口，降低 tab overload。
- 将当前窗口或一组选中的 open tabs 保存为 session。
- 让 saved sessions 可以被搜索、分类、重命名、补充、恢复和拖拽整理。
- 让当前 open tabs 能反向查询历史 sessions，帮助用户判断“这个页面之前保存在哪里”。
- 保持数据本地化，避免账号、后端和隐私解释成本。

## 背景和竞品关系

TabBoard 的第一阶段从 OneTab 复刻开始，后来吸收 tabExtend 的组织方式。

保留 OneTab 的部分：

- 一键保存当前窗口。
- 保存后可以恢复单个 tab 或整个 session。
- 导入导出文本。
- OneTab 导出文本兼容导入。

增强 OneTab 的部分：

- Workspaces。
- Categories。
- 多列 session card 工作台。
- Open Tabs 面板。
- 当前 tab 反查 saved sessions。
- Inline rename、note、lock、bin。
- 新标签页直接进入 TabBoard。

借鉴 tabExtend 的部分：

- workspace/category 组织模型。
- 更像工作台的 saved sessions 视图。
- open tabs 与 saved sessions 的联动。

刻意没有继续做的部分：

- Quick list / Pinned workflow。该概念与 saved sessions 的关系不清晰，已下线。
- Todo 工作流。旧 todo 数据会按 note 兼容展示，但当前产品不暴露待办系统。
- 远端同步和协作。当前坚持 local-first。

## 当前产品形态

TabBoard 是 Manifest V3 Chrome extension，安装后会提供这些入口：

- Toolbar action：默认保存当前窗口；也可在 Options 中切换为打开 popup。
- New tab override：新标签页打开 TabBoard manager。
- Manager page：主要工作台，包含 open tabs、categories、workspace、search 和 saved sessions。
- Popup：轻量入口，支持保存当前窗口、打开 manager、搜索 recent sessions。
- Context menu：页面/扩展按钮右键保存当前 tab、窗口、左右 tabs、其它 tabs、全部窗口等。
- Omnibox：输入 `tb` 搜索 saved tabs。
- Commands：快捷键保存当前窗口或打开 TabBoard。

## 核心概念

Workspace：
最高层上下文。每个 workspace 有自己的 sessions、categories 和 category order。

Session：
一次保存下来的浏览上下文。session 包含 title、tabs/notes、category 归属和 lock 状态；legacy `collapsed` 字段保留兼容，但当前 manager 不使用。

Tab item：
session 内的条目。当前支持 link 和 note。旧 todo 会被 normalize 成 note。

Category：
session 的单一归属。内置 category 包括 Inbox、Saved 和 Archive，自定义 category 存在 `folders` 中。

Inbox：
没有自定义 category、也未归档的默认收纳区。

Saved：
内置 category。标为 starred 的 session 归入 Saved，它是 session 的一种归属，而不是额外叠加状态。

Archive：
内置 category。归档的 session 归入 Archive，用于存放不常用但需要保留的工作上下文。

Bin：
删除 session 或 tab item 后进入的本地回收区，最多保留 80 条。

## 产品原则

1. Local-first
数据留在 `chrome.storage.local`，不引入账号和后端。

2. Save fast, organize later
保存窗口必须轻，整理能力不能阻碍主流程。

3. Sessions over bookmarks
默认保存工作上下文，不把 TabBoard 变成普通书签夹。

4. Dense but calm
主界面偏信息工作台，强调扫描、比较和重复操作，不做营销式 landing page。

5. Direct manipulation first
重命名、排序、移动、补充链接等操作尽量贴近对象本身。

6. Dangerous actions recoverable or confirmed
删除走 bin；永久清理、删除等 destructive action 默认需要确认。

## 项目边界

当前范围内：

- 本机 Chrome extension。
- 保存、恢复和组织 tabs。
- Workspaces 和 categories。
- Import/export。
- 新标签页替换。
- 本地回收站。
- 轻量设置页。

当前不做：

- 多设备同步。
- 用户账号、云端备份、协作。
- 任务管理系统。
- 类 Notion 的复杂数据库。
- 自动摘要或 AI 分类。
- 完整键盘无鼠标拖拽替代方案。

## 当前状态

版本：`0.1.0`

代码规模：

- 技术栈：React 18 + TypeScript + Vite；UI 使用 Mantine v7，状态用 Zustand 持久化到 `chrome.storage.local`，拖拽用 `@dnd-kit`，图标用 `@tabler/icons-react`。
- 核心 extension 页面入口：`manager.html`、`popup.html`、`options.html`。
- 核心模块目录：`src/background/`（Chrome API 边界与 service worker）、`src/shared/model/`（纯数据）、`src/shared/store/`（持久化与 Zustand）、`src/manager/`（Manager UI + core 纯逻辑 + hooks）。
- 构建与测试：`npm run build`（`tsc --noEmit` + `vite build`）、`npm test`（Vitest）、`npm run check`（build + `scripts/check-extension.mjs`）和 `git diff --check`。

主要风险：

- Manager UI 逻辑较多，后续新增行为要注意维持 components / core / hooks 的边界。
- 拖拽交互基于 `@dnd-kit`（pointer/touch/keyboard sensors + 自定义 collision detection），视觉反馈和落点几何仍是最易出边界 bug 的区域。
- session 数量继续增长后，当前用 CSS `content-visibility` 让 off-screen session slot 跳过 layout/paint；若单 category 达到数百 session，仍可能需要引入真正的虚拟列表（需评估与 `@dnd-kit` measurement 的兼容性）。
- 右键菜单触发筛选、icon-only 操作的可发现性仍需观察。
- Session 拖拽通过 `.session-card__drag-handle`（携带 `@dnd-kit` activator + attributes）支持 pointer 与键盘两条路径；handle 默认低调，hover/focus 时才显现，其可发现性仍需观察。

## 成功标准

产品体验层：

- 保存当前窗口足够快，且保存后能自然回到工作台。
- 用户可以在大量 sessions 中快速找到目标。
- 用户能把零散 tabs 整理到合适 session/category。
- 恢复后不会意外丢失重要 session，lock 语义清晰。

技术维护层：

- 状态 schema 可 normalize 旧数据。
- Import/export 能覆盖 TabBoard text/json 和 OneTab text。
- Chrome API 权限和特殊 URL 行为有明确边界。
- 每次明显方向变化都有文档记录。

## 文档地图

- [Feature Spec](feature-spec.md): 当前功能面和交互规则。
- [Technical Architecture](technical-architecture.md): 模块、数据模型和关键流程。
- [Feature Evolution](feature-evolution.md): 功能变迁记录。
- [Product Decisions](product-decisions.md): 决策背景和取舍。
- [Product Story](product-story.md): 对外介绍和 demo 话术。
