# Session Domain Ownership 深化设计

**日期：** 2026-07-26
**状态：** 已实现并验证
**范围：** 统一 category、DropIntent、session move/drop execution、restore/import 的 shared domain ownership，消除 Manager/shared/store 之间的剩余 import cycle。

## 背景与问题

当前唯一 source import SCC 包含：

- `src/manager/core/dnd.ts`
- `src/manager/core/selectors.ts`
- `src/shared/model/import-export.ts`
- `src/shared/model/index.ts`
- `src/shared/model/schema.ts`
- `src/shared/store/mutationValidation.ts`

表面路径是：

```text
manager/core/dnd
  -> shared/model barrel
  -> model/schema
  -> store/mutationValidation
  -> manager/core/dnd
```

但只把 `dnd.ts` 和 `selectors.ts` 改成 direct import 只能让 SCC 消失，不能修复真正的 ownership inversion：

- `mutationValidation.ts` 从 Manager DnD 导入 `DropIntent` / `SavedTabRef`；
- `stateMutations.ts` 从 Manager commands 导入 drop execution、replay、digest、session move；
- background persistence/service worker 从 Manager commands 导入 replay 语义；
- shared Zustand store 从 Manager commands 导入 restore/import 语义；
- `CategoryFilter` 由 Manager selector 定义，却被 shared mutation schema 使用；
- `schema.ts` 从 store mutation validation 导入 operation ID、timestamp 和 digest primitive validation。

结果是 Manager layer 同时拥有：

1. pointer/keyboard DnD geometry 与 target resolution；
2. persistent DropIntent contract；
3. session/category immutable execution；
4. replay/ledger identity；
5. restore/import state operations。

后四项被 background 和 shared persistence 使用，本质上不是 Manager UI 职责。

## 目标

建立从底向上的单向依赖：

```text
shared primitive validation
  -> shared model contracts / category semantics
  -> shared drop validation / execution / replay
  -> shared store mutations / background persistence
  -> manager DnD resolution / React UI
```

完成后：

- `src/shared/**` 和 `src/background/**` 不再导入 `src/manager/**`；
- `CategoryFilter`、`SavedTabRef`、`DropIntent` 由 shared model 拥有；
- session move/category placement 只有一套实现；
- drop execution/replay/digest/identity 由 shared model 拥有；
- restore/import immutable operations 由 shared model 拥有；
- Manager `dnd.ts` 只拥有 drag payload/target/marker、geometry、ownership-based intent resolution；
- `commands.ts` 不再作为 persistence/domain owner；
- source import graph 无 SCC，`npm run check` 对任何 source cycle 失败。

## 方案比较

### 方案 A：只把 Manager 的 barrel imports 改成 direct imports

把：

```ts
import { isStorableCaptureCandidate, type Group } from '../../shared/model';
```

改成：

```ts
import { isStorableCaptureCandidate } from '../../shared/model/capture-policy';
import type { Group } from '../../shared/model/types';
```

**优点：**

- 变更极小；
- 现有 6-module SCC 很可能立即消失。

**缺点：**

- shared validation/store/background 仍反向依赖 Manager；
- `CategoryFilter` 和 `DropIntent` 仍放在 UI layer；
- `commands.ts` 继续混合 drop persistence、restore、import；
- import graph 变绿但层次 ownership 不变；
- 下一次改 replay 或 session placement 仍要修改 Manager core。

### 方案 B：把所有 DnD 代码整体搬到 shared

把 `dnd.ts` 和 `commands.ts` 全部移动到 shared。

**优点：**

- 快速消除反向 import；
- 行为代码集中。

**缺点：**

- pointer rect、placeholder、marker、target hysteresis 等 UI interaction contract 被错误下沉到 domain；
- shared layer开始依赖 DOM `DOMRect`；
- DnD geometry 与 persistent state execution 仍混在一起，只是换目录；
- 模块边界比当前更差。

### 方案 C：拆分 shared domain contract/execution，保留 Manager resolution

