# TabBoard 架构复盘（2026-07-26，第三轮）

## 基线

本轮基于所有已完成 ownership 优化：

- Storage Authority；
- Open Tabs Workflow；
- Authoritative Publication；
- Shared Session Domain；
- Search Query Store + Board Projection；
- Typed Application Feedback Channel。

Fresh verification：

- `npm run build`: PASS，6988 modules；
- `npm run check`: PASS：
  - extension artifacts；
  - 6 import-graph tests；
  - 134 source files，零cycles / forbidden edges；
  - 8 architecture fixture tests；
  - 77 production source files，零ownership violations；
- `npm test`: PASS，57 test files，896 tests；
- shared/background production imports Manager：0；
- retired feedback/search event seams：0。

## 再分析范围

本轮不重新枚举已修复问题，而是寻找剩余的高价值风险：

- production module size、fan-in、fan-out；
- module-level mutable state与生命周期；
- window/document/Chrome event channels；
- framework/domain反向依赖；
- 语义owner重复；
- suppressions/TODO与隐式绕过；
- architecture gate覆盖面；
- recent change locality。

## 结果

## 1. Dependency direction健康

- source graph为134 files，SCC为0；
- shared/background → Manager edge为0；
- Authoritative Publication、drop operations、state mutations、worker persistence、
  SearchQueryStore、ApplicationFeedback均有显式forbidden-import policy；
- 高fan-in modules主要是model types/barrel、Open Tabs protocol、Zustand facade和domain
  mutation owner，符合其contract角色。

结论：没有新的layer inversion。

## 2. Page-local state与event ownership健康

- saved query：单一external store；
- board membership：shared category owner + canonical projection；
- Open Tabs：pure reducer/projection + runtime adapter；
- overlay：provider lifecycle拥有document/window listeners，commands与observable state分离；
- application feedback：typed page-local channel，non-replay，subscriber异常隔离；
- diagnostics：global error listeners返回显式disposer；
- keyboard/focus/visibility listeners都位于对应React lifecycle。

剩余 `CustomEvent` 仅位于 `FileStorageAdapter` instance私有/injected `EventTarget`，
用于实现该adapter的 `subscribeState()`。它不是window global bus。

结论：没有新的隐藏业务事件总线。

## 3. Infrastructure singletons有明确生命周期

- service worker persistence/restore queue：service-worker process owner；
- Storage Authority singleton：有reset/dispose和backend rebinding；
- Authoritative Publication instance：有generation、releaseHydration、dispose；
- Zustand fallback subscription：page lifetime owner，并在beforeunload best-effort释放；
- SearchQueryStore / ApplicationFeedback：page module singleton，API窄且direct tested；
- Toast notification ID：只保证同provider page中的render key唯一。

结论：没有发现需要再建store/provider的singleton问题。

## 4. Suppressions没有形成P1

Production suppressions仅包括：

- `DataStorageCard` mount-only refresh/fallback subscription的
  `react-hooks/exhaustive-deps`；
- store fallback console breadcrumb；
- test/memory filesystem的`no-this-alias`；
- legacy todo schema compatibility constant。

`DataStorageCard` effect只需在mount绑定authority listener，并通过返回值释放；把
`refreshStatus` callback加入dependency而不重写hook会导致重复subscription。当前
行为有明确lifecycle，不构成owner或correctness风险。

结论：保留，不为消除lint comment做预防式hook重构。

## 5. Large modules仍是P2观察项

主要production大文件：

- `stateMutations.ts`: 2380；
- `service-worker.ts`: 1639；
- `useManagerOverlays.ts`: 1130；
- `authoritativePublication.ts`: 1100；
- `ManagerLayout.tsx`: 1010；
- `drop-operations.ts`: 946。

当前证据：

- 每个文件都有单一owner或adapter role；
- direct/pure seams已覆盖其高风险逻辑；
- import direction稳定；
- 最近Search/Board/Feedback feature均能通过窄owner替换，不需复制大文件内部policy；
- 拆分仅会改变文件布局，尚无可拒绝的独立behavior交付或局部测试收益。

停止条件：

仅当未来真实feature/bug满足以下任一条件时拆分：

1. 一个改动必须同时触碰同文件中两个可命名、独立演化的policy；
2. focused test无法绕开整个owner运行；
3. adapter产生第二份状态或隐藏时序；
4. import gate无法表达新的责任边界。

结论：当前不拆。

## 6. Architecture gates覆盖高风险回归

`npm run check` 当前执行：

- TypeScript + production build；
- extension artifact sanity；
- strict zero-cycle graph；
- publication/drop/mutation/background/search/feedback forbidden imports；
- saved-search event bus、WorkspaceContent category scan、feedback legacy event/module、
  toast raw payload/window listener等静态规则。

结论：主要ownership决策已有自动化防回退。

## 最终架构结论

第三轮没有发现新的P1：

- 无重复state owner；
- 无shared/background反向依赖；
- 无全局业务DOM event bus；
- 无未隔离的persistence/application feedback时序；
- 无需要立即拆分的大文件证据；
- 无未进入gate的已知高风险边界。

“无可优化”不应解释为代码永远不需要变化，而是：

> 在当前产品范围、变更历史和可执行证据下，没有继续重构能带来明确高价值收益；
> 剩余项都应由未来feature/bug触发，而不是预防式搬运。

因此优化循环在此停止，进入最终prompt-to-artifact completion audit。
