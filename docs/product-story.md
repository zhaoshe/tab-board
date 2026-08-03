# Product Story

本文档用于 sell TabBoard：对用户、评审或后续开发者讲清楚它解决什么问题、为什么值得用、和 OneTab / tabExtend 的关系是什么。

## 一句话定位

TabBoard 是一个 local-first 的 Chrome tab manager，把 OneTab 的快速收纳能力和更适合长期整理的 session 工作台结合起来。

## Elevator pitch

浏览器 tabs 会快速变成临时记忆的堆积场：正在看的文档、排查中的链接、准备稍后再读的页面，最后都挤在窗口里。OneTab 能快速清空窗口，但后续整理能力有限；tabExtend 更像工作流工具，但概念较重。

TabBoard 选择中间路线：一键保存当前窗口，把它变成可搜索、可分类、可恢复的 session；当你正在浏览当前窗口时，也可以勾选几个 open tabs 创建新 session，或者右键某个 open tab 反查它属于哪些历史 sessions。

核心价值不是“保存链接”，而是把浏览器里的临时上下文变成可以回到现场的工作记忆。

## Why now

- AI coding、内部文档、Issue、Dashboard、搜索结果会让单个任务同时打开大量 tabs。
- 浏览器窗口越来越像临时项目空间，但 Chrome 原生 tab 管理不适合长期回溯。
- 传统书签偏长期收藏，不能表达一次工作上下文。
- OneTab 解决了收纳，但没有很好覆盖“整理、补充、筛选、回到上下文”。

## Core promises

### 1. One click to clear the window

当前窗口一键保存为 session，减少 tab overload。

用户收益：

- 浏览器变干净。
- 当前上下文不会丢。
- 之后可以按 session 恢复。

### 2. Sessions are work memory

每个 session 不只是 URL 列表，还可以被命名、分类、搜索、拖拽、补充和加 note。

用户收益：

- 保存的是一次工作现场。
- 可以把零散链接整理成主题。
- 适合项目、调研、排查、阅读列表。

### 3. Open tabs can query history

右键当前 open tab 后，右侧 saved sessions 会过滤出包含这个 URL 的 sessions。

用户收益：

- 快速知道“这个页面我之前存到哪里了”。
- 可以从当前页面回到历史上下文。
- 减少重复保存和重复搜索。

### 4. Local-first by design

数据默认留在本机 Chrome extension storage，也可以完整切换到用户选择的本地文件夹；不需要账号和远端后端。

用户收益：

- 隐私边界简单。
- 安装即用。
- 可导入导出，也可使用普通 JSON 本地文件夹自主备份或交给用户自己的同步盘。

## Compared with OneTab

TabBoard 保留：

- 当前窗口保存。
- session 恢复。
- 导入导出。
- OneTab 文本导入。

TabBoard 增强：

- Workspaces 和 categories。
- Kanban/grid 式浏览。
- Inline rename。
- Notes / starred。
- Open tabs 反查 saved sessions。
- 拖动 open tab 到已有 session。
- 新标签页直接进入管理界面。

## Compared with tabExtend

TabBoard 借鉴：

- workspace/category 的组织方式。
- 更偏工作台的多 session 视图。
- open tabs 和 saved sessions 的联动。

TabBoard 避免：

- 过重的 pinned workflow 概念。
- 为了工作流而牺牲 OneTab 式保存恢复速度。
- 默认展示过多控制项。

## Demo script

1. 打开一个有很多 tabs 的窗口。
2. 在 Open Tabs header 选择目标 window，点击 Save。
3. 展示生成的 session，并双击标题 inline rename。
4. 右键一个当前 open tab，选择 Filter sessions by this tab，右侧筛选出包含它的 sessions。
5. 勾选多个 open tabs，使用 Create Session，或通过 Save to 明确选择已有/新 Session 位置。
6. 拖动一个 open tab 到已有 session，或精确命中两个 Session 之间的 `+` 创建新 Session。
7. 用搜索或 category 找回 session，再 Restore。

## Current talking points

- “It is not bookmarks. It is recoverable browsing context.”
- “OneTab speed, plus session organization.”
- “Local-first, no account, no backend.”
- “Open tabs are not only things to save; they are filters into your past work.”
- “Pinned tabs can be saved without being removed from your working window.”

## Risks to explain honestly

- 目前没有跨设备同步。
- Local Folder 可以放在用户自己的同步目录中，但 TabBoard 不提供冲突解决；同一时间应只在一台设备写入。
- 新标签页替换默认 Chrome new tab，用户需要接受 TabBoard 成为入口。
- Open tab filter 由右键菜单触发，后续可能需要更明显的视觉提示来提高发现性。
- Quick list / Pinned workflow 已移除，未来如果恢复，需要重新定义它和 sessions 的关系。
