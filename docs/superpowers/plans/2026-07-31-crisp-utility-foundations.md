# TabBoard Crisp Utility Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the persistent Workspace, transient Open Tabs, and shared icon contracts required by the remaining Crisp Utility implementation.

**Architecture:** Keep Workspace persistence inside shared model/store boundaries and publish mutations through the existing authoritative queue. Remove `OpenTabInfo.active` only from TabBoard's transient protocol while leaving Chrome's native `Tab.active` available at the Chrome API boundary. Introduce one shared Lucide action primitive before migrating page components.

**Tech Stack:** TypeScript, Zustand, serialized state mutations, React 18, Mantine v7, Lucide, Vitest.

## Global Constraints

- Preserve file/browser storage formats except for Workspace `emoji` and canonical Workspace order.
- Preserve mutation validation, authoritative publication, replay, and structural sharing.
- Workspace names use trim + NFC + case-insensitive duplicate validation.
- Workspace emoji accepts one grapheme and supports ZWJ and skin-tone sequences.
- Do not add an emoji-picker dependency.
- `OpenTabInfo.active` removal must not remove native `chrome.tabs.Tab.active` usage required to focus/create Chrome tabs.
- Lucide toolbar icons use 18px, menu icons use 16px, and `strokeWidth={1.75}`.
- Do not commit unless explicitly requested.

---

### Task 1: Persist Workspace Emoji

**Files:**
- Modify: `src/shared/model/types.ts`
- Modify: `src/shared/model/schema.ts`
- Modify: `src/shared/model/schema.test.ts`
- Modify: `src/shared/model/import-export.ts`
- Modify: `src/manager/core/import.test.ts`
- Modify: `src/shared/store/fileSerialization.ts`
- Modify: `src/shared/store/fileSerialization.test.ts`
- Modify: `src/shared/store/stateStructuralSharing.ts`
- Modify: `src/shared/store/stateStructuralSharing.test.ts`

**Interfaces:**
- Produces: `Workspace.emoji: string`.
- Produces: `DEFAULT_WORKSPACE_EMOJI = '🗂️'`.
- Produces: `normalizeWorkspaceEmoji(value: unknown): string`.
- Changes: `createWorkspace(name, emoji?)` always returns a normalized emoji.

- [ ] **Step 1: Write failing schema and serialization tests**

Add literal cases:

```ts
expect(normalizeWorkspace({
  id: 'workspace-a',
  name: 'Research',
  createdAt: timestamp,
  updatedAt: timestamp,
})?.emoji).toBe(DEFAULT_WORKSPACE_EMOJI);

expect(createWorkspace('Research', '🧪').emoji).toBe('🧪');
expect(normalizeWorkspaceEmoji('👩🏽‍💻')).toBe('👩🏽‍💻');
expect(normalizeWorkspaceEmoji('text')).toBe(DEFAULT_WORKSPACE_EMOJI);
```

Round-trip state through JSON and file serialization and assert `emoji` is preserved.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/shared/model/schema.test.ts src/shared/store/fileSerialization.test.ts src/shared/store/stateStructuralSharing.test.ts
```

Expected: FAIL because `Workspace` has no `emoji`.

- [ ] **Step 3: Implement normalized emoji ownership**

Use `Intl.Segmenter` when available and a Unicode `Extended_Pictographic` check. Accept exactly one grapheme containing an emoji code point. Normalize legacy/missing/invalid values to `DEFAULT_WORKSPACE_EMOJI`.

- [ ] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Run import/export regression**

```sh
npx vitest run src/manager/core/import.test.ts src/shared/model/drop-operations.test.ts
```

Expected: PASS.

### Task 2: Add Atomic Workspace Update And Canonical Order Mutations

**Files:**
- Modify: `src/shared/store/stateMutations.ts`
- Modify: `src/shared/store/stateMutations.test.ts`
- Modify: `src/shared/store/mutationValidation.ts`
- Modify: `src/shared/store/stateStructuralSharing.ts`
- Modify: `src/shared/store/stateStructuralSharing.test.ts`
- Modify: `src/shared/store/useTabBoardStore.ts`
- Modify: `src/shared/store/useTabBoardStore.test.ts`

**Interfaces:**
- Produces:

```ts
type StateMutation =
  | {
      type: 'update-workspace';
      id: string;
      name: string;
      emoji: string;
      updatedAt: string;
    }
  | {
      type: 'set-workspace-order';
      orderedWorkspaceIds: string[];
      updatedAt: string;
    }
  | ExistingStateMutation;
