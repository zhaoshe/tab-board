# ZipTab React 重构方案

&gt; **状态**: 待 Review
&gt; **目标**: 使用现代 React 技术栈重构 ZipTab，保持功能完整，提升可维护性和 UX 体验

---

## 目录

1. [项目现状分析](#1-项目现状分析)
2. [产品需求文档 (PRD)](#2-产品需求文档-prd)
3. [技术栈选型](#3-技术栈选型)
4. [重构架构设计](#4-重构架构设计)
5. [UX 设计方案](#5-ux-设计方案)
6. [实施路线图](#6-实施路线图)
7. [风险与缓解](#7-风险与缓解)

---

## 1. 项目现状分析

### 1.1 当前技术栈

| 层面 | 现有技术 | 问题 |
|------|---------|------|
| 框架 | 原生 ES Modules + 手写 DOM | `manager.js` 已超过 3000 行，维护困难 |
| UI 组件 | Web Awesome 3.10.0 (Web Components) | 自定义拖拽和组件交互复杂 |
| 状态管理 | 手动 `chrome.storage.local` + 全量 re-render | 状态更新逻辑分散，难以追踪 |
| 样式 | 手写 CSS + Nord 主题变量 | 缺乏组件化样式隔离 |
| 构建 | 无构建步骤 | 无法利用现代前端工具链 |
| 测试 | Node 原生测试 + 纯 helper 测试 | DOM 和拖拽逻辑缺乏覆盖 |

### 1.2 现有功能全景

#### 核心功能模块

1. **Capture (捕捉)**
   - 保存当前窗口/选中标签/左右标签/全部窗口
   - 标签去重
   - 关闭已保存标签
   - 保留 Chrome 标签组元数据

2. **Restore (恢复)**
   - 单个标签恢复
   - 整个 Session 恢复
   - 恢复到新窗口/当前标签旁
   - 锁定 Session 防止恢复后删除
   - 恢复后自动清理记录

3. **Organize (组织)**
   - Workspaces 隔离
   - 分类系统 (Inbox/Starred/自定义分类)
   - Session 卡片横向排列
   - 分类拖拽排序
   - Session 拖拽重排/跨分类移动

4. **Search &amp; Filter (搜索过滤)**
   - 顶部搜索框
   - Command Palette 搜索 (Cmd/Ctrl+K)
   - 侧边栏打开标签过滤
   - 打开标签 URL 反查历史 Sessions
   - Omnibox 地址栏搜索 (`zt` 关键字)

5. **Edit (编辑)**
   - Session 内联重命名
   - 添加链接/笔记
   - Session 笔记
   - 锁定/星标
   - 复制链接
   - 删除到回收站

6. **Drag &amp; Drop (拖拽)**
   - 打开标签拖入 Session
   - 选中多个标签批量拖拽
   - 保存的标签在 Session 间移动
   - Session 横向拖拽重排
   - 拖到分类标签移动分类
   - 拖拽创建新 Session

7. **Import/Export (导入导出)**
   - ZipTab JSON 导入导出
   - ZipTab 文本格式
   - OneTab 格式导入
   - 简单 URL 列表导入

8. **Bin (回收站)**
   - 最多保留 80 条删除记录
   - 恢复删除项
   - 永久删除
   - 清空回收站

9. **多入口**
   - Toolbar 按钮 (可配置保存/打开弹窗)
   - New Tab 替换
   - Popup 快捷操作
   - 右键菜单
   - 键盘快捷键
   - Omnibox

10. **Settings (设置)**
    - 工具栏按钮行为
    - 保存后关闭标签
    - 保存后打开管理器
    - 恢复后删除记录
    - 新窗口恢复
    - 恢复到当前标签旁
    - 聚焦第一个恢复标签
    - 捕捉时去重
    - 主题 (系统/浅色/深色)

---

## 2. 产品需求文档 (PRD)

### 2.1 产品定位

**一句话**: 本地优先的 Chrome 标签管理器，用 OneTab 式一键收纳清理窗口，再用类 tabExtend 的工作台把浏览上下文变成可恢复的工作记忆。

### 2.2 用户画像

- **重度浏览器用户**: 同时打开 20+ 标签，需要快速整理
- **研究者/开发者**: 需要按项目/主题组织浏览上下文
- **效率控**: 习惯键盘操作和拖拽整理
- **隐私敏感用户**: 要求数据本地存储，不上传云端

### 2.3 功能需求 (FR)

#### FR-1: 捕捉系统

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-1.1 | 一键保存当前窗口 | P0 | 点击工具栏/快捷键 ≤ 200ms 完成保存 |
| FR-1.2 | 保存选中标签 | P0 | 多选后可批量保存为 Session |
| FR-1.3 | 保存方向标签 (左/右) | P1 | 右键菜单可选保存方向 |
| FR-1.4 | 保存所有窗口 | P1 | 可选择跨窗口批量保存 |
| FR-1.5 | 标签去重 | P0 | 开启时按 URL 去重，关闭重复源标签 |
| FR-1.6 | 保留固定标签 | P0 | Pinned 标签正常保存，显示徽章 |
| FR-1.7 | 保留标签组元数据 | P1 | 恢复时尽量重建 Chrome 标签组 |
| FR-1.8 | 保存后行为配置 | P0 | 可配置是否关闭标签、是否打开管理器 |

#### FR-2: 恢复系统

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-2.1 | 单标签点击恢复 | P0 | 点击链接直接打开，响应 &lt; 100ms |
| FR-2.2 | 整个 Session 恢复 | P0 | Restore 按钮一键恢复全部 |
| FR-2.3 | 恢复位置配置 | P0 | 可选新窗口/当前标签旁 |
| FR-2.4 | 锁定 Session | P0 | 锁定后恢复不删除记录 |
| FR-2.5 | 恢复后清理 | P0 | 非锁定 Session 恢复后移除已恢复项 |
| FR-2.6 | 空 Session 自动清理 | P1 | 无内容无笔记无锁定的 Session 自动删除 |
| FR-2.7 | 批量恢复选中项 | P1 | 多选模式下可批量恢复 |

#### FR-3: 工作区与分类

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-3.1 | Workspace 切换 | P0 | 顶部下拉切换，数据隔离 |
| FR-3.2 | 新建/重命名 Workspace | P1 | 支持创建和重命名 |
| FR-3.3 | 内置分类 (Inbox/Starred) | P0 | 始终存在，不可删除 |
| FR-3.4 | 自定义分类 | P0 | 支持创建/重命名/删除 |
| FR-3.5 | 分类拖拽排序 | P1 | 顶部标签可拖拽调整顺序 |
| FR-3.6 | Session 单分类归属 | P0 | 一个 Session 只能属于一个分类 |
| FR-3.7 | 分类名称唯一性校验 | P0 | 同一 Workspace 内不重名 |
| FR-3.8 | Starred 星标 | P0 | 星标后进入 Starred 分类 |

#### FR-4: Session 卡片

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-4.1 | 横向滚动排列 | P0 | 单行横向排列，支持滚动 |
| FR-4.2 | 卡片全高显示 | P0 | 卡片充满可用高度 |
| FR-4.3 | 内部标签滚动 | P0 | 标签过多时卡片内纵向滚动 |
| FR-4.4 | Favicon 堆叠显示 | P1 | 前几个网站图标堆叠展示 |
| FR-4.5 | 标题内联编辑 | P0 | 双击/F2/Enter 重命名 |
| FR-4.6 | Session 笔记 | P1 | 支持添加会话级笔记 |
| FR-4.7 | 锁定/星标徽章 | P0 | 状态用徽章清晰标示 |
| FR-4.8 | 添加链接/笔记 | P0 | More 菜单可添加条目 |
| FR-4.9 | 复制全部链接 | P1 | 一键复制所有 URL |

#### FR-5: 打开标签侧边栏

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-5.1 | 可折叠侧边栏 | P0 | 折叠后显示窄轨道，悬浮展开 |
| FR-5.2 | 窗口选择器 | P0 | compact 下拉切换 Chrome 窗口 |
| FR-5.3 | 单一纵向列表 | P0 | 选中窗口的标签按 index 排序 |
| FR-5.4 | Pinned 标签内联徽章 | P0 | 不分离固定标签，用徽章标识 |
| FR-5.5 | 标签过滤输入 | P0 | 底部输入框按标题/URL 过滤 |
| FR-5.6 | 多选模式 | P0 | 勾选多个标签进行批量操作 |
| FR-5.7 | URL 反查过滤 | P1 | 右键标签过滤包含该 URL 的 Sessions |
| FR-5.8 | 新建 Chrome 窗口 | P1 | 侧边栏可直接创建新窗口 |

#### FR-6: 拖拽系统

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-6.1 | Session 横向拖拽 | P0 | 拖拽时显示占位符，目标位置清晰 |
| FR-6.2 | 拖到其他分类 | P0 | 拖到分类标签移动分类 |
| FR-6.3 | 标签内部排序 | P0 | 上下插入线指示位置 |
| FR-6.4 | 标签跨 Session 移动 | P0 | 可拖到其他 Session |
| FR-6.5 | 打开标签拖入 Session | P0 | 浏览器标签直接拖入保存 |
| FR-6.6 | 多选批量拖拽 | P0 | 选中多个标签一起拖 |
| FR-6.7 | 拖拽创建新 Session | P0 | 拖到空白处创建新会话 |
| FR-6.8 | 拖拽视觉反馈 | P0 | 拖拽图像跟随指针，目标高亮 |
| FR-6.9 | 不支持 Session 合并 | P0 | 禁止拖到另一个 Session 上合并 |

**关键交互规则**:
- Session 拖拽: 目标卡左右 25% 是前/后插入，中间 50% 是占据目标位置
- 目标位置有滞后锁定，减少回闪
- 打开标签拖拽是 copy 语义，不关闭源标签

#### FR-7: 搜索系统

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-7.1 | 顶部搜索框 | P0 | 搜索标题/URL/笔记 |
| FR-7.2 | Command Palette | P0 | Cmd/Ctrl+K 打开，支持 restore/reveal |
| FR-7.3 | 搜索快捷键 `/` | P0 | `/` 聚焦搜索框 |
| FR-7.4 | Omnibox 搜索 | P1 | 地址栏 `zt` 搜索，回车直接恢复 |
| FR-7.5 | 搜索状态记忆 | P1 | 收起搜索框时保留筛选状态 |
| FR-7.6 | Popup 最近搜索 | P1 | Popup 显示最近 5 个 Session |

#### FR-8: 回收站

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-8.1 | 删除进入回收站 | P0 | Session/标签删除不直接消失 |
| FR-8.2 | 80 条上限 | P0 | 超出时自动清理最旧记录 |
| FR-8.3 | 恢复删除项 | P0 | 可恢复误删的 Session/标签 |
| FR-8.4 | 永久删除 | P1 | 可单条永久删除 |
| FR-8.5 | 清空回收站 | P1 | 一键清空，需二次确认 |
| FR-8.6 | 危险操作确认 | P0 | 永久删除/清空必须确认 |

#### FR-9: 导入导出

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-9.1 | ZipTab JSON 导入 | P0 | 完整数据 round-trip |
| FR-9.2 | ZipTab 文本导入导出 | P1 | 人类可读格式 |
| FR-9.3 | OneTab 文本导入 | P0 | 空行分隔的块变成多个 Sessions |
| FR-9.4 | URL 列表导入 | P1 | 每行一个 URL |
| FR-9.5 | 复制/下载导出 | P0 | 支持复制文本、下载文本、下载 JSON |
| FR-9.6 | 导入到当前 Workspace 头部 | P0 | 新导入内容放在最前面 |

#### FR-10: 多入口体验

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-10.1 | Toolbar 按钮可配置 | P0 | 保存当前窗口 / 打开 Popup |
| FR-10.2 | New Tab 替换 | P0 | 新开标签直接进入管理器 |
| FR-10.3 | Popup 快捷操作 | P0 | Save/Open/Dedupe + 最近 Sessions |
| FR-10.4 | Popup 预览 | P1 | Hover 最近 Session 显示全部标签 |
| FR-10.5 | 右键菜单 | P0 | 页面/扩展按钮右键多种保存选项 |
| FR-10.6 | 键盘快捷键 | P0 | Alt+Shift+1 保存，Alt+Shift+Z 打开 |
| FR-10.7 | 保存后定位 | P0 | 新保存的 Session 高亮显示 |

#### FR-11: 设置与主题

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-11.1 | 基础设置 | P0 | 所有现有设置项完整保留 |
| FR-11.2 | 主题系统 | P0 | 浅色/深色/跟随系统 |
| FR-11.3 | Nord 色调 | P0 | 保持现有 Nord 配色风格 |
| FR-11.4 | 重置设置 | P1 | 高级选项可重置 |
| FR-11.5 | Chrome 快捷方式入口 | P1 | 设置页链接到 Chrome 快捷键配置 |

#### FR-12: 可访问性与键盘

| ID | 需求 | 优先级 | 验收标准 |
|----|------|--------|---------|
| FR-12.1 | Skip link | P1 | 跳转到主要内容 |
| FR-12.2 | 正确的 ARIA 标签 | P0 | 所有交互元素有适当 aria 属性 |
| FR-12.3 | 键盘焦点管理 | P0 | 弹窗关闭后焦点回到触发器 |
| FR-12.4 | 键盘导航 | P0 | 所有功能可键盘操作 |
| FR-12.5 | Focus ring | P0 | 清晰的焦点指示 |

### 2.4 非功能需求 (NFR)

| ID | 需求 | 指标 |
|----|------|------|
| NFR-1 | 性能 | 1000 个 Sessions 下滚动 60fps；保存操作 &lt; 200ms |
| NFR-2 | 包体积 | 初始加载 &lt; 200KB gzipped |
| NFR-3 | 数据兼容 | 完全兼容现有 `chrome.storage.local` 数据格式 |
| NFR-4 | 离线可用 | 100% 本地功能，无需网络 |
| NFR-5 | 浏览器兼容 | Chrome 115+ (Manifest V3) |
| NFR-6 | 可维护性 | 模块化组件，核心逻辑独立测试覆盖 ≥ 80% |
| NFR-7 | 构建速度 | HMR 热更新 &lt; 500ms |

---

## 3. 技术栈选型

### 3.1 框架选择: **React 18 + TypeScript + Vite**

**为什么 React?**
- 组件化模型适合拆分复杂 UI (当前 `manager.js` 是单体)
- 成熟的拖拽库生态 (dnd-kit, react-dnd)
- 状态管理选择丰富
- TypeScript 提供类型安全
- Vite 提供极快的 HMR 和构建

**为什么不用其他框架?**
- **Vue/Svelte**: 生态好但团队/社区对 React 拖拽和状态管理更熟悉
- **Solid/Svelte 5**: 性能好但 Chrome 扩展场景生态不如 React 成熟
- **无框架**: 当前就是无框架，`manager.js` 已证明不可持续

### 3.2 核心依赖选型

| 层面 | 选型 | 理由 |
|------|------|------|
| **UI 框架** | React 18 | Concurrent Mode、Suspense、成熟生态 |
| **语言** | TypeScript 5.x | 类型安全，减少重构 bug |
| **构建工具** | Vite 5.x + `@crxjs/vite-plugin` | 专为 Chrome 扩展优化，HMR 支持优秀 |
| **样式方案** | Tailwind CSS 3.x + CSS Variables | 原子化 CSS 开发快，CSS 变量做主题 |
| **UI 组件** | 自定义组件 + Radix UI Primitives | Radix 提供无样式可访问 primitive，样式自定义匹配 Nord |
| **状态管理** | Zustand | 轻量 (&lt; 1KB)、简单、支持 middleware、Chrome 扩展友好 |
| **拖拽** | @dnd-kit/core + @dnd-kit/sortable | 现代、可访问、支持触控、比 react-dnd 更灵活 |
| **表单** | React Hook Form | 轻量、性能好、类型安全 |
| **图标** | 继续用现有 Heroicons 自注册模式或 `lucide-react` | 保持现有图标风格，或用更丰富的 lucide |
| **数据持久化** | `chrome.storage.local` + Zustand persist middleware | 保持本地优先，无缝迁移现有数据 |
| **测试** | Vitest + Testing Library + Playwright | Vitest 快，Testing Library 测组件，Playwright 做 E2E 拖拽测试 |

### 3.3 关键依赖详细对比

#### 状态管理对比

| 方案 | 大小 | 学习曲线 | Chrome 扩展适配 | 适合场景 |
|------|------|---------|----------------|---------|
| **Zustand** | ~1KB | 极低 | 优秀 (subscribeWithSelector + persist) | ✅ 推荐 |
| Jotai | ~2KB | 中 | 良好 | 原子化状态好，但重涂需要精细优化 |
| Redux Toolkit | ~10KB | 中高 | 良好 | 太重量级，这个项目不需要 |
| React Context + useReducer | 0 | 低 | 优秀 | 性能问题，重渲染过多 |
| Valtio | ~3KB | 低 | 良好 | Proxy 模式好用但调试不如 Zustand 直观 |

**结论**: 选 **Zustand**。API 极简，完美适配 Chrome storage 持久化，支持选择器订阅避免不必要重渲染。

#### 拖拽库对比

| 方案 | 可访问性 | 触控支持 | 自定义拖拽图像 | 多拖拽 | 包大小 |
|------|---------|---------|--------------|--------|--------|
| **@dnd-kit** | ✅ 优秀 | ✅ 原生支持 | ✅ DragOverlay | ✅ | ~33KB |
| react-dnd | ⚠️ 需要自己处理 | ❌ 差 | ⚠️ HTML5 backend 限制 | ⚠️ 复杂 | ~45KB |
| react-beautiful-dnd | ✅ 好 | ❌ 不支持 | ❌ 受限 | ✅ | ~45KB (已不维护) |
| 原生 HTML DnD | ❌ | ❌ | ⚠️ Chrome bug 多 | ⚠️ 难实现 | 0 |

**结论**: 选 **@dnd-kit**。当前原生 DnD 在 Chrome 有很多事件时序 bug (文档明确提到)，@dnd-kit 用指针事件抽象，支持更好的视觉反馈和可访问性。

#### 样式方案对比

| 方案 | 开发效率 | 主题支持 | 包大小 | 与现有 CSS 兼容 |
|------|---------|---------|--------|----------------|
| **Tailwind + CSS Vars** | 极高 | ✅ 优秀 | ✅ JIT 极小 | ✅ 可以共存 |
| CSS Modules | 中 | ⚠️ 需要自己处理 | 0 | ✅ |
| Styled Components | 中高 | ✅ | ❌ 大 | ⚠️ 不 |
| Panda CSS | 高 | ✅ | ✅ | ⚠️ 需要迁移 |
| 继续手写 CSS | 低 | ✅ | 0 | ✅ |

**结论**: 选 **Tailwind CSS**。开发速度快、主题系统完善、和现有 CSS 变量可以完美配合保留 Nord 主题，Radix UI 也推荐用 Tailwind。

#### UI 组件 primitive 对比

| 方案 | 可访问性 | 无样式 | 可定制 | React 生态 |
|------|---------|--------|--------|-----------|
| **Radix UI Primitives** | ✅ 顶级 | ✅ | ✅ 极高 | ✅ |
| React Aria Components | ✅ 顶级 | ✅ | ✅ 极高 | ✅ |
| Headless UI | ✅ 好 | ✅ | ⚠️ 中等 | ✅ |
| shadcn/ui | ✅ 基于 Radix | ✅ | ✅ 极高 | ✅ (基于 Radix) |

**结论**: 直接用 **Radix UI Primitives** 构建自定义组件。shadcn/ui 是基于 Radix 的预组装组件，但我们的设计是 Nord 主题的高密度工作台风格，自己组装更合适。可以参考 shadcn/ui 的模式但不直接依赖。

### 3.4 Chrome 扩展专用: @crxjs/vite-plugin

为什么用这个插件:
- 自动处理 Manifest V3 入口
- 内容脚本/Service Worker 热更新
- React 组件 HMR 正常工作
- 静态资源处理正确
- 开发时自动重载扩展

### 3.5 package.json 依赖预览

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/modifiers": "^7.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@radix-ui/react-context-menu": "^2.1.5",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-toggle": "^1.0.3",
    "@radix-ui/react-scroll-area": "^1.0.5",
    "lucide-react": "^0.344.0",
    "react-hook-form": "^7.51.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/chrome": "^0.0.263",
    "@vitejs/plugin-react": "^4.2.0",
    "@crxjs/vite-plugin": "^2.0.0-beta.23",
    "typescript": "^5.4.0",
    "vite": "^5.1.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "vitest": "^1.3.0",
    "@testing-library/react": "^14.2.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0",
    "jsdom": "^24.0.0",
    "@playwright/test": "^1.42.0"
  }
}
```

---

## 4. 重构架构设计

### 4.1 目录结构

```
ziptab-react/
├── src/
│   ├── background/              # Service Worker (保持原生 JS 或轻量 TS)
│   │   ├── index.ts
│   │   ├── capture.ts           # 标签捕捉逻辑 (复用现有逻辑移植 TS)
│   │   ├── restore.ts           # 标签恢复逻辑
│   │   ├── context-menus.ts     # 右键菜单
│   │   ├── omnibox.ts           # 地址栏搜索
│   │   └── messaging.ts         # 消息传递
│   │
│   ├── shared/                  # 跨页面共享
│   │   ├── model/               # 数据模型 (从 model.js 移植，保持纯函数)
│   │   │   ├── types.ts         # TypeScript 类型定义
│   │   │   ├── schema.ts        # normalize、默认值、验证
│   │   │   ├── create.ts        # 创建实体 (workspace/folder/group/tab)
│   │   │   ├── import-export.ts # 导入导出解析
│   │   │   ├── search.ts        # 搜索匹配逻辑
│   │   │   └── move.ts          # 拖拽移动逻辑 (moveGroupTabs 等)
│   │   ├── store/               # Zustand store
│   │   │   ├── useZipTabStore.ts
│   │   │   └── storage.ts       # chrome.storage 适配
│   │   ├── hooks/               # 共享 React hooks
│   │   │   ├── useChromeTabs.ts
│   │   │   ├── useKeyboardShortcut.ts
│   │   │   ├── useDebounce.ts
│   │   │   └── useLocalStorage.ts
│   │   ├── icons/               # 图标组件
│   │   ├── utils/               # 工具函数
│   │   │   ├── cn.ts            # clsx + tailwind-merge
│   │   │   ├── url.ts
│   │   │   └── platform.ts
│   │   └── styles/
│   │       ├── globals.css      # 全局样式 + Tailwind 基础
│   │       ├── nord-theme.ts    # Nord 主题定义
│   │       └── theme.css        # CSS 变量定义
│   │
│   ├── manager/                 # 主工作台页面
│   │   ├── index.html
│   │   ├── main.tsx             # 入口
│   │   ├── App.tsx              # 根组件
│   │   ├── components/
│   │   │   ├── shell/
│   │   │   │   ├── AppShell.tsx        # 整体布局
│   │   │   │   ├── ManagerTopbar.tsx   # 顶部工具栏
│   │   │   │   └── WorkspaceBoard.tsx  # 工作区板
│   │   │   ├── sidebar/
│   │   │   │   ├── Sidebar.tsx         # 侧边栏容器
│   │   │   │   ├── SidebarRail.tsx     # 折叠窄轨
│   │   │   │   ├── WindowSelector.tsx  # 窗口选择器
│   │   │   │   ├── OpenTabsList.tsx    # 打开标签列表
│   │   │   │   ├── OpenTabItem.tsx     # 单个打开标签
│   │   │   │   ├── OpenTabsFilter.tsx  # 标签过滤
│   │   │   │   └── OpenTabsToolbar.tsx # 多选工具栏
│   │   │   ├── categories/
│   │   │   │   ├── CategoryNav.tsx     # 分类导航标签
│   │   │   │   ├── CategoryTab.tsx     # 单个分类标签
│   │   │   │   └── CreateCategory.tsx  # 新建分类
│   │   │   ├── sessions/
│   │   │   │   ├── SessionList.tsx     # Session 横向列表
│   │   │   │   ├── SessionCard.tsx     # Session 卡片
│   │   │   │   ├── SessionHeader.tsx   # 卡片头部
│   │   │   │   ├── SessionTabs.tsx     # 卡片标签列表
│   │   │   │   ├── TabItem.tsx         # 单个保存标签
│   │   │   │   ├── NoteItem.tsx        # 笔记条目
│   │   │   │   ├── AddItemMenu.tsx     # 添加链接/笔记
│   │   │   │   └── SessionContextMenu.tsx
│   │   │   ├── workspace/
│   │   │   │   ├── WorkspaceSwitcher.tsx
│   │   │   │   └── WorkspaceMenu.tsx
│   │   │   ├── search/
│   │   │   │   ├── SearchBox.tsx
│   │   │   │   ├── SearchModal.tsx     # Command Palette
│   │   │   │   └── SearchResult.tsx
│   │   │   ├── dnd/                   # 拖拽相关
│   │   │   │   ├── DnDProvider.tsx
│   │   │   │   ├── SortableSession.tsx
│   │   │   │   ├── SortableTab.tsx
│   │   │   │   ├── DraggableOpenTab.tsx
│   │   │   │   ├── SessionDragOverlay.tsx
│   │   │   │   └── NewSessionDropzone.tsx
│   │   │   └── ui/                     # 基础 UI 组件 (基于 Radix)
│   │   │       ├── Button.tsx
│   │   │       ├── IconButton.tsx
│   │   │       ├── Input.tsx
│   │   │       ├── Dialog.tsx
│   │   │       ├── DropdownMenu.tsx
│   │   │       ├── ContextMenu.tsx
│   │   │       ├── Tooltip.tsx
│   │   │       ├── Select.tsx
│   │   │       ├── Badge.tsx
│   │   │       ├── ScrollArea.tsx
│   │   │       └── Toast.tsx
│   │   ├── features/                   # 复杂功能模块
│   │   │   ├── bin/
│   │   │   │   ├── BinModal.tsx
│   │   │   │   └── useBin.ts
│   │   │   ├── import-export/
│   │   │   │   ├── ImportModal.tsx
│   │   │   │   ├── ExportModal.tsx
│   │   │   │   └── useImportExport.ts
│   │   │   ├── inline-edit/
│   │   │   │   └── InlineRename.tsx
│   │   │   └── toasts/
│   │   │       └── Toaster.tsx
│   │   └── hooks/                      # 页面级 hooks
│   │       ├── useActiveWorkspace.ts
│   │       ├── useVisibleSessions.ts
│   │       ├── useOpenTabs.ts
│   │       └── useSessionSelection.ts
│   │
│   ├── popup/                    # 弹出页
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── Popup.tsx
│   │   └── components/
│   │       ├── QuickActions.tsx
│   │       ├── RecentSessions.tsx
│   │       └── SessionPreview.tsx
│   │
│   └── options/                  # 设置页
│       ├── index.html
│       ├── main.tsx
│       ├── Options.tsx
│       └── components/
│           ├── BasicSettings.tsx
│           ├── AdvancedSettings.tsx
│           └── ThemeSelector.tsx
│
├── public/                       # 静态资源
│   ├── icons/                    # 扩展图标
│   └── manifest.json             # 由 @crxjs 处理
│
├── tests/
│   ├── unit/                     # 单元测试 (shared/model 为主)
│   ├── component/                # 组件测试
│   └── e2e/                      # Playwright E2E
│       └── extension.spec.ts
│
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### 4.2 架构分层

```
┌─────────────────────────────────────────────────────────┐
│                  UI Layer (React Components)           │
│  Manager / Popup / Options        Radix Primitives     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              State/Action Layer (Zustand)               │
│  useZipTabStore: state + actions + selectors            │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Domain Layer (Pure Functions)              │
│  model/*: types, schema, import/export, search, move   │
│  无 DOM/React/Chrome API 依赖，100% 可单元测试          │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│           Platform/Chrome API Layer                     │
│  background/*, chrome.tabs, chrome.storage, messaging   │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Zustand Store 设计

```typescript
// src/shared/store/useZipTabStore.ts

interface ZipTabState {
  // Data
  workspaces: Workspace[]
  activeWorkspaceId: string
  groups: Group[]
  folders: Folder[]
  categoryOrderByWorkspace: Record&lt;string, string[]&gt;
  bin: BinEntry[]
  settings: Settings
  quickList: Tab[] // legacy
  
  // UI State (不持久化)
  activeCategoryId: string // 'inbox' | 'starred' | folderId
  searchQuery: string
  openTabsQuery: string
  openTabFilter: { url: string } | null
  sidebarCollapsed: boolean
  selectedOpenTabIds: Set&lt;string&gt;
  selectedTabIdsByGroup: Record&lt;string, Set&lt;string&gt;&gt;
  draggedItem: DragItem | null
  
  // Actions
  // Workspace
  setActiveWorkspace: (id: string) =&gt; void
  createWorkspace: (name: string) =&gt; void
  renameWorkspace: (id: string, name: string) =&gt; void
  
  // Categories
  createCategory: (name: string, workspaceId: string) =&gt; void
  renameCategory: (id: string, name: string) =&gt; void
  deleteCategory: (id: string) =&gt; void
  reorderCategories: (workspaceId: string, order: string[]) =&gt; void
  setActiveCategory: (id: string) =&gt; void
  
  // Sessions/Groups
  createSession: (tabs: Tab[], options?: Partial&lt;Group&gt;) =&gt; string
  updateSession: (id: string, updates: Partial&lt;Group&gt;) =&gt; void
  deleteSession: (id: string) =&gt; void
  moveSession: (id: string, targetCategoryId: string, targetIndex: number) =&gt; void
  moveSessionToCategory: (id: string, categoryId: string) =&gt; void
  lockSession: (id: string, locked: boolean) =&gt; void
  starSession: (id: string, starred: boolean) =&gt; void
  renameSession: (id: string, title: string) =&gt; void
  setSessionNote: (id: string, note: string) =&gt; void
  
  // Tabs/Items
  addTabToSession: (groupId: string, tab: Omit&lt;Tab, 'id'&gt;, index?: number) =&gt; void
  moveTabs: (refs: TabRef[], targetGroupId: string, targetTabId?: string, placement?: 'before'|'after') =&gt; void
  updateTab: (groupId: string, tabId: string, updates: Partial&lt;Tab&gt;) =&gt; void
  deleteTab: (groupId: string, tabId: string) =&gt; void
  
  // Open tabs selection
  toggleOpenTabSelection: (windowId: number, tabId: number) =&gt; void
  selectAllOpenTabs: (tabs: OpenTab[]) =&gt; void
  clearOpenTabSelection: () =&gt; void
  createSessionFromSelectedOpenTabs: () =&gt; Promise&lt;void&gt;
  
  // Search/filter
  setSearchQuery: (q: string) =&gt; void
  setOpenTabsQuery: (q: string) =&gt; void
  setOpenTabFilter: (url: string | null) =&gt; void
  
  // Sidebar
  toggleSidebar: () =&gt; void
  setSidebarCollapsed: (collapsed: boolean) =&gt; void
  
  // Settings
  updateSettings: (updates: Partial&lt;Settings&gt;) =&gt; void
  resetSettings: () =&gt; void
  
  // Bin
  restoreFromBin: (binEntryId: string) =&gt; void
  deleteFromBinPermanently: (binEntryId: string) =&gt; void
  emptyBin: () =&gt; void
  
  // Import/Export
  importData: (payload: string) =&gt; { success: boolean; count: number }
  exportAsText: () =&gt; string
  exportAsJson: () =&gt; string
}
```

Store 使用 middleware:
- `persist`: 自动同步到 `chrome.storage.local`
- `subscribeWithSelector`: 细粒度订阅
- UI 状态 (非持久化) 用独立的 store 或在 persist 中 blacklist

### 4.4 消息传递设计

Background 和 UI 页面之间用类型安全的消息:

```typescript
// shared/messaging/types.ts
type MessageMap = {
  'capture-window': {
    request: { mode: CaptureMode; anchorTabId?: number }
    response: { storedTabs: number; groupId?: string }
  }
  'list-open-tabs': {
    request: {}
    response: { windows: BrowserWindow[] }
  }
  'restore-tab': {
    request: { groupId: string; tabId: string }
    response: { success: boolean }
  }
  'restore-group': {
    request: { groupId: string; inNewWindow?: boolean }
    response: { restoredCount: number }
  }
  'create-browser-window': {
    request: {}
    response: { windowId: number }
  }
}
```

封装 `sendMessage()` 提供完整类型安全。

### 4.5 拖拽架构 (基于 @dnd-kit)

```
DnDProvider (整个 manager)
├── DragOverlay (渲染跟随指针的拖拽预览)
│
├── SortableContext (session 横向排序)
│   └── SortableSession × N
│       └── useSortable
│           └── SessionCard
│               └── SortableContext (内部 tabs 纵向排序)
│                   └── SortableTab × M
│
├── Droppable (CategoryTab 作为 drop target)
├── Droppable (NewSessionDropzone - 空白处新建)
└── Draggable (OpenTabItem)
```

关键实现点 (对应现有 manager-view.js 中的逻辑):

1. **Session 拖拽目标检测**: 用 `onDragMove` 计算指针在目标卡的位置 (左右 25% vs 中间 50%)
2. **Target slot 锁定**: 进入中间 50% 后用 hysteresis margin 保持锁定，减少回闪
3. **DragOverlay**: 自定义拖拽图像，避免浏览器原生截图问题
4. **Placeholder**: 源位置显示 `group-insert-marker` 占位符
5. **多拖拽**: 选中多个 open tabs 时一起拖，用 DragOverlay 显示堆叠预览

### 4.6 数据模型移植

`src/shared/model/` 直接从现有 `model.js` 移植到 TypeScript:
- 保持纯函数，无副作用
- 保留完整的 `normalizeState()` 兼容现有数据
- 所有函数保持同名同签名，减少迁移风险
- 添加完整类型定义
- 现有测试可以直接移植验证

**100% 数据兼容是最高优先级**: 现有用户升级后数据无缝迁移，不丢失任何内容。

### 4.7 主题系统

用 CSS 变量 + Tailwind 保留 Nord 主题:

```typescript
// tailwind.config.ts
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nord: {
          0: 'rgb(var(--nord0) / &lt;alpha-value&gt;)',
          1: 'rgb(var(--nord1) / &lt;alpha-value&gt;)',
          // ... 所有 Nord 颜色
        },
        zt: {
          canvas: 'rgb(var(--zt-canvas) / &lt;alpha-value&gt;)',
          surface: 'rgb(var(--zt-surface) / &lt;alpha-value&gt;)',
          // ... 映射到现有 --zt-* 变量
        }
      },
      borderRadius: {
        'zt-control': 'var(--radius-control)',
      },
      height: {
        'zt-header': 'var(--manager-header-height)',
        'zt-control': 'var(--manager-control-height)',
      }
    }
  },
  plugins: []
}
```

现有 `styles.css` 中的 CSS 变量定义可以大部分保留，确保视觉一致性。

---

## 5. UX 设计方案

### 5.1 设计方向

**Aesthetic Direction: Calm Workbench (静谧工作台)**

延续现有 "dense but calm" 的产品原则:
- **不是**营销式 landing page
- **不是**极简留白艺术站
- **是**高密度但不压抑的工作工具
- **感觉**像专业开发者的工作台: 信息丰富、条理清晰、反馈明确、操作顺手

**Tone**: Nordic industrial / refined utility
- 主色保持 Nord 冷调，冷静专业
- 高密度信息布局，但通过留白和层级保持呼吸感
- 微动效精致但不花哨
- 阴影和圆角克制，不做过度玻璃拟态

**Typography**:
- Display/标题: **IBM Plex Sans** 或 **Space Grotesk**? → 选 **Geist** 或保留系统无衬线 → 最终推荐 **Inter Tight** 作为标题，系统字体作为正文
  - 等宽数字: **JetBrains Mono** (用于 tab counts 等统计)
- 正文: 系统字体栈 `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` (和现有一致，保证原生感)
- 字号: 正文 14px (比现有 15px 略小以适配更高密度)，标题 13px/600 weight

**Do Not**:
- ❌ 不要紫蓝渐变
- ❌ 不要 Inter/Roboto/Arial 系统默认泛滥
- ❌ 不要过度圆角和阴影
- ❌ 不要卡片套卡片
- ❌ 不要到处玻璃拟态
- ✅ 要克制的 8-10px 圆角
- ✅ 要微妙的悬停状态
- ✅ 要清晰的拖拽指示线
- ✅ 要明确的键盘焦点环

### 5.2 布局结构 (保持现有交互模型，优化细节)

```
┌─────────────────────────────────────────────────────────────────┐
│ ◉ 64px Topbar                                                    │
│ ┌──────────┬──────────────────────────────┬───────────────────┐ │
│ │ Workspace│ Inbox · Starred · Work · ... │ 🔍 ⬇ ⬆ 🗑 ⚙      │ │
│ │ ▼ Personal│ [Cat tabs drag-sortable]    │  (actions right)  │ │
│ └──────────┴──────────────────────────────┴───────────────────┘ │
├────────┬────────────────────────────────────────────────────────┤
│ 62px   │ Session Board (horizontally scrollable row)             │
│ Rail   │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │
│ (win   │ │Session │ │Session │ │Session │ │  New   │            │
│ icons) │ │  Card  │◀┤  Card  │─▶  Card  │ │ Session│ (drop)     │
│        │ │  42px  │ │        │ │        │ │  zone  │            │
│   ───  │ └────────┘ └────────┘ └────────┘ └────────┘            │
│ Filter │                                                         │
│ tabs   │  Cards are full-height, tabs scroll inside              │
│ [____] │                                                         │
└────────┴─────────────────────────────────────────────────────────┘
```

### 5.3 交互增强 (在现有基础上提升)

#### 5.3.1 拖拽体验增强 (解决现有原生 DnD bug)

现有问题（文档明确提到）:
- HTML DnD 事件时序在 Chrome 中脆弱
- 原元素隐藏、drag image、placeholder 重排叠加时 bug 多

@dnd-kit 改进:
1. **自定义 DragOverlay**: 拖拽时渲染高质量预览，不用浏览器原生截图
2. **Pointer 事件抽象**: 不依赖 HTML5 DnD，事件时序完全可控
3. **Smooth 动画**: 用 `@dnd-kit/modifiers` 加 snap 动画
4. **触控支持**: 原生支持平板/触控板拖拽
5. **更好的目标锁定**: 重新实现 target slot hysteresis，减少视觉回闪

#### 5.3.2 动画与微交互

遵循 **"high-impact orchestration over scattered micro"** 原则:

1. **首次加载**: 侧边栏滑入 → 顶栏淡入 → Session cards 交错上浮 (50ms stagger，总时长 ≤ 350ms)
2. **Session 创建**: 新卡片从侧边滑入 + 轻微 highlight 脉冲 1.5s 后淡出
3. **拖拽**: 被拖拽项轻微 scale(1.02) + shadow 加深；target 位置显示明亮的插入线
4. **Hover**: 按钮 hover 用 subtle background-color 160ms transition (和现有一致)
5. **Restore 点击**: 点击链接时 card 内部项有轻微的 slide-out 反馈 (如果 deleteRestoredTabs)
6. **Toast**: 从右上角滑入，保持简洁
7. **Sidebar 折叠/展开**: 平滑宽度动画，rail 模式下 hover 覆盖层不推动内容

**原则**: 所有动画 ≤ 200ms (简单) / ≤ 350ms (复杂序列)，保持响应感。不用 bouncy/spring 过度动画，保持工具感的 easing (cubic-bezier(0.4, 0, 0.2, 1))。

#### 5.3.3 搜索体验增强

1. **Cmd/Ctrl+K Command Palette**:
   - 模糊搜索 (fuse.js 或简单 substring + 权重)
   - 结果分组: Tabs / Sessions
   - 键盘导航: ↑↓ 选择，Enter restore，⌘+Enter reveal in session
   - 快捷键提示显示在右侧

2. **即时搜索反馈**: 输入时 cards 平滑过滤，不闪烁
3. **搜索高亮**: 匹配文字用 Nord 13 (黄) 或 Nord 8 (青) 高亮
4. **搜索状态保留**: 收起搜索框后图标按钮有 active indicator，展开保留 query (现有功能保留)

#### 5.3.4 右键菜单增强

用 Radix Context Menu 替代原生右键菜单:
- 更一致的视觉，匹配主题
- 支持子菜单
- 支持快捷键提示
- 更好的可访问性

菜单内容保持和现有一致，不新增功能。

#### 5.3.5 多选模式增强

Open tabs 多选和 Session 内多选:
- 选中行有明确的背景色 (--zt-selection)
- 顶部工具栏显示选中数量 + 可用动作
- 多选拖拽时 DragOverlay 显示堆叠预览 ("+3" 徽章)
- Esc 清空选择

#### 5.3.6 空状态优化

- 空 Inbox: 简洁提示 "No saved sessions in Inbox. Try saving your current window with Alt+Shift+1"
- 空搜索结果: "No results for '{query}'"
- 首次使用: 简洁的 onboarding 提示，不做强制 tour

### 5.4 可访问性 (A11y) 提升

- 所有交互元素有适当 ARIA roles/labels
- 拖拽支持键盘操作 (@dnd-kit 内置支持)
  - Space 开始拖拽
  - 方向键移动
  - Space 放置
  - Esc 取消
- 焦点管理: 弹窗/菜单关闭后焦点返回触发元素
-  prefers-reduced-motion 尊重: 禁用动画
- 颜色对比度满足 WCAG AA
- 保持 Skip link

### 5.5 响应式/窄屏考虑

虽然 Chrome 管理器通常在桌面，但新标签页可能在不同宽度:
- &lt; 900px: Sidebar 默认折叠
- &lt; 700px: Session cards 宽度收窄，横向滚动更流畅
- 始终保证 64px/62px 顶部/侧边栏控件可点击 (≥ 32px 触控目标)

### 5.6 Popup 重设计

保持紧凑，但视觉更统一:
- 3 个主要动作: Save / Open Manager / Dedupe
- Recent sessions 列表
- Hover 显示 session tabs 预览 (Popover 组件)
- 搜索框快速跳转

Popup 尺寸: 360px × 480px，不改变太大。

### 5.7 Options 重设计

分 Basic / Advanced 两栏卡片:
- 左侧导航: Basic / Advanced
- 右侧表单: 用 Switch 组件替代 checkbox，视觉更现代
- Theme 选择用 Segmented Control
- 重置按钮在 Advanced 底部，红色警告样式

---

## 6. 实施路线图

建议分 7 个阶段，每个阶段结束都有可运行、可验证的产物。

### Phase 0: 项目初始化 (0.5 天)

- [ ] Vite + @crxjs + React + TS 项目搭建
- [ ] Tailwind CSS 配置，Nord 主题变量移植
- [ ] 配置路径别名 `@/` 指向 `src/`
- [ ] 配置 Vitest + Testing Library
- [ ] 能加载空白扩展，HMR 工作
- [ ] 确认 manifest.json 正确生成

**验收**: 空白扩展可加载到 Chrome，打开 manager 显示 Hello World。

### Phase 1: 数据层 + 基础 UI (1.5 天)

- [ ] 移植 `model.js` → TypeScript，带完整类型
- [ ] 移植所有 model 单元测试，全部通过
- [ ] 配置 Zustand store + chrome.storage 持久化
- [ ] 验证现有数据 normalize 兼容 (用真实用户数据测试)
- [ ] 构建基础 UI 组件 (Button, IconButton, Input, Dialog, DropdownMenu, Tooltip, ContextMenu, Badge, ScrollArea)
- [ ] 图标系统 (lucide-react 或自注册，保持现有图标名映射)

**验收**: 模型层 100% 测试通过；基础 UI 组件可在 demo 页使用；从现有存储加载数据正确。

### Phase 2: App Shell + 导航 (1 天)

- [ ] AppShell 布局 (Sidebar + Topbar + Board)
- [ ] WorkspaceSwitcher 下拉
- [ ] CategoryNav 标签切换 (不含拖拽)
- [ ] Sidebar 折叠/展开
- [ ] 主题切换 (system/light/dark)
- [ ] Toast 通知系统

**验收**: 空 shell 可以切换 workspace/category，侧边栏折叠正常，主题切换工作。

### Phase 3: Open Tabs Sidebar (1.5 天)

- [ ] chrome.tabs 查询封装 (useChromeTabs hook)
- [ ] WindowSelector 窗口切换
- [ ] OpenTabsList 显示选中窗口标签
- [ ] Pinned 标签徽章
- [ ] OpenTabsFilter 底部过滤
- [ ] 多选模式 + Select toolbar
- [ ] 保存当前窗口 / 保存选中功能 (对接 background)
- [ ] URL 反查过滤 (右键 filter sessions by this URL)

**验收**: 侧边栏功能完整；可以保存当前窗口到 Inbox。

### Phase 4: Session Cards 静态渲染 (1 天)

- [ ] SessionList 横向滚动
- [ ] SessionCard 完整渲染 (标题、favicon 堆叠、徽章、tabs 列表)
- [ ] TabItem 渲染 (favicon, title, url, note)
- [ ] Restore 按钮工作 (对接 background)
- [ ] 内联重命名
- [ ] Session 右键菜单
- [ ] Tab 右键菜单 + 单 Session 多选
- [ ] Add link/note 功能
- [ ] Lock/Star/Delete 功能

**验收**: Sessions 可正确渲染，单条 restore 工作，基本编辑功能完整。

### Phase 5: 拖拽系统 (2 天) — 最复杂

- [ ] DnDProvider 搭建
- [ ] Session 横向 sortable (同分类重排)
- [ ] Session placeholder + DragOverlay
- [ ] Session 拖到其他分类
- [ ] Session target slot 逻辑 (25%/50%/25% + hysteresis lock)
- [ ] Tab 纵向 sortable (Session 内部排序)
- [ ] Tab 跨 Session 移动
- [ ] OpenTab 拖入现有 Session
- [ ] 多 OpenTab 批量拖拽
- [ ] NewSessionDropzone (拖到空白新建)
- [ ] 拖到分类标签移动
- [ ] 键盘可访问拖拽
- [ ] 完整手动测试所有拖拽场景 (对照 AGENTS.md 清单)

**验收**: 所有 AGENTS.md 中列出的拖拽测试场景都通过。

### Phase 6: 搜索 + 弹窗功能 (1 天)

- [ ] 顶部 SearchBox
- [ ] SearchModal (Cmd/Ctrl+K) 命令面板
- [ ] `/` 快捷键聚焦搜索
- [ ] BinModal 回收站
- [ ] ImportModal 导入 (JSON/text/OneTab)
- [ ] ExportModal 导出 (copy text/download text/download JSON)

**验收**: 搜索过滤正确；导入导出 round-trip 正常；回收站恢复/删除工作。

### Phase 7: Popup + Options + 收尾 (1.5 天)

- [ ] Popup 页面实现 (QuickActions, RecentSessions, hover preview)
- [ ] Options 页面实现 (Basic/Advanced 设置)
- [ ] Toolbar 按钮行为配置
- [ ] Omnibox `zt` 搜索
- [ ] Keyboard commands 适配
- [ ] Context menus 右键菜单对接
- [ ] 保存后定位/高亮新 Session
- [ ] 性能优化 (虚拟列表? 先测，必要时加)
- [ ] Playwright E2E 测试搭建，覆盖关键流程
- [ ] 最终回归测试 + 视觉检查

### 总计: ~10 个工作日

---

## 7. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 拖拽实现复杂，目标 slot 逻辑难复刻 | 高 | 中 | Phase 5 单独留 2 天；先用 @dnd-kit 做 POC 验证再继续；保留现有 model 的 move 逻辑纯函数可直接复用 |
| @crxjs HMR/构建有坑 | 中 | 中 | Phase 0 先验证完整开发流程；有备选方案用多 Vite entry 手动配置 |
| 性能: Sessions 数量大时重渲染 | 中 | 低 | Zustand 选择器订阅；必要时用 `React.memo` + `useShallow`；虚拟列表最后再加 |
| 数据迁移丢失用户数据 | 极高 | 低 | model 层直接移植现有 normalize 逻辑；用真实测试数据验证；persist 版本升级前做数据备份 |
| Manifest V3 service worker 限制 | 中 | 中 | Background 保持纯 JS/TS 不引入 React；用标准 `chrome.runtime.sendMessage` |
| 视觉还原不到位，用户不习惯 | 中 | 中 | 保留所有 CSS 变量；Tailwind 只做原子类辅助；逐像素对比关键页面；做用户切换可选方案(可保留旧版入口一段时间) |
| 功能遗漏 | 高 | 中 | 对照 feature-spec.md 逐条验收；Phase 7 做完整 checklist 回归 |

---

## 8. 开发约定

遵循 Vercel React Best Practices:

1. **Eliminate waterfalls**: 并行读取 chrome.storage 和 chrome.tabs，用 Promise.all
2. **Bundle size**: 动态导入重组件 (SearchModal, BinModal, Import/Export modals)
3. **Re-render optimization**:
   - Zustand 用选择器订阅需要的 state，不订阅整个 store
   - 列表项用 `React.memo` 避免无关重渲染
   - 回调用 `useCallback` 稳定引用
   - 衍生状态在 render 时计算，不用 useEffect
4. **Client state**: 
   - UI 状态 (sidebarCollapsed, selectedIds) 不持久化到 chrome.storage
   - 搜索输入用 `useDeferredValue` 保持输入流畅
5. **组件组织**: 不在组件内部定义组件；共享组件放 `components/ui/`，页面特有组件放对应目录
6. **No barrel files**: 直接导入，避免 barrel import 问题

---

## 9. 下一步

请 Review 本方案后确认:

1. **技术栈**: React + TS + Vite + Zustand + @dnd-kit + Tailwind + Radix 这个组合是否认可?
2. **UX 方向**: Calm Nord Workbench 方向，不做大幅视觉改版，重点优化交互和代码结构，是否认可?
3. **路线图**: 分 7 Phase 推进是否合适?
4. **优先级**: 有没有特别需要优先做或延后做的功能?
5. **其他**: 是否有其他想调整的设计决策?

确认后我将开始 Phase 0 实施。
