# Feature Evolution

本文档记录 TabBoard 的功能变迁。目标是回答两个问题：

- 我们为什么从 A 变成 B？
- 以后看到某个功能时，能不能知道它服务过什么目标？

## 当前产品形态

TabBoard 是一个 local-first Chrome tab manager。它以 OneTab 的"快速收起和恢复 tabs"为基础，吸收 tabExtend 的 workspace、分类和工作台思路，但保持主流程更轻：

- 当前选中的 browser window 一键保存为 session。
- 从单一 Open Tabs 列表勾选多个有 URL 的 tabs 创建 session。
- 通过有 URL open tab 的右键菜单筛选包含该 URL 的 saved sessions。
- 用 sidebar footer Filter tabs 只过滤当前 selected browser window 的单一 Open Tabs 列表。
- Open Tabs 保留 selected normal window 的非 TabBoard tab rows；pinned、Chrome 和 file URLs 可正常多选和保存，自定义 URL 过滤规则与 TabBoard 自身页面直接隐藏。
- 勾选 open tabs 只用于批量创建 session 或批量拖入已有 session，拖拽完成后自动退出多选。
- 拖动 open tab 到已有 session 中追加链接。
- saved sessions 支持三档内置分类（Inbox/Saved/Archive）+ 自定义分类、搜索、恢复、拖拽排序、inline rename、笔记、导入导出、回收站。
- Session card 展示 note，预览弹窗可添加/修改 note，点击打开链接后自动隐藏预览窗。

## 变迁时间线

### 2026-07-21: Session 键盘拖拽无障碍修复

上一轮新增的 Playwright e2e 暴露出一个无障碍缺口：session card 的拖拽 activator 是不可聚焦的 `<header>`，只 spread 了 `@dnd-kit` listeners、没有 attributes，因此键盘用户无法拿起并重排 session。

变化：

- 在 session card header 内新增独立的 `.session-card__drag-handle` 按钮，承载 `setActivatorNodeRef` + `@dnd-kit` `attributes` + `listeners`；handle 提供 `role="button"`、`tabindex=0`、`aria-roledescription="sortable"` 和描述性 `aria-label`。
- `KeyboardSensor` 配置 `coordinateGetter: sortableKeyboardCoordinates`，让方向键按 sortable 位置跨越整列 session，从而命中自定义 collision detection 的 `group-insert` 目标。
- header 仍保留 pointer listeners，鼠标拖整块 header 的体验不变；handle 默认低调，hover/focus 时才显现，保持"dense but calm"。
- 新增键盘拖拽 e2e（`reorders sessions using only the keyboard`）与 handle a11y 断言，`session-rendering.test.ts` 增补 handle/activator 结构契约。

判断：

- 采用独立 handle 而不是把 attributes spread 到 `<header>`，避免在包含 title/Restore/More 的容器上产生非法 `role="button"` 与重复 tab stop。
- 键盘拖拽是 direct-manipulation 的可达性底线，值得作为独立修复而非顺带改动。

当前状态：Current，`tsc`、`npm test`、`npm run check` 通过；Playwright e2e（含键盘拖拽）本地按需运行通过。

### 2026-07-21: 架构文档校正与死字段清理

在一次全项目审查中发现文档与实现漂移，并清理了 React 重写后遗留的死 schema 字段。

变化：

- 校正 `technical-architecture.md` 的 Drag and Drop 章节：DnD 早已从原生 HTML5（`setDragImage`/`dataTransfer`）迁移到 `@dnd-kit`（`PointerSensor`/`TouchSensor`/`KeyboardSensor` + 自定义 `createGeometryCollisionDetection` + `DragOverlay`），文档此前仍在描述已废弃的原生实现。
- 移除 schema 中的死字段 `quickList`（Quick list workflow 于 2026-07-06 下线，React 重写后 UI 已完全不读写）。`normalizeState()` 遇到历史 `quickList` 数据时迁移成 `Former Quick list` session，保证不丢数据。
- 新增 `src/shared/model/schema.test.ts` 覆盖迁移与字段移除。
- 新增 `tests/e2e/`（Playwright）浏览器级冒烟骨架，覆盖 manager 加载与 `@dnd-kit` 键盘拖拽；纯 resolver 回归仍以 `src/manager/core/dnd.test.ts` 为主。
- 大数据量 board 性能：`WorkspaceContent` 的横向 session track 引入按需渲染，减少 session 数量很大时的一次性 DOM 成本。

判断：

- `collapsed` 字段刻意保留：`browserGroup.collapsed` 是真实 Chrome tab group 元数据，`group.collapsed` / `folder.collapsed` 仍嵌在 mutation 校验与 replay identity 契约中，移除属于高风险低收益。
- 文档漂移会误导后续维护"改哪里、注意什么"，因此把 DnD 章节校正视为与代码同等重要的修复。

当前状态：Current，`tsc`、`npm test`、`npm run check` 通过；Playwright e2e 为按需本地运行。

### 2026-07-21: Category 系统改造与体验优化

用户反馈当前分类体系不够清晰，同时 Open Tabs 和 session 管理有多处体验缺口。本轮将 category 从 Inbox/Starred 两档内置扩展为 Inbox/Saved/Archive 三档内置 + 自定义 folder，并补齐 note、搜索、确认设置等体验细节。

变化：

- Category 系统：从 `Inbox + Starred + folders` 改为 `Inbox + Saved + Archive + folders` 三档内置分类。Starred 改名为 Saved，新增 Archive 用于归档不常用的工作上下文。
- Group 新增 `archived: boolean` 字段，与 `starred` 互斥；两者任一为 true 时 `folderId` 自动 normalize 为 null。
- Session card 展示 note 区域，预览弹窗支持添加和修改 note；点击打开链接后自动关闭预览浮层。
- Open Tabs 优化：多选模式提供全选按钮，拖拽完成后自动退出多选；tab URL 最多显示 3 行；favicon 加载失败时有兜底 icon；全局去重避免同 URL 重复展示。
- 搜索优化：关闭搜索栏时清空筛选条件，不再保留上次 query。
- 设置新增 `confirmBeforeDestructive` 选项，默认开启危险操作前二次确认，用户可在 Options 中关闭。
- 侧边栏分隔线与右侧 topbar border-bottom 视觉对齐，消除左右割裂感。
- 修复侧边栏收起状态下 icon 初始不居中问题（`sidebarHoverSuppressed` 初始值与 `sidebarCollapsed` 保持一致）。
- 修复拖动 session 到同一 category 时的 "Invalid state mutation" 验证错误。

