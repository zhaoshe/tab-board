# Session Domain Ownership 深化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 category、DropIntent、session move/drop execution/replay、restore/import 迁到 shared domain，令 Manager DnD 只拥有 interaction resolution，并消除所有 source import cycles。

**Architecture:** 先提取无领域依赖的 primitive validation，再建立 shared category 与 DropIntent contracts；drop validation、execution/replay 和 session operations 分别成为 shared owners。Manager `dnd.ts` 保留 geometry/target resolution，shared store/background 只依赖 shared domain，最终删除 production `manager/core/commands.ts` 并启用 strict zero-cycle gate。

**Tech Stack:** TypeScript, React 18, Zustand 4, Chrome Manifest V3 APIs, `@dnd-kit`, Vitest, Node test runner.

## Global Constraints

- 不改变 DnD geometry、target hysteresis、placeholder、DragOverlay 或 keyboard/pointer behavior。
- 不改变 DropIntent wire shape、mutation schema、operation ledger 或 retry policy。
- 不改变 category 产品语义或 sidebar/header UI。
- 不改变 import formats、restore placement 或 Bin behavior。
- 不重写成熟 drop algorithms；只迁移 owner并去除重复 category semantics。
- shared/background production modules不得导入 `src/manager/**`。
- `CategoryFilter`、`SavedTabRef`、`DropIntent` 必须由 shared model直接拥有。
- orphan folder IDs 继续按 Inbox 处理。
- 不引入 runtime dependency。
- 每个 production behavior 迁移先有 direct-owner failing test 或 import-contract RED。
- 每个 commit message 末尾必须是 `Co-authored-by: TRAE CLI <noreply@bytedance.com>`。

---

### Task 1: 提取 primitive validation 并切断 schema → store 依赖

**Files:**
- Create: `src/shared/validation.ts`
- Create: `src/shared/validation.test.ts`
- Modify: `src/shared/model/schema.ts`
- Modify: `src/shared/store/mutationValidation.ts`
- Modify: `src/shared/store/mutationValidation.test.ts`
- Modify callers of primitive validation imports as required by TypeScript.

**Interfaces:**
- Produces: `utf8ByteLength`, `isBoundedString`, `isEntityId`, `isOperationId`, `isTimestamp`, `isDenseArray`, `canonicalize`, `canonicalJson`, `isCanonicalDigestWithinLimit`, and existing byte-limit constants.
- `schema.ts` imports primitive validation only from `../validation`.
- `mutationValidation.ts` re-exports primitive symbols temporarily but no longer defines them.

- [x] **Step 1: 写 primitive owner RED**

  新建 `validation.test.ts`，直接导入尚不存在的 `./validation`，用 literals 验证：

  ```ts
  expect(isOperationId('drop.operation-1')).toBe(true);
  expect(isOperationId('')).toBe(false);
  expect(isTimestamp('2026-01-01T00:00:00.000Z')).toBe(true);
  expect(isDenseArray([1, 2])).toBe(true);
  const sparse: unknown[] = [];
  sparse[1] = 'value';
  expect(isDenseArray(sparse)).toBe(false);
  expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } }))
    .toBe('{"a":{"c":3,"d":4},"b":2}');
  ```

  该测试捕获 primitive validation 仍由 store-owned module提供的错误边界。

- [x] **Step 2: 运行 RED**

  Run: `npx vitest run src/shared/validation.test.ts`

  Expected: FAIL because `./validation` does not exist.

- [x] **Step 3: 迁移 primitive implementation**

  从 `mutationValidation.ts` 移出 constants/functions；保留 drop/mutation-specific validation。`schema.ts` 改为：

  ```ts
  import {
    isOperationId,
    isTimestamp,
    utf8ByteLength,
    MAX_CANONICAL_DIGEST_BYTES,
  } from '../validation';
  ```

  不新增 model/store dependency。

