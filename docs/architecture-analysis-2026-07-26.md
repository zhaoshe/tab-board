# TabBoard 架构复盘（2026-07-26）

## 基线

本次复盘基于以下 ownership 优化完成后的代码：

- Storage Authority；
- Open Tabs Workflow；
- Authoritative Publication；
- Shared Session Domain。

Fresh verification baseline：

- `npm run build`: PASS，6984 modules；
- `npm run check`: PASS，6个graph CLI tests，123 source files，零cycles/forbidden edges；
- `npm test`: PASS，50 test files，857 tests；
- shared/background production imports Manager：0；
- production `src/manager/core/commands.ts`：已删除。

## 评估方法

不以文件行数作为唯一信号，按以下维度评估：

- **Module ownership**：状态和规则是否只有一个owner；
- **Interface**：consumer能否只看接口理解使用方式；
- **Dependency depth**：依赖是否从primitive/domain向adapter/UI单向流动；
- **Seam**：能否独立测试和替换；
- **Adapter boundary**：DOM、Chrome、storage、React是否被限制在adapter；
- **Leverage**：修复是否影响多个高频调用方；
- **Locality**：一个行为变化需要修改多少模块。

## 当前健康项

### 1. Source dependency graph

- strict graph gate当前覆盖123个source files；
- source SCC数量为0；
- publication禁止依赖Zustand/React/UI/concrete storage；
- shared/background禁止反向依赖Manager。

结论：dependency direction已从主要风险变为可执行约束。

### 2. Persistence ownership

- Storage Authority拥有backend identity/switch/fallback；
- Authoritative Publication拥有optimistic/authoritative时序；
- worker State Persistence拥有batch transaction；
- Zustand只保留UI projection和domain facade。

结论：三层职责可独立测试，当前不应重新合并。

### 3. Session/drop ownership

- category、DropIntent、raw validation、execution/replay、restore/import均由shared domain拥有；
- Manager DnD只保留geometry、target resolution和interaction lifecycle；
- orphan folder → Inbox规则已有shared owner。

结论：persistent domain不再被UI layer拥有。

## 新发现

## P1: Saved search query没有单一owner

当前 `useFilteredGroups.ts` 同时维护：

- module-level `globalQuery`；
-一个未实际被订阅的 `listeners` set；
- `sessionStorage["tabboardSearch"]`；
- `window.dispatchEvent(new CustomEvent("tabboard-search-change"))`；
- 每个 `useSearchQuery()` caller自己的React state与window listener。

`SearchBar.tsx` 又独立监听同一window event，以同步自己的debounced local input。

影响：

- 同一query有四种同步机制；
- 初始化由每个hook instance重复执行；
- window event成为同页面组件间的隐藏通信；
- test必须mock整个hook而不能直接验证query owner；
- search clear / URL target / Open Tabs filter race要跨多个组件推理。

优化方向：

- 建立一个可注入、可测试的 `SearchQueryStore`；
- store拥有URL/sessionStorage初始化、snapshot、subscribe、set；
- React通过 `useSyncExternalStore`订阅；
- `SearchBar`只保留150ms input debounce，并从external snapshot同步local value；
- 删除 `tabboard-search-change` window event和重复listener。

## P1: WorkspaceContent重复category projection

`WorkspaceContent.tsx` 已使用 `useFilteredGroups(category)` 获取visible groups，但又从Zustand读取所有groups并手写：

```ts
if (category === 'saved') ...
if (category === 'archive') ...
if (category === 'inbox') ...
```

这份逻辑用于DnD insertion index和empty target。

问题：

- 与shared `categoryForGroup()`重复；
- Inbox只接受 `folderId === null`，而shared rule把invalid/orphan folder也归Inbox；
- Saved分支额外要求`!archived`，与shared precedence规则不同；
- filtered groups和unfiltered category groups可能使用不同membership；
- 一个category规则变化至少要修改selector、resolver和WorkspaceContent。

优化方向：

- `useFilteredGroups.ts` 暴露单一board projection：
  - `categoryGroups`：canonical unfiltered category sessions；
  - `visibleGroups`：按query过滤后的sessions；
  - `searchQuery`。
- projection复用当前stable workspace-folder selector和shared `getVisibleGroups()`；
- `WorkspaceContent`只消费该projection，不再读取/扫描全部groups；
- `useFilteredGroups()`保留为薄wrapper供ManagerLayout使用。

## P2: 大型mutation/publication modules

当前主要大文件：

- `stateMutations.ts`: 2380行；
- `authoritativePublication.ts`: 1100行；
- `drop-operations.ts`: 946行。

它们确实包含多个内部阶段，但当前具备：

- 单一owner；
- 明确public API；
- direct tests；
- strict dependency boundaries；
- 最近变更主要是owner迁移，而非持续跨文件修改。

结论：

- 暂不按行数机械拆分；
- 后续只有在一个真实feature/bug需要同时修改多个内部阶段，或测试无法局部运行时，再拆分：
  - mutation raw contract / semantic safety / replay / apply；
  - publication reconciliation / retry policy / hydration lifecycle；
  - drop execution / replay identity。

## P2: Manager adapters偏大

- `ManagerLayout.tsx`: 1010行、fan-out 20；
- `useManagerOverlays.ts`: 1130行；
- `service-worker.ts`: 1639行。

这些文件是composition/event adapters，天然fan-out较高。当前已有：

- pure DnD helpers；
- Open Tabs workflow；
- overlay external state store；
- background state persistence seam。

结论：

- 不因fan-out或行数立即拆分；
- 下次修改对应feature时检查是否存在可命名的独立workflow owner；
- 保持“先提取行为owner，再缩adapter”，不做目录级搬运。

## 优先级

1. **P1：Search Query Store + Board Projection**  
   同时消除隐藏window event和category重复语义，收益明确、风险局部。
2. **P2：mutation/publication内部拆分**  
   暂无足够变更局部性证据，观察。
3. **P2：Manager/service-worker adapter继续收缩**  
   按后续feature触发，不做预防式重构。

## 下一步

设计并实现 `SearchQueryStore + Board Projection`，完成后重新运行同样的架构分析和全量验证。
