# Authoritative Publication 深化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 optimistic queue、authoritative reconciliation、retry/isolation、waiter 与 hydration 生命周期从 Zustand store 提取为一个可独立实例化和测试的 publication owner。

**Architecture:** `createAuthoritativePublication(dependencies)` 独占 publication 状态机，通过 projection ports 读写 Zustand，通过 transport ports 访问 Storage Authority 和 worker RPC。`useTabBoardStore.ts` 保留领域 action facade、import/export、restore target 和 AppEvents 映射，不再拥有基础设施队列与生命周期变量。

**Tech Stack:** TypeScript, Zustand 4, Chrome Manifest V3 runtime/storage APIs, Vitest, happy-dom.

## Global Constraints

- 保持所有现有产品行为、mutation schema 和 worker 原子事务不变。
- publication 模块不得依赖 Zustand、React、DOM event utilities 或 `globalThis.chrome`。
- retry 延迟保持 `[250, 1_000, 4_000]` 毫秒。
- 普通 mutation 保持 fire-and-forget；drop/category 返回 authoritative persistence Promise；restore 同步错误不抛回 UI。
- 成功事件只能在 worker 确认 mutation 已提交后发出。
- `releaseHydration()` 不 teardown Storage Authority backend。
- 不修改 Session move / DnD domain ownership。
- 不引入 runtime dependency。
- 每个生产行为改动必须先有 focused failing test。
- 每个 commit message 末尾必须是 `Co-authored-by: TRAE CLI <noreply@bytedance.com>`。

---

### Task 1: 建立 publication interface 与 optimistic commit seam

**Files:**
- Create: `src/shared/store/authoritativePublication.ts`
- Create: `src/shared/store/authoritativePublication.test.ts`

**Interfaces:**
- Produces: `PublicationProjection`, `AuthoritativePublicationDependencies`, `AuthoritativePublication`, `CategoryStateMutation`, `createAuthoritativePublication()`.
- `commit(mutation)` 同步发布 optimistic state 并在 100ms 后通过 `sendMutations()` 发送。
- `commitRestore()` 捕获同步 optimistic failure。
- `commitDrop()` 和 `commitCategory()` 返回 `Promise<void>`。

- [x] **Step 1: 写最小 failing interface test**

  在 `authoritativePublication.test.ts` 使用内存 projection fake，导入尚不存在的 `createAuthoritativePublication()`，验证：

  ```ts
  publication.commit({
    type: 'update-settings',
    updates: { theme: 'dark' },
    updatedAt: timestamp,
  });
  expect(projection.state.settings.theme).toBe('dark');
  expect(sendMutations).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(100);
  expect(sentBatches).toEqual([['update-settings']]);
  ```

  该测试捕获“publication 只转发、不拥有 optimistic projection 或 debounce queue”的错误实现。

- [x] **Step 2: 运行 RED**

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: FAIL because `./authoritativePublication` does not exist.

- [x] **Step 3: 实现最小 interface、ports 与 ordinary commit**

  创建：

  ```ts
  export type CategoryStateMutation = Extract<
    StateMutation,
    { type: 'add-folder' | 'rename-folder' | 'delete-folder' | 'set-category-order' }
  >;

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
  ```

  最小实现拥有 pending queue、100ms save timer、serialized send queue，并通过 `readProjection()` / `publishProjection()` 进行 optimistic apply。

- [x] **Step 4: 运行 GREEN 并增加 structural-sharing assertion**

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: PASS；未变化 workspace/group 引用保持相同。

- [x] **Step 5: 运行 focused direct regressions**

  新模块尚未拥有完整 retry/isolation/hydration 语义，因此本任务不切换 production store，避免短暂双 owner 或行为退化。

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: PASS.

- [x] **Step 6: Commit**

  ```bash
  git add src/shared/store/authoritativePublication.ts \
    src/shared/store/authoritativePublication.test.ts
  git commit -m "refactor(store): establish publication owner"
  ```

### Task 2: 迁移 authoritative reconciliation 与 remote buffering

**Files:**
- Modify: `src/shared/store/authoritativePublication.ts`
- Modify: `src/shared/store/authoritativePublication.test.ts`

**Interfaces:**
- Publication internally owns `pendingMutations`, `inFlightMutations`, `pendingRemoteState`, and `lastAuthoritativeState`.
- `acceptAuthoritativeState(authoritative, committedMutations)` chooses newest remote state, replays committed ordinary mutations when required, seeds committed drop ledger, reapplies pending mutations, and publishes structural sharing.
- `subscribeAuthoritativeState()` callbacks are buffered whenever publication has pending or in-flight mutations.

