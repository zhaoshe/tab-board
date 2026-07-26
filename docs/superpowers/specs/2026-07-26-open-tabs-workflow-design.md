# Open Tabs Workflow Deepening Design

**Date:** 2026-07-26
**Status:** Implemented and verified
**Scope:** Give Open Tabs listing, selection, refresh, capture completion, filtering, and drag completion one workflow owner with a compact interface.

## Problem

Open Tabs currently spans:

- duplicated transport types in `service-worker.ts` and `manager/core/open-tabs.ts`;
- selection rules in core helpers, the runtime hook, and `OpenTabsPanel`;
- refresh concurrency and Chrome listener wiring in `useOpenTabsRuntime`;
- selected capture reconciliation, saved-session filtering, and global DOM events in the same hook;
- drag completion emitted by `ManagerLayout` through `tabboard-open-tabs-dropped`;
- capture completion emitted through `tabboard-capture-completed`;
- a global tab-filter event used only to move state between the hook and `ManagerLayout`;
- a 29-field runtime interface and a 31-field panel interface.

Small behavior changes therefore touch four or five modules, while most extracted pure helpers are shallow and do not own sequencing.

## Decision

Create one Open Tabs workflow seam with four parts:

1. **Shared protocol** in `src/shared/openTabs.ts`
   - owns `OpenTabInfo`, `OpenWindowInfo`, capture result, and runtime response contracts;
   - is imported by background, preview, Manager, mutation validation, and persistence;
   - removes duplicate worker/Manager types.

2. **Pure workflow state** in `src/manager/core/openTabsWorkflow.ts`
   - owns canonical windows, selected window, selected IDs, closing IDs, query, tab-filter URL, and operation status;
   - applies refresh/selection/operation transitions through a reducer;
   - exposes one derived projection containing selected records and drag IDs.

3. **React runtime adapter** in `useOpenTabsRuntime.ts`
   - binds Chrome events and runtime messages;
   - drives the pure reducer;
   - performs persisted-state reconciliation for selected capture;
   - exposes grouped `model` and `commands`, not a field-per-detail interface.

4. **Manager ownership**
   - `ManagerLayout` creates the workflow once and passes it to `Sidebar`;
   - successful Open Tabs drops call `commands.completeDrop()` directly;
   - selected capture returns a structured completion result directly to `ManagerLayout`;
   - tab-filter URL is read directly from workflow model;
   - global DOM events for capture completion, drop completion, and tab-filter synchronization are removed.

## Interfaces

```ts
export interface OpenTabsWorkflowModel {
  windows: OpenWindowInfo[];
  selectedWindow: OpenWindowInfo | null;
  filteredTabs: OpenTabInfo[];
  query: string;
  tabFilterUrl: string | null;
  selection: {
    active: boolean;
    ids: number[];
    count: number;
    records: OpenTabInfo[];
    recordIds: number[];
  };
  status: {
    loading: boolean;
    capturing: boolean;
    updatingSelection: boolean;
    closingTabIds: number[];
    error: string | null;
  };
}

export interface OpenTabsWorkflowCommands {
  refresh(): Promise<void>;
  selectWindow(windowId: number): void;
  setQuery(value: string): void;
  clearQuery(): void;
  toggleSelection(tabId: number | undefined): void;
  selectAll(): void;
  clearSelection(): void;
  completeDrop(): void;
  focusTab(tabId: number | undefined, windowId: number | undefined): Promise<void>;
  closeTab(tabId: number | undefined): Promise<void>;
  pinTab(tabId: number | undefined): Promise<void>;
  closeSelection(): Promise<void>;
  pinSelection(): Promise<void>;
  filterSessionsByTab(tab: OpenTabInfo): void;
  clearSessionFilter(): void;
  captureSelection(
    categorySnapshot: CaptureCategorySnapshot,
    getCurrentCategorySnapshot: () => CaptureCategorySnapshot,
  ): Promise<CaptureCompletion>;
}

export interface OpenTabsWorkflow {
  model: OpenTabsWorkflowModel;
  commands: OpenTabsWorkflowCommands;
}
```

`OpenTabsPanel` receives:

```ts
{
  workspaceId;
  workflow;
  sidebarPinned;
  sidebarToggleRef;
  onToggleSidebar;
  onCaptureSelectedTabs;
  onSourceKeyChange;
}
```

## Capture Completion

`captureSelection()` returns `CaptureCompletion` with the existing committed/reconciled/selection/category/filter evidence. `ManagerLayout` handles toast, reveal, and category navigation synchronously from this returned value. No window event is dispatched.

The capture still:

- snapshots selected IDs, window, workspace, category, and filters;
- rejects duplicate concurrent capture;
- validates created session IDs in persisted state;
- structurally shares authoritative state;
- clears selection only when the original selection is still current;
- avoids reveal/filter cleanup after workspace, category, filter, or selection races.

## Drag Completion

`ManagerLayout` still owns DnD geometry and persistence because that is the interaction adapter. After a persisted Open Tabs drop it calls `workflow.commands.completeDrop()`. Failed drops do not clear selection.

## Testing

Tests must prove:

- shared protocol types are used by background and Manager;
- reducer refresh removes invalid selected IDs atomically;
- reducer window switch clears selection;
- selected records/IDs are derived once in the workflow projection;
- concurrent refresh keeps one active run plus one queued rerun;
- successful direct drop completion clears selection, failed persistence does not;
- capture completion is returned directly and preserves all existing race evidence;
- `OpenTabsPanel` consumes grouped model/commands and does not derive selection records;
- source no longer contains the three global Open Tabs events;
- existing Chrome listener, capture, DnD, overlay, and service-worker tests remain green.

## Non-Goals

- No product behavior change.
- No rewrite of service-worker capture.
- No new state library.
- No movement of persistent Session move semantics; that belongs to the later Session move ownership round.
- No change to DnD geometry or target resolution.
