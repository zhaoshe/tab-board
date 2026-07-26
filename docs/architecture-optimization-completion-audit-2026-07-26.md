# TabBoard 架构优化完成审计（2026-07-26）

## 审计目标

原始请求：

> 先提交当前的代码，然后深度分析架构，给出架构的优化方案。

后续执行约束：

> 依次处理所有优化点，之后重新进行架构分析，接着继续优化 → 分析，直到架构达到无可优化为止。

本审计不以“测试通过”或“提交很多”代替完成判断，而是逐项核对：

1. 起始工作是否先提交；
2. 是否有source-backed深度架构分析；
3. 是否给出并实施优化方案；
4. 是否完成“优化 → 重新分析 → 继续优化”的循环；
5. 是否有design、plan、code、tests、docs、gates与commit evidence；
6. 是否存在未完成计划、tracked改动、无依据的“已完成”声明；
7. 剩余项为何停止，而不是继续预防式重构。

## 1. 起始提交

本轮最早commit：

- `374e878 fix(manager): align open tab capture and sidebar behavior`

该commit在深度架构优化前提交了当时工作区中的Open Tabs/capture/sidebar行为与文档。

结论：满足“先提交当前代码”。

## 2. 架构分析与优化循环

## 第一阶段：Storage Authority

问题：

- browser/file backend选择、订阅、ping、migration、fallback分散；
- runtime file failure没有稳定authority自动降级。

产物：

- design：`docs/superpowers/specs/2026-07-26-storage-authority-design.md`；
- plan：`docs/superpowers/plans/2026-07-26-storage-authority.md`；
- code：stable authority、storage event transport、runtime fallback、transactional switch；
- docs：D037/D039 implementation notes与technical architecture；
- commits：`721e1e8` → `3abc306`。

结果：

- callers持有稳定adapter identity；
- backend switch/fallback有明确commit point；
- file runtime失败降级到Chrome且不误报本次未提交mutation成功。

## 第二阶段：Open Tabs Workflow

问题：

- protocol、selection、refresh、capture、tab filter、drag completion分散；
- 多条global DOM events传递同页状态。

产物：

- design：`docs/superpowers/specs/2026-07-26-open-tabs-workflow-design.md`；
- plan：`docs/superpowers/plans/2026-07-26-open-tabs-workflow.md`；
- shared runtime protocol；
- pure reducer/projection；
- grouped `model/commands` workflow；
- capture/drop/filter直接return/command/model；
- commits：`822faab` → `1f56d87`。

结果：

- Open Tabs state有单一owner；
- Panel不重复派生records/IDs；
- 三条global DOM event seam删除。

## 第三阶段：Authoritative Publication

问题：

- optimistic queue、retry、waiters、remote buffer、hydration/context generation全部堆在
  `useTabBoardStore.ts` module globals；
- persistence时序无法脱离Zustand/Chrome global直接测试。

产物：

- design/spec/plan；
- injected `createAuthoritativePublication(dependencies)` owner；
- 22 direct tests；
- `useTabBoardStore.ts` 从1227行收敛到约534行，后续feedback优化后为499行；
- commits：`a307619` → `5078322`。

结果：

- publication、Storage Authority、worker transaction三层ownership分离；
- ordinary/drop/category/restore、partial commit、retry、isolation、hydration/context replacement
  由direct tests守护；
- import gate禁止publication依赖UI library、components与concrete storage adapters。

## 第四阶段：Shared Session Domain

问题：

- category、DropIntent、drop validation/execution/replay、restore/import由Manager拥有；
- shared/background反向依赖Manager，形成六模块SCC。

产物：

- `shared/validation.ts`；
- `model/categories.ts`；
- `model/drop-intent.ts`；
- `model/drop-validation.ts`；
- `model/drop-operations.ts`；
- `model/session-operations.ts`；
- 删除production `manager/core/commands.ts`；
- strict zero-cycle graph gate；
- commits：`81b0dd2` → `50a7f0a`。

结果：

- shared/background production imports Manager降为0；
- source SCC降为0；
- orphan folder → Inbox由shared owner统一；
- Manager DnD只保留interaction resolution。

## 第一次重新分析

产物：

- `docs/architecture-analysis-2026-07-26.md`
- commit：`059465d`

结论：

- persistence/domain/direction已健康；
- 识别唯一P1：Search Query Store + Board Projection；
- 大文件与Manager adapters缺少继续拆分证据，列为P2观察项。

## 第五阶段：Search Query Store + Board Projection

问题：

- query有module global、per-hook state、sessionStorage、window event四套同步；
- WorkspaceContent复制category membership，orphan Inbox render与DnD index漂移。

产物：

- design：`docs/superpowers/specs/2026-07-26-search-query-board-projection-design.md`；
- plan：`docs/superpowers/plans/2026-07-26-search-query-board-projection.md`；
- framework-neutral SearchQueryStore；
- `useSyncExternalStore` adapter；
- canonical `getBoardProjection()` / `useBoardProjection()`；
- static architecture checker；
- D044；
- commits：`fd16c87` → `68b73fc`。

结果：

- query只有一个snapshot owner；
- 同栈Open Tabs filter → capture竞态消除；
- SearchBar 150ms debounce与external sync有direct tests；
- render/card index/end target共享canonical categoryGroups；
- `tabboard-search-change`与旧hook owner删除。