新增明确的 shared units：

1. **Primitive validation**
   - bounded strings、IDs、timestamps、canonical JSON 和 byte limits；
   - 不依赖 model/store/manager。
2. **Session categories**
   - `CategoryFilter`、category matching/ownership/order、session move/insertion；
   - 依赖 model types/schema，不依赖 Manager。
3. **Drop intent contract**
   - `SavedTabRef`、`DropIntent`；
   - 纯类型，不依赖 DOM。
4. **Drop validation**
   - raw DropIntent/OpenTabInfo/payload shape；
   - 依赖 shared contract 与 primitive validation。
5. **Drop operations**
   - digest、stable generated IDs、replay、immutable execution；
   - 依赖 shared model/drop contract，不依赖 Manager。
6. **Session operations**
   - restore-from-bin 与 import parsing/application；
   - 依赖 shared model。

Manager `dnd.ts` 保留 `DragPayload`、`DropTarget`、geometry、marker 与 `resolveDrop()`，但产出的 persistent intent 使用 shared `DropIntent`。

**优点：**

- 修复真实 ownership inversion；
- shared/background 不再依赖 Manager；
- Manager 保留真正属于 interaction adapter 的 geometry；
- validation、execution、replay 与 UI resolution 可独立测试；
- source graph 可开启零 cycle gate。

**缺点：**

- 需要拆分现有 `commands.ts` 并迁移较多 imports/tests；
- shared drop execution 文件仍包含多种 intent，需要通过后续架构分析评估内部 seam；
- 为保持行为等价，必须迁移成熟算法而不是重写。

**决定：采用方案 C。**

## 模块边界

### `src/shared/validation.ts`

拥有无领域依赖的 primitive contracts：

```ts
export const MAX_OPERATION_ID_BYTES = 128;
export const MAX_ENTITY_ID_BYTES = 128;
export const MAX_REFS = 128;
export const MAX_LIVE_RECORDS = 128;
export const MAX_MUTATIONS = 128;
export const MAX_URL_BYTES = 4096;
export const MAX_TITLE_BYTES = 512;
export const MAX_FAVICON_URL_BYTES = 2048;
export const MAX_TIMESTAMP_BYTES = 64;
export const MAX_CANONICAL_DIGEST_BYTES = 16 * 1024;

export function utf8ByteLength(value: string): number;
export function isBoundedString(value: unknown, maxBytes: number): value is string;
export function isEntityId(value: unknown): value is string;
export function isOperationId(value: unknown): value is string;
export function isTimestamp(value: unknown): value is string;
export function isDenseArray(value: readonly unknown[]): boolean;
export function canonicalize(value: unknown): unknown;
export function canonicalJson(value: unknown): string;
export function isCanonicalDigestWithinLimit(value: unknown): boolean;
```

`schema.ts` 直接依赖该模块，不再依赖 store validation。

### `src/shared/model/categories.ts`

拥有：

```ts
export type CategoryFilter =
  | 'inbox'
  | 'saved'
  | 'archive'
  | `folder:${string}`;

export function categoryForGroup(
  state: Pick<TabBoardState, 'folders'>,
  group: Group,
): CategoryFilter;

export function categoryMatches(
  state: Pick<TabBoardState, 'folders'>,
  group: Group,
  category: CategoryFilter,
): boolean;

export function isOwnedCategory(
  state: Pick<TabBoardState, 'folders'>,
  category: CategoryFilter,
  workspaceId: string,
): boolean;

export function categoryOrder(
  state: Pick<TabBoardState, 'folders' | 'categoryOrderByWorkspace'>,
  workspaceId: string,
): string[];

export function reorderCategoryIds(
  categoryOrder: string[],
  sourceId: string,
  targetId: string,
  placement: 'before' | 'after',
): string[];

export function moveSessionToCategory(
  state: TabBoardState,
  input: { groupId: string; category: CategoryFilter; index: number },
  updatedAt?: string,
): TabBoardState;

export function insertGroupAtCategoryIndex(...): TabBoardState;
```