判断：

- 三档内置分类比两档更符合"收集 → 整理 → 归档"的工作流演进，Saved 比 Starred 更准确地表达"已整理/重要"的语义。
- Note 是 session 上下文的重要补充，在 card 上直接可见降低了查找成本。
- 搜索关闭即清空符合"用完即走"的轻量交互，避免用户误以为筛选仍在生效。
- 二次确认默认为安全兜底，同时给高级用户关闭选项，平衡安全与效率。

当前状态：Current，全部 603 个测试通过。

### 2026-07-20: Open Tabs 自身页面过滤与无闪烁刷新

Open Tabs 的用途是呈现用户正在处理的浏览现场，TabBoard 自身 manager/settings 等页面不应占据列表；后台刷新也不应让旧列表短暂消失。

变化：

- `list-open-tabs` 在 background 数据入口按当前 extension base URL 排除 TabBoard 自身页面，preview harness 保持同一规则。
- 刷新期间保留已显示的 windows/tabs，不展示 loading row；顶部 Refresh icon 旋转并标记 `aria-busy`，成功后一次替换数据，失败时旧列表仍可见。

当前状态：Current。

### 2026-07-18: React Manager 收敛为唯一实现

本轮把 React + Mantine Manager 从“已迁移”收敛为唯一生产实现，移除旧 native 双栈与其行为基线机制。

变化：

- 生产入口链固定为 `manifest.json -> manager.html -> /src/manager/main.tsx`；旧 native `src/manager.js` 及其相关代码已删除，不再作为行为 oracle。
- 移除历史 parity manifest / native oracle 测试机制；自动化 proof 收敛到 Vitest core contracts（`npm test`）。
- 自动化 proof 执行 typed DnD、immutable state mutation、serialized persistence、replay status、Open Tabs selection、capture ownership 和 authoritative feedback contracts。
- 普通 mutation 增加引用、locked 和 link/note URL 边界；drop replay 使用 ledger 与稳定 identity；runtime message 在 storage/Chrome side effect 前验证 sender。

边界：

- 自动化 proof 不等于完整 UI 验收。custom-element lifecycle、原生 DnD 时序、Chrome capture/restore 和真实 keyboard/focus 仍需手工 Chrome 回归。
- 本轮不改变产品 schema、storage key 或能力范围。

当前状态：React 自动化 proof、build、check 已通过；旧 native/Web Awesome 栈与相关测试全部退役。Chrome 手工覆盖仍建议在 unpacked extension 上回归。

### 2026-07-12: Manager interaction cleanup（Phase 1–6 收尾）

本轮把 Manager 的高密度交互收敛为更稳定的可见层级：window selector 使用本地 window icon 与 ordinal/count，selected tabs 用 numeric badge，selected window 与单一 tab list 顶部对齐；collapsed sidebar 保留 rail，并通过 hover/focus overlay 展开而不推动 board；tab metadata 通过 hover/focus preview 提供，不增加 eye 按钮；saved title 保持单行；selected capture 在同一 workspace 切到 Inbox 并高亮新 session；search 默认收起但保留 query。

判断：

- 这些调整只清理 interaction hierarchy 和 progressive disclosure，保留既有保存、恢复、selection 与 DnD 语义。
- 本轮没有 state schema、Chrome API 或 DnD semantic 变化。

当前状态：自动实现与测试完成；Chrome unpacked、keyboard、screen-reader、rail overlay 和 DnD 人工验收仍待用户执行。

### 2026-07-12: 同一 workspace 的 category 名称唯一性

用户可以保留历史重复 category，但后续新建或重命名时需要避免同一 workspace 内产生更多同名导航项。

变化：

- 新建和重命名 category 统一使用 trim 后、大小写不敏感的纯 model 校验。
- 同一 workspace 的冲突会被拒绝并通过 toast 提示；不同 workspace 可以使用相同名称。
- 重命名自身当前名称允许通过 folder id 排除；normalize 不合并、不删除、不迁移已有重复 category。

判断：

- 将规则放在 model helper 并由 manager 两个边界调用，避免创建和重命名行为漂移。
- 保留历史数据，避免用户升级时 category id、session 归属或排序发生隐式变化。

当前状态：Current。

### 2026-07-11: 移除 board 折叠与 tab preview 截断

用户验收后确认 category/session/global collapse controls 和 Show more / Show fewer 会增加 board 操作噪音；session card 应直接展示匹配 tabs，并由 card 内 tab list 负责纵向滚动。

变化：

- 保留顶部 category tabs 和 category/grid 的 drop 与 DnD 语义，但移除 category section title/count/collapse header。
- 移除 manager 内 category、session、global collapse handlers/actions；`group.collapsed` 等模型字段保持兼容。
- Session More 不再显示 Collapse；全部 matching tabs 直接渲染，不再使用 preview limit 或 Show more / Show fewer。

判断：

- Board 结构和拖拽目标继续表达组织关系，折叠控制交给 card 内滚动，减少状态和入口数量。
- 保留数据字段避免 legacy state migration，后续若需要折叠应重新评估交互收益。

### 2026-07-11: Options 与 capture surface 简化

这一阶段曾尝试把 capture eligibility 从 Options 中移除，以简化浏览器现场表达；后续 React parity work 恢复并统一了现有 settings-aware capture policy。

变化：

- 当前 Options 只保留自定义 URL 过滤规则，并由 shared capture policy 统一用于 Open Tabs、capture 和 DnD eligibility。
- 非 storable rows 仍留在 selected-window Open Tabs 中，显示原因，不进入选择或拖拽。
- Category board 不恢复 header/collapse/Show more 等结构控制；session card 直接渲染全部 matching items，由 card 内列表滚动。

判断：

- Open Tabs 应表达完整浏览器现场，同时明确指出当前 settings 为什么阻止保存。
- 统一 policy 避免 checkbox、DnD 和 background capture 出现“看得到但保存结果不同”的漂移。
- 结构导航和内容滚动分别由 category tabs 与 session card 内部列表承担，减少重复控制。

