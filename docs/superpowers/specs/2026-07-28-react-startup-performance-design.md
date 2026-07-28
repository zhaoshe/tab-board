# React Startup Performance Design

## Objective

Reduce production Manager and Options startup time by fixing the measured
ownership problems:

- Options must not hydrate unrelated session data before rendering settings.
- Manager must not mount every tab row and tab-level DnD registration before
  its first useful frame.
- Shared hydration must read canonical state once per page startup.
- Startup event bursts and non-critical diagnostics must not compete with the
  critical path.

The target is the production Chrome MV3 extension, not the Vite preview.

## Constraints

- Keep the canonical `TabBoardState` schema unchanged.
- Keep the existing mutation wire and DropIntent semantics unchanged.
- Keep Authoritative Publication and structural sharing as the Manager state
  reconciliation owners.
- Keep every session's horizontal slot and group insertion geometry mounted.
- Do not restore session-to-session merge.
- Do not add a runtime dependency.
- Preserve browser and file storage modes, migration, fallback, and
  cross-context publication.
- Preserve all five manual DnD paths required by `AGENTS.md`.

## Architecture

### 1. Startup Benchmark Owner

Add a repository-owned production benchmark under `scripts/`.

The benchmark builds the extension, launches isolated persistent Chromium
profiles with the unpacked `dist`, discovers the extension ID from the MV3
service worker, seeds canonical state from that worker context, then opens
Manager or Options in a measured page.

It records:

- first root content;
- first useful Manager/Options UI;
- state-read completion;
- session-card and tab-row count at first useful UI;
- startup `list-open-tabs` count;
- empty, 60 x 2, 300 x 20, and large-state/empty-Inbox scenarios;
- at least five runs and median values.

Timing is an explicit performance command, not part of ordinary Vitest. Pure
seed/statistics/probe helpers receive unit coverage.

### 2. Single-Read Hydration

Authoritative Publication will replace the current two dependency calls:

```ts
ensureState(): Promise<TabBoardState>
readAuthoritativeState(): Promise<TabBoardState>
```

with:

```ts
initializeAuthoritativeState(): Promise<TabBoardState>
```

Hydration subscribes first, initializes/reads the active authority once, then
chooses the newer of that result and any buffered publication by
`mutationRevision` and `updatedAt`.

Page hydration no longer wakes the service worker merely to read state. The
worker remains the mutation serialization, capture, restore, and Chrome API
owner.

### 3. Options Settings Projection

`tabboardSettingsProjection` is a disposable derived startup cache:

```ts
interface SettingsProjection {
  settings: Settings;
  mutationRevision: number;
  updatedAt: string;
}
```

It is not canonical state and never wins a conflict against `TabBoardState`.

Rules:

- Chrome-state commits write `tabboardState` and the matching projection in one
  `chrome.storage.local.set`.
- File-state commits update the Chrome projection only after the file commit
  succeeds.
- Missing, malformed, or stale projection triggers one canonical read and
  projection repair.
- Options renders from a page-local projection store and sends settings
  mutations through the existing worker mutation contract.
- A committed mutation response updates the projection from its authoritative
  returned state.
- Storage migration controls may load the canonical authority when Advanced is
  opened; Basic settings do not.

### 4. Stable Session Slots With Interactive Activation

The horizontal board keeps one fixed-width `SessionSlot` per visible session
and every group insertion target. This preserves board width, scroll position,
group collision geometry, and canonical indexes.

Each slot has two render modes:

- `SessionCardShell`: lightweight title, link/note counts, lock state, and
  activation metadata; no tab rows, tab sortables, row subscriptions, or
  per-card overflow observers.
- `SessionCard`: the existing complete interactive card.

`useSessionActivation` activates:

- slots intersecting the board viewport;
- two cards of inline overscan on both sides;
- the highlighted/search-reveal target;
- focused slots;
- active drag source and current drag target.