`selectors.ts` re-export `CategoryFilter` for a bounded compatibility window, but persistent/shared code imports the shared owner directly.

Category semantics use one canonical rule:

- `starred` → Saved；
- else `archived` → Archive；
- else valid same-workspace `folderId` → custom folder；
- else Inbox。

`categoryMatches(state, group, category)` delegates to `categoryForGroup(state, group)`，因此 orphan folder IDs 与 `folderId: null` 一样属于 Inbox。Existing tests for missing folders remain authoritative.

### `src/shared/model/drop-intent.ts`

拥有纯 contract：

```ts
export type SavedTabRef = { groupId: string; tabId: string };

export type DropIntent =
  | MoveSessionIntent
  | ReorderCategoryIntent
  | MoveTabsIntent
  | CopyOpenTabsIntent
  | CreateSessionIntent;
```

不包含 `DragPayload`、`DropTarget`、`DOMRect`、marker 或 React types。

### `src/shared/model/drop-validation.ts`

从当前 `mutationValidation.ts` 移入：

- `isDropIntentShape()`；
- `isOpenTabInfoShape()`；
- `isDropPayloadWithinLimits()`；
- DropIntent/OpenTabInfo-specific helper。

`mutationValidation.ts` 继续拥有 mutation batch 限制与 `isDropMutationCandidate()`，并可 re-export shared validation symbols供现有 callers 迁移；它不再导入 Manager。

依赖方向固定为：

```text
shared/validation
  -> model/drop-intent
  -> model/drop-validation
  -> store/mutationValidation
```

`drop-validation.ts` 不导入 `schema.ts`、`stateMutations.ts` 或 `mutationValidation.ts`，避免 primitive validation 再次经由 barrel 回流。

### `src/shared/model/drop-operations.ts`

从 Manager commands 迁入：

- `dropOperationTabId()`；
- `dropOperationGroupId()`；
- `getDropOperationDigest()`；
- `getDropIntentReplayStatus()`；
- `isDropIntentAlreadyApplied()`；
- `executeDropIntent()`；
- stable generated identity/replay helpers；
- saved/open tab move/copy/create helpers。

它复用 `categories.ts`，不再维护第二套 `categoryMatches`、`categoryForMove`、`categoryOrder`。

### `src/shared/model/session-operations.ts`

从 Manager commands 迁入：

- `restoreGroupFromBin()`；
- `parseImportedText()`；
- `importText()`。

`useTabBoardStore.ts` 和 Import Modal 直接使用 shared owner。

### `src/manager/core/dnd.ts`

保留：

- `DragPayload`；
- `DropTarget`；
- `DragMarker` / `DragUiState`；
- rect/placement/hysteresis helpers；
- `resolveDrop()` 和 interaction ownership checks。

它导入 shared：

- `CategoryFilter`；
- `DropIntent` / `SavedTabRef`；
- category helpers；
- model types；
- capture policy。

它不提供 persistent execution/replay。

### `src/manager/core/commands.ts`

完成迁移后删除 production module。测试按 owner 迁移：

- drop/session placement/replay → shared model tests；
- restore → session operations tests；
- import → session operations tests。

若为减少单次 rename churn暂时保留 test 文件名，测试必须直接 import shared owner；production 不保留 manager compatibility re-export。

## 数据流

### Session drag

```text
Manager DnD geometry
  -> resolveDrop()
  -> shared DropIntent
  -> useTabBoardStore.applyDropIntent()
  -> AuthoritativePublication
  -> worker statePersistence
  -> shared stateMutations
  -> shared executeDropIntent()
  -> Storage Authority
```

### Raw mutation validation

```text
runtime message
  -> store/mutationValidation
  -> model/drop-validation
  -> model/drop-intent contract
```

无 Manager dependency。

### Replay

```text
worker/state mutation
  -> shared drop operations
  -> ledger digest / stable generated identity
```

Manager UI 不参与 authoritative replay 判定。