当前状态：Capture-policy simplification superseded；board simplification remains Current。

### 2026-07-10: Pinned tabs 分区与底部 Filter tabs

Open Tabs 需要同时说明“当前存在”与“当前可保存”的边界，并让窗口内 tab 较多时仍能快速定位。

变化：

- Background 保持 capture 过滤语义不变：所有 pinned tabs 都保留可见；普通 pinned tab 可由 Include pinned tabs 开启保存，特殊/排除 URL 仍标记为不可保存。
- Selected window 的 Open Tabs 固定显示 Pinned 区；大量 pinned tabs 通过单行横向滚动保持可达，regular tabs 作为唯一纵向滚动区域。
- Sidebar 底部增加独立的 Filter tabs 输入，只过滤当前 selected window 的 pinned/regular rows。
- 不可保存 pinned row 不提供 checkbox、拖拽或按 URL 筛选 sessions，并显示 `Not saved by current settings`。
- open-tab URL 筛选 saved sessions 的 `openTabFilter` 与底部 query 分离；切换 window 或刷新 tabs 不会自动清除 saved-session filter。
- Options 修改 Include pinned tabs 或 exclude URL patterns 后，manager 会重新加载 Open Tabs eligibility，避免旧 `storable` 状态残留。

判断：

- Pinned tab 的可见性帮助用户理解浏览器现场，storable 标记避免把 capture 约束隐藏成“tab 消失”。
- 两种 filter 服务不同对象：底部 query 负责当前窗口内定位，右键 URL filter 负责反查历史 sessions。

当前状态：Superseded by 2026-07-11 Options 与 capture surface 简化；window chips 和底部 Filter tabs 保留，pinned strip、regular-only scroll 和 settings eligibility 已移除。

### 2026-07-10: Window sidebar 收敛为 tabExtend 风格 chips

用户希望 Open Tabs 更接近 tabExtend 的 window sidebar：workspace 信息不应占据 sidebar header，多个 Chrome window 也不应同时展开。

变化：

- Workspace switcher、stats、新建/重命名 workspace 移到右侧 topbar 的 category tabs 左侧。
- Sidebar header 改为 window chips、collapse 和新建 Chrome window。
- Open Tabs 通过 chip 切换 selected window，一次只渲染一个 window；保留当前 window 的 save、dedupe、select 和拖拽流程。
- 新建 Chrome window 后自动选中该 window 并刷新 Open Tabs。

判断：

- Window 是 Open Tabs 的导航上下文，适合放在 sidebar header；workspace 是 saved sessions 的上下文，适合放在 main topbar。
- Pinned/regular 分区和底部 Filter tabs 留给后续任务，不在本次引入。

当前状态：Partially superseded by 2026-07-11；window chips、sidebar actions 和单一 selected-window list 保留，pinned 分区方案不再采用。

### 2026-07-08: Board-first UI rework 和 capture cleanup

用户手动验收发现上一轮 manager-first 设计仍有明显问题：context strip 语义不清、inspector 价值低、Open Tabs 只显示 current window、select mode 跳动、DnD 落点不清、popup 缺少 dedupe/settings/delete/preview，Options 中特殊 URL 设置和界面设置也不清晰。

变化：

- Manager 改为 Board-first：顶部 toolbar + 左侧 Open Tabs/Categories + 右侧 session board。
- 移除 context strip 和常驻 inspector。
- Open Tabs 展示所有 windows，一次只展开一个 window。
- Select mode 只覆盖 window title 行，不改变 tab 列表布局。
- Session DnD 改为源位置 placeholder + target slot 预览：左右 25% 插入前/后，中间 50% 让被拖拽 session 占目标位置，目标卡回填源空位。
- Popup 改为横排 Save/Open/Dedupe quick actions，并增加 Settings、recent session Delete、hover/focus tabs preview。
- Save 完成后 popup 关闭，manager 打开/聚焦、定位刚保存 session，并用浮层 toast 提示。
- Capture 默认按源 tabs URL 去重，清理 about:blank 和重复源 tabs。
- Options 用 exclude URL patterns 取代 chrome/file 单独开关，默认 `chrome://*`、`file://*`。
- Favicons 始终展示；危险操作始终确认；session toolbar 外露动作不再可配置。
- Popup、Manager、Options 统一使用 `src/icons.js` 图标和共享 control sizing tokens。

判断：

- Popup 只做 trigger surface，不做小 manager。
- Manager 的核心是 session board，不应该把解释性 UI 和低价值 inspector 放在主路径。
- Drag and drop 反馈必须清楚表达最终 slot；session 排序允许轻量 live reorder，但不能重新引入 session 合并语义。

当前状态：Partially superseded by 2026-07-11 Options 与 capture surface 简化；popup、board-first 主线和 DnD 语义保留，`about:blank` cleanup 与 exclude URL patterns 已移除。

### 2026-07-09: Session drag target-slot hardening

用户继续手动验证 session 拖拽，发现跨多个 session 排序时 target card 会在边界附近回闪，尤其是拖第 2 个 session 到第 1/4 个 session 附近时。

变化：

- 目标 card 左右 25% 保留 before/after 插入语义。
- 目标 card 中间 50% 改为 target slot 语义：被拖拽 session 占据目标位置，目标 card 回填源空位。
- drag start 记录源卡片 rect，避免隐藏后的源卡片实时 rect 抢回 placeholder。
- 进入 target slot 后记录目标卡片原始 rect，并用 release margin 保持 target lock，降低 grid 重排造成的回闪。

判断：

- 当前体验仍可能有原生 DnD 瑕疵，但已经达到可用线，先停止继续打磨。
- 后续如果继续优化，应考虑替换原生 HTML DnD 为 pointer-driven drag，而不是继续叠加边界补丁。

### 2026-07-04: OneTab 复刻起点

初始目标是完整复刻 OneTab 的核心体验，让插件能直接安装到 Chrome 使用。

完成方向：

- 保存当前窗口、当前 tab、多种右键保存模式。
- session 列表、恢复、删除、锁定、导入导出、分享页。
- OneTab 文本导入。
- local-first 存储，不依赖后端。

保留的判断：

