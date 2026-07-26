# React 性能优化审查

> 状态：审查列出的 11 项优化均已实现；全量自动化与隔离 production extension Chrome 验收均已完成。
>
> 最新自动化：`npm run build`、`npm run check`、`npm test` 均通过；Vitest 共 31 个文件、664 项。Playwright 全量 14 项通过。

## 实施原则

- 每次只处理一个可验证热点，先写/补回归测试，再实现。
- 优先缩短拖拽和 Open Tabs 的交互热路径。
- 不为未验证问题引入新依赖、全局抽象或 JS virtualization。
- 改动 DnD 后手动验证：同分类排序、跨分类移动、saved tab 合并、open tabs 批量拖入已有/新 session。

## 2026-07-22 全部实施结果

- **P0 #1 已完成：** `ManagerLayout` 碰撞检测改为单次扫描，保留 category 与 lock 优先级，不再创建候选排序数组；拖拽 replacement snapshot 仅在数据或筛选条件变化时重算。
- **P0 #2 已完成：** `listOpenTabs()` 在单次请求内按 `groupId` 复用 browser group Promise，并行转换窗口与 tab records；无分组与查询失败继续返回 `null`。
- **P0 #3 已完成（局部稳定性）：** `useFilteredGroups()` 对相同 store slice、category、query 的派生结果保持引用稳定，并缩窄为当前 workspace folders；真实 hook 回归覆盖本地无关 rerender。
- **P0 #4 已完成：** Open Tabs 面板在面板层共享 selection `Set`、selected records 与 IDs；pinned tab 与普通 tab 一样参与选择和拖拽；刷新后无有效选中项会退出 selection mode；拖拽源刷新/替换后释放不会提交旧 payload。
- **P1 #5 已完成：** `WorkspaceContent` 与 `SessionCard` 使用 `useShallow` 并缩窄 folder 订阅；authoritative state 在发布到 Zustand 前通过语义 structural sharing 复用未变化的 workspace、folder、group、tab、settings、category order、bin 与 ledger 引用。真实 storage 订阅回归覆盖跨 workspace 写入保持当前实体引用。
- **P1 #6 已完成：** overlay 全局 document/window listener effect 使用 refs 读取最新 menu/preview，只在 provider 生命周期绑定一次；DOM 回归覆盖绑定次数、Esc、outside click、blur/focus、preview timer 与 focus restore。
- **P1 #7 已完成：** storage change 直接比较旧/新 `settings.actionClick`；普通 state 更新不再读取 settings 或调用 action API，模式变化才更新 popup/title。
- **P1 #8 已完成：** `SessionCard` 单次 `useMemo` 派生 visible tabs、link/note/restorable 数量、selected refs 与 canonical index Map，不再重复 `filter()` / `findIndex()`。
- **P2 #9 已完成：** `WorkspaceContent` 在下传前将 marker 解析为 card-local tab marker 或 insertion boolean；`SessionCard` 与 insertion targets 使用 `memo`，drag-over 只改变上一个和当前目标的 props。
- **P2 #10 已完成：** overlay commands 与 observable state 分离；card/row 使用基于 `useSyncExternalStore` 的 menu/preview key 布尔订阅，非目标 consumer 不随 overlay 状态 fan-out。
- **P2 #11 已完成：** Open Tabs query 通过 `useDeferredValue` 延后列表派生；每个 row 使用 CSS `content-visibility: auto` 与 intrinsic size。全部 rows、DnD hooks、preview anchors 和 focus targets 仍保留在 DOM，不采用 JS virtualization。

### 已完成验证

- P0 批次已有 collision、browser group、visible groups、selection/drag payload 回归。
- 新增 action mode、SessionCard metadata、structural sharing、authoritative cross-workspace、listener binding、command consumer、marker scoping、deferred query 与 row containment 回归。
- 聚焦回归覆盖 store/service-worker/manager 热点，另有 Open Tabs、overlay 与 Manager DOM 交叉验证；`tsc --noEmit` 通过。
- `npm run build`：通过。
- `npm run check`：通过，extension sanity check 输出 `TabBoard 0.1.0 extension check passed`。
- `npm test`：31 个文件、664 项通过；已知 hydration fallback 测试日志符合测试预期。
- `npm run test:e2e`：Chromium 14 项通过。
- `git diff --check`：通过。