### Restore/import

```text
Zustand domain facade / Import Modal
  -> shared session operations
  -> pure TabBoardState
  -> StateMutation / authoritative publication
```

## 测试策略

### Contract migration

- 新 shared contract tests直接 import `drop-intent.ts`、`drop-validation.ts`；
- 现有 mutation validation malformed/limit cases保持；
- `dnd.ts` resolver tests仍验证所有 payload/target → intent 映射。

### Category/session move

将现有 tests 作为行为基线，覆盖：

- Saved/Archive/Inbox/custom folder flags；
- invalid/missing/cross-workspace folder；
- empty category insertion；
- source workspace block；
- unrelated global order；
- orphan folder visible as Inbox；
- locked sibling placement safety。

Manager resolver 与 state mutation必须使用同一 shared helpers。

### Drop execution/replay

迁移现有：

- all five intent execution paths；
- forged inactive/cross-workspace intent rejection；
- partial saved refs；
- stable generated IDs；
- ledger eviction replay；
- conflict detection；
- digest size；
- batch revision/rebase integration。

### Import/restore

迁移现有 restore/import tests，不改变 fixtures或预期。

### Architecture gate

最终 `npm run check` 使用 strict source-cycle mode：

```sh
node scripts/check-import-cycles.mjs \
  --deny-imports src/shared/model/drop-operations.ts,src/manager \
  --deny-imports src/shared/store/stateMutations.ts,src/manager \
  --deny-imports src/background/statePersistence.ts,src/manager
```

未指定 `--deny-together` 时任何 SCC 都失败。Gate 同时保留 publication forbidden edges。

## 迁移顺序

1. 提取 primitive validation，切断 `schema → store/mutationValidation`。
2. 提取 shared category + DropIntent contracts，迁移 type imports。
3. 提取 drop validation，令 store validation 不依赖 Manager。
4. 提取 category/session move semantics，Manager resolver和state mutation共用。
5. 提取 drop execution/replay，迁移 background/store callers。
6. 提取 restore/import session operations，迁移 Zustand/Import Modal。
7. 删除 Manager commands production owner。
8. 收紧 strict zero-cycle gate，更新文档并全量验证。

每步保持行为等价，先写或迁移 failing direct-owner test，再移动 production code。

## 非目标

- 不改变 DnD geometry、target hysteresis、placeholder、DragOverlay 或 keyboard/pointer behavior。
- 不改变 DropIntent wire shape、mutation schema、operation ledger 或 retry policy。
- 不改变 category 产品语义或 sidebar/header UI。
- 不改变 import formats、restore placement 或 Bin behavior。
- 不重写成熟 drop algorithms；只迁移 owner并去除重复 category semantics。
- 不引入 runtime dependency。

## 实施结果

- `src/shared/validation.ts` 成为primitive validation owner，`schema.ts` 不再依赖store validation。
- `categories.ts` 统一category derivation/ownership/order、session move和category insertion；orphan folder继续归Inbox。
- `drop-intent.ts` 统一五类persistent DropIntent wire contract。
- `drop-validation.ts` 统一raw DropIntent/OpenTabInfo/payload-limit validation。
- `drop-operations.ts` 统一五类intent execution、operation digest、stable generated IDs与replay/ledger semantics。
- `session-operations.ts` 统一restore-from-bin与import parsing/application。
- `src/manager/core/dnd.ts` 只保留interaction payload/target/geometry/hysteresis与intent resolution。
- production `src/manager/core/commands.ts` 已删除；shared/background production imports Manager 为零。
- 原六模块SCC已消失；strict graph gate验证123个source files零cycles/forbidden edges。

## 验证记录

- `npm run build`: PASS，TypeScript + Vite production build，6984 modules。
- `npm run check`: PASS，extension sanity、6个import-graph CLI tests、123 source files strict zero-cycle/reverse-edge gate。
- `npm test`: PASS，50 test files，857 tests。
- `git diff --check`: PASS。