```

- Produces:

```ts
updateWorkspace(id: string, updates: { name: string; emoji: string }): Promise<void>;
updateWorkspaceOrder(orderedWorkspaceIds: string[]): Promise<void>;
```

- [ ] **Step 1: Write failing mutation tests**

Cover:

```ts
expect(applyStateMutation(state, {
  type: 'update-workspace',
  id: 'workspace-a',
  name: 'Research Lab',
  emoji: '🧪',
  updatedAt: timestamp,
}).workspaces[0]).toMatchObject({ name: 'Research Lab', emoji: '🧪' });
```

```ts
expect(applyStateMutation(state, {
  type: 'set-workspace-order',
  orderedWorkspaceIds: ['workspace-c', 'workspace-a', 'workspace-b'],
  updatedAt: timestamp,
}).workspaces.map(({ id }) => id)).toEqual([
  'workspace-c',
  'workspace-a',
  'workspace-b',
]);
```

Reject missing, duplicate, extra, and cross-state IDs. Assert untouched Workspace objects preserve references.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/shared/store/stateMutations.test.ts src/shared/store/stateStructuralSharing.test.ts src/shared/store/useTabBoardStore.test.ts
```

Expected: FAIL because the mutation kinds and actions do not exist.

- [ ] **Step 3: Implement mutation validation and execution**

`update-workspace` validates normalized name/emoji atomically. `set-workspace-order` requires a dense permutation of every current Workspace ID. Preserve active Workspace ID and all Workspace-owned groups/folders.

- [ ] **Step 4: Implement store facade**

Add `updateWorkspace` and `updateWorkspaceOrder` through the ordinary authoritative mutation queue. Keep `renameWorkspace` as a temporary compatibility action in this plan so the intermediate branch builds. Remove it in Manager Task 3 after every caller uses atomic `updateWorkspace`.

- [ ] **Step 5: Run focused GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 6: Run publication/replay regression**

```sh
npx vitest run src/shared/store/authoritativePublication.test.ts src/shared/store/activeAdapter.test.ts src/background/statePersistence.test.ts
```

Expected: PASS.

### Task 3: Remove `OpenTabInfo.active`

**Files:**
- Modify: `src/shared/openTabs.ts`
- Modify: `src/shared/openTabs.test.ts`
- Modify: `src/shared/model/drop-validation.ts`
- Modify: `src/shared/model/drop-validation.test.ts`
- Modify: `src/shared/model/drop-operations.ts`
- Modify: `src/shared/model/drop-operations.test.ts`
- Modify: `src/shared/store/stateMutations.test.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/background/service-worker.test.ts`
- Modify: `src/manager/core/open-tabs.ts`
- Modify: `src/manager/core/open-tabs.test.ts`
- Modify: `src/manager/core/openTabsWorkflow.ts`
- Modify: `src/manager/core/openTabsWorkflow.test.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.ts`
- Modify: `src/manager/hooks/useOpenTabsRuntime.dom.test.ts`
- Modify: `src/manager/components/sidebar/OpenTabRow.tsx`
- Modify: `src/manager/components/sidebar/OpenTabsPanel.test.ts`
- Modify: `src/manager/ManagerApp.dom.test.ts`
- Modify: `src/manager/components/shell/ManagerLayout.test.ts`

**Interfaces:**
- Changes:

