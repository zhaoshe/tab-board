# Authoritative Publication 深化设计

**日期：** 2026-07-26  
**状态：** 已批准，待实施  
**范围：** 将 optimistic mutation、权威状态发布、重试与错误隔离、等待器和 hydration 生命周期从 Zustand store 中提取为独立 publication owner。

## 背景与问题

`src/shared/store/useTabBoardStore.ts` 同时承担了两类职责：

1. **领域 facade**
   - 把 `addWorkspace()`、`moveTab()`、`restoreFromBin()` 等 UI 命令转换为 `StateMutation`；
   - 读取当前投影，生成 ID、时间戳和 Bin 元数据；
   - 对 import/export 和 restore 目标执行领域级准备。
2. **authoritative publication**
   - 应用 optimistic mutation；
   - 聚合、串行发送和重试 mutation batch；
   - 处理 drop/category 的持久化等待器；
   - 隔离 terminal ordinary mutation；
   - 合并 worker 返回值与并发 storage publication；
   - 在 hydration/release 之间管理订阅和 generation；
   - 发布持久化成功与错误反馈。

这两类职责共享同一个 1200 行文件和一组 module-level 可变变量。结果是：

- Zustand 成为 persistence protocol、并发状态机和领域命令的共同 owner；
- publication 无法脱离 React/Zustand 单独实例化和测试；
- queue、retry、waiter、remote buffer 与 hydration generation 之间的约束只能通过隐式变量关系理解；
- category/drop 的等待语义和普通 mutation 的 fire-and-forget 语义散落在四个 commit helper 中；
- context 切换、cleanup 和 terminal isolation 都可能影响未完成 waiter，但没有统一生命周期接口；
- store 测试需要通过完整 Zustand singleton 与全局 Chrome mock 才能验证 publication 行为。

## 目标

建立一个不依赖 Zustand、React、DOM 或具体 Chrome 全局对象的 authoritative publication 模块，使它成为以下状态和时序的唯一 owner：

- optimistic mutation queue；
- in-flight batch；
- buffered remote state；
- last authoritative state；
- serialized publication queue；
- bounded retry budget 与 retry timer；
- drop/category persistence waiters；
- hydration promise、subscription 和 generation；
- context replacement cleanup。

Zustand store 只保留：

- 当前 `TabBoardState`、`hydrated` 和 `persistenceError` 的 UI 投影；
- 领域 action 到 `StateMutation` 的转换；
- import/export、restore target 等领域准备；
- 对 publication ports 的薄适配。

## 方案比较

### 方案 A：只提取纯 reconciliation helpers

把 newest-state 选择、mutation replay、drop revision rebase 等函数移动到独立文件，但保留 queue、retry、waiter 和 hydration 在 Zustand store。

**优点：**

- 改动小；
- 纯函数更容易测试。

**缺点：**

- 真正复杂的状态机仍由 Zustand 文件拥有；
- module-level queues 和 lifecycle 继续与 UI store 耦合；
- 只能降低文件长度，不能建立新的架构 seam。

### 方案 B：新建第二个 Zustand persistence store

用另一个 Zustand store 保存 publication queue、retry 和 hydration 状态。

**优点：**

- 可观察内部状态；
- React 开发工具可能更容易调试。

**缺点：**

- publication 内部状态并不是 UI state；
- 引入两个 store 间的同步和订阅顺序问题；
- 仍然把基础设施状态机绑定到 Zustand；
- 增加 API 面和运行时复杂度。

### 方案 C：注入式 authoritative publication owner

使用 `createAuthoritativePublication(dependencies)` 创建普通 TypeScript 对象。对象内部独占可变状态，通过窄 ports 读取/发布 Zustand 投影，并通过 transport ports 访问 Storage Authority 和 worker RPC。

**优点：**

- 一个实例拥有完整 publication 状态机；
- 可用内存 fake 直接测试，不依赖 Zustand 或 Chrome global；
- Zustand 只承担 facade 和 projection；
- 后续 transport、retry policy 或 UI store 替换不改变领域 actions；
- 生命周期可通过 `hydrate()`、`releaseHydration()`、`dispose()` 显式管理。

**缺点：**

- 需要一次性迁移较多经过验证的时序逻辑；
- ports 必须足够完整，但不能泄漏内部 queue 细节。

**决定：采用方案 C。** 方案 A 只改善表面结构，方案 B 创建错误的状态所有权；方案 C 才能建立可独立理解、测试和替换的 publication seam。

## 模块边界

### `authoritativePublication.ts`

该模块拥有 publication 状态机，并导出：