### 已完成 Chrome 验收

使用 Playwright bundled Chromium persistent context 加载 production `dist/`，在隔离 profile 中完成：

- 同分类 session 指针重排，最终顺序为 Beta / Alpha / Gamma。
- session 跨分类拖到 Saved，authoritative storage 中 `starred` 更新为 `true`。
- saved tab 从 Gamma 拖入 Beta，目标 session 同时包含 Beta One 与 Gamma One。
- 创建两个共享 browser group tabs 和一个未分组 tab 后刷新 Open Tabs，真实 Chrome API 列表可见。
- 两个选中 Open Tabs 批量拖入 Beta；单个 Open Tab 拖到绕开已有 card 的 end target 后创建新 session。
- saved/open preview 的 Esc、outside click 与 window blur suppression。
- 最终 storage `mutationRevision` 为 4，页面无未捕获错误。

## P0：交互与 Chrome API 热路径

### 1. 移除拖拽碰撞检测全量排序

- 文件：`src/manager/components/shell/ManagerLayout.tsx:215-246`
- 现状：每次 pointer move 遍历 droppable、创建 candidates、`sort()`，再多次 `find()`。
- 问题：拖拽时为 `O(n log n)`，session/tab 多时会丢帧。
- 最小改法：单次循环追踪最近 candidate、category candidate、locked candidate；不构建排序数组。
- 验证：现有 DnD 单测；手动测试所有项目 DnD 路径。

### 2. 并行并缓存 Open Tabs 的 browser group 查询

- 文件：`src/background/service-worker.ts:1348-1386`
- 现状：`listOpenTabs()` 对每个 tab 串行 `await readBrowserGroup(tab)`；同一 `groupId` 可重复读取。
- 问题：Open Tabs refresh 延迟随 tab 数线性累加。
- 最小改法：以 `groupId` 缓存查询 Promise；用 `Promise.all()` 生成 tab records。
- 验证：补 service-worker 测试，覆盖同 group 去重、无 group、查询失败回退；手动刷新多个 tab group。

### 3. 稳定 groups 派生结果，移出 dragReplacementKey 热路径

- 文件：`src/manager/hooks/useFilteredGroups.ts:30-42`
- 文件：`src/manager/components/shell/ManagerLayout.tsx:342-347, 485-504`
- 现状：每次 render 重新 `getVisibleGroups()`，并遍历全部 groups/tabs 拼接 `dragReplacementKey`；drag-over 会持续触发 render。
- 问题：拖拽期间反复执行 `O(全部 tabs)` 扫描和字符串分配。
- 最小改法：`useFilteredGroups()` 以 `useMemo` 稳定相同 store slice、category、query 的结果；replacement key 只在数据或筛选条件变化时计算。
- 验证：ManagerLayout 单测覆盖 source replacement 失效；拖拽大 session 手动检查 placeholder/取消行为。

### 4. Open Tabs 选中记录只计算一次

- 文件：`src/manager/components/sidebar/OpenTabsPanel.tsx:151-157, 394-454`
- 现状：每个 row 对相同 `availableTabs` 做 `filter()`，并反复 `selectedTabIds.includes()`、`closingTabIds.includes()`。
- 问题：一次列表 render 最坏 `O(n²)`。
- 最小改法：面板层预计算 selected storable records；将 selected/closing IDs 转为 `Set`；row 接收已计算结果。
- 验证：Open Tabs 单测覆盖单选、多选、drag payload、close loading state。

## P1：低风险渲染和后台调用削减

### 5. 修正 Zustand fresh-array / fresh-object selector

- 文件：`src/manager/components/workspace/WorkspaceContent.tsx:73-77`
- 文件：`src/manager/components/sessions/SessionCard.tsx:114`
- 现状：selector 返回新 object 或 `folders.filter()` 新数组；无关 store 更新也会使 session board / card 重渲染。
- 最小改法：复用项目已有 `useShallow`，或由父层传入稳定 folders。
- 验证：组件测试；确认 folder 更新仍更新对应 session card。

### 6. Overlay 全局监听器仅绑定一次