- [x] **Step 1: 写 concurrent remote RED tests**

  增加 direct tests：

  1. in-flight RPC 期间收到更高 revision remote state，RPC 返回后保留 remote entity 和 local committed change；
  2. committed drop ledger 已被新 remote ledger eviction 时不重复执行 drop；
  3. invalid pending ordinary mutation 在 reconciliation 时移除并通过 error callback 暴露；
  4. unaffected entities 保持引用。

  测试必须直接调用真实 publication 和真实 `applyStateMutations()`，transport 只 fake 延迟与返回值。

- [x] **Step 2: 运行 RED**

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: FAIL because the minimal module overwrites or drops concurrent remote state.

- [x] **Step 3: 迁移 pure reconciliation helpers**

  从 store 移入并改为 instance-owned：

  - committed drop ledger seed；
  - volatile-metadata fingerprint；
  - committed mutation replay；
  - revision/timestamp newest-state selection；
  - pending mutation reconciliation；
  - pending drop revision rebase。

  `publishProjection()` 前使用 `structurallyShareState()`；不得调用 Zustand。

- [x] **Step 4: 迁移 batch queue 与 success callback**

  `sendPendingBatch()` 在成功时：

  ```ts
  const authoritative = await dependencies.sendMutations(batch);
  reconcileAuthoritativeState(authoritative, batch);
  batch.forEach(dependencies.onMutationCommitted);
  ```

  只有确认提交的 indexes 才触发 callback。

- [x] **Step 5: 运行 direct GREEN**

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: PASS.

- [x] **Step 6: Commit**

  Commit:

  ```bash
  git add src/shared/store/authoritativePublication.ts \
    src/shared/store/authoritativePublication.test.ts
  git commit -m "refactor(store): own authoritative reconciliation"
  ```

### Task 3: 迁移 waiter、retry 与 terminal isolation

**Files:**
- Modify: `src/shared/store/authoritativePublication.ts`
- Modify: `src/shared/store/authoritativePublication.test.ts`

**Interfaces:**
- `commitDrop()` waiter identity uses `operationId`; category/ordinary identity uses object identity.
- Retry sequence is exactly 250ms, 1000ms, 4000ms after the initial attempt.
- `onPersistenceError(error, notify)` receives publication-owned notification policy.

- [x] **Step 1: 写 waiter/retry RED tests**

  Direct tests cover:

  ```ts
  const pending = publication.commitDrop(dropMutation);
  await vi.advanceTimersByTimeAsync(100);
  rejectRpc(new Error('temporary'));
  await vi.advanceTimersByTimeAsync(249);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toBeUndefined();
  ```

  另加：

  - retry exhaustion after four total sends rejects drop and rolls back；
  - category validation immediately rejects without retry；
  - restore collision removes restore but retries ordinary sibling；
  - invalid drop indexes settle only matching waiter；
  - terminal ordinary mixed batch is isolated one mutation at a time；
  - mutation queued during isolation remains queued；
  - successful category sibling resolves while terminal sibling rejects；
  - unowned final ordinary failure uses `notify: true`，owned final drop uses `notify: false`。

- [x] **Step 2: 运行 RED**

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: FAIL on pending/retry/isolation assertions.

- [x] **Step 3: 迁移 waiters 与 error classification**

  移入：

  - waiter take/settle/reject；
  - category/drop/restore error detection；
  - invalid/committed index extraction；
  - committed state extraction；
  - retained index mapping。

  waiter 在 retry queue 中不得提前 settle。

- [x] **Step 4: 迁移 bounded retry 与 recovery**

  publication owns：

  - retry attempt；
  - retry timer；
  - suppress-next-retry schedule flag；
  - authoritative recovery via `readAuthoritativeState()` then `lastAuthoritativeState`；
  - retry budget reset rules。

- [x] **Step 5: 迁移 terminal ordinary isolation**

  将 mixed terminal batch 拆为逐项发送。每次 isolate attempt 后重新捕获 isolation 期间新排队的 mutation；成功项触发 commit callback，失败项映射到各自 waiter。

- [x] **Step 6: 运行 direct GREEN**

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: PASS.

- [x] **Step 7: Commit**

  Commit:

  ```bash
  git add src/shared/store/authoritativePublication.ts \
    src/shared/store/authoritativePublication.test.ts
  git commit -m "refactor(store): isolate publication failures"
  ```

### Task 4: 迁移 hydration、release、context replacement 与 dispose