```ts
export interface PublicationProjection {
  state: TabBoardState;
  hydrated: boolean;
  persistenceError: string | null;
}

export interface AuthoritativePublicationDependencies {
  readProjection(): PublicationProjection;
  publishProjection(
    state: TabBoardState,
    status?: Partial<Pick<PublicationProjection, 'hydrated' | 'persistenceError'>>,
  ): void;
  patchStatus(
    status: Partial<Pick<PublicationProjection, 'hydrated' | 'persistenceError'>>,
  ): void;
  ensureState(): Promise<TabBoardState>;
  readAuthoritativeState(): Promise<TabBoardState>;
  subscribeAuthoritativeState(callback: (state: TabBoardState) => void): () => void;
  sendMutations(mutations: readonly StateMutation[]): Promise<TabBoardState>;
  currentContext(): unknown;
  onPersistenceError(error: unknown, notify: boolean): void;
  onMutationCommitted(mutation: StateMutation): void;
}

export interface AuthoritativePublication {
  commit(mutation: StateMutation): void;
  commitRestore(
    mutation: Extract<StateMutation, { type: 'restore-group' | 'restore-tab' }>,
  ): void;
  commitDrop(mutation: Extract<StateMutation, { type: 'drop-intent' }>): Promise<void>;
  commitCategory(mutation: CategoryStateMutation): Promise<void>;
  hydrate(): Promise<void>;
  releaseHydration(): void;
  dispose(): void;
}

export function createAuthoritativePublication(
  dependencies: AuthoritativePublicationDependencies,
): AuthoritativePublication;
```

`currentContext()` 只用于识别测试、preview 或 extension context 已整体替换。模块不直接读取 `globalThis.chrome`，也不解释 context 内容。

`dispose()` 是最终生命周期边界：

- 释放 hydration subscription；
- 取消 save/retry timer；
- 拒绝全部 waiter；
- 清空 pending/in-flight/remote buffer；
- 使旧异步 continuation 失效。

正常 React cleanup 使用 `releaseHydration()`，它只断开该 UI projection 的 publication，不销毁 Storage Authority backend。测试 module reset 或未来显式 teardown 才使用 `dispose()`。

### `useTabBoardStore.ts`

该文件保留：

- `TabBoardStore` action interface；
- `persistedSnapshot()` 或等价纯 snapshot helper；
- restore 目标、Bin 元数据、import/export 等领域 facade；
- 一个 `createAuthoritativePublication()` 实例；
- ports 到 `useTabBoardStore.getState()` / `setState()` 的映射；
- success/error callback 到 `AppEvents` 和 `persistenceError` 的映射。

它不再拥有：

- save/retry timer；
- pending/in-flight mutation arrays；
- waiter arrays；
- persistence queue；
- remote buffer 和 last authoritative state；
- hydration promise/generation/subscription；
- batch isolation 和 retry classification。

## 数据流

### 普通 optimistic commit

1. 领域 action 构造 `StateMutation`。
2. `publication.commit(mutation)` 同步：
   - 检查 context；
   - 从 projection 读取纯 `TabBoardState`；
   - 通过 `applyStateMutation()` 计算 optimistic state；
   - 发布 structurally shared projection；
   - 把 mutation 加入 pending queue；
   - debounce 100ms 后发送 batch。
3. worker 返回 authoritative state。
4. publication 合并期间到达的 remote publication，重放需要保留的 committed mutation，再应用 pending mutation。
5. publication 发布 reconciled projection，触发 commit callback，并重置 retry budget。

### Drop commit

`commitDrop()` 在 optimistic apply 后创建与该 `operationId` 绑定的 waiter。Promise 只在以下情况 settle：

- mutation 被 worker 确认提交：resolve；
- mutation 被判定 invalid/terminal 且不再重试：reject；
- context replacement 或 dispose：reject；
- transient failure 且仍在 retry queue：保持 pending。

同步 optimistic validation 失败时，返回已处理 rejection，不发送 RPC，也不发通用 error event。

### Category commit

`commitCategory()` 不先进入 debounce queue，而是把 mutation 作为 additional batch 串行发送。这样保留现有调用方等待 authoritative validation 的语义。

当 transient failure 发生时 waiter 随 mutation 进入 retry queue；category validation failure 会立即 reject，不自动重试。

### Restore commit

`commitRestore()` 保留 fire-and-forget API。同步 optimistic collision 被 publication 捕获并报告，不抛回 UI action；成功事件只能在 authoritative commit 后触发。

### 并发 remote publication

- hydration 之前到达：暂存为 initial hydration candidate；
- hydrated 且没有 pending/in-flight：立即 structurally share 并发布；
- 有 pending/in-flight：存入单一 newest remote buffer；
- batch 完成：以 revision 优先、timestamp 次优选择 newest authoritative state；
- buffered state 比 RPC result 更新时，把已确认的 ordinary mutation安全重放到 buffered state；
- committed drop 通过 ledger seed 防止重复应用；
- 无法重放的 pending ordinary mutation被移除并拒绝对应 waiter；drop 保留给 worker 做最终验证。

## 错误与重试

重试延迟保持：

