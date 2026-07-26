# Typed Application Feedback Channel 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用typed page-local channel替换Store → Manager的window CustomEvent反馈总线，同时保持authoritative commit/error timing和现有toast文案。

**Architecture:** `shared/applicationFeedback.ts`只拥有typed synchronous fanout；`shared/store/stateMutationFeedback.ts`纯映射committed mutation到feedback；Zustand facade只在publication outcome ports触发publish；Manager hook只把typed union映射为toast presentation。

**Tech Stack:** TypeScript, React 18, Zustand 4, Vitest, happy-dom, Node test runner.

## Global Constraints

- Feedback是page-local、non-replay、synchronous event stream，不进入TabBoard state。
- 不建立BroadcastChannel、Chrome storage transport或跨page feedback同步。
- Save/import/restore只在authoritative commit后publish。
- Partial commit只publishcommitted mutations。
- Transient retry和`notify: false` error不得publish。
- Subscriber异常不得影响persistence outcome或阻止其它subscribers。
- 保持现有toast copy、title和3秒lifecycle。
- 不修改Storage Authority fallback channel。
- 不修改publication retry/partial commit/waiter/reconciliation算法。
- 不新增runtime dependency。
- 每个production behavior先有failing test。
- 每个commit末尾必须恰好一次`Co-authored-by: TRAE CLI <noreply@bytedance.com>`。

---

### Task 1: 建立 typed ApplicationFeedback channel

**Files:**
- Create: `src/shared/applicationFeedback.ts`
- Create: `src/shared/applicationFeedback.test.ts`

**Interfaces:**
- Produces `ApplicationFeedback`, `ApplicationFeedbackChannel`,
  `createApplicationFeedbackChannel()`, `applicationFeedbackChannel`.
- Owner不得import React、Zustand、shared store或读取DOM/Chrome globals。

- [ ] **Step 1: 写direct RED**

  用literal feedback fixtures验证：

  ```ts
  const first = createApplicationFeedbackChannel();
  const received: ApplicationFeedback[] = [];
  const unsubscribe = first.subscribe((feedback) => received.push(feedback));
  first.publish({ kind: 'save-succeeded', title: 'Work', tabCount: 2 });
  unsubscribe();
  first.publish({ kind: 'operation-failed', source: 'persistence', message: 'late' });
  expect(received).toEqual([
    { kind: 'save-succeeded', title: 'Work', tabCount: 2 },
  ]);
  ```

  另覆盖：

  - listener在publish中unsubscribe；
  - throwing listener之后的listener仍收到，publish不抛；
  - two instances隔离；
  - late subscriber不replay。

- [ ] **Step 2: 运行RED**

  Run:

  ```bash
  npx vitest run src/shared/applicationFeedback.test.ts
  ```

  Expected: FAIL because module does not exist.

- [ ] **Step 3: 实现最小channel**

  Closure-backed `Set`，`publish()`遍历`[...listeners]`并对每个listener单独
  `try/catch`。不保存history/last value。

- [ ] **Step 4: 运行GREEN**

  Run:

  ```bash
  npx vitest run src/shared/applicationFeedback.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/shared/applicationFeedback.ts src/shared/applicationFeedback.test.ts
  git commit -m "refactor(feedback): own typed application channel" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 2: 建立mutation mapper并迁移store authoritative feedback

**Files:**
- Create: `src/shared/store/stateMutationFeedback.ts`
- Create: `src/shared/store/stateMutationFeedback.test.ts`
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/shared/store/useTabBoardStore.test.ts`
- Modify: `src/manager/core/import.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export function feedbackForCommittedMutation(
    mutation: StateMutation,
  ): ApplicationFeedback | null;
  ```

- Store imports singleton and mapper; publication仍拥有commit/error timing。

- [ ] **Step 1: 写mapper RED**

  Direct tests用完整StateMutation literals覆盖：

  - add-group → save；
  - import-groups → import counts；
  - restore-group → group restore；
  - restore-tab → tab restore；
  - update-settings → null。

- [ ] **Step 2: 运行mapper RED**

  Run:

  ```bash
  npx vitest run src/shared/store/stateMutationFeedback.test.ts
  ```

  Expected: FAIL because mapper does not exist.