- OneTab 的价值在于“瞬间把混乱 tabs 收起来”，所以保存和恢复必须是第一优先级。
- 数据必须本地化，避免 tab 历史变成隐私风险。

### 2026-07-04: 左侧操作区收敛

早期 sidebar 中平铺了 Save window、Restore all、Import、Export、Options 等按钮，占用空间过大。

变化：

- 常用操作保留在外层。
- 低频操作收进二级 More 菜单。
- More 菜单在底部时改为向上弹出，避免用户还要继续滚动。

结果：

- 左侧导航更像工具台，不像设置页。
- 低频功能仍可达，但不压迫主工作流。

### 2026-07-05: tabExtend 方向探索

用户提出更喜欢 tabExtend 的 tab 管理方式，因此引入了更偏工作台的能力。

引入方向：

- Workspaces。
- Categories。
- Kanban/session grid。
- Open tabs sidebar。
- Notes / starred。

经验：

- tabExtend 的优点是“按工作流组织”，但如果照搬过多，会让 TabBoard 变重。
- TabBoard 后续要保持 OneTab 的轻量保存恢复，同时选择性吸收 tabExtend 的组织能力。

### 2026-07-06: 新标签页改为 TabBoard

增加 Chrome `chrome_url_overrides.newtab`，让新标签页直接进入 TabBoard。

目的：

- tab manager 不只是一个偶尔打开的扩展页，而是每次开新 tab 时的工作入口。
- 降低“保存以后找不到”的概率。

### 2026-07-06: Session UI 从列表改为更紧凑的工作台

原 session 列表基本占满屏幕，信息密度低。之后改为更接近 kanban/grid 的展示。

调整：

- 多列 session card。
- 每个 card 内限制 tab 预览数量。
- 标题和 URL 使用行数限制，减少高度失控。
- 支持展开和折叠全部。

结果：

- 大量 session 可以横向浏览。
- 牺牲了一部分完整内容可见性，换取扫描效率。

当前状态：Superseded by 2026-07-11 移除 board 折叠与 tab preview 截断；session card 现在渲染全部 matching items，并由 card 内列表滚动。

### 2026-07-06: Inline rename

原来只能从 session 的 More 菜单里 Rename，路径太深。

变化：

- 双击 session 标题可直接 inline rename。
- `Enter` 保存，`Esc` 取消，失焦保存。
- More > Rename 继续保留，复用同一套保存逻辑。

判断：

- 命名是整理 tabs 的高频动作，应该贴近标题本身。

### 2026-07-06: Quick list / Pinned workflow 下线

Quick list 来自 tabExtend 的 Pinned workflow 思路，但在 TabBoard 当前体验中不够清晰。

下线原因：

- 它和 saved sessions 的关系不直观。
- 用户很难理解“把 session 放进 pinned workflow”到底是复制、移动还是引用。
- 它占用了右侧屏幕空间，但收益不稳定。

处理方式：

- 移除右侧 Quick list 面板。
- 移除选择工具条里的 Quick list 操作。
- Popup 改成 Recent sessions。
- 旧 quickList 数据自动迁移成 `Former Quick list` 普通 session，避免数据丢失。

结论：

- 当前阶段不做独立 pinned workflow。
- 工作流组织先回到 sessions、categories、workspace 上。

### 2026-07-06: Open Tabs 面板重构

用户希望 Open Tabs 面板减少噪音，成为创建和筛选 session 的入口。

变化：

- 仅保留 Current window 的 Save 按钮。
- 移除每个 open tab 后面的单独 Save。
- Current window 右上角增加 select mode 按钮，默认不进入 select mode。
- 进入 select mode 后，每个 open tab 前才展示 checkbox。
- 选中多个 open tabs 后可以创建新 session。
- 选中多个 open tabs 后，从任一已选 tab 开始拖动会携带全部已选 tabs，可拖入已有 session 或拖到目标位置创建新 session。
- 右键 open tab 可以筛选右侧包含对应 URL 的 sessions。
- 支持拖动单个或已勾选的多个 open tabs 到已有 session。
- 批量工具条固定在 open tab 列表上方，滚动列表时仍可见。
- Chrome 内部页、扩展页、TabBoard 自身页面等不可可靠保存的 tabs 不在列表中展示。

判断：

- 单 tab 保存是低价值高噪音操作。
- 用户更常见的动作是“把一组当前上下文保存下来”或“找之前是否保存过这个 tab”。

当前状态：Partially superseded by 2026-07-11 Options 与 capture surface 简化。

- Open tab 多选创建 session 会走后台 `tab-ids` capture 模式。
- 拖动 open tab 到 session 是追加记录，不关闭浏览器里的 tab。
- Open Tabs 现在展示所有 browser tabs；符合 shared capture policy 的非 TabBoard tabs 可保存，TabBoard 自身页、无 usable URL 或被 policy 排除的 rows 保留可见并显示原因。

### 2026-07-06: Icon-first 操作按钮

随着 card/grid 视图变紧凑，文字按钮开始挤占标题和 URL 空间，尤其是 Restore、Open、More、Import from OneTab 等较长文本。

变化：

- 增加统一的 SVG icon set。
- 高频工具按钮改为固定尺寸 icon-only。
- Hover 或 keyboard focus 一段时间后显示 tooltip。
- 二级菜单和弹窗操作保留 icon + 短标签，避免纯图标降低可发现性。
- icon-only 按钮都保留 `aria-label`，用于键盘和读屏。

判断：

- Session card 的主要内容应该是标题、URL 和上下文，不应该被按钮文字抢占。
- 高频动作可以用图标表达，低频动作仍需要短文本帮助识别。
- tooltip 是补充说明，不承担主要点击路径。

### 2026-07-06: Categories 支持拖动排序

Categories 最初按固定顺序展示：All items、Unfiled、Starred，然后是自定义分类。用户希望把 Starred 等更常用的分类放到顶部。

变化：

- 系统分类和自定义分类都可以拖动排序。
- 分类顺序按 workspace 保存到 `categoryOrderByWorkspace`。
- 删除自定义分类后，旧排序 id 会在渲染时被忽略；新增分类会追加到当前排序末尾。
- 自定义分类的 Rename/Delete 移入右键菜单，列表表面只保留分类入口，减少拖动排序时的干扰。

判断：