```ts
const PERSISTENCE_RETRY_DELAYS_MS = [250, 1_000, 4_000] as const;
```

错误分类保持现有语义：

- `CATEGORY_VALIDATION`：移除 category mutation，立即 reject category waiter；
- `INVALID_DROP_INTENT`：按返回 index 移除并 reject invalid drop；
- `RESTORE_ID_COLLISION`：移除 restore mutation，保留可重试 siblings；
- 其他带 code 的 terminal semantic error：对 mixed ordinary batch 做逐项隔离；
- transport/unknown error：在预算内重试；
- drop 耗尽预算：回滚到 recoverable authoritative state，reject waiter，不发重复通用错误；
- unowned ordinary mutation 最终失败：更新 `persistenceError` 并发通用错误事件。

`onPersistenceError(error, notify)` 是唯一错误 callback。publication 决定 `notify`，Zustand adapter 决定如何投影消息和发 UI event。

`onMutationCommitted(mutation)` 只对 worker 确认提交的 mutation 调用一次。Zustand adapter 根据 mutation type 映射：

- `add-group` → `tabboard:save-success`；
- `import-groups` → `tabboard:import-success`；
- `restore-group` / `restore-tab` → `tabboard:restore-success`。

## Hydration 生命周期

`hydrate()`：

- 同一 generation 内共享一个 in-flight Promise；
- 先调用 `ensureState()`，但允许其内部回退到直接 Storage Authority 读取；
- 在 initial read 之前订阅 publication，避免 read/subscribe gap；
- 在 initial read 期间只保留 newest buffered state；
- 成功后发布 `hydrated: true`、`persistenceError: null`；
- 失败后释放本 generation listener，发布 `hydrated: false`，允许下一次 retry。

`releaseHydration()`：

- generation 加一，使旧 continuation 和旧 listener callback 失效；
- 释放 publication subscription；
- 清除共享 hydration Promise；
- 只把 UI projection 设为 `hydrated: false`；
- 不清空 mutation queue，不 teardown Storage Authority。

context replacement：

- 在每次 commit 前比较 `currentContext()`；
- context 改变时取消 retry timer、清空 publication queue 和 remote caches；
- 拒绝旧 waiter；
- 不让旧 context 的 mutation进入新 context。

## 测试策略

### 独立 publication 单元测试

新建 `authoritativePublication.test.ts`，使用内存 projection 和 transport fakes，直接证明：

- 模块可以在没有 Zustand、DOM 和 Chrome global 的环境实例化；
- ordinary/drop/category/restore 四种 commit 语义；
- transient retry 的 waiter 保持 pending；
- terminal、invalid drop、category validation 和 restore collision 的隔离；
- mixed batch isolation 和 queued-during-isolation 保留；
- concurrent remote publication reconciliation；
- committed mutation replay 与 drop ledger 去重；
- hydration promise sharing、read/subscribe gap、release generation 和 retry；
- context replacement 与 dispose 拒绝 waiter；
- success callback 只在 authoritative commit 后触发；
- structural sharing 保留未变化实体引用。

### Store 集成测试

保留少量 `useTabBoardStore.test.ts` 集成覆盖：

- action 生成正确 mutation；
- Zustand projection port 正确读写；
- AppEvents payload 映射；
- import/export 和 restore target 领域逻辑；
- fallback error 映射；
- singleton publication 接线。

现有 publication 回归测试先保持行为等价；在新模块稳定后，按 ownership 移入直接测试，避免一次同时改变实现和全部 test harness。

### 架构约束

增加 source contract，防止：

- `authoritativePublication.ts` 导入 `zustand`、React、组件或 DOM event utilities；
- `useTabBoardStore.ts` 重新声明 publication queue/timer/waiter/hydration globals；
- publication module 直接读取 `globalThis.chrome`。

## 迁移顺序

1. 用 failing test 建立可实例化的 publication interface 和最小 optimistic commit。
2. 移入 pure reconciliation、pending/in-flight ownership 和 success callback。
3. 移入 waiter、retry、terminal isolation 与 error callback。
4. 移入 hydration/release/context lifecycle。
5. 把 Zustand actions 切换到 publication instance，删除旧 module-level 状态和 helpers。
6. 收紧 source contract，迁移高价值回归到 direct module tests。
7. 更新技术架构和演进文档，执行完整 build/check/test。

每一步保持 production behavior 不变，并在独立 commit 前运行对应 focused tests。

## 非目标

- 不改变 worker `statePersistence` 的原子 mutation 事务。
- 不改变 Storage Authority、file/browser backend 或 fallback policy。
- 不修改 `StateMutation` schema 和产品行为。
- 不在本轮统一 Session move / DnD domain ownership；该问题在下一轮单独处理。
- 不引入新的状态库、runtime dependency 或公开调试 API。
- 不把所有 store helper 机械拆成小文件；只移动由 publication 状态机真正拥有的职责。
