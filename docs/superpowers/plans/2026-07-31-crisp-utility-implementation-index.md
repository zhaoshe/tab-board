# TabBoard Crisp Utility Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Execute plans in the listed order. Do not commit unless the user explicitly requests it.

**Goal:** Implement the confirmed bilingual Crisp Utility specification without mixing schema, Manager interaction, DnD geometry, and Options/Popup acceptance into one unreviewable change.

**Source of truth:**

- Chinese: `docs/superpowers/specs/2026-07-29-crisp-utility-ui-redesign-design.zh-CN.md`
- English: `docs/superpowers/specs/2026-07-29-crisp-utility-ui-redesign-design.md`

## Execution Order

1. `2026-07-31-crisp-utility-foundations.md`
   - Workspace emoji and canonical order.
   - Remove `OpenTabInfo.active`.
   - Shared Lucide and geometry foundations.

2. `2026-07-31-crisp-utility-manager-interactions.md`
   - B2 menus and row actions.
   - Workspace/Category management.
   - Session/Open Tabs selection ownership and target pickers.
   - Sidebar/header/tooltips.

3. `2026-07-31-crisp-utility-dnd.md`
   - Fixed Session tracks.
   - Explicit `new-session-insert`.
   - Gap Anchors, Empty Category, ghost geometry.
   - Progressive auto-scroll and pointer target stability.
   - Remove visible/hidden keyboard drag handles in favor of Hybrid Commands.

4. `2026-07-31-crisp-utility-options-popup-and-acceptance.md`
   - Options storage semantics and copy.
   - Popup pinned/dedupe composition.
   - Complete Lucide migration and remove Tabler.
   - Documentation, browser, accessibility, DnD, and performance gates.

## Cross-Plan Interfaces

Foundation plan produces:

```ts
interface Workspace {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
}

type StateMutation =
  | { type: 'update-workspace'; id: string; name: string; emoji: string; updatedAt: string }
  | { type: 'set-workspace-order'; orderedWorkspaceIds: string[]; updatedAt: string }
  | ExistingStateMutation;
```

DnD plan produces:

```ts
type DropTarget =
  | ExistingDropTarget
  | {
      kind: 'new-session-insert';
      category: CategoryFilter;
      index: number;
      workspaceId: string;
    };
```

Manager plan consumes both interfaces and produces Saved/Open named Hybrid Commands.
DnD Task 7 extends the same picker with whole-session Before/After commands:

```ts
interface SessionTargetChoice {
  kind: 'existing-session' | 'new-session' | 'session-position';
  groupId?: string;
  category: CategoryFilter;
  index: number;
}
```

## Global Gates

- Use TDD for every behavior change.
- Keep one active selection scope across Manager.
- Preserve Storage Authority, authoritative publication, optimistic replay, and structural sharing.
- Do not restore Session-card-to-Session-card merge.
- Saved Tabs may explicitly merge into an Existing Session, including All Source Tabs.
- No resting drag icon or hidden drag-handle focus stop.
- No new runtime dependency beyond confirmed `lucide-react`; remove `@tabler/icons-react` after migration.
- Run final browser/DnD commands serially.
- Do not commit unless explicitly requested by the user.
