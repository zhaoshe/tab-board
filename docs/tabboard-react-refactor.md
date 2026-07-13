# ZipTab → TabBoard 重构记录

> 本文档记录了将 ZipTab 从原生 JS/DOM 技术栈重构为 React + Mantine + TypeScript 技术栈的完整过程。供其他 Agent 快速理解项目现状。

---

## 1. 项目背景与重构目标

### 1.1 为什么重构

- 原有技术栈：原生 ES Modules + 手写 DOM + Web Awesome Web Components
- 代码分散在多个 .js 文件中，维护成本高
- 没有类型系统，容易出 bug
- UI 组件库 Web Awesome 生态较小，组件不够丰富
- 没有构建步骤，限制了代码组织方式

### 1.2 重构目标

1. **技术栈升级**：迁移到 React 18 + TypeScript + Mantine UI
2. **产品重命名**：ZipTab → **TabBoard**
3. **功能对齐**：保持与重构前完全一致的功能集
4. **状态管理**：引入 Zustand 替代直接操作 chrome.storage
5. **构建工具**：Vite + @crxjs/vite-plugin（Chrome 扩展专用）
6. **拖拽交互**：使用 @dnd-kit 替代手写 DnD

---

## 2. 技术栈对比

| 维度 | 重构前 (ZipTab) | 重构后 (TabBoard) |
|------|-----------------|-------------------|
| 框架 | 原生 JS (ES Modules) | React 18 |
| 语言 | JavaScript | TypeScript 5.x |
| UI 库 | Web Awesome 3.10.0 (Web Components) | Mantine v7 (150+ 组件) |
| 状态管理 | 直接操作 chrome.storage.local | Zustand + chrome.storage 持久化 |
| 构建工具 | 无（直接运行） | Vite 5.x + @crxjs/vite-plugin |
| 图标库 | Web Awesome SVG | @tabler/icons-react |
| 拖拽 | 手写 HTML5 DnD API | @dnd-kit (core + sortable + utilities) |
| 测试 | 无 | Vitest |
| 产品名 | ZipTab | TabBoard |
| Omnibox 关键字 | `ziptab` | `tb` |
| 快捷键 | Alt+Shift+Z | Alt+Shift+B |
| Storage Key | `ziptabState` | `tabboardState` |

---

## 3. 规划与实施过程

### 3.1 总体策略

采用「从底层到上层」的重构顺序：

```
数据模型 → Store层 → 后台Service Worker → UI组件 → 页面组装
```

### 3.2 实施阶段

#### 阶段一：基础设施搭建
- 初始化 package.json，安装所有依赖
- 配置 TypeScript (tsconfig.json)
- 配置 Vite + @crxjs/vite-plugin (vite.config.ts)
- 更新 manifest.json（产品名、图标、入口）

#### 阶段二：数据层迁移
- 将 `src/model.js` 拆分为 TypeScript 模块：
  - `types.ts` - 类型定义
  - `constants.ts` - 常量
  - `schema.ts` - 创建、规范化函数
  - `search.ts` - 搜索匹配函数
  - `import-export.ts` - 导入导出功能
- 封装 `chromeStorage.ts`（chrome.storage 的 Promise 化）
- 实现 Zustand store (`useTabBoardStore.ts`)

#### 阶段三：Background 迁移
- 将 `src/background.js` 完整迁移到 TypeScript
- 保持所有原有功能：
  - 右键上下文菜单（8个菜单项）
  - Omnibox 搜索
  - 命令快捷键
  - 完整的消息处理（15+ 种消息类型）
  - 标签恢复功能（单个/分组/全部）
  - 浏览器标签组保存/恢复

#### 阶段四：UI 组件开发
- Manager 主界面布局 (AppShell)
- 侧边栏导航（分类列表、工作区）
- 会话卡片 (SessionCard)
- 标签行 (TabItemRow)
- 搜索栏 (SearchBar)
- 设置页面 (Options)
- Popup 弹出页

