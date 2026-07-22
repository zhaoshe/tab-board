# 批次一性能优化设计

- 日期：2026-07-22
- 状态：已批准，待编制实施计划
- 范围：`docs/performance-optimization-review.md` 中 P0 #1–#4 与 P1 #5。

## 目标

缩短拖拽和 Open Tabs 交互热路径，减少无关 React 重渲染。保持 TabBoard 现有数据模型、Chrome API 边界、拖拽语义和 UI 行为，不增加运行时依赖。

## 不在范围内

- Overlay 全局监听器重绑与 Overlay Context 拆分。
- `chrome.action` 配置更新去重。
- `SessionCard` tab 元数据合并派生。
- `dragMarker` 更新范围收缩。
- Open Tabs virtualization 或新增 `content-visibility` 策略。

这些项目需要后续 profile 或独立回归覆盖后再评估。

## 方案选择

采用局部热路径优化。

- 不改组件层级、store 结构或 DnD contract。
- 复用现有 `useShallow`、`useMemo`、`Promise.all` 与标准 `Map`/`Set`。
- 不引入新依赖或外部抽象。

未采用仅处理后台/DnD 的缩小范围，因为 Open Tabs 列表和 Zustand selector 的重复工作仍会保留。未采用批次二/三合并重构，因为 overlay、virtualization 与 `dragMarker` 影响焦点恢复和 DnD，风险不匹配当前目标。

## 设计

### DnD 碰撞检测单次扫描

修改 `src/manager/components/shell/ManagerLayout.tsx` 的 `createGeometryCollisionDetection()`。

现有逻辑会创建全部 candidate，按 distance 排序，再重复查找 category、locked 和最终 selected candidate。新逻辑在遍历 droppable container 时维护：

- 最近普通兼容 target；
- 最近且指针位于 rect 内的 `category-column` target；
- 匹配当前 locked target 的 candidate；
- 每个 candidate 的 `container`、`target` 与 `distance`。

选择顺序保持不变：优先最近 category target；否则使用最近普通 target；随后按现有 `lockDropTarget()` 与 release margin 决定最终 target；最终返回该 target 的原始 droppable container。

`resolveTabEdgeTarget()`、`isCompatibleTarget()`、键盘 DnD、无 candidate 时清理 locked target 和 `dragUiState` contract 均不改变。

### browser group 并行去重

修改 `src/background/service-worker.ts` 的 `listOpenTabs()`。

每次请求创建局部 `Map<number, Promise<BrowserGroup | null>>`。有效 `groupId` 首次出现时调用已有 `readBrowserGroup()` 并缓存 Promise；后续相同 `groupId` 复用 Promise。无 group 的 tab 直接解析为 `null`。

window 内 tab record 通过 `Promise.all()` 并发创建，过滤规则、`storable` 计算、数据字段与原有 tab/window 顺序保持不变。`readBrowserGroup()` 已吞掉 Chrome API 失败并返回 `null`，该容错行为保持不变。缓存只覆盖单次 `listOpenTabs()` 调用，不跨 refresh 保留 Chrome group 元数据。

### 稳定可见 session 与 replacement snapshot

修改：

- `src/manager/hooks/useFilteredGroups.ts`
- `src/manager/components/shell/ManagerLayout.tsx`

`useFilteredGroups()` 使用 `useMemo()` 缓存 `getVisibleGroups()`，依赖为 shallow-stable store slice、category 与 search query。相同输入下，父组件仅因本地拖拽状态重渲染时保留相同 groups 引用。

`ManagerLayout` 仅在 groups、workspace、category 或 bin/workspace view 变化时 memoize drag replacement snapshot。`handleDragStart()` 保存 snapshot；活动拖拽期间的 effect 比较已 memoize snapshot，继续在数据、过滤条件或 source 可见性变化时终止拖拽。`onDragOver` 触发的本地 state 更新不再遍历所有 visible group/tab 拼接字符串。

### Open Tabs 选择派生

修改 `src/manager/components/sidebar/OpenTabsPanel.tsx`。

面板层使用 `useMemo()` 创建：

- `selectedTabIdSet`；
- `closingTabIdSet`；
- 当前 window 中已选择、可存储的 tab records；
- 对应 tab ID 数组。

每行通过 `Set.has()` 得到 selected/closing 状态。`OpenTabContentTrigger` 接收共享的选择派生数据；仅当前行已选时使用已选择且可存储的 records 作为 drag payload，否则保持单 tab payload。

不可存储/pinned tab 继续禁用拖拽；Close loading、preview key、tooltip、overlay lifecycle 与 window filter 行为不变。

### Zustand selector 稳定性

修改：

- `src/manager/components/workspace/WorkspaceContent.tsx`
- `src/manager/components/sessions/SessionCard.tsx`

`WorkspaceContent` 的对象 selector 使用已有 `useShallow` 包装。`SessionCard` 的 workspace folder filter selector 同样使用 `useShallow`。由 immutable Zustand 更新保证，不相关 state 或其他 workspace folder 变动保持相等 selector 结果；当前 workspace folder 的新增、删除、改名仍会触发必要更新。

## 测试与验证

先补失败测试，再写最小实现。

### 自动化

1. DnD 单测：最近 target、分类列优先、locked target 保持/释放、tab edge 解析、无兼容 target 清锁。
2. service worker 测试：同 group 查询一次、多 group 并发、无 group 不查询、读取失败回退 `null`、输出顺序不变。
3. Manager/Open Tabs DOM 测试：单选和多选 drag payload、不可存储项排除、Close loading 状态、groups 引用稳定、selector 对无关更新不重渲染且对相关 folder 更新生效。
4. 保留并运行既有 Playwright Open Tabs 大列表/preview 回归。

### 手动 Chrome 验证

- 同分类 session 排序；
- session 跨分类移动；
- saved tab 拖入已有 session；
- 单个 Open Tab 拖入已有 session；
- 多选 Open Tabs 拖入已有 session；
- 多选 Open Tabs 在插入位置创建新 session；
- 多个 Chrome tab group 的 Open Tabs refresh。

完成后执行 `npm test`、`npm run build` 与 `npm run check`。

## 成功标准

- 同一 browser group 的 group metadata 每次 refresh 最多读取一次。
- 相同 store/filter 输入下，拖拽本地 state 更新不重新派生 visible groups 或 replacement snapshot。
- Open Tabs 一次列表 render 不再为每行扫描完整 `availableTabs` 和选择数组。
- 无关 Zustand 更新不因 fresh object/array selector 结果刷新目标组件。
- 所有自动化检查通过，DnD 手动矩阵无回归。
