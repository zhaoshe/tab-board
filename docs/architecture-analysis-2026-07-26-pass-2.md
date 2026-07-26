# TabBoard 架构复盘（2026-07-26，第二轮）

## 基线

本次复盘基于以下 ownership 优化全部完成后的代码：

- Storage Authority；
- Open Tabs Workflow；
- Authoritative Publication；
- Shared Session Domain；
- Search Query Store + Board Projection。

Fresh verification baseline：

- `npm run build`: PASS，6987 modules；
- `npm run check`: PASS：
  - extension artifact check；
  - 6 个 import-graph CLI tests；
  - 130 source files，零 cycles / forbidden edges；
  - 5 个 search-architecture CLI tests；
  - 76 production source files，零 search ownership violations；
- `npm test`: PASS，54 test files，880 tests；
- shared/background production imports Manager：0；
- removed search event/global/ref/import seams：0；
- production `tabboardSearch` owner：仅 `useSearchQuery.ts`。

## 评估方法

继续使用 ownership-first 标准，不以文件行数或 fan-out 单独决定重构：

- **Owner**：同一状态、时序或规则是否只有一个权威模块；
- **Interface**：consumer 是否通过窄、类型化 contract 使用；
- **Direction**：primitive/domain/infrastructure → adapter/UI 是否单向；
- **Lifecycle**：module singleton、subscription、timer 是否有明确创建/释放边界；
- **Locality**：真实 feature/bug 是否需要跨多个 owner 同步修改；
- **Test seam**：关键行为能否绕开 DOM/Chrome/React 直接验证；
- **Static enforcement**：依赖方向与禁止 seam 是否进入 `npm run check`。

## 当前健康项

### 1. Dependency direction

- source graph 已扩展到 130 个 TS/TSX files；
- SCC 数量为 0；
- shared/background → Manager production edge 为 0；
- SearchQueryStore、Authoritative Publication、drop execution 和 worker persistence 均有显式 forbidden-import gate。

结论：layering 已从文档约定变为 executable architecture。

### 2. Page-local state ownership

- saved-session query 由三方法 external store 单一拥有；
- React subscription 与 Open Tabs imperative snapshot 使用同一 owner；
- board render 与 DnD index 共用 canonical category projection；
- Open Tabs selection/refresh/filter 由 reducer/projection 单一拥有；
- overlay commands 与 observable state 已分离。

结论：此前最主要的 Manager 隐式状态同步问题已经消除。

### 3. Persistence ownership

- Storage Authority 决定 backend identity、migration、fallback；
- Authoritative Publication 决定 optimistic/authoritative 时序；
- worker State Persistence 决定 mutation transaction；
- Zustand facade 只组合 domain actions、UI projection ports 和 outcome mapping。

结论：当前三层职责互补，不应重新合并。

### 4. Large modules

当前主要大文件：

- `stateMutations.ts`: 2380 行；
- `service-worker.ts`: 1639 行；
- `useManagerOverlays.ts`: 1130 行；
- `authoritativePublication.ts`: 1100 行；
- `ManagerLayout.tsx`: 1010 行；
- `drop-operations.ts`: 946 行。

复核结果：

- 大文件均已有明确 production owner；
- `authoritativePublication.ts` 只有一个 production factory consumer，22 个 direct tests；
- `drop-operations.ts` 已是 shared domain owner，production apply 入口集中；
- `useManagerOverlays.ts` 的 document/window listeners 在 provider lifecycle 内统一绑定；
- `ManagerLayout.tsx` 是 composition/DnD adapter，近期 search/board改动只替换窄 hooks，没有迫使内部 policy再复制；
- recent git history没有显示“一个 feature必须反复同步修改多个内部 owner”的新证据。

结论：仍不按行数机械拆分。文件长度是观察信号，不是当前 P1。

## 新发现

## P1: Application feedback 仍由未类型化 window event bus 传递

当前 `src/shared/utils/events.ts` 提供：

```ts
emitEvent(eventName: string, data?: unknown)
onEvent(eventName: string, callback: (data?: unknown) => void)
```

Zustand/publication adapter用它发布：

- save success；
- import success；
- restore success；
- persistence/import error。

Manager `useToastNotifications()` 再通过四个 `window.addEventListener` 订阅，并在
consumer侧用 type assertion解释 `unknown` payload。

问题：

1. **隐藏 global seam**  
   Shared store和Manager UI通过window event name耦合，接口无法从import graph直接看出。
2. **无类型 payload**  
   Producer和consumer分别手写payload shape；字段漂移只能在运行时发现。
3. **dead ownership**  
   `events.ts` 维护module-level `listeners` map并在emit时通知，但 `onEvent()`从未往
   该map注册，说明模块同时尝试拥有两套channel，实际只使用window channel。
4. **测试依赖 DOM global**  
   store outcome tests spy `window.dispatchEvent` 或stub `EventTarget`，而不是直接验证
   typed feedback contract。
5. **不需要跨context能力**  
   `window.CustomEvent`只在当前extension page生效，并没有提供真正的Manager/Options/
   worker跨context通信；使用global DOM bus没有架构收益。

### 推荐方向

建立 typed Application Feedback owner：

```ts
type ApplicationFeedback =
  | { kind: 'save-succeeded'; title: string; tabCount: number }
  | { kind: 'import-succeeded'; groupCount: number; tabCount: number }
  | { kind: 'restore-succeeded'; item: 'group' | 'tab'; count: number; label: string }
  | { kind: 'operation-failed'; source: 'persistence' | 'import'; message: string };

interface ApplicationFeedbackChannel {
  publish(feedback: ApplicationFeedback): void;
  subscribe(listener: (feedback: ApplicationFeedback) => void): () => void;
}
```

- owner 不依赖 DOM、React、Zustand、Chrome 或 store；
- Zustand adapter只把 authoritative outcomes投影成typed feedback；
- Manager hook订阅channel并把typed union映射为toast copy；
- 删除 `shared/utils/events.ts`、`AppEvents`、window CustomEvent与dead listener map；
- 保持反馈只在authoritative commit / surfaced error时产生，不改变时序；
- 新增direct channel tests、mutation→feedback tests、toast presentation tests与静态门禁。

## 已分类但不优化的 seam

### FileStorage CustomEvent

`fileStorage.ts` 的 `CustomEvent` 运行在adapter instance私有/injected `EventTarget` 上，
只实现该adapter的 `subscribeState()`。它不是window global bus，生命周期与adapter一致。

结论：保留。

### Storage fallback subscriptions

`onFallback()` 当前有三个consumer：

- Zustand projection记录 `persistenceError`；
- Manager展示fallback toast；
- Options更新storage status/reconnect UI。

它们消费同一Storage Authority outcome，但承担不同投影，不是三个fallback owner。

结论：保留；若未来需要replay/last-value语义，再升级为typed observable state。

### Service worker / persistence queues

- service-worker restore queue；
- worker state persistence queue；
- Storage Authority singleton；
- Authoritative Publication instance。

均有进程/页面级生命周期与单一职责。

结论：保留。

## 优先级

1. **P1：Typed Application Feedback Channel**  
   删除最后一条Store → Manager全局DOM反馈总线，收益明确、范围局部。
2. **P2：large mutation/publication/drop modules**  
   继续观察真实变更局部性，不按行数拆分。
3. **P2：Manager/service-worker adapters**  
   只有新feature再次形成可命名workflow owner时再提取。

## 下一步

设计并实现 Typed Application Feedback Channel；完成后再次运行全仓分析。
若新基线没有新的P1 ownership / direction / lifecycle问题，则进入最终
prompt-to-artifact completion audit，而不是继续做预防式重构。