**Files:**
- Modify: `src/shared/store/authoritativePublication.ts`
- Modify: `src/shared/store/authoritativePublication.test.ts`

**Interfaces:**
- `hydrate()` shares one Promise per generation.
- `releaseHydration()` invalidates stale async continuations but preserves pending publication work and backend authority.
- `dispose()` rejects waiters, clears timers/queues, unsubscribes, and permanently invalidates old continuations.
- `currentContext()` replacement resets old publication work before accepting a new commit.

- [x] **Step 1: 写 lifecycle RED tests**

  Direct tests prove：

  - repeated hydrate returns the same Promise and one subscription；
  - publication arriving during initial read wins only when newer；
  - release before ensure resolves prevents listener attachment；
  - stale listener callback after release is ignored；
  - failed hydrate reports `notify: false` and allows retry；
  - context replacement rejects old drop/category waiter and sends only new-context mutation；
  - dispose clears save/retry timers and rejects waiters。

- [x] **Step 2: 运行 RED**

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: FAIL because lifecycle is not yet instance-owned.

- [x] **Step 3: 实现 hydration state machine**

  将 hydration generation、Promise、subscription、initial buffered state 移入 publication。所有 await 和 callback 后检查 generation/disposed token。

- [x] **Step 4: 实现 context replacement 与 dispose**

  `syncContext()` 在每次 commit 前调用。replacement/dispose 共用内部 reset primitive，但只有 dispose 设置永久 disposed flag。

- [x] **Step 5: 运行 lifecycle GREEN**

  Run: `npx vitest run src/shared/store/authoritativePublication.test.ts`

  Expected: PASS.

- [x] **Step 6: Commit**

  Commit:

  ```bash
  git add src/shared/store/authoritativePublication.ts \
    src/shared/store/authoritativePublication.test.ts
  git commit -m "refactor(store): move hydration into publication"
  ```

### Task 5: 一次性切换 Zustand adapter