- 文件：`src/manager/hooks/useManagerOverlays.ts:719-755`
- 现状：effect 依赖 `menu`、`preview`；overlay 状态变化时解绑并重绑约 16 个 document/window listeners。
- 最小改法：稳定 listener effect，menu/preview 通过 refs 获取最新值。
- 风险：高。overlay focus、preview timer、outside-click 很脆弱。
- 验证：现有 `useManagerOverlays.dom.test.ts`；补 listener 绑定次数测试；手动验证 blur/focus、Esc、outside click、saved/open preview。

### 7. 仅在 actionClick 改变时更新 Chrome action

- 文件：`src/background/service-worker.ts:111-115, 506-512`
- 现状：每个 `STATE_KEY` storage 更新都读 settings 并调用 `chrome.action.setPopup()`、`setTitle()`。
- 最小改法：比较 storage change 中旧/新 `settings.actionClick`，未变化则跳过；或缓存已应用 mode。
- 验证：service-worker 测试覆盖普通 state 更新不调用 action API、actionClick 变化时调用。

### 8. SessionCard 单次派生 tab 元数据

- 文件：`src/manager/components/sessions/SessionCard.tsx:120-130, 291-293, 487-513`
- 现状：同一 `group.tabs` 多次 `filter()`；在 `visibleTabs.map()` 内为每行 `findIndex()`。
- 最小改法：一个 `useMemo` 产出 visible tabs、link/note counts、selected refs、tab index Map。
- 验证：SessionCard 过滤、选择、Dnd index 现有测试。

## P2：需要测量或较大重构

### 9. 缩小 dragMarker 引发的卡片更新范围

- 文件：`src/manager/components/shell/ManagerLayout.tsx:843-849`
- 文件：`src/manager/components/workspace/WorkspaceContent.tsx:175-200`
- 现状：每次 drag-over 变化把 `dragMarker` 下传全部 SessionCard / TabItemRow。
- 方向：分离静态 card 与 marker；仅当前和上一个 marker 所在 card 更新。
- 前提：先完成 P0 #1、#3，使用 React Profiler 确认仍为瓶颈。

### 10. 拆分 Overlay Context 的状态订阅

- 文件：`src/manager/hooks/useManagerOverlays.ts:770-791`
- 文件：`src/manager/components/sessions/TabItemRow.tsx:87`
- 现状：Context value 包含 `menu`、`preview`；任一 overlay 变化会更新所有 session/tab consumer。
- 方向：commands 与 state 拆 Context，或采用支持 selector 的外部 store。
- 前提：先 profile。此项改动面广，不能仅为理论优化重构。

### 11. Open Tabs 列表挂载优化

- 文件：`src/manager/components/sidebar/OpenTabsPanel.tsx:394-454`
- 现状：每个 open tab 挂完整 row、Tooltip、Dnd hook、overlay trigger。
- 建议：先完成 P0 #4，再使用真实大列表 profile。输入筛选可先尝试 `useDeferredValue`。
- 不立即做 JS virtualization：Dnd、focus restore、preview anchor 与 accessibility 风险高。
- 备选：验证 `content-visibility` 是否可用于 open-tab rows 后，再决定。

## Bundle 观察

- Manager 生产启动资源约为 630 KB JS raw / 200 KB gzip，232 KB CSS raw / 35 KB gzip。
- Vite 已按 manager、popup、options 拆 entry；Mantine shared styles 是主要 CSS。
- 不建议当前替换 Mantine、拆组件库或新增 bundle 工具。先处理运行时热点。

## 已有优化，不重复实现

- `src/manager/styles/manager.css:1414-1430` 已对 session board 使用 `content-visibility: auto`。
- 不新增 session board JS virtualization；它会干扰 `@dnd-kit` 测量、`scrollIntoView` 与 keyboard DnD。

## 后续观察

- 使用 React Profiler 在真实大 workspace、长 Open Tabs 列表和连续 drag-over 下复核 commit 范围与耗时。
- 若单窗口达到数百 tabs 后仍有压力，先测量 CSS containment 与 deferred filtering 的效果，再重新评估 virtualization；当前不引入会破坏 DnD、focus restore、preview anchor 或 accessibility 的 JS virtualization。
- 继续把 Chrome 手工验收与自动化 proof 分开记录，不能以测试通过代替真实浏览器 DnD/Chrome API/focus 验收。