```ts
interface OpenTabInfo {
  id: number | undefined;
  windowId: number | undefined;
  title: string;
  url: string;
  favIconUrl: string;
  pinned: boolean;
  index: number;
  browserGroup: BrowserGroup | null;
  storable: boolean;
  reason: CaptureCandidateReason | null;
}
```

- Keeps: `OpenTabsWorkflowState.active` because that field means “selection workflow active”, not Chrome active tab.

- [ ] **Step 1: Write failing protocol tests**

Assert parser accepts the complete object without `active`, and equality/structural sharing ignore any legacy extra `active` property:

```ts
const { active: _legacyActive, ...withoutActive } = openTab;
expect(isOpenTabInfo(withoutActive)).toBe(true);
const previous = {
  ...createOpenTabsWorkflowState(),
  windows: [windowInfo(1, [withoutActive])],
};
const next = reduceOpenTabsWorkflow(previous, {
  type: 'refresh-succeeded',
  windows: [windowInfo(1, [withoutActive])],
});
expect(next.windows).toBe(previous.windows);
```

Assert structural sharing no longer compares `active`, and Open Tab row markup contains no `tab.active` weight branch.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/shared/openTabs.test.ts src/shared/model/drop-validation.test.ts src/manager/core/openTabsWorkflow.test.ts src/manager/core/open-tabs.test.ts src/manager/components/sidebar/OpenTabsPanel.test.ts
```

Expected: FAIL because `active` is required and compared.

- [ ] **Step 3: Remove transient projection**

Remove `active` from records built in `service-worker.ts`, parser/shape validation, equality checks, DnD fixtures, and Open Tab typography. Keep native Chrome calls such as:

```ts
chrome.tabs.query({ active: true, lastFocusedWindow: true });
chrome.tabs.update(tabId, { active: true });
chrome.tabs.create({ url, active: false });
```

- [ ] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Run background and mutation regression**

```sh
npx vitest run src/background/service-worker.test.ts src/shared/store/stateMutations.test.ts src/shared/model/drop-operations.test.ts
```

Expected: PASS.

### Task 4: Establish Shared Lucide Action Geometry

**Files:**
- Create: `src/shared/components/TabBoardIcon.tsx`
- Create: `src/shared/components/TabBoardIcon.test.ts`
- Modify: `src/shared/components/AccessibleIconAction.tsx`
- Modify: `src/shared/components/AccessibleIconAction.test.ts`
- Modify: `src/shared/styles/accessibility.css`
- Modify: `src/shared/styles/theme.ts`

**Interfaces:**
- Produces:

```ts
type TabBoardIconSize = 'toolbar' | 'menu' | 'empty';

function TabBoardIcon({
  icon: Icon,
  size = 'toolbar',
}: {
  icon: LucideIcon;
  size?: TabBoardIconSize;
}): ReactElement;
```

- Geometry:
  - `toolbar`: 18px, `strokeWidth={1.75}`.
  - `menu`: 16px, `strokeWidth={1.75}`.
  - `empty`: 48px, `strokeWidth={1.75}`.
  - `AccessibleIconAction`: 32px desktop, 44px touch/coarse.

- [ ] **Step 1: Write failing primitive tests**

Render Search in toolbar/menu/empty sizes and assert exact SVG attributes and decorative semantics. Assert action geometry remains stable while disabled.

- [ ] **Step 2: Run focused RED**

```sh
npx vitest run src/shared/components/TabBoardIcon.test.ts src/shared/components/AccessibleIconAction.test.ts
```

Expected: FAIL because the shared Lucide primitive does not exist.

- [ ] **Step 3: Implement primitive and tokens**

Keep all action labels on the button, not the icon. Add shared classes for 32px icon buttons, 16px leading slots, selected/danger/disabled state, and 44px coarse-pointer expansion.

- [ ] **Step 4: Run focused GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Run type/build smoke**

```sh
npm run build
```

Expected: PASS.