#### 阶段五：功能补全
- Bin 回收站界面
- 导入导出弹窗
- Open Tabs 侧边栏
- 工作区管理（创建/重命名/删除）
- 分类管理（创建/重命名/删除/颜色）
- 会话编辑（重命名/笔记/星标/锁定/折叠）
- 标签恢复功能
- 深色模式支持
- Toast 通知系统
- 键盘快捷键帮助

#### 阶段六：拖拽功能
- 使用 @dnd-kit 实现
- 会话卡片拖拽排序（同分类）
- 会话跨分类移动（拖到侧边栏）
- 标签拖拽排序（同会话）
- 标签跨会话移动
- 视觉反馈（占位符、高亮、阴影）

---

## 4. 文件结构

### 4.1 重构前文件结构

```
src/
├── background.js          # Service Worker
├── manager.js             # Manager 主逻辑
├── manager-startup.js     # 启动初始化
├── manager-view.js        # 视图渲染
├── manager-overlays.js    # 弹窗/菜单
├── model.js               # 数据模型
├── store.js               # 存储封装
├── options.js             # 设置页逻辑
├── options-view.js        # 设置页视图
├── popup.js               # Popup 逻辑
├── popup-view.js          # Popup 视图
├── icons.js               # 图标注册
├── webawesome-controls.js # Web Components 封装
├── feedback-copy.js       # 文案工具
├── styles.css             # 全局样式
├── options.css            # 设置页样式
└── popup.css              # Popup 样式
```

### 4.2 重构后文件结构

```
src/
├── background/
│   └── service-worker.ts              # Service Worker (完整功能)
│
├── shared/                            # 共享层
│   ├── model/
│   │   ├── index.ts                   # 统一导出
│   │   ├── types.ts                   # TypeScript 类型定义
│   │   ├── constants.ts               # 常量定义
│   │   ├── schema.ts                  # 创建/规范化/工具函数
│   │   ├── search.ts                  # 搜索匹配逻辑
│   │   └── import-export.ts           # 导入导出解析/生成
│   ├── store/
│   │   ├── chromeStorage.ts           # chrome.storage Promise 封装
│   │   └── useTabBoardStore.ts        # Zustand Store (CRUD + 业务方法)
│   ├── styles/
│   │   └── theme.ts                   # Mantine 主题配置 (Nord 配色)
│   ├── hooks/
│   │   ├── useStoreHydration.ts       # Store 水化 Hook
│   │   └── useColorScheme.ts          # 主题模式 Hook
│   └── utils/
│       └── events.ts                  # 事件总线工具
│
├── manager/                           # Manager 主页面
│   ├── ManagerApp.tsx                 # 根组件
│   ├── main.tsx                       # 入口文件
│   ├── components/
│   │   ├── shell/
│   │   │   ├── ManagerLayout.tsx      # AppShell 布局 + DndContext
│   │   │   ├── KeyboardShortcutsHelp.tsx  # 快捷键帮助弹窗
│   │   │   ├── useToastNotifications.ts   # Toast 通知
│   │   │   └── useToast.tsx           # Toast Hook
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx            # 侧边栏导航
│   │   │   └── OpenTabsPanel.tsx      # 打开标签面板
│   │   ├── search/
│   │   │   └── SearchBar.tsx          # 搜索栏
│   │   ├── sessions/
│   │   │   ├── SessionCard.tsx        # 会话卡片 (支持拖拽)
│   │   │   ├── TabItemRow.tsx         # 标签行 (支持拖拽)
│   │   │   └── SessionPlaceholder.tsx # 拖拽占位符
│   │   ├── workspace/
│   │   │   └── WorkspaceContent.tsx   # 工作区内容 (SortableContext)
│   │   ├── bin/
│   │   │   └── BinView.tsx            # 回收站视图
│   │   └── import-export/
│   │       ├── ImportModal.tsx        # 导入弹窗
│   │       └── ExportModal.tsx        # 导出弹窗
│   └── hooks/
│       ├── useFilteredGroups.ts       # 过滤/搜索 Hook
│       └── useToast.tsx               # Toast Hook
│
├── popup/                             # Popup 弹出页
│   ├── PopupApp.tsx                   # Popup 主组件
│   └── main.tsx                       # 入口文件
│
├── options/                           # 设置页面
│   ├── OptionsApp.tsx                 # 设置页主组件
│   └── main.tsx                       # 入口文件
│
├── background.js                      # 旧版 (保留参考)
├── manager.js                         # 旧版 (保留参考)
├── model.js                           # 旧版 (保留参考)
└── ... 其他旧版文件                    # 旧版 (保留参考)
```