**Files:**
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/shared/store/useTabBoardStore.test.ts`
- Modify: `src/shared/hooks/useStoreHydration.test.ts`

**Interfaces:**
- Production store creates exactly one `AuthoritativePublication` instance.
- Store action methods call publication `commit*()` variants.
- Store hydration methods call publication `hydrate()` / `releaseHydration()`.
- AppEvents and `persistenceError` remain adapter concerns.

- [x] **Step 1: 写 production wiring RED test**

  增加 store integration assertion：ordinary、drop、category、restore 和 hydration 均经同一个 publication owner 保持原有对外行为；测试通过真实 store API 和 Chrome boundary 观察，不暴露 publication internals。

- [x] **Step 2: 运行 RED**

  临时将新 integration test 对准尚未接线的 direct publication-specific行为（例如 context replacement waiter rejection），确认旧 store fails for the intended ownership reason。

  Run: `npx vitest run src/shared/store/useTabBoardStore.test.ts -t "publication owner"`

- [x] **Step 3: 创建 singleton ports**

  在 store 中映射：

  ```ts
  readProjection: () => {
    const state = useTabBoardStore.getState();
    return {
      state: persistedSnapshot(state),
      hydrated: state.hydrated,
      persistenceError: state.persistenceError,
    };
  },
  publishProjection: (state, status = {}) => {
    const current = useTabBoardStore.getState();
    useTabBoardStore.setState({
      ...state,
      hydrated: status.hydrated ?? current.hydrated,
      persistenceError: status.persistenceError === undefined
        ? current.persistenceError
        : status.persistenceError,
    });
  },
  patchStatus: (status) => useTabBoardStore.setState(status),
  ```

  transport ports 使用现有 `ensureStateForHydration()`、`getActiveState()`、`subscribeActiveState()` 和 `sendStateMutations()`。

- [x] **Step 4: 切换所有 commit 与 hydration methods**

  Store methods变为 publication method calls。`onFallback()` 仍由 UI adapter 映射到 `persistenceError`；publication 不订阅 fallback UI event。

- [x] **Step 5: 删除全部旧 publication ownership**

  删除 store 中：

  - save/retry timers 和 retry budget；
  - pending/in-flight/remote/authoritative arrays/state；
  - waiter arrays；
  - persistence queue；
  - reconciliation/replay/rebase helpers；
  - error classification、isolation、send/schedule helpers；
  - hydration Promise/generation/subscription；
  - batch success emitter loops。

  保留领域 facade、snapshot、restore target、AppEvents payload mapping 和 fallback UI mapping。

- [x] **Step 6: 运行 integration GREEN**

  Run:

  ```bash
  npx vitest run src/shared/store/authoritativePublication.test.ts
  npx vitest run src/shared/store/useTabBoardStore.test.ts
  npx vitest run src/shared/hooks/useStoreHydration.test.ts
  ```

  Expected: PASS.

- [x] **Step 7: Commit**

  ```bash
  git add src/shared/store/useTabBoardStore.ts \
    src/shared/store/useTabBoardStore.test.ts \
    src/shared/hooks/useStoreHydration.test.ts
  git commit -m "refactor(store): delegate publication lifecycle"
  ```

### Task 6: 收紧架构边界、文档与完整验证

**Files:**
- Modify: `scripts/check-import-cycles.mjs`
- Modify: `scripts/check-import-cycles.test.mjs`
- Modify: `package.json`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `docs/superpowers/specs/2026-07-26-authoritative-publication-design.md`
- Modify: `docs/superpowers/plans/2026-07-26-authoritative-publication.md`
- Modify as review requires: publication/store files and tests.

**Interfaces:**
- Static gate proves publication does not join UI/Zustand/Chrome-global ownership.
- Plan/spec status and verification record reflect the actual artifact.

- [x] **Step 1: 写 failing architecture gate test**

  扩展 cycle/check CLI，使其可拒绝一个 module 导入指定 forbidden prefixes，测试 fixture 验证违规时 exit non-zero。

  Production gate forbids `authoritativePublication.ts` importing：

  - `zustand`；
  - `react`；
  - `src/manager/components`；
  - `src/shared/utils/events`；
  - `chromeStorage` 或 `activeAdapter` concrete modules。

- [x] **Step 2: 运行 RED**

  Run: `node --test scripts/check-import-cycles.test.mjs`

  Expected: FAIL before forbidden-import support exists.

- [x] **Step 3: 实现 gate 并接入 `npm run check`**

  添加精确 CLI option 和 package script；不使用源文本 change-detector，实际解析 import graph 并针对 resolved module edges 判定。

- [x] **Step 4: 更新架构文档**

  记录：

  - Storage Authority 与 Authoritative Publication 的不同 ownership；
  - worker-side persistence transaction 与 manager-side publication state machine；
  - Zustand 仅作为 UI projection/domain facade；
  - optimistic → RPC → remote buffer → reconciliation 数据流；
  - error/waiter/hydration lifecycle。

- [x] **Step 5: Review full diff**

  检查：

  - `useTabBoardStore.ts` 不再有 publication queue/timer/waiter/hydration globals；
  - direct publication tests覆盖关键时序，不只是把旧 store tests 原样复制；
  - public interface 没有泄漏内部 arrays/timers；
  - success/error callbacks 没有重复发 event；
  - release 与 dispose 语义没有混淆；
  - no unrelated product behavior changes。

- [x] **Step 6: 运行 fresh full verification**

  Run:

  ```bash
  npm run build
  npm run check
  npm test
  git diff --check
  ```

  Expected: all exit 0；记录 test files/tests count。

- [x] **Step 7: 更新状态并 Commit**

  将 spec 标记为 `Implemented and verified`，勾选本计划所有步骤，写入实际 verification record。

  ```bash
  git add scripts/check-import-cycles.mjs scripts/check-import-cycles.test.mjs \
    package.json docs src/shared/store
  git commit -m "docs(store): record authoritative publication boundary"
  ```

## Completion Audit

本轮结束前逐项确认：

- [x] 新 production module 存在且由 Zustand store 实际使用。
- [x] publication queue、retry、waiter、remote buffer、hydration 的 ownership 已全部迁出 store。
- [x] ordinary/drop/category/restore 四种 commit 语义均有 direct module tests。
- [x] concurrent remote、terminal isolation、retry exhaustion、context replacement、release/dispose 均有 direct tests。
- [x] AppEvents payload 与触发时机保持集成测试覆盖。
- [x] static architecture gate 在 `npm run check` 中实际执行。
- [x] 文档描述与当前 import graph、runtime data flow 一致。
- [x] full build/check/test 与 diff check 均使用本轮 fresh output。

## Verification Record

- `npm run build`: PASS，TypeScript + Vite production build，6979 modules。
- `npm run check`: PASS，extension sanity、4 个 import-graph CLI tests、112 source files 的 cycle/forbidden-edge gate。
- `npm test`: PASS，44 test files，831 tests。
- `git diff --check`: PASS。
- `useTabBoardStore.ts`: 1227 行降至 534 行；publication queue/timer/waiter/reconciliation/hydration globals 均已移除。