- [x] **Step 4: 运行 GREEN 与 validation regression**

  Run:

  ```bash
  npx vitest run src/shared/validation.test.ts
  npx vitest run src/shared/store/mutationValidation.test.ts
  npx vitest run src/shared/store/stateMutations.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [x] **Step 5: 加 architecture assertion**

  用 import graph CLI 对 `src/shared/model/schema.ts` 禁止 `src/shared/store` edge；实际 graph 应无该 edge。

- [x] **Step 6: Commit**

  ```bash
  git add src/shared/validation.ts src/shared/validation.test.ts \
    src/shared/model/schema.ts src/shared/store/mutationValidation.ts \
    src/shared/store/mutationValidation.test.ts
  git commit -m "refactor(domain): own primitive validation"
  ```

### Task 2: 建立 shared category 与 DropIntent contracts

**Files:**
- Create: `src/shared/model/categories.ts`
- Create: `src/shared/model/categories.test.ts`
- Create: `src/shared/model/drop-intent.ts`
- Create: `src/shared/model/drop-intent.test.ts`
- Modify: `src/shared/model/index.ts`
- Modify: `src/manager/core/selectors.ts`
- Modify: `src/manager/core/dnd.ts`
- Modify: `src/manager/core/capture.ts`
- Modify: category/DropIntent type imports throughout Manager/shared/background.

**Interfaces:**
- Produces: `CategoryFilter`, `categoryForGroup`, `categoryMatches`, `groupsForCategory`, `isOwnedCategory`, `isOwnedCategoryId`, `categoryOrder`, `reorderCategoryIds`, `moveSessionToCategory`, `insertGroupAtCategoryIndex`.
- Produces: `SavedTabRef`, `DropIntent`.
- `selectors.ts` re-exports `CategoryFilter` but does not own it.
- Manager-local type re-exports are allowed only for existing UI imports；`src/shared/**` 与 `src/background/**` 必须直接 import shared owner。
- `dnd.ts` imports shared types/helpers and retains `DragPayload`, `DropTarget`, geometry and `resolveDrop`.

- [x] **Step 1: 写 category owner RED**

  在 `categories.test.ts` direct import shared module，迁移并补齐 literals：

  ```ts
  expect(categoryForGroup(state, group('orphan', { folderId: 'missing' })))
    .toBe('inbox');
  expect(categoryMatches(state, group('orphan', { folderId: 'missing' }), 'inbox'))
    .toBe(true);
  expect(categoryMatches(state, group('saved', { starred: true }), 'saved'))
    .toBe(true);
  expect(isOwnedCategory(state, 'folder:folder-a', 'workspace-a')).toBe(true);
  expect(isOwnedCategory(state, 'folder:missing', 'workspace-a')).toBe(false);
  ```

  迁移现有 session move tests：custom folder、Saved/Archive/Inbox、empty category、workspace block、global order、invalid folder/index/group。

- [x] **Step 2: 写 DropIntent contract RED**

  `drop-intent.test.ts` 用 exhaustive `satisfies DropIntent[]` fixture定义五种 wire shapes；production change that breaks a field/name must fail TypeScript/Vitest import.

- [x] **Step 3: 运行 RED**

  Run:

  ```bash
  npx vitest run src/shared/model/categories.test.ts
  npx vitest run src/shared/model/drop-intent.test.ts
  ```

  Expected: FAIL because modules do not exist.

- [x] **Step 4: 实现 shared categories/contracts**

  从 `selectors.ts` / `dnd.ts` / `commands.ts` 迁移类型和成熟 category/session move functions。所有 category matching使用：

  ```ts
  export function categoryMatches(
    state: Pick<TabBoardState, 'folders'>,
    group: Group,
    category: CategoryFilter,
  ): boolean {
    return categoryForGroup(state, group) === category;
  }
  ```

- [x] **Step 5: 切换 Manager type/helper imports**

  `dnd.ts` 不再定义 `SavedTabRef` / `DropIntent`，可从 shared module re-export type供现有 UI imports平滑迁移；production shared/background不得通过该 re-export。

  `selectors.ts` 使用 shared category helpers，保留 query/strip projection。

- [x] **Step 6: 运行 GREEN**

  Run:

  ```bash
  npx vitest run src/shared/model/categories.test.ts src/shared/model/drop-intent.test.ts
  npx vitest run src/manager/core/selectors.test.ts src/manager/core/dnd.test.ts
  npx vitest run src/manager/core/capture.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [x] **Step 7: Commit**

  ```bash
  git add src/shared/model/categories.ts src/shared/model/categories.test.ts \
    src/shared/model/drop-intent.ts src/shared/model/drop-intent.test.ts \
    src/shared/model/index.ts src/manager/core
  git commit -m "refactor(domain): share session category contracts"
  ```

### Task 3: 下沉 DropIntent raw validation

**Files:**
- Create: `src/shared/model/drop-validation.ts`
- Create: `src/shared/model/drop-validation.test.ts`
- Modify: `src/shared/store/mutationValidation.ts`
- Modify: `src/shared/store/mutationValidation.test.ts`
- Modify: `src/manager/core/commands.ts` during compatibility stage.
- Modify callers of `isDropIntentShape`, `isDropPayloadWithinLimits`, `isOpenTabInfoShape`.

**Interfaces:**
- Produces: `isDropIntentShape`, `isOpenTabInfoShape`, `isDropPayloadWithinLimits`.
- Depends only on `shared/validation`, `model/drop-intent`, `model/types`, `shared/openTabs`.
- `mutationValidation.ts` owns mutation batch-specific limits and re-exports drop validators for compatibility only.
- 所有 production callers在 Task 6 gate 前迁到 direct owner；re-export 不得成为 shared dependency graph 中的长期路径。

- [x] **Step 1: 写 direct malformed/limit RED**

  在 `drop-validation.test.ts` 直接 import shared owner，覆盖：

  - five valid intent shapes；
  - extra key rejection；
  - sparse arrays；
  - duplicate/negative tab IDs；
  - empty refs；
  - invalid folder category；
  - oversized operation ID/digest/openTabs；
  - openTabs forbidden for non-open source；
  - complete OpenTabInfo shape。

- [x] **Step 2: 运行 RED**

  Run: `npx vitest run src/shared/model/drop-validation.test.ts`

  Expected: FAIL because module is absent.

- [x] **Step 3: 迁移 implementation 与 callers**

  从 `mutationValidation.ts` 移动 DropIntent/OpenTab-specific code。Store validation imports shared owner；Manager compatibility caller也直接 imports shared owner。

- [x] **Step 4: 运行 GREEN**

  Run:

  ```bash
  npx vitest run src/shared/model/drop-validation.test.ts
  npx vitest run src/shared/store/mutationValidation.test.ts
  npx vitest run src/shared/store/stateMutations.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [x] **Step 5: 验证 shared/store 不再导入 Manager DnD types**

  Run:

  ```bash
  node scripts/check-import-cycles.mjs \
    --deny-together src/shared/store/mutationValidation.ts,src/manager/core/dnd.ts
  ```

  Expected: no denied cycle for this pair.

- [x] **Step 6: Commit**

  ```bash
  git add src/shared/model/drop-validation.ts \
    src/shared/model/drop-validation.test.ts \
    src/shared/store/mutationValidation.ts \
    src/shared/store/mutationValidation.test.ts
  git commit -m "refactor(domain): share drop validation"
  ```

### Task 4: 迁移 drop execution/replay 到 shared domain

**Files:**
- Create: `src/shared/model/drop-operations.ts`
- Create: `src/shared/model/drop-operations.test.ts`
- Modify: `src/manager/core/commands.ts`
- Modify: `src/manager/core/commands.test.ts`
- Modify: `src/manager/core/dnd.test.ts`
- Modify: `src/manager/core/release.test.ts`
- Modify: `src/shared/store/stateMutations.ts`
- Modify: `src/shared/store/stateMutations.test.ts`
- Modify: `src/shared/store/useTabBoardStore.test.ts`
- Modify: `src/background/statePersistence.ts`
- Modify: `src/background/statePersistence.test.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/background/service-worker.test.ts`.

**Interfaces:**
- Produces: `dropOperationTabId`, `dropOperationGroupId`, `getDropOperationDigest`, `DropIntentReplayStatus`, `getDropIntentReplayStatus`, `isDropIntentAlreadyApplied`, `executeDropIntent`.
- Reuses shared categories and drop validation.
- `stateMutations.ts` and background modules import only shared owner.

- [x] **Step 1: 写 shared execution owner RED**

  在 `drop-operations.test.ts` 直接 import尚不存在 module，迁移 behavior fixtures：

  - move-session；
  - reorder-category；
  - move-tabs；
  - copy-open-tabs；
  - create-session from saved/open tabs；
  - inactive/cross-workspace forged intents return original state；
  - partial refs return original state；
  - operation ID stable IDs/byte bounds；
  - ledger replay/eviction/conflict/digest。

- [x] **Step 2: 运行 RED**

  Run: `npx vitest run src/shared/model/drop-operations.test.ts`

  Expected: FAIL because module is absent.

- [x] **Step 3: 迁移 mature algorithm**

  从 `manager/core/commands.ts` 移动 operation ID/replay/execution block（原 lines 27–925中 drop-owned functions），不改算法。所有 category calls改为 shared state-aware helpers。

- [x] **Step 4: 迁移 authoritative callers**

  `stateMutations.ts`、`background/statePersistence.ts`、`background/service-worker.ts` 与 tests直接 import shared owner；不得从 Manager compatibility module导入。

- [x] **Step 5: 收缩 Manager commands compatibility**

  在本任务结束时 `commands.ts` 只暂存 restore/import functions；drop functions删除，不 re-export。Manager DnD tests直接 import shared execution owner。

- [x] **Step 6: 运行 GREEN**

  Run:

  ```bash
  npx vitest run src/shared/model/drop-operations.test.ts
  npx vitest run src/manager/core/dnd.test.ts src/manager/core/release.test.ts
  npx vitest run src/shared/store/stateMutations.test.ts
  npx vitest run src/background/statePersistence.test.ts src/background/service-worker.test.ts
  npx vitest run src/shared/store/useTabBoardStore.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [x] **Step 7: Commit**

  ```bash
  git add src/shared/model/drop-operations.ts \
    src/shared/model/drop-operations.test.ts \
    src/manager/core src/shared/store src/background
  git commit -m "refactor(domain): own drop execution"
  ```

### Task 5: 迁移 restore/import session operations 并删除 Manager commands owner

**Files:**
- Create: `src/shared/model/session-operations.ts`
- Create: `src/shared/model/session-operations.test.ts`
- Modify: `src/shared/model/index.ts`
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/manager/components/import-export/ImportModal.tsx`
- Modify: `src/manager/core/import.test.ts`
- Modify: `src/manager/core/commands.test.ts`
- Delete: `src/manager/core/commands.ts`

**Interfaces:**
- Produces: `restoreGroupFromBin`, `parseImportedText`, `importText`.
- `useTabBoardStore.ts` imports shared session operations.
- Import Modal imports shared session operations.
- No production Manager commands module remains.

- [x] **Step 1: 写 session operations owner RED**

  Direct tests迁移现有 fixtures：

  - restore valid original folder；
  - restore fallback placement / original metadata / category index；
  - Markdown OneTab、plain OneTab、TabBoard text、round-trip export text；
  - invalid workspace/folder；
  - import ID regeneration/non-mutation。

- [x] **Step 2: 运行 RED**

  Run: `npx vitest run src/shared/model/session-operations.test.ts`

  Expected: FAIL because module is absent.

- [x] **Step 3: 迁移 implementation**

  从 `commands.ts` 移动 lines 926+ restore/import block，使用 direct model imports而非 barrel where needed to preserve graph direction.

- [x] **Step 4: 迁移 callers/tests并删除 commands.ts**

  所有 production/test imports改为 shared owner。`commands.test.ts` 中纯 drop/category tests已在前面任务迁走；剩余 restore tests迁入 shared test，随后删除该 test file if empty。

- [x] **Step 5: 运行 GREEN**

  Run:

  ```bash
  npx vitest run src/shared/model/session-operations.test.ts
  npx vitest run src/manager/core/import.test.ts
  npx vitest run src/shared/store/useTabBoardStore.test.ts
  npx tsc --noEmit
  ```

  Expected: PASS.

- [x] **Step 6: 验证 production Manager command owner 已消失**

  Run: `test ! -e src/manager/core/commands.ts`

  Expected: exit 0.

- [x] **Step 7: Commit**

  ```bash
  git add src/shared/model/session-operations.ts \
    src/shared/model/session-operations.test.ts src/shared/model/index.ts \
    src/shared/store/useTabBoardStore.ts \
    src/manager/components/import-export/ImportModal.tsx \
    src/manager/core
  git commit -m "refactor(domain): own session operations"
  ```

### Task 6: 启用 strict zero-cycle gate、文档和全量验证

**Files:**
- Modify: `scripts/check-import-cycles.mjs`
- Modify: `scripts/check-import-cycles.test.mjs`
- Modify: `package.json`
- Modify: `docs/technical-architecture.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`
- Modify: `docs/superpowers/specs/2026-07-26-session-domain-ownership-design.md`
- Modify: `docs/superpowers/plans/2026-07-26-session-domain-ownership.md`
- Modify as review requires: shared domain/Manager/store/background files and tests.

**Interfaces:**
- `npm run check:cycles` rejects every SCC.
- Forbidden edges reject shared/background → manager dependencies.
- Publication forbidden edges remain enforced.

- [x] **Step 1: 写 strict gate RED**

  扩展 CLI tests确认：

  - fixture `a -> b -> a` with no deny filter exits 1；
  - acyclic fixture with no deny filter exits 0；
  - production current graph before migration exits 1 and lists six-module SCC。

  前两个现有行为已有覆盖基础；新增 production source assertion记录当前 RED。

- [x] **Step 2: 运行 source graph RED**

  Run: `node scripts/check-import-cycles.mjs`

  Expected: FAIL and list the current Manager/shared SCC before final import cleanup.

- [x] **Step 3: 清理 barrel imports与所有 reverse edges**

  Manager core使用 direct shared imports where barrel would reintroduce schema/validation cycles。检查：

  ```bash
  rg -n "from ['\"].*manager/" src/shared src/background
  ```

  Expected: no production matches.

- [x] **Step 4: 切换 package gate**

  Replace targeted script with:

  ```json
  "check:cycles": "node --test scripts/check-import-cycles.test.mjs && node scripts/check-import-cycles.mjs --deny-imports src/shared/store/authoritativePublication.ts,zustand,react,src/manager/components,src/shared/utils/events,src/shared/store/chromeStorage.ts,src/shared/store/activeAdapter.ts --deny-imports src/shared/model/drop-operations.ts,src/manager --deny-imports src/shared/store/stateMutations.ts,src/manager --deny-imports src/background/statePersistence.ts,src/manager",
  "check": "npm run build && node scripts/check-extension.mjs && npm run check:cycles"
  ```

  CLI strict mode rejects any cycle when no `--deny-together` is supplied.

- [x] **Step 5: 更新架构/演进/决策文档**

  记录：

  - shared session/drop domain ownership；
  - Manager DnD interaction-only boundary；
  - raw validation dependency direction；
  - authoritative drop data flow；
  - zero source-cycle policy；
  - D043 tradeoff。

- [x] **Step 6: Review full diff**

  核对：

  - shared/background production imports Manager = 0；
  - Manager commands production module不存在；
  - category semantics只有 shared owner；
  - orphan folder仍是 Inbox；
  - DropIntent wire shape无变化；
  - state mutation/background replay tests使用 shared owner；
  - no compatibility re-export hiding reverse ownership；
  - `rg -n "from ['\"].*manager/" src/shared src/background` 无 production matches；
  - no unrelated DnD UI behavior changes。

- [x] **Step 7: 运行 fresh full verification**

  Run:

  ```bash
  npm run build
  npm run check
  npm test
  git diff --check
  ```

  Expected: all exit 0；source import graph zero cycles；记录 test files/tests count。

- [x] **Step 8: 更新状态并 Commit**

  标记 spec/plan implemented and verified，写入 fresh evidence。

  ```bash
  git add scripts package.json docs src
  git commit -m "docs(domain): record shared session ownership"
  ```

## Completion Audit

- [x] `CategoryFilter` / `SavedTabRef` / `DropIntent` 由 shared model拥有。
- [x] category/session move实现只有一套且state-aware处理 orphan folder。
- [x] raw drop validation不依赖 Manager或store/model barrel cycle。
- [x] drop execution/replay/digest/identity 由 shared model拥有。
- [x] restore/import state operations由 shared model拥有。
- [x] `src/manager/core/dnd.ts` 只保留 interaction/intent resolution。
- [x] `src/manager/core/commands.ts` production module已删除。
- [x] shared/background production imports Manager 为零。
- [x] `npm run check` 对任何 source SCC 失败且当前 graph零 cycle。
- [x] 全量 build/check/test/diff check 使用本轮 fresh output。

## Verification Record

- `npm run build`: PASS，TypeScript + Vite production build，6984 modules。
- `npm run check`: PASS，extension sanity、6个import-graph CLI tests、123 source files strict zero-cycle/reverse-edge gate。
- `npm test`: PASS，50 test files，857 tests。
- `git diff --check`: PASS。
- `src/manager/core/commands.ts`: deleted；shared/background production imports Manager = 0。