- [ ] **Step 3: 实现pure mapper**

  使用exhaustive switch的相关branches；default返回null。不得调用channel。

- [ ] **Step 4: 迁移store timing tests为typed RED**

  先修改以下既有tests，让它们从同一module graph的
  `applicationFeedbackChannel`收集typed payload，而不是spy
  `window.dispatchEvent`：

  - success then reconciliation error order；
  - save after deferred authoritative resolve；
  - partial committed save；
  - import failure/success；
  - restore success/collision/failure/no-target。

  对dynamic `await import('./useTabBoardStore')` cases同时dynamic import：

  ```ts
  const [{ useTabBoardStore }, { applicationFeedbackChannel }] =
    await Promise.all([
      import('./useTabBoardStore'),
      import('../applicationFeedback'),
    ]);
  ```

  Tests预期FAIL，直到store改用channel。

- [ ] **Step 5: 迁移store producer**

  `useTabBoardStore.ts`：

  - 删除`emitEvent`/`AppEvents` import；
  - `reportError()`在notify时publish`operation-failed`；
  - 删除`emitRestoreSuccesses()`/`emitMutationSuccesses()`；
  - `onMutationCommitted`调用mapper并publish非null result。

  不改publication代码。

- [ ] **Step 6: 迁移import observable error test**

  `manager/core/import.test.ts`从typed channel订阅，断言：

  ```ts
  {
    kind: 'operation-failed',
    source: 'import',
    message: 'Workspace not found.',
  }
  ```

- [ ] **Step 7: 运行GREEN**

  Run:

  ```bash
  npx vitest run src/shared/store/stateMutationFeedback.test.ts
  npx vitest run src/shared/store/useTabBoardStore.test.ts
  npx vitest run src/manager/core/import.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS，74 store tests仍守护timing。

- [ ] **Step 8: Commit**

  ```bash
  git add src/shared/store/stateMutationFeedback.ts \
    src/shared/store/stateMutationFeedback.test.ts \
    src/shared/store/useTabBoardStore.ts \
    src/shared/store/useTabBoardStore.test.ts \
    src/manager/core/import.test.ts
  git commit -m "refactor(feedback): publish typed store outcomes" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 3: 迁移Manager toast consumer并删除旧总线

**Files:**
- Modify: `src/manager/components/shell/useToastNotifications.ts`
- Create: `src/manager/components/shell/useToastNotifications.test.ts`
- Delete: `src/shared/utils/events.ts`
- Modify any remaining source/tests from:

  ```bash
  rg -n "AppEvents|emitEvent|onEvent|tabboard:(save|import|restore|error)" src
  ```

**Interfaces:**
- Produces `FeedbackPresenter`, `presentApplicationFeedback()`,
  `useToastNotifications()`.
- Hook subscribes once per stable presenter and unsubscribes on unmount.

- [ ] **Step 1: 写presentation RED**

  Direct tests对五类presentation断言exact existing copy：

  ```ts
  presentApplicationFeedback(
    { kind: 'save-succeeded', title: 'Work', tabCount: 2 },
    presenter,
  );
  expect(showSuccess).toHaveBeenCalledWith('2 tabs saved', 'Work');
  ```

  覆盖import、group restore、tab restore、error。

- [ ] **Step 2: 写hook lifecycle RED**

  happy-dom挂载probe调用hook；publish后toast presenter收到，unmount后publish不再收到。
  使用真实channel，mock `useToast()`仅作为UI port。

- [ ] **Step 3: 运行RED**

  Run:

  ```bash
  npx vitest run src/manager/components/shell/useToastNotifications.test.ts
  ```

  Expected: FAIL because typed presentation is not implemented.

- [ ] **Step 4: 实现typed consumer**

  单一`subscribe`，switch exhaustive presentation。通过`useMemo`创建稳定presenter。
  删除`onEvent`/`AppEvents`。

- [ ] **Step 5: 删除events.ts与残余契约**

  删除`src/shared/utils/events.ts`，更新任何source contract tests。确认：

  ```bash
  rg -n "AppEvents|emitEvent|onEvent|tabboard:(save|import|restore|error)" src
  ```

  无命中。