- Categories 是个人工作流入口，顺序应该由用户决定。
- 排序是 workspace 级偏好，不应该影响其它 workspace。

### 2026-07-06: 特殊 URL 保存开关

用户希望避免把 `chrome://`、`file://` 这类链接混入普通 saved sessions。

变化：

- Options > Capture 增加 `Include chrome:// links`。
- Options > Capture 增加 `Include file:// links`。
- 两个开关默认关闭。
- Open Tabs 列表、保存当前窗口、右键保存等入口统一走同一套 capture 判断。

判断：

- `chrome://` 和 `file://` 不像普通网页，跨机器、跨权限、恢复成功率都不稳定。
- 如果用户确实需要保存这些链接，应该显式打开对应开关。

当前状态：Superseded by 2026-07-11 Options 与 capture surface 简化；特殊 URL 开关已删除，除 TabBoard 自身页和无 usable URL 外均尝试保存，恢复失败时保留 saved record。

### 2026-07-06: Categories 从筛选器改为目录导航

用户希望右侧 saved sessions 区域按照左侧 Categories 的顺序展示所有分类，并且点击左侧分类时滚动到对应区域，而不是硬切成单一分类。

变化：

- 右侧内容按 `categoryOrderByWorkspace` 渲染所有 category section。
- 每个 category section 有独立标题和 session/link 计数。
- category title 在滚动经过该分类时吸顶，帮助用户判断当前位置。
- 点击左侧 category 只更新高亮并平滑滚动到对应 section。
- Search 和 open tab 右键筛选仍然作为全局过滤条件生效。

判断：

- Categories 更像信息目录，而不是互斥过滤器。
- 对大量 saved sessions 来说，滚动定位比硬切更利于保持空间记忆。
- 保留全局 Search / tab filter，可以继续处理“只看匹配项”的明确筛选需求。

当前状态：Superseded by 2026-07-09 tabExtend-style visual board clone；顶部 category tabs 现在切换单一 active category board，不再滚动全部 category sections。

### 2026-07-06: Saved sessions 顶部标题精简

右侧顶部原来同时显示 `Saved sessions` 和 `Personal / Category` 路径。改成目录导航后，当前位置已经由下面的 category title 承担。

变化：

- 顶部只保留 `Saved sessions` 标题。
- 顶部 header 永远吸顶。
- category title 吸顶位置下移到 Saved sessions header 之下。
- 后续该静态标题被 Workspace 控制区替代，见“Workspace 控制移到顶部”。

判断：

- 顶部路径会和 category section title 重复。
- 固定的 Saved sessions 标题提供稳定页面锚点，具体位置由滚动中的 category title 表达。

### 2026-07-06: Category 改为 session 的单一归属

用户明确希望每个 session 最多只有一个 category。`All items` 不再作为独立 category 展示；Starred 是内置 category。

变化：

- 移除 `All items` category。
- `Unfiled` 改名为 `Inbox`，表示没有 category 的 session。
- Starred session 会清空普通 category。
- 将 session 移动到 Inbox 或自定义 category 时，会取消 Starred。
- 将 session 拖动到 Starred category 时，会设置为 Starred。
- 右侧每个 session 只出现在一个 category section 中。

判断：

- `Inbox` 比 `Unfiled` 更像默认收纳入口，减少“未整理”的负面语感。
- Starred 被视为高优先级内置 category，而不是叠加状态。
- 单一归属能避免 All items / Starred / 自定义 category 同屏重复 session。

### 2026-07-06: 折叠控制改为三层状态按钮

用户希望 Saved sessions、category 和 session 三个层级都能直接折叠/展开，并且按钮状态随当前内容状态变化。

变化：

- Saved sessions 顶部从两个固定按钮改为一个动态按钮。
- 全部 session 都折叠时，顶部按钮点击后展开全部；否则点击后折叠全部。
- 每个 category title 左侧增加同样规则的折叠/展开按钮。
- 每个 session header 增加一级折叠/展开按钮，移除 More 菜单里的重复入口。

判断：

- “按钮表示下一次点击动作”比同时展示折叠/展开两个按钮更省空间。
- category 级按钮让用户能快速整理大块内容，而不用先滚动到每个 session。

当前状态：Superseded by 2026-07-11 移除 board 折叠与 tab preview 截断；manager 不再提供 global、category 或 session 内容折叠。

### 2026-07-06: Session 外露动作可配置

用户希望 session card 上的动作尽量和 title 在同一层，同时能够自行决定哪些动作外露、外露顺序如何。

变化：

- Session header 改为 title 左侧、quick actions 右侧的同层布局。
- Options > Interface 增加 Session toolbar 设置。
- 用户可以勾选哪些 session actions 外露，并用上下按钮调整顺序。
- 未外露的动作仍按同一顺序放入 More 菜单。
- Saved sessions/category 的批量 collapse/expand 是结构控制，固定放在对应 title 左边；session 自身的 collapse 仍按 session toolbar 设置展示。

判断：

- 不同用户对高频动作的定义不同，不应该把 Restore/Add/More 固定死。
- More 继续作为兜底，避免配置外露动作后丢失低频功能。

当前状态：Superseded by 2026-07-08 Board-first UI rework 和 2026-07-11 移除 board 折叠与 tab preview 截断；session toolbar 配置已删除，Restore 固定外露，其余动作进入 More，Collapse 已从 manager 移除。

### 2026-07-06: 移除 saved tab 级 Star/Todo 动作

用户指出 tab 菜单里的 Star 和 Todo 含义不清。

变化：

- 单个 saved tab 的 More 菜单不再展示 Star/Todo。
- 批量选择栏不再展示 Star selected tabs / Toggle selected tasks。
- 当时仍保留 Add todo 创建文本待办项的能力，后续在 session 级入口里继续收敛。

判断：

- Starred 已经是 session 级内置 category，tab 级 Star 会造成层级混淆。
- Todo 作为 tab 状态不如显式 todo item 清晰，先从主流程移除。

### 2026-07-06: 移除 session 级 Todo item

用户追问 session 上新增 Todo 的含义后，确认当前 Todo 既不是 session 状态，也没有完整待办闭环，容易干扰 tab/session 管理主线。

变化：