---

## 5. 功能完整对照表

### 5.1 核心功能

| 功能 | 重构前 | 重构后 | 备注 |
|------|--------|--------|------|
| 工作区管理 | ✅ | ✅ | 创建/重命名/删除/切换 |
| 分类管理 | ✅ | ✅ | 创建/重命名/删除/颜色/计数 |
| 会话管理 | ✅ | ✅ | CRUD/星标/锁定/折叠/笔记 |
| 标签管理 | ✅ | ✅ | CRUD/星标/笔记/恢复 |
| 标签恢复 | ✅ | ✅ | 单个/分组/全部 |
| 浏览器标签组 | ✅ | ✅ | 保存/恢复 BrowserGroup |
| 搜索功能 | ✅ | ✅ | 标题/URL/笔记/会话 |
| Bin 回收站 | ✅ | ✅ | 恢复/删除/清空 |
| 导入导出 | ✅ | ✅ | JSON/OneTab 文本 |
| Open Tabs 面板 | ✅ | ✅ | 窗口列表/标签预览/批量保存 |
| Popup 弹出页 | ✅ | ✅ | 标签列表/勾选/保存 |
| Options 设置页 | ✅ | ✅ | 所有设置项 |

### 5.2 后台 & 集成

| 功能 | 重构前 | 重构后 | 备注 |
|------|--------|--------|------|
| 右键上下文菜单 | ✅ | ✅ | 8个菜单项 |
| Omnibox 搜索 | ✅ | ✅ | 关键字从 ziptab 改为 tb |
| 键盘快捷键 | ✅ | ✅ | Alt+Shift+B (保存), Alt+Shift+O (管理器) |
| 深色模式 | ✅ | ✅ | System/Light/Dark |
| Toast 通知 | ✅ | ✅ | 操作反馈 |
| 快捷键帮助 | ❌ | ✅ | 按 `?` 显示 |

### 5.3 拖拽功能

| 功能 | 重构前 | 重构后 | 技术方案 |
|------|--------|--------|----------|
| 会话卡片重排序 | ✅ | ✅ | @dnd-kit sortable |
| 会话跨分类移动 | ✅ | ✅ | @dnd-kit droppable |
| 标签项重排序 | ✅ | ✅ | @dnd-kit sortable |
| 标签跨会话移动 | ✅ | ✅ | @dnd-kit |
| 拖拽视觉反馈 | ✅ | ✅ | 占位符/高亮/阴影 |

### 5.4 设置项

| 设置项 | 重构前 | 重构后 |
|--------|--------|--------|
| actionClick (store/popup) | ✅ | ✅ |
| closeTabsAfterSave | ✅ | ✅ |
| dedupeOnSave | ✅ | ✅ |
| deleteRestoredTabs | ✅ | ✅ |
| focusRestoredTabs | ✅ | ✅ |
| openManagerAfterSave | ✅ | ✅ |
| restoreGroupsInNewWindow | ✅ | ✅ |
| restoreNextToCurrent | ✅ | ✅ |
| theme (system/light/dark) | ✅ | ✅ |

---

## 6. 关键设计决策

### 6.1 状态管理：Zustand vs Redux

**选择 Zustand**，原因：
- 轻量（<1KB），适合扩展环境
- API 简洁，学习成本低
- 支持订阅部分状态，性能好
- 不需要 Provider 嵌套，方便在多个入口页面使用

### 6.2 拖拽库：@dnd-kit vs react-beautiful-dnd

**选择 @dnd-kit**，原因：
- 现代维护，react-beautiful-dnd 已停止维护
- 支持触摸、键盘、指针设备
- 支持网格布局（会话卡片是网格）
- 性能好，可定制性强
- TypeScript 原生支持