- [ ] **Step 6: 运行GREEN**

  Run:

  ```bash
  npx vitest run src/manager/components/shell/useToastNotifications.test.ts
  npx vitest run src/manager/components/shell/ManagerLayout.test.ts
  npx vitest run src/manager/ManagerApp.dom.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add src/manager/components/shell/useToastNotifications.ts \
    src/manager/components/shell/useToastNotifications.test.ts \
    src/shared/utils/events.ts
  git add -u src
  git commit -m "refactor(feedback): consume typed toast outcomes" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

### Task 4: 固化架构门禁、文档与全量验证

**Files:**
- Modify: `scripts/check-search-architecture.mjs`
- Modify: `scripts/check-search-architecture.test.mjs`
- Modify: `package.json`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify ignored planning evidence.

**Interfaces:**
- Architecture checker继续支持`--root` fixtures。
- Graph checker显式禁止feedback owner依赖React/Zustand/shared store/Manager。

- [ ] **Step 1: 写static gate RED**

  扩展Node fixtures：

  - production source出现旧event name → fail；
  - `applicationFeedback.ts` import React/Zustand/shared store或读取window/document/chrome → fail；
  - `useToastNotifications.ts`使用window listener或`as { ... }` payload assertion → fail；
  - fixture含`src/shared/utils/events.ts` → fail；
  - test files中的legacy strings不触发。

- [ ] **Step 2: 运行RED**

  Run:

  ```bash
  node --test scripts/check-search-architecture.test.mjs
  ```

  Expected: new fixtures FAIL.

- [ ] **Step 3: 实现checker并接入graph gate**

  更新checker rules；在`check:cycles`增加：

  ```text
  --deny-imports src/shared/applicationFeedback.ts,react,zustand,src/shared/store,src/manager
  ```

- [ ] **Step 4: 更新docs**

  - architecture：typed owner、authoritative timing、subscriber isolation、page-local/non-replay；
  - evolution：删除最后一条Store → Manager window event seam；
  - decision D045：为什么不用callbacks或Zustand queue。

- [ ] **Step 5: 运行focused suite**

  Run:

  ```bash
  npx vitest run \
    src/shared/applicationFeedback.test.ts \
    src/shared/store/stateMutationFeedback.test.ts \
    src/shared/store/useTabBoardStore.test.ts \
    src/manager/core/import.test.ts \
    src/manager/components/shell/useToastNotifications.test.ts \
    src/manager/components/shell/ManagerLayout.test.ts \
    src/manager/ManagerApp.dom.test.ts
  ```

- [ ] **Step 6: 运行fresh full verification**

  依次运行：

  ```bash
  npm run build
  npm run check
  npm test
  git diff --check
  rg -n "AppEvents|emitEvent|onEvent|tabboard:(save|import|restore|error)" src
  rg -n "from .*manager" src/shared src/background
  ```

  Expected全部PASS/零命中。

- [ ] **Step 7: 更新planning evidence与commit docs/gates**

  记录实际module/test counts和命令输出。提交：

  ```bash
  git add scripts/check-search-architecture.mjs \
    scripts/check-search-architecture.test.mjs \
    package.json \
    docs/technical-architecture.md \
    docs/feature-evolution.md \
    docs/product-decisions.md \
    docs/superpowers/plans/2026-07-26-typed-application-feedback.md
  git commit -m "docs(feedback): record typed outcome ownership" \
    -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
  ```

- [ ] **Step 8: 检查commit stack**

  Run:

  ```bash
  git status --short
  git log -6 --format='%h %s%n%b'
  ```

  Expected tracked tree clean，每个commit trailer恰好一次。

## Plan Self-Review

- Spec coverage：typed owner、subscriber isolation、mutation mapping、authoritative timing、
  toast presentation、old bus deletion、static gates和docs分别由Tasks 1–4覆盖。
- Type consistency：`ApplicationFeedback`、`ApplicationFeedbackChannel`、
  `feedbackForCommittedMutation`、`presentApplicationFeedback`命名一致。
- Test seam：channel和mapper可直接测试；store tests守timing；presentation tests守copy。
- Scope：不改publication算法、fallback、local component toasts或跨page transport。
- Placeholder scan：无TBD/TODO/未定义“类似处理”步骤。