- Add 菜单只保留 Link 和 Note。
- 旧数据里的 `itemType: "todo"` 在 normalize 时按 Note 展示，保留文本内容但不继续暴露 Todo 状态。
- 搜索、统计、导出和 README 不再把 Todo 作为当前能力宣传。

判断：

- TabBoard 当前阶段优先做好 tab/session 管理，避免引入半套任务管理模型。
- 需要文本补充时，Note 已经覆盖主要需求；Todo 若未来回归，应该作为完整 workflow 重新设计。

### 2026-07-06: Session More 菜单收敛

用户指出 session More 菜单里的 category 下拉框、Share、Star/Unstar、Export 让菜单过重。

变化：

- Category 下拉框从 session 菜单和外露动作配置中移除，分类只通过拖拽修改。
- Share、Star/Unstar、Export 从单个 session action 中移除。
- Options 的 Session toolbar 配置同步移除这些动作，旧设置会在 normalize 时自动过滤。
- 保留 Lock/Unlock，因为它控制“restore 后是否保留该 session”，用于固定模板和常用工作流。

判断：

- Starred 已经是 category，不应该再通过菜单按钮表达为额外状态。
- 单个 session 的 Share/Export 属于低频分发能力，当前不应占据 session 菜单。
- Lock 有明确数据保护语义，比普通管理动作更值得保留。

### 2026-07-06: Workspace 控制移到顶部

用户希望 workspace 放到原 Saved sessions 顶部标题的位置，不再占用左侧 sidebar 空间。

变化：

- 顶部 sticky header 从 `Saved sessions` 文案改为 Workspace 控制区。
- 保留 workspace title/switch、新建 workspace、rename workspace。
- 保留 Saved sessions 级别的折叠/展开全部 session 按钮，并放在 workspace title 左侧。
- 左侧 sidebar 删除原 workspace 区块，让 Search / Open tabs / Categories 更靠上。

判断：

- Workspace 是当前页面的最高层上下文，比静态的 Saved sessions 标题更适合放在顶部锚点。
- 左侧 sidebar 应优先承载当前窗口 tabs 和 categories，减少重复导航层级。

当前状态：Partially superseded by 2026-07-10 Window sidebar 收敛和 2026-07-11 移除 board 折叠与 tab preview 截断；workspace 仍在主 topbar，sidebar 现在承载 window chips 和 Open Tabs，全局折叠入口由后续 board 简化移除。

### 2026-07-06: 移除 starred session 卡片侧边强调

Starred 已经是一个内置 category，用户认为 session card 上的金色侧边重复表达。

变化：

- starred session card 不再显示额外的左侧强调边。
- Starred 状态仍通过 category 归属和 session meta 展示。

判断：

- 同一个状态只保留一个主要视觉载体，减少列表噪音。
- Category 本身已经提供足够的分组语义。

### 2026-07-06: Session 内选择模式

用户希望 saved tab 的选择能力不要常驻在列表左侧，而是从 More 菜单触发，并在当前 session 内完成批量操作。

变化：

- 单个 saved tab 的 More 菜单新增 Select。
- 点击 Select 后，仅当前 session 进入选择模式，所有 tab/link 左侧展示 checkbox，触发项会直接被选中。
- 当前 session header 被批量操作栏覆盖，提供 Restore、Copy URL、Delete、Close selection。
- 批量操作栏只保留 selected 计数和操作按钮，不展示辅助说明文案，避免窄卡片里挤压计数。
- 移除旧的全局 selection bar。
- 删除无 favicon 时的灰色圆角 fallback，占位不再作为视觉元素出现。

判断：

- 选择是低频批量操作，不应默认占用每一行的扫描空间。
- 批量操作栏限定在 session 内，比全局选择栏更符合用户的局部操作心智。

### 2026-07-06: Saved tab 菜单入口收敛

用户希望移除 saved tab 行右侧的独立 Open 和 More 按钮，仅保留右键菜单。

变化：

- saved tab 行不再显示独立 Open icon 和 More icon。
- 保留点击 tab title 打开链接。
- 右键 saved tab/link 会打开上下文菜单。
- 右键菜单提供 tab 级动作：Select、Note/Edit、Copy、Delete。

判断：

- Open 是高频但已经由链接本身承载，独立按钮重复占空间。
- tab 行表面只保留内容和必要状态，低频动作收进右键菜单。

### 2026-07-06: Tab 拖拽生成新 session

用户希望每个 saved tab item 都可以按住拖动，并且多选后也可以批量拖动。

变化：

- saved tab item 允许从标题/link 区域直接拖动。
- 进入 session 选择模式后，拖动任一已选 tab 会携带当前 session 中的全部已选 tab。
- 拖动一个或多个 tab 时，目标位置会插入 New session placeholder，松手后就在该位置新增 session。
- 拖动一个或多个 tab 到已有 session 本体时，默认加入该 session，不显示 New session placeholder。
- 拖动一个或多个 tab 到已有 session 内部 item 时，用上/下插入线表达最终位置，不再高亮整行。
- New session 不再作为每个 category 尾部的常驻卡片展示，只在拖拽时作为占位出现，避免与拖拽 placeholder 同时出现。
- 多选 saved tabs 也可以拖到已有 session 中，按源 session 内顺序追加或插入。
- 拖动 session 时，目标位置会插入 Move here placeholder，松手后 session 就出现在该位置。
- 拖动 session 一开始就在原位置插入 Move here placeholder，未计算出新目标时默认保持起始位置。
- 拖动 session 时使用独立拖拽影像跟随鼠标，Move here placeholder 接管原卡片布局位置；鼠标经过 Move here placeholder 时不重新计算位置，减少拖拽抖动。
- session 本体不再作为“合并到另一个 session”的 drop 结果，只用于计算 Move here placeholder 的前后位置，避免把 A 拖进 B 的误操作。
- session dragstart 会立即把 Move here placeholder 种在源 session 原位置，避免第一次 dragover 命中 category 空白区时把 placeholder 放到列表尾部。
- session 拖拽影像使用源卡片原位置的可见 clone 生成，避免浏览器无法截取视口外 drag image 时出现“一拖就消失”。
- 通过 Current window 或插件图标捕获创建的 session 仍出现在当前 workspace 头部。

判断：