## 第二次重新分析

产物：

- `docs/architecture-analysis-2026-07-26-pass-2.md`
- commit：`b6c0e38`

结论：

- Search/Board ownership健康；
- file adapter private EventTarget、fallback fanout和large modules按证据排除；
- 识别唯一剩余P1：Typed Application Feedback Channel。

## 第六阶段：Typed Application Feedback

问题：

- Store用四个未类型化window events传递save/import/restore/error；
- toast consumer断言unknown payload；
- event module有dead listener map；
- store timing tests依赖`window.dispatchEvent`。

产物：

- design：`docs/superpowers/specs/2026-07-26-typed-application-feedback-design.md`；
- plan：`docs/superpowers/plans/2026-07-26-typed-application-feedback.md`；
- typed ApplicationFeedback channel；
- pure mutation feedback mapper；
- typed toast presenter/subscriber；
- 删除`shared/utils/events.ts`；
- feedback architecture/graph gates；
- D045；
- commits：`b7e3dab` → `a120b47`。

结果：

- feedback只有一个typed page-local owner；
- authoritative commit/error timing保持；
- partial commit/retry/notify policy由74个store tests守护；
- subscriber异常不影响persistence；
- legacy event names/module/imports为0。

## 第三次重新分析

产物：

- `docs/architecture-analysis-2026-07-26-pass-3.md`
- commit：`94c5965`

分析范围：

- module size/fan-in/fan-out；
- module-level mutable state/lifecycle；
- 所有window/document/Chrome event channels；
- suppressions；
- 语义owner重复；
- reverse dependencies；
- architecture gate覆盖；
- recent change locality。

结论：

- 无新的P1；
- 无重复state owner；
- 无shared/background反向依赖；
- 无global业务DOM event bus；
- 无未隔离的persistence/feedback时序；
- large modules仍只有行数信号，没有独立behavior/locality证据；
- 剩余项由未来feature/bug触发，不继续预防式搬运。

## 3. Prompt-to-Artifact 对照

| 用户要求 | Artifact evidence | 状态 |
|---|---|---|
| 先提交当前代码 | `374e878` | 完成 |
| 深度分析架构 | 三轮architecture analysis + source graph/fan-in/out/lifecycle扫描 | 完成 |
| 给出优化方案 | 每轮design/spec/decision docs | 完成 |
| 依次处理所有优化点 | 六个ownership阶段、49 commits | 完成 |
| 优化后重新分析 | `059465d`、`b6c0e38`、`94c5965` | 完成 |
| 继续优化直到无高价值项 | Search/Board与Feedback两轮追加P1均实施 | 完成 |
| Evidence before claims | fresh build/check/test与静态审计 | 完成 |
| 最终artifact审计 | 本文档 | 完成 |

## 4. 计划与提交完整性

- authoritative publication plan：无unchecked steps；
- session domain plan：无unchecked steps；
- search/board plan：无unchecked steps；
- typed feedback plan：无unchecked steps；
- design/spec/plan中无TBD/待定实现；
- 从`059465d`到最终复盘的18个commits，TRAE co-author trailer均恰好一次且位于末尾；
- 从起始commit `374e878` 到第三轮复盘共49个commits。

## 5. Fresh验证证据

最终实现后已按顺序执行：

- focused Typed Feedback suite：7 files / 136 tests；
- `npm run build`: PASS，6988 modules；
- `npm run check`: PASS：
  - extension artifacts；
  - 6 graph tests；
  - 134 source files；
  - 0 cycles；
  - 0 forbidden edges；
  - 8 architecture fixture tests；
  - 77 production source files；
  - 0 ownership violations；
- `npm test`: PASS，57 files / 896 tests；
- `git diff --check`: PASS；
- retired search/feedback seams：0；
- shared/background production imports Manager：0；
- tracked working tree：clean（在本审计文档提交前）。

已知test stderr中的file fallback/hydration日志和OpenTabsPanel React prop warning是现有测试场景输出；
所有tests仍PASS，本轮没有为其做无关修复。

## 6. 明确不做的项目

以下不是遗漏，而是经过三轮分析后有意停止：

- 不按行数拆 `stateMutations.ts`、`service-worker.ts`、
  `authoritativePublication.ts`、`useManagerOverlays.ts`、
  `ManagerLayout.tsx`、`drop-operations.ts`；
- 不把private FileStorage EventTarget替换成另一套observable；
- 不合并Storage fallback的三个不同UI projections；
- 不为消除mount-only effect suppression重写DataStorageCard lifecycle；
- 不引入新runtime dependency；
- 未执行Chrome手工DnD acceptance，因为本轮没有改变DnD geometry/pointer behavior；
  AGENTS仍要求相关未来UI/DnD变更做manual Chrome验证。

## 7. 最终结论

原始请求及后续持续优化约束已经完成：

- 代码先提交；
- 架构经过三轮source-backed分析；
- 六个高价值ownership问题全部实施；
- 关键决策进入D042–D045与technical/evolution docs；
- 架构边界进入可执行gates；
- full verification通过；
- 第三轮没有新的P1。

当前架构不是“永远不需要改”，而是已经达到本轮合理停止点：继续重构只会是预防式
文件搬运，缺少可验证的行为收益。后续应由真实feature/bug重新触发架构评估。