Activation is monotonic during one mounted board category: once a slot has
become interactive, it remains interactive until workspace/category/query
context changes. This avoids unmounting focused or drag-related controls while
still keeping the first commit bounded. It also makes horizontal exploration
progressively interactive without background-mounting the entire board.

Group drag registration lives on the stable slot, not inside the expensive
body. Tab drag registration exists only for activated cards. During an active
drag the activation set is frozen except for explicit target activation.

TabBoard search remains canonical across all state. Browser Ctrl+F only sees
activated tab rows; this is the accepted tradeoff that supersedes the
full-interactive-DOM portion of D033.

### 5. Runtime Fan-Out Reduction

Open Tabs:

- one initial refresh;
- events during an in-flight refresh set one dirty bit;
- completion schedules at most one trailing refresh;
- startup focus/visibility/tab events coalesce for 75ms;
- TabBoard extension pages do not trigger a refresh through created/updated
  events.

Tab rows:

- event-only store actions use stable command ports from SessionCard or
  `useTabBoardStore.getState()` at interaction time;
- `confirmBeforeDestructive` is read once at SessionCard ownership;
- overflow observers exist only for activated cards;
- overlay subscriptions remain keyed and fine-grained.

Derived work:

- canonical group indexes use a `Map`;
- category counts use one group pass;
- DnD/overlay invalidation uses `mutationRevision` and active source identity,
  not joined strings of every tab ID.

### 6. Conditional Modules And Diagnostics

Options loads `DataStorageCard` only when Advanced Settings opens.
Folder migration and disconnect dialogs load only when their commands open.

Storage Authority uses literal dynamic imports for file-only modules after the
bootstrap mode resolves to `file`. Browser mode does not evaluate file
serialization, atomic file I/O, or IndexedDB handle modules.

Diagnostics preserves immediate warn/error durability. Info breadcrumbs append
to an in-memory ring and flush in one batch after 250ms or during an idle
callback. Diagnostics never performs one storage read and write per startup
breadcrumb.

Selective Mantine CSS and Tabler import transformation are not part of the
first implementation batch. They remain follow-up work only if the optimized
empty-state benchmark misses its target.

## Error Handling

- A missing settings projection falls back to canonical state and repairs the
  cache without blanking Options.
- A projection write failure does not fail an already committed canonical state
  mutation; it records a non-blocking warning and repairs on the next read.
- A lazy Advanced module failure shows an actionable inline error and keeps
  Basic settings usable.
- `IntersectionObserver` absence activates all session cards to preserve
  behavior on unsupported/test environments.
- Activation errors fall back to complete card rendering rather than hiding
  data or DnD targets.
- Existing file-storage fallback rules remain authoritative.

## Verification

### Automated correctness

- Focused RED/GREEN unit tests for every new owner.
- `npm run check`
- `npm test`
- `npm run test:e2e`
- `git diff --check`

### Production performance

Five-run medians on one built tree:

- Options empty versus 2.30 MB state differs by at most 100ms.
- Options cold useful UI is at most 500ms.
- Manager 300 x 20 with about 200 Inbox sessions reaches useful UI within
  1,000ms.
- First useful Manager UI mounts only viewport plus overscan tab rows.
- Open Tabs startup performs no more than one initial and one trailing request.
- No session-tree mount task exceeds 200ms.

### Browser behavior

- Manager and Options production-extension smoke.
- Session reorder within and across categories.
- Saved tab into an existing session.
- Multiple selected Open Tabs into existing and new sessions.
- Keyboard session reorder.
- Search reveal and horizontal activation.
- Focus restoration for menus/dialogs.
- Browser/file mode migration, reconnect, fallback, and cross-context updates.
- axe checks for default/open, light/dark, desktop/compact states.

## Documentation

Update:

- `docs/feature-spec.md`
- `docs/technical-architecture.md`
- `docs/feature-evolution.md`
- `docs/product-decisions.md`
- the performance review with after-measurements and completion evidence.

D033 must be marked partially superseded: stable session geometry remains full,
but expensive interactive card content is activated near the viewport.