- 拖拽是更高频的创建方式，常驻 New session 会与拖拽 placeholder 同时出现，反而增加判断成本。
- 捕获创建代表“刚刚保存的当前上下文”，放在头部；拖拽整理要尊重用户手势，按占位位置插入。

### 2026-07-07: 搜索框移入 workspace 顶栏

用户希望将左侧 sidebar 的搜索框移动到 workspace 顶部空白区域。

变化：

- 全局搜索输入框从 sidebar 移到 workspace header 右侧。
- 搜索 label 改为视觉隐藏，输入框使用 placeholder，避免撑高顶栏。
- 窄屏下搜索框换行占满 header 宽度，避免挤压 workspace 切换控件。

判断：

- 左侧 sidebar 的核心任务是 open tabs 和 categories，搜索放在主内容顶栏更接近 saved sessions 的过滤结果。
- 搜索框继续复用原 `#searchInput`，保留 `/` 快捷键聚焦和现有过滤逻辑。

### 2026-07-07: Sidebar 底部动作展开

用户希望底部 More 菜单不再折叠，并移除不常用或重复入口。

变化：

- 底部动作区改为常驻展开按钮。
- 仅保留 Bin、Import、Export、Options。
- 移除单独的 Import from OneTab 入口；普通 Import 默认支持 OneTab 导出文本。
- 调换 sidebar 中 Import 和 Export 的图标方向：Import 使用进入/向下图标，Export 使用出去/向上图标。

判断：

- Search 已移入 workspace 顶栏，Restore all 不再适合占用 sidebar 常驻底部动作。
- OneTab 只是导入格式之一，能力应并入 Import，而不是作为独立产品入口。

### 2026-07-07: Manager-first extension UI redesign

使用 `chrome-extension-ui` 规则审查后，确认 TabBoard 的主价值不在 popup 里完成管理，而是在 new tab manager 中稳定整理和恢复 sessions。

变化：

- Popup 收敛为快动作入口：Save window、Open workspace、recent sessions restore。
- Popup recent sessions 最多展示 5 条，不再像缩小版 manager。
- Manager 顶部强化为 command bar，并新增 workspace/category/search/open-tab-filter 的 context strip。
- Manager 增加右侧 inspector，展示 focused session 的 metadata、note 和编辑入口。
- Session card 默认只保留 Restore 作为主要直接动作，其余管理动作进入 More 或 inspector。
- Options 分为 Basic 和 Advanced，日常设置和高风险/低频设置分层展示。
- 反馈文案抽到 `src/feedback-copy.js`，focus-visible 和 empty state 样式统一。

判断：

- Chrome popup 的尺寸和 auto-close 行为不适合承载重管理流程。
- Manager/new tab 才是重复使用的工作台，应承担搜索、编辑、整理和恢复。
- Popup 功能变少是有意取舍，换取更清楚的一眼可用入口。

当前状态：Partially superseded by 2026-07-08 Board-first UI rework；manager-first 定位、popup 和 Options 分层保留，context strip 与常驻 inspector 已移除。

### 2026-07-09: tabExtend-style visual board clone

用户选择先复刻 tabExtend 的 visual board 思路，再基于实际使用慢慢微调。随后根据截图反馈，category 改为顶部 segmented tabs，workspace 切换入口放在顶部最左侧。

变化：

- 顶部 toolbar 最左侧展示 workspace switcher。
- Categories 从左侧 sidebar 移到顶部，使用 tabExtend 风格 segmented tabs。
- 点击 category tab 会切换右侧 active category board，而不是展示所有 category sections。
- Session card 增加 favicon stack、link/note meta、locked/starred chips 和 note preview。
- Session、saved tabs、open tabs 可拖到顶部 category tab，把内容移入该 category。
- Popup、Options、数据模型和现有 DnD target-slot 语义保持不变。

判断：

- 这次优先复制 tabExtend 的顶部 category 切换和 visual card 组织方式，而不是继续做极简调整。
- 先用原生 DOM/CSS 实现现代 board，不引入 React、bundler 或新依赖。
- 后续再基于手动验证决定是否加入 inspector、view toggle、onboarding 或更完整的 workspace rail。

当前状态：Partially superseded by 2026-07-11 Options 与 capture surface 简化；top category tabs、active board 和 session card 视觉保留，Options/capture eligibility 已改变。

### 2026-07-10: Full-height collapsible sidebar and horizontal sessions

用户继续要求整体布局向 tabExtend 靠齐：manager 明确切成左右两栏，Open Tabs 使用全高 sidebar，右侧 sessions 变成全高横向列表。

变化：

- Workspace switcher 移入左侧 sidebar header。
- Sidebar 可折叠成窄 rail，折叠状态保存在 manager localStorage。
- Open Tabs 占满 sidebar 剩余高度，并使用单一内部纵向滚动容器。
- 右侧 active category board 改为单行 horizontal track。
- 每张 session card 充满 board 高度，tab list 在 card 内独立滚动。
- Session action menu 使用 fixed positioning，避免被横向 board 裁切。
- Popup、Options、数据模型、capture/restore 和 target-slot DnD 语义保持不变。

判断：

- Sidebar、category strip、session columns 形成更接近 tabExtend 的稳定桌面工作台。
- 横向 board 优先服务大屏和重复整理场景，不再让 sessions 自动换成多行 grid。
- 后续继续观察横向拖拽边缘滚动、窄屏表现和 sidebar 折叠入口的可发现性。

当前状态：Partially superseded by 2026-07-10 Window sidebar 收敛和 2026-07-11 Options 与 capture surface 简化；全高双栏和横向 session board 保留，workspace 已移回主 topbar，sidebar 顶部改为 window chips，Options/capture eligibility 已改变。

### 2026-07-12: Nord visual system and local Web Awesome shell controls

用户确认继续参考 tabExtend 的紧凑工作台思路，但将视觉语言统一到 Nord，并允许引入适合原生 DOM/MV3 的设计系统。

变化：