### 6.3 持久化策略

Store → chrome.storage.local 的异步持久化：
- 使用防抖（100ms）批量保存
- 监听 chrome.storage.onChanged 同步其他标签页
- 首次加载时异步水化（hydrate）

### 6.4 产品重命名

所有 ZipTab 引用 → TabBoard：
- manifest.json 名称/描述
- omnibox 关键字：`ziptab` → `tb`
- 快捷键：Alt+Shift+Z → Alt+Shift+B
- storage key：`ziptabState` → `tabboardState`
- 所有 UI 文案

---

## 7. 构建与使用

### 7.1 构建命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 类型检查
tsc --noEmit

# 测试
npm test
```

### 7.2 安装到 Chrome

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist/` 目录

### 7.3 入口页面

| 页面 | URL | 说明 |
|------|-----|------|
| Manager | `manager.html` | 主管理界面（新标签页覆盖） |
| Popup | `popup.html` | 点击扩展图标弹出 |
| Options | `options.html` | 设置页面 |
| Background | `service-worker.ts` | 后台 Service Worker |

---

## 8. 已知遗留事项

### 8.1 数据迁移

旧版 ZipTab 的数据（`ziptabState`）尚未自动迁移到 TabBoard（`tabboardState`）。
- 用户首次使用时数据是空的
- 可以手动导出旧数据再导入新扩展

### 8.2 保留的旧文件

旧版 `.js` 文件仍然保留在 `src/` 目录下，用于参考对照。后续可以删除。

### 8.3 测试覆盖

目前只有类型检查，单元测试尚未迁移。原有 `tests/model.test.mjs` 仍可参考。

---

## 9. 相关文档

- [project-overview.md](file:///Users/zhaoshe/code/ZipTab/docs/project-overview.md) - 产品定位与概念
- [feature-spec.md](file:///Users/zhaoshe/code/ZipTab/docs/feature-spec.md) - 功能规格
- [technical-architecture.md](file:///Users/zhaoshe/code/ZipTab/docs/technical-architecture.md) - 技术架构
- [feature-evolution.md](file:///Users/zhaoshe/code/ZipTab/docs/feature-evolution.md) - 功能演进
- [product-decisions.md](file:///Users/zhaoshe/code/ZipTab/docs/product-decisions.md) - 产品决策
- [nord-ui-redesign.md](file:///Users/zhaoshe/code/ZipTab/docs/nord-ui-redesign.md) - Nord 配色设计
- [tabextend-analysis.md](file:///Users/zhaoshe/code/ZipTab/docs/tabextend-analysis.md) - tabExtend 分析

---

## 10. 关键文件快速索引

| 功能 | 核心文件 |
|------|----------|
| 数据类型 | [types.ts](file:///Users/zhaoshe/code/ZipTab/src/shared/model/types.ts) |
| Store | [useTabBoardStore.ts](file:///Users/zhaoshe/code/ZipTab/src/shared/store/useTabBoardStore.ts) |
| 后台逻辑 | [service-worker.ts](file:///Users/zhaoshe/code/ZipTab/src/background/service-worker.ts) |
| 主布局 | [ManagerLayout.tsx](file:///Users/zhaoshe/code/ZipTab/src/manager/components/shell/ManagerLayout.tsx) |
| 侧边栏 | [Sidebar.tsx](file:///Users/zhaoshe/code/ZipTab/src/manager/components/sidebar/Sidebar.tsx) |
| 会话卡片 | [SessionCard.tsx](file:///Users/zhaoshe/code/ZipTab/src/manager/components/sessions/SessionCard.tsx) |
| 主题配置 | [theme.ts](file:///Users/zhaoshe/code/ZipTab/src/shared/styles/theme.ts) |
| 扩展清单 | [manifest.json](file:///Users/zhaoshe/code/ZipTab/manifest.json) |
| 构建配置 | [vite.config.ts](file:///Users/zhaoshe/code/ZipTab/vite.config.ts) |

---

*文档生成时间：2026-07-13*