- 建立 Nord0-Nord15 primitives 和 light/dark `--zt-*` semantic tokens，删除旧 teal、硬编码蓝色、Manager radial gradient 和 glass surface。
- Sidebar 与 main topbar 使用 64px shared header rail；main controls 统一 40px，sidebar controls 统一 32px。
- Window chips 收敛为只显示 ordinal/tab count 的 compact selector，不再显示 `Current window` 或 raw Chrome window ID；Dedupe 进入 window More。
- Workspace switch/create/rename/stats 收进单一 dropdown；顶部 category tabs、search 和 utilities 对齐同一 control line。
- 删除 category outer frame 和多余 board padding；session cards 直接位于 Nord canvas 上，并使用 card 内纵向滚动。
- 本地 vendoring Web Awesome `3.10.0`，保留 license、来源、integrity、1,066 个 checksums 和 remote-font patch；Manager 的 search、window selector、workspace dropdown 使用静态本地 Web Components。
- Session/category/tab rows、DnD hierarchy、context menu、本地图标 registry 和 shared tooltip service 继续保持 TabBoard 自定义实现。
- Popup 与 Options 复用 Nord tokens 和统一 control sizing，不改变 quick actions 或 Basic/Advanced 信息架构。

判断：

- Web Awesome 只接管稳定通用 controls，避免 Shadow DOM 或 shared button migration 扩大到脆弱 DnD surface。
- Nord semantic tokens 同时约束自定义产品组件和 Web Awesome，避免出现两套视觉语言。
- Global button/tooltip/dialog、session/window action menu 和 settings checkbox/radio migration 延期；需要浏览器级 keyboard/focus/DnD 验证后再逐 family 推进。

当前状态：Superseded。该阶段的 Nord native shell 与本地 Web Awesome 组件已随 React + Mantine 重写整体退役；当前 Manager 使用 Mantine 组件与 `@tabler/icons-react`，vendor 目录已删除。

### 2026-07-12: Progressive disclosure rail and popover lifecycle

用户继续以 tabExtend 的 hover 模式优化高密度 Manager：默认界面应保持内容优先，完整 sidebar 和对象级操作只在用户表现出意图时出现。

变化：

- collapsed sidebar 现在显示 selected-window icon rail、tab favicon projection 和 Filter tabs 入口；hover 或 keyboard focus 以 absolute overlay 展开完整 sidebar，不改变 board 宽度或 selection payload。active drag 暂时禁用 overlay pointer events，防止它遮挡 board drop target。
- rail 只复用当前 Open Tabs 的 model 并聚焦现有 row/filter；不创建第二份 tabs state，也不参与 drag/drop。
- info popover 内的 Filter、Close、Edit、Copy、Delete、Select 等动作在业务 mutation 前统一关闭浮层，并在下一帧恢复仍可用的 row/session/filter focus fallback，避免页面重绘后保留旧内容或隐藏 keyboard focus。
- hover/focus/coarse-pointer 渐进披露、右置 selection checkbox、stable favicon fallback 与本地图标均保持为 Manager 自定义 DOM contract。

判断：

- hover 是增强层，不替代 keyboard、touch 或 context-menu 路径。
- absolute overlay 比扩张 grid 更安全，因为不会移动 session card、target slot 或 insert marker。

当前状态：`npm test` 与 `npm run check` 自动验证通过；Chrome manual gate 仍包括 rail hover/focus、coarse pointer、200% zoom、screen reader 与全部 DnD 路径。

### 2026-07-12: Manager empty-shell resilience 与 wa-select event repair

Manager 启动阶段出现依赖或异步顺序问题时，页面不应停在空白页，也不能让旧 storage 快照覆盖刚到达的新 state。

变化：

- 先同步准备 normalized 默认 state、渲染 Manager shell，并发起 Open Tabs request；storage state 改为异步 apply。
- 将本地 Web Awesome module 放在独立 failure boundary；修复 `wa-select` window event 接收路径，保持 window 切换可用。
- 增加 startup revision guard，并按 popover、storage、migration、shell 等阶段分别降级和提示。

判断：

- 这是启动可靠性修复，不改变 state schema、DnD 语义或 Chrome API contract。
- 空 shell 比等待所有依赖后再首屏更可恢复，也让单个 control/module 故障不会拖垮 Manager 主路径。

当前状态：开发、spec review、quality review 与自动验证已完成；Chrome manual regression 仍待用户执行。

### 2026-07-19: Open Tabs checkbox-first multi-selection

变化：

- 首次勾选可保存 tab 直接进入多选态；同一组选中 IDs 同时用于 multi-tab DnD 与创建 session。
- 多选态替换 sidebar footer 的 Filter tabs，提供 icon-only 的创建 session、批量删除、批量 pin 与退出操作。
- 批量 Chrome 操作完成后只刷新一次 Open Tabs 列表；操作失败保留 selection 供重试。

判断：

- checkbox 只表达“准备处理这一组 tabs”，不再要求用户先发现独立的选择模式入口。
- DnD 继续复用现有 typed `open-tabs` payload，不新增平行数据模型。

当前状态：已实现并由 runtime/preview tests 覆盖；Chrome 手工 DnD 回归仍待执行。

### 2026-07-20: Popup capture scope and safe window dedupe

变化：

- Popup 改为当前窗口概览：展示总 tab、pinned、重复 URL 和 Chrome tab group 数量；pinned 与 grouped tabs 可以独立排除出本次 Save。
- Popup Dedupe 直接关闭当前窗口的重复 tabs 并关闭 popup；同 URL 优先保留 active tab，否则保留最近访问的 tab。

判断：

- 保存范围在提交前可见且可控，避免为短暂保存临时修改全局 capture settings。
- 去重保留正在使用的 tab，其他重复集合遵循最近访问的可预测规则。

当前状态：已实现，自动测试与 Popup preview 验证通过。

## 待观察问题

- 右键菜单触发筛选是否足够容易被发现。
- 批量拖动已勾选 open tabs 到已有 session 是否需要更明显的拖拽提示。
- 拖动 open tab 到 session 是否需要视觉提示说明是 copy 而不是 move。
- Quick list 下线后，是否还需要更轻量的“临时工作区”概念。
- Kanban/grid 在 session 数量很大时是否需要虚拟列表或分页。
- icon-only 动作在新用户第一次使用时是否足够清晰。
- `Inbox` 是否比 `Unfiled` 更符合用户对“没有 category”的直觉。
- 2026-07-19：收敛 Open Tabs URL policy 为单一自定义过滤规则。pinned、`chrome://` 与 `file://` 不再因内建规则不可选；命中自定义规则的 tab 直接从列表隐藏。
