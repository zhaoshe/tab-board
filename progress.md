# TabBoard UI / UX Audit Progress

## 2026-07-27

- Loaded `web-design-guidelines`, `agent-browser`, `vercel-react-best-practices`, and the applicable planning/review workflows.
- Fetched the current Vercel Web Interface Guidelines from the upstream repository.
- Read the project README, overview, current feature/UI contracts, technical architecture, recent evolution/decisions, package scripts, entry HTML, and recent commits.
- Verified the working tree was clean before adding audit-only planning files.
- Recovered relevant prior memory for live layout measurement, browser setup, structural sharing, and DnD constraints.
- Established that the review covers manager, popup, and options, with live browser verification.
- Product code changes: none.
- Completed the static audit of Manager, Popup, Options, import/export, Bin, storage dialogs, shared theme, custom overlays, and manager CSS.
- Recorded exact file/line evidence for semantic-control gaps, keyboard/focus defects, state/deep-link gaps, motion/theme issues, misleading storage copy, and component/style ownership.
- Ran the real manager and popup preview harnesses with `agent-browser`.
- Loaded real `options.html` with a temporary `/tmp` Chrome API init script; no repository preview or dependency was added.
- Measured desktop and narrow geometry at 390, 800, 1280, and 1440 widths; tested dark mode and reduced motion.
- Reproduced session rename keyboard failure, detail-popover action inaccessibility, sidebar collapse focus loss, category-strip clipping, and narrow search overlap.
- Ran axe-core through `agent-browser` on Manager, Popup, and Options.
- Wrote P0/P1/P2 recommendations, 3 implementation approaches, and acceptance gates to `findings.md`.
- Approved design and detailed implementation plan were written under `docs/superpowers/`.
- Task 1 completed with TDD: shared accessible icon action, destructive confirmation dialog, Intl formatters, page theme metadata, shared accessibility/reduced-motion CSS, and HTML theme-color defaults.
- Task 1 verification: 4 test files / 5 tests passed; `npm run build` passed.
- Task 2 completed with TDD: Manager landmarks, Enter/F2/Space session rename, semantic session note, keyboard-reachable detail actions, named Search/Import inputs, Bin action names, locale formatting, reduced-motion-aware scrolling, semantic Open Tabs rows, and live toast roles.
- Task 2 verification: 5 focused files / 22 tests passed; 4 related regression files / 99 tests passed; `npm run build` passed.
- Task 3 completed with TDD: sidebar disclosure owner and focus restoration, mounted compact expand control, absolute category reorder hit areas, unified desktop/compact global actions, exclusive compact search, narrow session sizing, and reduced-motion-compatible behavior.
- Task 3 verification: 4 focused files / 17 tests passed; `npm run build` passed; 4 responsive viewports plus 3 boot/reload flows passed in 7 Playwright tests.
- Task 4 completed with TDD: Popup landmark/loading/dedupe confirmation and contrast; Options theme/main/group labels/basic-vs-advanced hierarchy/reset confirmation/narrow layout; exact folder-wins migration copy; Intl storage time formatting.
- Task 4 verification: 3 focused files / 21 tests passed; `npm run build` passed; Popup and Options light/dark axe audits each report 0 violations and 0 incomplete checks.
- Task 5 completed with TDD: framework-neutral Manager URL owner, React history adapter, validated workspace create/rename modal, Manager integration, and current-behavior docs.
- Task 5 verification: 6 related files / 59 tests passed; `npm run build` passed; Manager deep-link/history plus responsive/boot flows passed in 8 Playwright tests.
- Task 6 completed the Manager ownership refactor: extracted `ManagerDndCoordinator`, `ManagerFrame`, `useCaptureReveal`, category/workspace/search/global-action owners, and split Manager CSS into 6 stable owner files while preserving public helper contracts.
- Task 6 verification: 5 ownership/contract files / 112 tests passed; `npm run build` passed; Manager deep-link/history, responsive geometry, and boot flows passed in 8 Playwright tests.
- Fetched the latest upstream Web Interface Guidelines on 2026-07-27 (180 lines) for the final project-wide review.
- Final static review round 1 fixed form metadata, Intl date-time ownership, async live regions, image dimensions, drag interaction isolation, consistent destructive confirmation, native prompt replacement, storage-dialog labels, actionable errors, and decorative icon semantics.
- Final static contract verification: focused UI suite 56/56, composer/close suite 34/34, accessibility/storage/schema suite 21/21; production build passed after the first fix batch.
- Browser review round 1: Popup light 0 violations/0 incomplete; Options light 0/0; Manager geometry correct and no runtime errors, with 2 axe violation groups and 2 incomplete groups remaining for landmark/contrast/menu ownership.
- Browser review round 2: Manager light/dark 0/0, Popup dark 0/0, narrow geometry/search pass, and reduced-motion computed styles pass. Remaining: Options dark segmented-control contrast and compact global-action menu ARIA incomplete.
- Browser review round 3: default and compact menus plus Options dark are 0/0; Popup dedupe dialog is 0/0 with focus return. Open Manager import/export and Options Advanced revealed remaining modal-landmark, close-name, and action-contrast issues.
- Final browser loop completed: every audited Manager/Popup/Options default and open state reports axe 0 violations / 0 incomplete, with no runtime page errors.
- Keyboard/focus gates: Add Link focuses URL, destructive confirmation focuses Cancel, Popup and Manager confirmations restore trigger focus on Escape.
- DnD regression gate: restored lost split-CSS geometry/feedback rules, added canonical insertion-index keyboard coordinates, passed 10/10 repeated keyboard reorder and 4/4 complete pointer/keyboard DnD E2E.
- Manual browser DnD acceptance passed all 5 required product paths: session reorder within one category, session move across categories, one saved tab into an existing session, multiple selected Open Tabs into an existing session, and multiple selected Open Tabs into a new session.
- Final verification after the DnD resolver fix and manual acceptance: `npm run check` passed; `npm test` passed 73 files / 957 tests; `npm run test:e2e` passed 19/19; Options Advanced light/dark axe each passed 0 violations / 0 incomplete; `git diff --check` and the final anti-pattern scan passed.
- Refetched the upstream Web Interface Guidelines immediately before completion: 180 lines, SHA-256 `eea73cb6dd46fee9faec9973e8e7fe198b5f07ec326f14d276a56e50287e1cab`.
- Independent completion audit reopened the loop instead of trusting the earlier green state. New findings were reproduced and fixed with RED/GREEN tests: window singular copy, missing control names, lazy images, tabular/Intl numbers, first-frame theme race, mismatched dark theme-color, non-compositor transitions, direct SVG transforms, persistent Tooltip behavior, Trash containment, Title Case/actionable copy, Options Advanced URL state, explicit loading copy, Manager floating landmark ownership, and destructive contrast.
- Final static zero-finding review: 0 prohibited anti-patterns, 0 literal three-dot copy, 0 images missing dimensions/alt/lazy policy, 0 unnamed ActionIcons, 0 unhidden presentational icons, 0 forced Tooltip animations, and 0 raw user-visible count expressions outside the shared formatter. The remaining `data-tab-count={window.tabCount}` is a non-visible machine attribute.
- Final browser review after those fixes: Manager light/dark/default/390px/menu/search/Import/Export/reduced-motion/Tooltip states, Popup light/dark/Dedupe dialog, and Options light/dark/Advanced/Reset open/closed states all report axe 0 violations / 0 incomplete; focus, URL, overflow, theme-color, and modal overscroll probes pass.
- Fresh final verification: `npm run check` passed; `npm test` passed 75 files / 979 tests; `npm run test:e2e` passed 19/19; `git diff --check` passed. No runtime dependency or generated-artifact diff was introduced.
- Prompt-to-artifact completion audit maps every explicit objective, all 13 P0/P1/P2 recommendations, all named commands/gates, every changed-file group, and all product constraints to concrete evidence in `findings.md`.
- Started the separate `$ui-ux-pro-max` review/refactor loop requested after the
  Web Interface Guidelines work.
- Recorded 12 UI/UX Pro Max findings and a three-stage implementation plan in
  `docs/reviews/2026-07-27-ui-ux-pro-max-review.md` and
  `docs/superpowers/plans/2026-07-27-ui-ux-pro-max-refactor.md`.
- Implemented all P0/P1/P2 findings across Manager, Popup, and Options,
  including stable collapsed-sidebar geometry, separate category navigation and
  DnD handles, Save Window, single-click Open Tab focus, touch target policy,
  Popup result prediction, Options draft saves/status, navigation counts, and
  conditional overflow cues.
- Completed the final ownership extraction for Open Tabs, Session Card, and
  Manager DnD. The public coordinators now compose explicit list/header/editor/
  geometry/sensor/overlay owners.
- Updated six stale source-contract assertions to read the new owners without
  removing any behavior checks. Fresh focused evidence: 4 test files / 98 tests
  passed; `npm run build` passed with 7,024 transformed modules;
  `git diff --check` passed.
- Re-ran the UI/UX Pro Max design-system, UX, and React searches. The generated
  portfolio/exaggerated-minimalism/orange system remains a domain
  misclassification and is rejected. The applicable high-priority results are
  keyboard navigation, 44px touch targets, 8px target spacing, predictable
  overflow, stable list keys, and selective memoization.
- Rendered review round 1 used one clean Vite 5173 server after diagnosing the
  repository's fixed HMR port. Manager, Popup, and Options default states each
  reached axe 0 violations / 0 incomplete with no browser page errors.
- Rendered review round 2 found and fixed three compact Open Tabs defects with
  RED/GREEN Playwright evidence: clipped Drag/More row controls in the collapsed
  rail, offscreen/overlapping window-bar focus targets, and 2px-spaced duplicate
  direct Close in the expanded touch drawer.
- Compact behavior now exposes only current Window plus row Focus while
  collapsed, restores the full workflow after Expand Sidebar, and uses
  Select/Drag/Focus/More at 44px with 8px spacing. Focused verification: 4
  Vitest files / 83 tests and the compact E2E scenario pass.
- Rendered review round 3 fixed explicit focus return for Popup Dedupe and
  Options Reset, then corrected Open Tab info actions from unnamed menuitems to
  named ordinary buttons while preserving overlay lifecycle/focus restoration.
- Final browser matrix: Manager desktop/compact/drawer/menu/details/import/
  export/dark/reduced-motion, Popup light/dark/Dedupe, and Options
  light/dark/Advanced/Reset all report axe 0 violations / 0 incomplete.
- Independent completion audit ran fresh gates: `npm run check` passed with 187
  source files free of forbidden edges/cycles and 111 production files passing
  architecture checks; `npm test` passed 76 files / 1,006 tests; `npm run
  test:e2e` passed 26/26.
- Repeated critical gates: `session-dnd.e2e.ts` passed 15/15 over three runs,
  category handle isolation passed 5/5, and compact sidebar geometry passed
  3/3. `git diff --check` passed.
- Fresh browser state-level acceptance passed all 5 AGENTS.md DnD paths:
  same-category session reorder, cross-category move, one saved tab into an
  existing session, multi-selected Open Tabs into an existing session, and
  multi-selected Open Tabs into a new insertion position.
- Dependency/artifact audit found no package, manifest, schema, storage,
  background, generated archive, or tracked browser-artifact diff.

## Next

- Investigate the reported Manager and Options startup delay with production
  extension measurements and an evidence-ranked React performance review.

## 2026-07-28

- Loaded `$vercel-react-best-practices`, `systematic-debugging`,
  `planning-with-files`, `agent-browser`, and verification guidance.
- Recovered the prior structural-sharing and extension E2E performance work;
  retained its rule to optimize authoritative references before scattered local
  memoization.
- Re-read the README, product overview, feature spec, technical architecture,
  current entry points, store hydration owner, Vite configuration, package
  scripts, and the pending UI/UX diff.
- Fresh baseline verification before commit: `npm run check` passed, `npm test`
  passed 76 files / 1,006 tests, and `git diff --check` passed.
- Committed the completed UI/UX refactor as `a90d8f0` so startup performance
  analysis begins from a reviewable clean baseline.
- Initial production build evidence: Manager page synchronously references
  roughly 220 KB page JS plus a 330 KB shared Mantine/theme JS chunk; Options
  references roughly 33 KB page JS plus the same 330 KB shared chunk. Both pages
  also synchronously preload storage authority and page-theme modules.
- Source trace shows both pages render only a loading surface until the shared
  `useStoreHydration()` path completes, even though Options initially needs only
  settings and storage status.
- Built and loaded the real production `dist` extension in isolated Chrome
  profiles with a page-init startup probe. The probe records first useful UI,
  runtime/storage call boundaries, card/row counts, and navigation timing.
- Empty-state baseline: Manager first useful UI 509ms; Options 505ms.
- Medium 62.6KB state (60 sessions / 120 tabs): Manager 726ms; Options
  1,186ms, including an 860ms worker ensure-state call.
- Heavy 2.30MB state (300 sessions / 6,000 tabs): Options produced 708ms and
  1,247ms cold/warm-variance samples; Manager first useful UI was 2,857ms.
  Manager state reads completed by about 757ms, then the first commit mounted
  196 Inbox cards and 3,920 rows over the next ~2.10s.
- CPU profiling significantly perturbed absolute timings and is not used as a
  startup metric. Its shape still confirmed the full-tree cost: about 13,454
  text-shaping operations, 1,833 forced style/layout updates, and substantial
  GC during the heavy Manager mount.
- Confirmed startup protocol: worker ensure-state returns a full normalized
  state that publication discards, then page Storage Authority reads bootstrap
  plus state, and publication reads the same full state again before hydration.
- Confirmed secondary costs: four startup `list-open-tabs` messages in the
  empty run, static Advanced/file-storage modules in Options, per-card overflow
  observers, per-row store/overlay/sortable hooks, O(n²) group index lookup,
  and one diagnostics storage read+write per breadcrumb.
- A reusable median benchmark prototype was attempted outside the repository.
  It was discarded after repeated Playwright/MV3 first-activation navigation
  failures; no failed benchmark output is used as evidence. The implementation
  plan calls for a production benchmark owner with stable extension discovery.
- Wrote the evidence-ranked Chinese review and staged refactor proposal to
  `docs/reviews/2026-07-28-react-startup-performance-review.md`.
- User approved execution of all recommendations. Added and committed the
  implementation design (`b52a4e8`) and task-level TDD plan (`9835114`).
- Task 1 RED: `node --test scripts/startup-benchmark-core.test.mjs` failed
  because the benchmark core did not exist.
- Task 1 GREEN: benchmark core tests pass 4/4 for deterministic state fixtures,
  median calculation, and summary output.
- Added `npm run benchmark:startup` and a production-extension Playwright
  runner. It derives the unpacked extension ID from the canonical dist path,
  verifies the actual MV3 worker ID, seeds state in the worker context, creates
  a separate measured tab, and reports JSON plus a table.
- Benchmark smoke passed for empty state: Manager useful UI 666ms, Options
  useful UI 663ms, and Manager startup recorded 4 `list-open-tabs` calls.
- Task 2 RED replaced the two hydration dependencies with one initializer and
  failed because production still called `ensureState`; it also proved the
  subscription was installed after the initial read.
- Task 2 GREEN: Authoritative Publication subscribes before one
  `initializeAuthoritativeState()` call, buffers read-gap updates, and keeps
  release/dispose generation guards.
- Store hydration now calls `ensureActiveState()` directly and sends zero
  `tabboard-ensure-state` runtime messages. Storage Authority initialization no
  longer pre-reads state before `ensureState()`, so browser startup performs one
  bootstrap read and one canonical state read.
- Fresh Task 2 verification: production build passed; 4 focused files / 119
  tests passed, and the broader storage checkpoint passed 7 files / 143 tests.
- One-run directional benchmark after Task 2: medium Options 544ms versus the
  audit sample 1,186ms; empty Options 617ms. Final claims remain gated on
  five-run medians.
- Task 3 projection core completed RED/GREEN with 7 tests: strict full-settings
  validation, canonical fallback repair, fast-path reads, and cross-context
  subscription.
- Chrome state commits now atomically write canonical state plus the settings
  projection. File commits publish projection plus file ping only after final
  meta commit. Focused projection/adapter evidence passes 28/28.
- Added a page-local `useOptionsSettings` external store. Basic Options reads
  only `tabboardSettingsProjection`, sends existing mutation RPCs, reconciles
  authoritative responses, rolls back failures, and accepts newer
  cross-context projections. Hook tests pass 4/4.
- Split store-free `usePreferredColorScheme(theme)` from the Manager/Popup
  Zustand adapter, so Options no longer imports the application store for theme
  resolution. Options DOM and focused projection/storage suite pass 48/48.
- Service worker startup and file-ping action synchronization now read the
  settings projection instead of full state; focused action tests pass 4/4.
- Production build passes. Five-run large Options median is 443ms with zero
  canonical state reads, meeting the absolute <=500ms gate. The separately run
  empty batch was 749ms, a reverse 306ms difference caused by cold-browser
  batch/order variance rather than data reads; final comparison will interleave
  scenarios and retain raw samples.
- Task 4 RED required `SessionSlot` to become the only ordinary group
  `useSortable` owner while preserving the complete SessionCard contract.
- Extracted group sortable metadata, refs, transforms, activator bindings, and
  drag placeholder into `SessionSlot`. SessionCard remains the state/command
  owner and drag-overlay cards remain static without sortable registration.
- Task 4 verification: 3 focused files / 39 tests passed, production build
  passed, and `session-dnd.e2e.ts` passed 5/5 across pointer, keyboard, Escape,
  and category-handle paths.
- Task 5 RED established bounded/monotonic activation, context reset, forced
  activation, and no-IntersectionObserver fallback. Hook tests pass 5/5.
- Added `SessionCardShell` and stable session slots. All 60 slots remain
  mounted in the E2E fixture, only the first 6 cards mount full tab interaction
  trees, and a far shell upgrades after horizontal scroll.
- Task 5 focused evidence: 5 files / 59 tests passed, production build passed,
  and combined large-board plus session/category DnD E2E passed 7/7.
- Fresh production five-run large benchmark: Manager median useful UI 487ms
  versus the prior 4,560ms; first interactive rows 120 versus 3,920; longest
  task 158ms versus 2,289ms; startup Open Tabs calls 1. Large Options median
  478ms with zero canonical state reads.
- Diagnosed and guarded a benchmark-order trap: Vite E2E rewrites `dist` to a
  CRXJS dev loader. The benchmark now rejects dev-mode dist and must run after a
  production build. Seeding uses the projection-only Options page so heavy
  Manager rendering cannot contaminate pre-measurement setup.
- Task 6 RED/GREEN added a framework-neutral refresh coalescer. Idle event
  bursts collapse after 75ms, an in-flight burst creates at most one trailing
  request, and disposal cancels pending work; core tests pass 3/3.
- Open Tabs initial/manual refreshes are immediate; focus, visibility, tab, and
  window lifecycle events use the coalescer. Own extension page creation/update
  events are ignored.
- Added a real hook event-burst test with a suspended initial worker request.
  Focus/tab/window events produce no parallel request and exactly one trailing
  request after completion. Open Tabs focused verification passes 30/30 and
  production build passes. The production heavy benchmark records one startup
  `list-open-tabs` call.
- Task 7 RED added canonical group-index and SessionCard command-port
  contracts. `getCanonicalGroupIndexById` now replaces per-visible-group
  `findIndex`, category counts use one workspace-group pass, and DnD replacement
  snapshots use structurally stable group-array references instead of joining
  every group/tab id and timestamp.
- TabItemRow no longer imports or subscribes to the Zustand application store.
  SessionCard owns stable update/delete/confirmation command ports and passes
  them through SessionTabList.
- Combined Task 6-7 verification: 8 focused files / 177 tests passed and the
  production build passed.
- Task 8 diagnostics RED/GREEN batches info breadcrumbs for 250ms into one
  storage read/write while warn/error entries trigger the batch immediately.
  Diagnostics focused tests pass 9/9, including the bounded 100-entry ring.
- Options Advanced now owns Data Storage, Safety, Keyboard/Reset, and reset
  confirmation in a `React.lazy` chunk with Suspense and an actionable load
  error. The closed disclosure mounts none of that optional UI.
- Storage Authority now literal-imports `fileStorage` and `fsDirectory` only
  after a file-mode operation is selected. Browser bootstrap invokes neither
  loader; file bootstrap invokes each cached loader once. Existing migration,
  rollback, fallback, reconnect, and file persistence regressions remain green.
- Task 8 focused verification passes 4 files / 56 tests. Production build
  splits `fileStorage` (9.78 kB), `fsDirectory` (1.23 kB), and Advanced Settings
  (16.52 kB) into dynamic chunks. Manager/Popup preload only the 12.32 kB
  Authority; default Options preloads neither Authority nor file UI/backend.
- Fresh five-run empty production benchmark: Manager median useful UI 275.5ms,
  Options 406ms, Options canonical state reads 0, Manager startup Open Tabs
  calls 1, and maximum observed longest task 64ms.
- Final Vercel practices re-review found one remaining P2 render cost: Manager
  overlays and Open Tabs still serialized all visible item identities into
  lifecycle strings. Replaced those strings with structurally shared
  group/filtered-tab references while preserving expected-removal focus rules.
- The benchmark scheduler now interleaves scenario/page samples by round and
  reverses alternate rounds, reducing batch-order and machine-warmup bias.
  Benchmark core RED/GREEN passes 5/5.
- Stable lifecycle reference focused verification passes 5 files / 122 tests;
  production build passes and the Manager entry decreased from 225.40 kB to
  224.97 kB raw.
- Current behavior docs now describe one-read hydration, SettingsProjection,
  stable-slot activation, Ctrl+F tradeoff, coalesced Open Tabs refresh,
  conditional modules, and diagnostics batching. D050 partially supersedes
  D033 for session interaction DOM while leaving Open Tabs full-row behavior
  unchanged.
- Final rotated five-run production benchmark: empty Manager 250.1ms, large
  Manager 478.0ms with 6 cards / 190 shells / 196 slots / 120 rows, longest
  task 163ms, and one Open Tabs request. Empty Options is 405.4ms; large
  Options is 369.5ms, a 35.9ms difference with zero canonical state reads.
- Medium Options in the full 35-profile suite records a 790.4ms median, while
  its standalone 4-run median is 454.0ms. Instrumentation places almost the
  entire slow interval inside `chrome.storage.local.get` for the projection;
  React reaches useful UI about 18ms after that I/O returns. No Chromium
  process leak remains, so the raw outlier is retained as cold storage noise.
- Final static gate initially found a type-only SessionSlot/Card/Shell import
  cycle. Extracted `SessionSortableBindings.ts`; the strict graph then passes
  with 201 source files and the architecture gate passes 120 production files.
- Full Vitest checkpoint found two stale tests that expected Chrome state writes
  without the projection sidecar. Updated them to require canonical state and
  SettingsProjection in the same atomic write. Fresh full Vitest passes 81
  files / 1,037 tests at that checkpoint.
- Full E2E exposed two acceptance-level issues: diagnostics tests read before
  the 250ms batch and preview Chrome did not preserve virtual storage across
  reload; Open Tabs also rebuilt equal refresh rows and closed a newly opened
  preview. Added preview storage persistence, empty-query/reference structural
  sharing, equivalent refresh sharing, and current-protocol diagnostics gates.
- Playwright checkpoint passes 27/27, including diagnostics reload,
  80-to-81 Open Tabs refresh, large-board activation, responsive geometry, and
  pointer/keyboard session/category DnD.
- Final rendered review found and fixed dark Manager native-button contrast by
  owning semantic foreground at `.manager-shell`. Manager desktop/compact,
  light/dark/reduced-motion, session menu and Open Tab details now report axe
  0 violations / 0 incomplete, with no overflow or page errors.
- Production Options default/Advanced and explicit Light/Dark/System at 390px
  report axe 0/0 after moving selected segmented-control background/foreground
  onto the label and removing its color transition. Default Advanced stays
  unmounted; opening it loads the optional chunks on demand.
- Added a repeatable five-path pointer DnD acceptance spec. It verifies
  persisted state for same-category session reorder, cross-category move,
  saved tab to existing session, multi-selected Open Tabs to existing session,
  and multi-selected Open Tabs to a new session. Fresh result: 5/5.
- A final benchmark rerun exposed cold `chrome.storage.local.get` stalls that
  could push empty Options past 500ms even though React completed about 20ms
  after projection I/O. Options now mounts the header and a disabled/busy Basic
  fieldset immediately; controls and Advanced enable only after hydration.
- Fresh final scenario medians after shell decoupling: empty Options 469.4ms,
  large Options 435.4ms (34.0ms difference, zero canonical reads); large
  Manager 536.7ms with 120 rows, one Open Tabs request, and 182ms maximum long
  task. Projection I/O may finish after useful Options UI without blocking it.
- Final post-fix verification: `npm run check` passed (201 source files, 120
  production architecture files); `npm test` passed 81 files / 1,040 tests;
  `npm run test:e2e` passed 32/32 including the five persisted-state DnD paths;
  `git diff --check` passed.

## 2026-07-28 Design Taste Review

- Loaded `design-taste-frontend` and applied it contextually: the skill itself
  says it is not a dashboard/multi-step product UI workflow, so landing-page
  defaults were excluded.
- Re-read current product docs, architecture, prior UI/UX review, Manager,
  Popup, Options owners, and the current Mantine/Tabler theme.
- Used `agent-browser` against the live preview. Manager and Popup axe checks
  report 0 violations / 0 incomplete.
- The default Manager fixture reproduced the highest-impact UX issue: Inbox was
  empty while Saved and a custom category contained sessions, so a populated
  product opened on an empty main surface.
- Opened Saved and verified the populated session structure; saved rows use
  generic link icons even though `favIconUrl` is stored and used by Open Tabs.
- Measured Options at 1280x900: the 688px Basic form is appropriately dense,
  while Advanced reintroduces nested shadow cards inside a framed disclosure.
- Traced Options save feedback to a synchronous local `savePending` toggle that
  does not represent the asynchronous authoritative mutation queue.
- Traced Restore settings to runtime branches: `restoreNextToCurrent` is ignored
  whenever `restoreGroupsInNewWindow` selects the new-window branch.
- Wrote the Chinese review, three approaches, recommended owner-local refactor,
  three implementation stages, preserved constraints, and verification plan to
  `docs/reviews/2026-07-28-design-taste-review.md`.
- No product code or runtime dependency was changed in this review phase.

## 2026-07-28 Design Taste Implementation

- Wrote the task-level TDD plan at
  `docs/superpowers/plans/2026-07-28-design-taste-optimization.md`.
- Stage 1 implemented authoritative Options save status/Retry, Restore
  Destination/Placement, and Manager bare-entry category preference.
- Stage 2 made workspace context visible, moved category drag activators into an
  explicit reorder mode while preserving ordinary category droppables, and
  introduced one shared Favicon primitive.
- Stage 3 flattened ordinary Advanced sections, restored TabBoard branding,
  demoted duplicate cleanup, and removed session resting shadows.
- Updated Feature Spec, Technical Architecture, Feature Evolution, and D051.
- Post-implementation taste Round 1 found compact reorder overlap. Added a real
  390px regression and fixed it with an exclusive toolbar lane.
- Round 2 found visible em-dashes and non-zero Popup letter spacing. Added copy
  and style contracts and removed both.
- Round 3 found incomplete duplicate copy, a 22px Retry action, and stale
  same-field queue errors. Added RED/GREEN coverage and fixed all three.
- Round 4 repeated the complete static/rendered matrix and produced no new
  recommendation.
- Corrected the production benchmark after instrumentation proved automatic
  new-tab startup ran before `page.goto`; page-local Inbox preference now keeps
  large Manager measurement on the intended 196-slot board.
- Fresh final evidence: `npm run check` PASS; 85 files / 1,061 Vitest PASS;
  serial Playwright 33/33 PASS; large Manager 560.4ms at 6/190/196/120 and
  Options 367.5ms with zero canonical reads.

## 2026-07-30 Crisp Utility Gap Previews

- Reopened the persisted Visual Companion on its previous port/token and
  started an 8-hour review session.
- Published the first new interactive screen:
  `crisp-utility-selection-filter-scope-v1.html`.
- The screen compares visible-result, whole-window, and reset-on-filter Select
  All semantics and exposes ordinary, empty selection, partial, all, filtered,
  and hidden-selection states.
- Self-review fixed small-text contrast and a hidden context-layer overflow.
- Final preview evidence: axe 0 violations / 0 incomplete; sidebar, context bar,
  topbar, and review panel have no horizontal overflow.
- Serial interaction verification passed: empty selection keeps selection mode
  with Save disabled; filtered context shows `2 of 8 open tabs`; hidden
  selections remain countable in option A; whole-window option selects all
  eight; reset option clears selection on filter.
- User confirmed option A for Preview 1: Select All / Unselect All is scoped to
  visible filtered rows, hidden selections remain selected, Save Selected uses
  the complete selection, and Save All ignores the text filter.
- Started Preview 2 for the explicit collapsed / peek / pinned / compact drawer
  sidebar state machine.
- Published `crisp-utility-sidebar-four-state-v1.html` with real hover, focus,
  pin, collapse, viewport, scrim, and Board-interaction transitions.
- Preview 2 self-review fixed compact-switch contrast, keyboard Peek focus
  transfer, focusout timing, and visually hidden disclosure controls remaining
  in the Tab sequence.
- Verified desktop geometry: collapsed Board offset 53px; Peek sidebar 238px
  with Board offset 53px and Board active; Pinned Board offset 239px with Board
  active.
- Verified compact geometry: Drawer sidebar 270px, Board offset 53px, topbar
  and Board inert, close/scrim paths available.
- Verified hover delay: 200ms remains Collapsed; 400ms reaches Peek. Keyboard
  focus moves from Expand to Pin and Enter promotes Peek to Pinned.
- Final Preview 2 static evidence: axe 0 violations / 0 incomplete, no page or
  product-surface horizontal overflow, and no visually hidden focusable control.
- User confirmed all four sidebar states and transitions. Icon concerns seen
  in this screen are deferred to the later global icon review.
- Started Preview 3 to compare keyboard-equivalent DnD paths after removing all
  visible Open Tab and Session drag icons.
- Published `crisp-utility-dnd-keyboard-path-v1.html` with complete Session and
  Open Tab paths for More Commands, Focusable Surface, and Arrange Mode.
- Preview 3 self-review removed closed menus, inactive Arrange controls, and
  option-specific actions from the Tab sequence; it also avoided nested button
  semantics by focusing only Open Tab text surfaces in option B.
- Option A verification: Session Move Left changes the real visual order and
  restores focus to Session More; Open Tab Add to Session updates the target
  count and restores focus to Open Tab More.
- Option B verification: Space picks up the focused Session summary, ArrowRight
  changes order, Space drops, and focus remains on the same session summary.
- Option C verification: Arrange Mode exposes six Session move controls plus
  five Open Tab Add to controls, hides ordinary row More, and moves sessions.
- Final Preview 3 evidence: axe 0 violations / 0 incomplete at page top, zero
  visually hidden focusable controls, and the open Session menu remains fully
  inside the app bounds.
- User confirmed option B for Preview 3: focusable Session summary and Open Tab
  text surfaces use Space / Arrow / Space / Escape for keyboard DnD while
  Enter/F2 preserve primary edit/open semantics.
- Added a final menu-content review phase covering Global, Workspace, Category,
  Session, Saved Tab, Open Tab, Selection, and context-only menus.
- Started Preview 4 to confirm that the read-only hover/focus tooltip and the
  interactive More menu are separate surfaces with separate semantics.
- Published `crisp-utility-tooltip-menu-separation-v1.html` with Open Tab and
  Saved Tab data, one shared tooltip, focus/hover variants, vertical/horizontal
  collision controls, and a separate focus-managed menu.
- Preview 4 verification: exactly one tooltip instance; Open Tab omits time;
  Saved Tab includes time; title/link clamps are 2/4; pointer-events is none;
  right collision leaves an 8px inset; top collision flips below at 6px.
- More verification: Tooltip closes before role=menu opens, first menu item
  receives focus, no simultaneous tooltip/menu state exists, and Escape returns
  focus to the source More button.
- Tooltip accessibility now keeps every trigger described by one hidden text
  owner regardless of visual A/B mode. Idle axe is 0 violations / 0 incomplete,
  hidden focusable controls are zero, and tooltip text contrast ranges from
  5.56:1 to 11.03:1.
- User confirmed option A for Preview 4: both pointer hover and keyboard focus
  show the same read-only visual tooltip, while screen-reader description stays
  on the separate hidden text owner.
- Started Preview 5 for selected-window versus Chrome-focused-window semantics,
  raw/visible/filtered counts, and a persistent collapsed-rail filter indicator.
- Published `crisp-utility-window-filter-indicator-v1.html` with deliberately
  separate Manager selected and Chrome focused windows, three count scopes,
  retained query behavior, and three rail indicator options.
- Preview 5 self-review made collapsed favicon rows semantic Focus Tab buttons,
  explicitly removed hidden Filter controls from the Tab sequence, and moved
  preview feedback to a hidden live region.
- Verified initial semantics: Manager selected 8-tab window, Chrome focused
  12-tab window, raw count 8, Open Tabs rows 7. Idle axe passes 0/0.
- Verified filter/collapse semantics: `docs` produces 2 of 7, B shows only the
  count badge, rail is 52px, Expand announces the result/total, and there are no
  hidden focusable controls.
- Verified state independence after switching selected window and moving Chrome
  focus: selected remained the 12-tab window, focus moved to the 4-tab window,
  and retained query produced raw 12 / Open Tabs 10 / filtered 2.
- Verified A/B/C indicator switching exposes exactly one indicator at a time;
  final preview is restored to recommended B with Filter active and rail
  collapsed. Final collapsed axe passes 0 violations / 0 incomplete.
- User confirmed option A for Preview 5: collapsed rail uses a quiet status dot
  for an active Filter; result/total remains in the Expand accessible name.
- Started Preview 6 for Popup mixed regular/pinned capture outcomes and
  removable-versus-protected duplicate semantics.
- Published `crisp-utility-popup-pinned-semantics-v1.html` with three copy
  strategies and six independently derived capture/dedupe scenarios.
- Verified Mixed dynamic copy: 7 saved, 5 regular closed, one removable
  duplicate, one protected pinned duplicate, and `Save and remove regular
  tabs`.
- Verified Pinned Only: 3 saved, zero closed, no Remove row, and `Save and keep
  in window`. Pinned Excluded saves/closes only five regular tabs and explicitly
  says pinned tabs are not saved but stay open. Keep All saves seven and closes
  zero.
- Verified No Pinned removes the entire pinned control with no reserved gap and
  uses `Save and remove from window`. Only Pinned Dupes reports two protected,
  zero removable, and removes separator/Remove from visual and keyboard state.
- Preview 6 contains no Group filtering text or controls; the popup and body
  have no horizontal overflow. Final self-review: zero hidden focusable
  controls and axe 0 violations / 0 incomplete. Default restored to option A +
  Mixed.
- User selected B Generic with one deliberate dynamic dimension: the main
  helper follows only the global save-and-close setting. The accepted copy is
  initially `Save and remove tabs from window` when enabled and
  `Save and keep tabs in window` when disabled.
- Updated Preview 6 to make the setting-aware B strategy the single confirmed
  option. Mixed/regular/pinned composition no longer changes the main helper;
  pinned-specific behavior remains in its checkbox helper.
- Re-verified all six Popup scenarios in the browser. The main helper changes
  only for the Keep All scenario; pinned-only still uses the enabled
  save-and-close policy copy while its subordinate note states that pinned
  tabs stay open.
- Final confirmed Popup evidence: axe 0 violations / 0 incomplete, no hidden
  focusable controls, and no horizontal overflow in the 320px Popup, body, or
  preview frame.
- Started Preview 7 for Options storage status and recovery semantics.
- Rendered feedback showed the enabled helper truncating in the fixed 320px
  Popup. Kept the 12px helper size and shortened the setting-aware pair to
  `Save and close tabs` / `Save and keep tabs open`.
- Measured both shortened Popup helpers in the real 194px text column.
  `scrollWidth === clientWidth` in both settings, so neither helper truncates.
- Published Preview 7 at
  `crisp-utility-options-storage-status-v1.html`, comparing configured-target,
  active-backend, and explicit dual-status fallback semantics.
- Exercised all 15 strategy/state combinations across Browser, Folder Ready,
  Permission Lost, Folder Missing, and Reconnecting. The 680px Options surface
  has no horizontal overflow and no hidden focusable control.
- Preview 7's first axe pass found the 10px update timestamp at 3.59:1.
  Darkened only that secondary text color; final axe is 0 violations /
  0 incomplete.
- User confirmed Preview 7 option A, Configured Target First. Fallback keeps
  Local Folder as the primary context and identifies Browser storage as the
  temporary writer; only explicit switch-back changes the configured target.
- Started Preview 8 for the confirmed Lucide icon mapping across actual
  Manager, Popup, and Options light/dark interaction states.
- Published `crisp-utility-icon-theme-state-matrix-v1.html` with all 16
  confirmed mappings, 11 auxiliary production semantics, paired A1/D1 product
  surfaces, and normal/hover/selected/disabled/danger states.
- A fresh agent-browser session failed to create its local socket. Reused the
  healthy existing Visual Companion browser session for Preview 8 verification.
- Preview 8 geometry pass confirmed 16 mappings, 32x32 icon buttons, 18x18
  glyphs, global stroke 1.75, no horizontal overflow, and no hidden focusable
  controls in either A1 or D1.
- The first computed-state probe found Preview 8's Light selected/danger cells
  missing their local semantic token bridge while Dark was correct. Fixed the
  preview token scope before accessibility and screenshot review.
- Preview 8's first axe pass found only preview defects: micro-scale muted text
  below AA, duplicate light/dark landmark names, and aria-label on roleless
  Window spans. It also exposed a semantic issue: opening Bin is navigation,
  not danger. Raised muted contrast, made Window glyphs real buttons, removed
  duplicate preview landmarks, and reserved danger for destructive commands.
- Final Preview 8 axe passes with 0 violations / 0 incomplete. Full-page
  screenshot capture stalled despite a responsive page; interrupted it and
  retained the already-complete geometry, computed-state, and accessibility
  evidence before switching to a viewport capture.
- The viewport screenshot also stalled while every non-screenshot browser
  command remained healthy. Interrupted it and stopped retrying the same
  automation failure; the user's live Visual Companion tab is the visual
  review surface.
- Verified the Both/Light/Dark switch: both renders two 432px columns; each
  single-theme view renders one 720px column and hides only the other sample.
  The preview is restored to Both for user review.
- User paused icon-state confirmation to review popup menu style and command
  contents first.
- Audited all menu owners against current code, feature/product docs, the
  latest Web Interface Guidelines, and UI/UX Pro Max keyboard/focus guidance.
- Found four current application `role=menu` surfaces: Global, Workspace,
  Category, and Session. Saved Tab and Open Tab actions still live in the old
  interactive info popover and must move to separate menus under the confirmed
  read-only Tooltip contract.
- Separated Chrome-native context menus from in-app menu styling, and excluded
  Selection bars, Tooltip, dialogs, and Select controls from the popup-menu
  inventory.
- Published `crisp-utility-popup-menu-review-v1.html`. It compares A Quiet
  Command, B Dense Native, and C Descriptive with identical commands, and can
  switch among Global, Workspace, Category, Session, Saved Tab, and Open Tab.
- The initial accessibility snapshot confirms every sample exposes real
  menu/menuitem semantics. The default Session proposal adds Edit Session Note,
  gives Move to Category a submenu affordance, and keeps Restore out of More.
- Measured all 18 type/style combinations. A menu heights are Global 121px,
  Workspace 189px, Category 112px, Session 309px, Saved Tab 155px, and Open Tab
  121px; none overflow horizontally. Session B is 261px while descriptive C is
  441px, confirming A as the best density/readability balance.
- Keyboard verification passed wrapped ArrowUp/ArrowDown plus Home/End, and
  focus can return to the trigger. D1 uses graphite surface, readable foreground,
  and distinct danger color without overflow.
- Preview 9's first axe pass exposed the selected-style implementation fading
  entire B/C cards to 72% opacity. Removed opacity-based selection, retained
  border/code markers, hid decorative style codes from the accessibility tree,
  and added a 44px coarse-pointer item floor.
- The second axe pass left one 4.3:1 helper-text node in C's hovered item.
  Strengthened the shared menu secondary token; final Preview 9 axe is
  0 violations / 0 incomplete, and `git diff --check` passes for planning
  artifacts.
- Visual Companion later exited on its idle timeout. Restarted it from the
  same project directory on the preserved port/token with an 8-hour timeout,
  restored Preview 9 into the new session content directory, and verified the
  rendered page title through both HTTP and agent-browser.
- User selected B2 menu density with C3 descriptions shown as delayed item
  tooltips, and substantially revised menu/selection ownership.
- Recorded the new row contract: Open Tab has no application menu and exposes a
  hover/focus Close X; Saved Tab exposes a hover/focus Delete X plus a
  right-click/keyboard context menu without Select; both overlay the favicon
  with the checkbox.
- Recorded Workspace emoji persistence plus dedicated create/manage preview
  requirements; recorded direct Category drag plus Manage Categories as the
  only reorder paths, superseding explicit reorder-only.
- Recorded Session `Select Tabs` semantics and local list-scoped selection
  ownership. A separate Session selection toolbar preview is required before
  implementation.
- Published Preview 10,
  `crisp-utility-row-menu-selection-revision-v1.html`, in the restarted Visual
  Companion session. It integrates hover/focus checkbox + X disclosure, B2
  context menus, C3 delayed item tips, Workspace emoji rows, and Open/Saved
  selection entry.
- Verified hover geometry for both Open and Saved Tabs: checkbox and X are
  visible while the favicon is hidden. First selection enters the owning mode;
  clearing the final item leaves 0 selected; entering another list exits and
  clears the prior scope.
- Verified Saved Tab context contents, no Open Tab application menu, Session
  Select Tabs at 0 selected, Workspace inline Pencil rename, tooltip collision
  clamping, and no overflow/hidden focusable controls.
- Verified Shift+F10 first-item focus plus Escape trigger focus return. Final
  Preview 10 axe is 0 violations / 0 incomplete and the page is restored to
  Ordinary for user review.
- User screenshots revealed Workspace leading-column waste/missing current
  highlight and Open/Saved checkbox/text alignment defects. Traced them to
  emoji concatenated into labels, absent current state, 14px checkbox versus
  16px favicon, and inline title/meta spans.
- Updated Preview 10 structurally: separate Workspace emoji/label/action data,
  shared 18px icon slot and 5px gap, active Personal background, 16px checkbox
  visual, and grid/block row text layout.
- Fresh geometry verifies all Workspace items share identical icon/title
  positions, emoji and Lucide are both 16px, checkbox/favicon centers and sizes
  match, and Open/Saved title/meta render on separate lines. Final axe remains
  0/0; no page/app overflow or hidden focus targets; `git diff --check` passes.
- A second user screenshot still showed an oversized Pencil and apparent
  checkbox/favicon drift. Re-measured the actual visual boxes, not only parent
  centers: native button padding was still part of the checkbox rendering, and
  Pencil's diagonal glyph filled a 16px SVG more aggressively than adjacent
  icons.
- Preview 10 v3 clears checkbox padding and anchors its bordered visual with
  2px inset, producing the exact same 16x16 box and `(56, 323)` coordinate as
  the favicon. Reduced Pencil to 14x14 while preserving and centering it in the
  18x18 action slot. Fresh axe is 0/0 and `git diff --check` passes.
- User confirmed Preview 10 and asked to continue. Locked the revised menu,
  row fast-action, and selection-entry contract; started the dedicated Create
  Workspace and emoji-picker preview.
- Published Preview 11,
  `crisp-utility-create-workspace-emoji-v1.html`, with A inline favorites, B
  searchable popover, and C free emoji input at full dialog size plus a live
  B2 Workspace-menu result.
- Verified A grid arrow movement, name empty/duplicate validation, B search and
  auto-close, C normal-text rejection and ZWJ emoji acceptance, and menu
  emoji/title geometry.
- Added explicit B Escape close and focus return after its rerendered trigger.
  Final Preview 11 axe is 0/0, no hidden focus targets or overflow, and
  `git diff --check` passes. Restored the page to A + Valid for review.
- User selected Preview 11 option A Inline Favorites. Locked the 16-choice
  inline grid plus Custom grapheme contract and started Manage Workspaces.
- Audited Workspace mutations and safety boundaries. Reorder needs a new typed
  mutation; delete cascades Sessions/Categories/order, cannot remove the only
  Workspace, and is blocked by locked Sessions.
- UI/UX Pro Max had no exact match for the first narrow query, so broadened to
  list management and used the returned confirmation, inline validation, and
  success-feedback guidance for Preview 12.
- Published Preview 12, `crisp-utility-manage-workspaces-v1.html`, with A Dense
  Rows, B Select + Inspector, and C explicit Edit Mode plus real delete
  confirmation states.
- Removed duplicate emoji edit entry and visible drag handles from A. Whole-row
  pointer drag shares ordering with Move Up/Down; row actions are enabled in the
  keyboard order only while hover/focus reveals them.
- Fixed C read-only action leakage and Edit Mode tab-order activation. Centered
  confirmation over an inert manager modal and added locked/only Workspace
  blocked states with Cancel focus.
- Final Preview 12 verification: A/B/C state transitions, reorder, Inspector,
  locked/only delete, focus policy, and containment pass; axe 0/0, no hidden
  focus targets or overflow, `git diff --check` passes.
- User required individual Workspace editing to reuse the confirmed Create
  Workspace modal and removed separate Rename/Change Emoji actions.
- Created Preview 12 v2. Removed inline/Inspector direct forms and reduced every
  row to ordering, one Edit, and Delete. A/B/C all open the same prefilled Edit
  Workspace modal with inline favorites, Custom emoji, live preview, and shared
  validation.
- Verified duplicate name, invalid/valid custom emoji, atomic name+emoji save,
  legacy custom emoji, Cancel/Escape focus return, and no direct Inspector
  inputs. Final v2 axe is 0/0 with no hidden focus targets or overflow;
  `git diff --check` passes.
- User selected Manage Workspaces option A Dense Rows and locked the single
  shared Edit Workspace modal.
- Started Manage Categories analysis. Built-in categories are reorderable but
  immutable; custom categories are editable/deletable. Direct topbar whole-tab
  drag and management-row ordering must share the existing typed category-order
  mutation, and locked Sessions block category deletion.
- Published Preview 13, `crisp-utility-manage-categories-v1.html`, comparing A
  unified dense list, B Built-in/Custom sections, and C compact table while
  showing the real topbar Category strip above the manager.
- Added shared New/Edit Category name+color modal, row drag and Move Up/Down
  synchronization, custom-only Edit/Delete, locked delete confirmation, and
  topbar pointer activation threshold with insertion marker.
- Verified 3px click vs 7px drag, topbar/manager order identity, Create/Edit
  validation/color flow, Built-in/Custom permissions, locked delete, keyboard
  focus policy, and A/B/C geometry. Final axe is 0/0, no hidden focus targets
  or overflow, and `git diff --check` passes.
- User selected Manage Categories option A Unified Dense List.
- Added a dedicated later DnD review covering Workspace, Category, Session,
  Saved Tab, selected tabs, Open Tab copy, target feedback, cancellation, and
  keyboard paths. Kept it separate from current selection-toolbar design.
- Started Preview 14 for Session-local Saved Tab selection. Audited current
  code: selection mode is still derived from selected IDs and only supports
  selected drag payloads; batch Restore/Copy/Delete toolbar commands require
  new explicit owners.
- User selected Preview 14 option A Icon Toolbar and explicitly deferred all
  inconsistent Workspace/Category/Session/Saved/Open Tab drag feedback to one
  dedicated all-scenarios review.
- Ran fresh option A browser checks across Empty, Links, Mixed, Notes, Locked,
  and Filtered. The action availability and Link-vs-Note scopes match the
  intended contract; Filtered preserves hidden selection while Select All
  remains visible-row scoped.
- Measured the confirmed 430px Session: the contextual header remains 58px,
  every icon action is 32x32, and document/body overflow plus hidden focusable
  controls are all zero.
- The first final axe pass had 0 violations but 1 incomplete because decorative
  mock favicon letters were too short for automated contrast classification.
  Removed the decorative letters and added Escape/focus-return behavior to the
  comparison-only C selection menu before the final rerun.
- Final Preview 14 verification passes: C menu Escape returns focus, Filtered
  Select All changes three total selections with one visible to five total with
  three visible, Exit restores the normal Session header, and the page returns
  to A + `0 selected`. Axe is 0 violations / 0 incomplete; final screenshot is
  `/tmp/tabboard-session-selection-a-final.png`.
- Restored the byte-identical Preview 8 icon theme/state matrix from its prior
  Visual Companion session into the current live session. Fresh checks confirm
  all 16 selected mappings, A1/D1 432px side-by-side samples, 32px actions,
  18px glyphs, 1.75 stroke, no overflow or hidden focus targets, and axe 0/0.
- User confirmed the restored icon theme/state matrix. Started the dedicated
  all-scenarios DnD review and audited the current `@dnd-kit` payload, target,
  geometry, overlay, source replacement, sensor, and E2E contracts.
- Published DnD Preview 1,
  `crisp-utility-dnd-feedback-system-v1.html`, comparing A Anchored Insertion,
  B Live Reflow, and C Destination Outline across Workspace, Category, Session,
  Saved Tabs, and Open Tabs. Each object exposes its real reorder/move/copy
  variants plus Ready/Pickup/Target/Invalid and Replay states.
- Fixed Preview 1 geometry after browser traversal: anchored every pointer
  preview to the workbench coordinate system, reserved one placeholder per
  selected Saved Tab, kept Open Tab copy sources unchanged, moved target-state
  previews into a stable lane above the workbench, and replaced pseudo/text
  decorative layers with CSS geometry that axe can evaluate.
- Final DnD Preview 1 evidence: all 10 option-A subscenarios independently pass
  axe 0/0; 158x48 compact preview, 3px insertion marker, zero page/body/stage
  overflow, zero hidden focus targets, and zero visible drag icons. Replay was
  observed at Ready, Pickup, and Target in order. The page is restored to
  A / Session / Same category / Target for user review.
- User rejected retained source placeholders and requested live target
  occupancy. The first interpretation incorrectly collapsed move/reorder
  sources at Pickup; the later corrected model treats source as the initial
  current target and changes order only after entering a new target.
- Created DnD Preview 1 v2,
  `crisp-utility-dnd-live-reflow-v2.html`, as one Live Target Reflow system
  rather than another A/B/C comparison. Target states rebuild the displayed
  ordering from the real mutation semantics, including removal of emptied
  unlocked source Sessions.
- The first v2 state-matrix probe failed because it assumed every Target state
  retained a `.drag-overlay`; v2 intentionally replaces that pointer overlay
  with an in-flow `.live-slot` at the target. Updated the probe contract to
  allow no overlay at Target and require the in-flow slot instead.
- User corrected the v2 state model: Pickup keeps the dragged object in its
  source slot because source is the first current target. Reworked all 10
  subscenarios so Pickup order equals Ready order, a new valid target alone
  changes order, and Invalid preserves the last valid target.
- Added stable reflow keys and FLIP transitions for existing objects. Session
  Replay now records zero sibling displacement at Pickup, Research shifting
  only when Startup moves to the new Target, and zero displacement when Target
  becomes Invalid. The current target runs the 170ms occupancy emphasis.
  Reduced-motion CSS disables transition/animation timing.
- Fixed preview-only accessibility defects: removed opacity from live occupant
  text, replaced the copy `+` pseudo-element with an `aria-hidden` node, and
  moved Pickup/Invalid pointer previews above the workbench. All 10 Target
  scenes and representative Active/Invalid scenes now pass axe 0/0 with no
  overflow, hidden focusables, or visible drag handles.
- Added Escape cancellation and focus restoration. A full state-matrix probe
  confirms every subscenario has one current target in Pickup/Target/Invalid,
  `Pickup == Ready`, and `Invalid == last Target`. Twenty-four serialized axe
  checks pass 0/0; the preview is restored to
  Session / Same category / Pickup at source.
- User questioned why Saved/Open New Session showed a target in Ready/Pickup.
  Corrected the preview: New Session targets are transient insertion targets
  and do not exist until the pointer enters that target. Ready/Pickup now show
  only existing Sessions; Target/Invalid show the newly inserted Session slot.
  Other Session remains distinct by inserting into the existing Research queue.
- Re-evaluated the control model and removed Existing/New as preselected
  subscenarios. Saved and Open Tabs now use one payload view with
  Ready, Pickup, Existing Target, New Session Target, and Invalid states.
  Verification confirms Ready/Pickup share one baseline, both target outcomes
  are reachable without resetting the payload, Invalid preserves the last
  target type, and Escape restores Ready.
- Serialized axe checks pass 0/0 for both five-state Saved/Open flows after
  target-entry animation settles. The preview is restored to
  Saved Tabs / Selected Tabs / Pickup for direct Existing-vs-New comparison.
- User required a deliberately precise New Session action. Replaced implicit
  insertion regions with 20x20 plus targets centered in each Session gap.
  Verification confirms the hit box equals the icon box, entering expands one
  New Session slot, and Leave/Invalid removes it immediately and restores the
  plus targets.
- Added Saved Tabs `All Source Tabs`: it exposes Ready/Pickup/Existing/Invalid
  only, renders no plus targets, and still permits explicit merge into an
  existing Session. Partial Saved selection and Open Tabs keep the plus targets.
- User revised plus activation semantics. Plus Active now only highlights one
  20x20 target and shows a pointer-transparent
  `Release to create session` tip; no slot or reflow occurs before release.
  Leave immediately restores resting pluses, and Released alone renders the
  resulting New Session. Plus Active, Leave, and Released each pass axe 0/0.
- Added the selected-tab drag ghost requested in screenshot review. Saved/Open
  Plus Active now shows three real tab rows in a 58%-alpha, pointer-transparent
  stack below the active plus; the plus remains z-indexed above it. Leave
  removes both ghost and tip, Released creates the Session, and All Source Tabs
  renders none of these New Session affordances.
- The transparent ghost produces no axe violations; axe reports one incomplete
  because its intentional overlap prevents automatic contrast calculation for
  covered board text. Geometry, z-order, pointer events, and readable ghost
  content were verified directly.
- Published DnD Preview 2,
  `crisp-utility-gap-anchor-dnd-v1.html`, replacing percentage-positioned
  examples with fixed Session tracks. It includes start, every-between, and end
  anchors plus Empty Category A First Slot Center and B Board Center.
- Browser measurements confirm three 220px preview Sessions at one 398px full
  height, four 20px anchors at one stable y coordinate, and an unchanged
  220x146 ghost between Pickup and Plus Active. Empty A sits at the first slot
  center; Empty B sits at the 778px Board center. The page defaults to Empty A.
- User chose Empty A and expanded its hit rule. Updated Empty Category so the
  entire 220x398 first-slot outline activates New Session; active styling covers
  the full slot. The top-left copy changes in place from
  `No sessions here yet` to `Release to create session`, with no plus tooltip.
  Ghost geometry remains 220x146 and axe has no violations.
- User requested a global ghost-above-plus experiment. Unified z-order to
  ghost 17 / plus 15 for empty and non-empty boards, with release tip 18.
  Non-empty measurement confirms the 220x146 translucent ghost fully overlaps
  the 20x20 plus while the plus remains visible through it; exact hit geometry
  remains unchanged.
- Published DnD Preview 3,
  `crisp-utility-dnd-autoscroll-v1.html`, comparing A progressive 48px edge,
  B constant 48px edge, and C wide 80px edge policies.
- Measured A at 6px/frame 32px from the right edge and 10.5px/frame 8px from
  the edge. B is 8px/frame immediately; C uses a more intrusive 80px zone.
  Pointer and 220x146 ghost stay fixed while scroll position accumulates.
- Added exact-plus scroll pause. A real 20px plus hit freezes scroll at
  0px/frame and keeps the anchor active; leaving resumes 10.5px/frame edge
  scrolling. Existing targets remain eligible for short hysteresis.
- User selected Preview 3 option A Progressive Edge. Started cancellation and
  keyboard-alternative review; current production still relies on visible
  Session/Open/Category drag handles for KeyboardSensor pickup, conflicting
  with the confirmed no-drag-icon direction.
- Published DnD Preview 4,
  `crisp-utility-dnd-keyboard-cancel-v1.html`, comparing full KeyboardSensor,
  full command menus, and C Hybrid Commands across all five object families.
- Verified C Session ArrowRight target preview and Escape rollback, Saved Tabs
  ArrowDown plus Enter commit, and Open Tabs target-picker preview. Live-region
  copy names preview/cancel/commit outcomes; final axe is 0/0.
- User selected C Hybrid Commands. Rewrote the complete Chinese and English
  Crisp Utility specifications with every confirmed Preview 1-14 and DnD
  Preview 1-4 decision, including Workspace emoji/order persistence, B2 menus,
  Session selection, explicit `new-session-insert`, fixed 340px tracks, Gap
  Anchors, Empty Category, Progressive Edge auto-scroll, and keyboard commands.
- Final spec self-review passes: 46 matching section headings in each language,
  no unresolved placeholders, all key contracts present in both files, no
  rejected-copy remnants in the specs, and `git diff --check` passes. Production
  build/tests were not run because this phase changed design artifacts only.
- Wrote the Crisp Utility production plan index plus four ordered plans:
  Foundations (4 tasks / 21 steps), Manager (7 / 37), DnD (8 / 35), and
  Options/Popup/Acceptance (9 / 40).
- Plan self-review fixed the nonexistent import-test path, preserved
  `renameWorkspace` until Manager callers migrate, replaced a speculative
  Open Tabs helper with the public reducer contract, and confirmed every plan
  has explicit RED/GREEN commands and no placeholders.
- Crisp Utility Foundations, Manager interactions, and DnD implementation are
  complete. DnD final evidence: focused matrix 168/168, full Vitest 101 files /
  1436 tests, `npm run check`, and serial Chromium 26/26.
- DnD now uses Pointer 5px + Touch 200ms/5px surfaces without visible/hidden
  drag handles; keyboard results use Hybrid Commands. Browser coverage includes
  Workspace/Category/Session/Saved/Open paths, start/between/end Gap Anchors,
  Empty Category, All Source suppression, source replacement, and
  reduced-motion Board auto-scroll.
- Started Phase 17: Options, Popup, Lucide migration, A1/D1 tokens, docs, and
  final acceptance.
- Completed Options Task 1. New/default settings use `Open Popup`, explicit
  persisted `store` remains valid, Basic/Capture copy matches the confirmed
  compact layout, and the focused Options/model/service-worker suite plus
  production build pass.
- Completed Options Task 2. Storage configuration now persists one projection
  that separates configured target from active backend and retains folder
  identity, fallback reason, and the last successful `meta.json.updatedAt`.
  `DataStorageCard` reads/subscribes to that projection without hydrating the
  full state or querying IndexedDB for display metadata.
- Task 2 evidence: 7 focused files / 76 tests pass, `tsc --noEmit`,
  `npm run build`, and the scoped `git diff --check` pass.
- Started Options Task 3: replace the one-item Safety, Keyboard Shortcuts, and
  Recovery wrappers with the confirmed A2 flat Advanced list while preserving
  lazy mounting.
- Completed Options Task 3. Advanced remains lazy and now renders four direct
  setting rows: Storage location, deletion confirmation, Keyboard shortcuts,
  and Reset settings. The one-item Safety/Recovery wrappers are gone.
- Task 3 evidence: RED identified the old wrapper headings; GREEN is 3 files /
  23 tests plus `tsc --noEmit` and scoped `git diff --check`.
- Started Popup Task 4: P2 compact action rows, dynamic save helper, conditional
  pinned controls, no Group/ratio UI, and pinned-safe automatic close/dedupe.
- Completed Popup Task 4. Popup now uses one 320px P2 composition: header-only
  Manager/Settings actions, fixed `Save`, setting-aware helper, conditional
  pinned scope/helper, and equal 80x32 Save/Remove actions. Group and
  selected/total UI are removed.
- Automatic capture and dedupe now protect pinned source tabs in the service
  worker. A pinned tab may be saved but is never auto-closed; pinned duplicate
  copies are excluded from both Remove count and close execution.
- Task 4 evidence: RED reproduced 11 UI/worker gaps; GREEN is 2 files / 78
  tests, `tsc --noEmit`, production build, scoped diff check, and the Popup CSS
  artifact shrank from 2.21 kB to 1.65 kB.
- Started Task 5: migrate production icon imports to the confirmed Lucide
  system and remove the Tabler runtime dependency only after source scans and
  focused architecture tests are green.
- Completed Task 5. All 19 production owners now use Lucide, Restore uses
  `SquareArrowOutUpRight`, Save uses `Inbox`, and Manager/Settings mappings
  follow the confirmed icon matrix. Obsolete test mocks were removed.
- `@tabler/icons-react` is removed from `package.json`, lockfile, and installed
  modules. Full repository scan returns no literal import.
- Task 5 evidence: architecture RED listed all 19 production owners; GREEN is
  8 files / 153 tests, `tsc --noEmit`, production build, and diff check.
  Vite transformed modules fell from 8,816 to 2,665 and Manager JS from
  270.80 kB to 265.61 kB.
- Started Task 6: apply the confirmed A1 Light / D1 Graphite semantic colors,
  zero letter spacing, 32px desktop / 44px coarse actions, compact menu rows,
  and neutral resting Save/Search states.
- Completed Task 6. Shared CSS now bridges the exact A1 Light and D1 Graphite
  values into Mantine body/default/border/primary variables. Manager Canvas,
  Sidebar, Toolbar, Session/overlay surfaces use their named semantic tokens.
- Resting Search, Save, and Restore actions are neutral. Selected/highlighted
  and DnD feedback use semantic cobalt; production no longer references the
  legacy Mantine blue scale or Nord palette. Controls use 6px radii, panels
  8px, Lucide 1.75 stroke, 32px desktop actions, and 44px coarse targets.
- Task 6 evidence: RED exposed six palette/surface/layout gaps; GREEN is 9
  files / 162 tests, `tsc --noEmit`, production build, semantic source scan,
  and diff check.
- Started Task 7: synchronize current product and architecture documentation
  with the implemented Crisp Utility behavior and remove superseded contracts.
- Completed Task 7 across README, AGENTS, overview, feature spec, architecture,
  evolution, decisions, and product story. Current docs now describe default
  Popup, Workspace emoji/order, one selection scope, explicit
  `new-session-insert`, Hybrid Commands, pinned-safe capture/dedupe,
  StorageStatusProjection, Lucide-only icons, and A1/D1 tokens.
- Historical Popup Group, Tabler/Nord, drag-handle, and `{mode}` decisions remain
  only as traceable superseded history. Added the 2026-08-03 evolution entry
  and D057 to name the replacement decisions.
- Task 7 evidence: cycles 6/6, architecture 8/8, 240-source import scan,
  137-production ownership scan, current-doc stale-truth scan, and full diff
  check pass.
- Started Task 8: full focused domains, build/check/Vitest, serial Playwright,
  and startup benchmark acceptance.
- Completed Task 8. Focused high-risk domains pass 9 files / 388 tests.
  `npm run check` passes extension sanity, 240-source cycles, and
  137-production architecture gates. Full Vitest passes 103 files / 1,462
  tests.
- The first Playwright attempt failed all browser launches before test bodies
  because the macOS sandbox denied Chromium MachPort rendezvous. The identical
  serial command outside the sandbox ran normally. One stale E2E selector still
  targeted the removed saved-tab More button; production, static contracts, and
  page snapshot all showed the confirmed trailing X owner. Migrated the test to
  `.tab-item-row__delete`; focused 1/1 and final serial Chromium 51/51 pass.
- Startup benchmark passes. Medians: empty Manager 334.8ms, empty Options
  389.5ms, medium Manager 311.1ms, medium Options 400.8ms, large Manager
  496.3ms, large Options 449.7ms, large empty-Inbox Manager 311.6ms. Large
  Manager retains 196 slots but mounts 6 cards / 190 shells / 120 rows;
  Options canonical state reads remain 0 and Manager Open Tabs calls remain 1.
- Started Task 9: rendered A1/D1 visual, accessibility, responsive,
  Popup/Options state matrix, and final source/diff audit.
- Task 9 final menu audit found that the C3 description lifecycle existed only
  in the custom overlay primitive; production Global, Workspace, Category,
  Session, and Saved Tab menus did not provide descriptions. Added one shared
  550ms pointer / immediate focus description owner and supplied concise
  production copy across all five menu scopes.
- The running Vite instance initially served stale transformed
  `ManagerGlobalActions` source after HMR. Restarting Vite exposed the current
  wrapper and confirmed this was a dev-server cache issue, not a React/Mantine
  event-composition defect.
- Real browser evidence now confirms: no tooltip at 300ms, tooltip visible at
  600ms, immediate keyboard-focus display, viewport edge flipping,
  `aria-describedby` ownership, and `pointer-events: none`.
- Axe exposed two final portal/token gaps during that verification. Both the
  custom menu and C3 tip now mount inside `#manager-main`, and custom destructive
  rows consume the A1/D1 `--tabboard-danger` token. Global and Session menu
  states each pass 0 violations / 0 incomplete.
- C3 focused verification passes 6 files / 111 tests. Browser evidence:
  `/tmp/tabboard-c3-menu.png` and `/tmp/tabboard-c3-session-menu.png`.
- Completed Task 9 rendered and automated acceptance. Global B2/C3 and custom
  Session menus both pass axe at 0 violations / 0 incomplete; Popup, Options,
  responsive Manager, sidebar states, selection, DnD, tooltip, and dialog
  matrices retain their earlier rendered acceptance.
- Final-tree verification: full Vitest 103 files / 1,465 tests; `npm run check`
  with 2,665 transformed modules, 240-source cycle/import scan, and
  137-production architecture scan; serial Chromium 51/51 in 48.1s; and
  `git diff --check` with no errors.
- Final real unpacked-extension startup medians: empty Manager 310.4ms, empty
  Options 388.7ms, medium Manager 345.7ms, medium Options 429.6ms, large
  Manager 448.0ms, large Options 450.8ms, and large empty-Inbox Manager
  362.7ms. Large Manager retains 196 slots while mounting 6 cards / 190 shells
  / 120 rows; Options canonical state reads remain 0 and Manager Open Tabs
  calls remain 1.
- Final scans confirm no production Tabler import and no `active` member in
  `OpenTabInfo`. Workspace C3 session-count copy now handles singular/plural.
- Manual-only residual: the native `showDirectoryPicker()` selection and OS
  permission prompt cannot be granted by the headless extension runner. Its
  fallback/reconnect logic is covered by projection, adapter, component, and
  browser-state tests, but the native permission UI still needs one human
  unpacked-extension smoke.
- Started Phase 18 after real unpacked-extension review showed that production
  visual/interaction parity was weaker than the approved preview despite green
  automated gates.
- Initial source tracing found three confirmed causes: Open Tabs context actions
  inherit Mantine filled styling because they omit `variant="subtle"`; Session
  tests intentionally removed the approved light elevation; Session Restore /
  More use resting opacity 0.45 instead of true progressive disclosure.
- Expanded the audit beyond the screenshot callouts to six complete product
  surfaces and all relevant resting/hover/focus/selection/theme/viewport states.
- Completed the initial source + rendered parity matrix. Added five production
  gaps beyond the screenshot: collapsed Expand and both selection toolbars
  inherit filled actions; Session Header actions are 22px raw controls instead
  of shared 32px controls; T1 two-line Session title is absent; S1 note fill /
  accent rule is absent; active Category adds an unapproved underline.
- Current 390px and 772px layouts have no page overflow, and representative
  Manager/Popup/Options axe runs remain 0 violations / 0 incomplete. Open/Saved
  row progressive checkbox/X geometry and Workspace context currently match
  the confirmed preview contracts.
- Completed Phase 18 implementation with TDD. Shared icon actions now default
  to neutral subtle; Session Header and Open/Saved trailing X consume the
  shared 32/44px primitive; Header/X disclosure is progressive; Session uses
  preview-derived light elevation, 3px/5px breathing inset, T1 two-line title,
  and S1 note treatment; active Category uses fill without underline.
- Rendered acceptance covered Manager light/dark/390/772, normal/hover/focus,
  Session menu-open, Open/Session selection, locked row actions, group note,
  and long two-line title. Popup and Options were rechecked after the shared
  primitive change. Every representative axe run reports 0 violations /
  0 incomplete.
- The first serial E2E run exposed three useful contract mismatches: the Empty
  full-slot target inherited the card inset, the shared 32px max-size defeated
  the 800px drawer 44px target, and the More command test clicked a
  progressive-hidden button without first hovering its Header. Split Empty
  target from ordinary slot inset, switched drawer/narrow row X to the touch
  token, and made the test follow the real hover interaction.
- Final verification: full Vitest 103 files / 1,472 tests; `npm run check`
  with 2,665 modules, 240-source cycle/import scan and 137-production
  architecture scan; serial Chromium 51/51 in 49.2s; `git diff --check`
  clean.
- Final real unpacked-extension benchmark medians: empty Manager 322.5ms,
  empty Options 394.5ms, medium Manager 430.6ms, medium Options 418.7ms,
  large Manager 489.6ms, large Options 286.3ms, large empty-Inbox Manager
  267.4ms. Large Manager remains bounded at 6 cards / 190 shells / 196 slots /
  120 rows; Manager list calls remain 1 and Options canonical state reads 0.
- Started Phase 19 after the user's real-extension screenshot exposed a
  Workspace `🗂️`/`Personal` collision missed by Phase 18.
- Root-cause investigation found a 16x16 text-emoji box paired with only a 4px
  Mantine button gap. Color emoji ink can overhang that CSS box, while prior
  tests checked source structure and DOM geometry but not visible glyph
  separation.
- Expanded the audit from one trigger to every compound row across Manager,
  Popup, and Options where icons, emoji, favicons, checkboxes, badges, text,
  counts, chevrons, and trailing actions compete for one line.
- Added rendered RED regressions. Workspace initially failed with
  `emojiToLabel = 0px`; Category count initially failed with `0px`; compact
  active Category initially had a 41px nav for a 75.5px item.
- Repaired Workspace with independent left/label/right Mantine sections and
  20px emoji slots; desktop gaps are 6px/4px and compact centers the emoji in a
  44px target. A ZWJ emoji plus long Workspace name is now part of the E2E
  fixture.
- Moved Category label/count gap to the actual Button label owner and made
  Session metadata `inline-flex` with a 4px gap.
- Compact Category navigation now reclaims desktop-only action margins,
  preserves the count, and reveals the active item after selection or nav/item
  resize via a cleaned-up rAF + ResizeObserver lifecycle.
- Rendered cross-surface audit found no additional collision in Open/Saved row
  grids, Workspace menu/manage/editor, Popup, or Options. Popup and Options
  icon/label gaps are 10px and compact Options has no overflow.
- Fresh accessibility evidence: compact Manager, Popup, compact Options
  Advanced, and rebuilt unpacked production Manager all report 0 violations /
  0 incomplete.
- Phase 19 final gates: focused 6 files / 124 tests; full Vitest 103 files /
  1,472 tests; `npm run check` with 2,665 modules, 240-source cycle/import and
  137-production architecture scans; serial Chromium 54/54; production
  extension Workspace gaps 6px/4px with no horizontal overflow.
- Fresh unpacked-extension startup medians: empty Manager 241.5ms, empty
  Options 358.6ms, medium Manager 335.0ms, medium Options 310.6ms, large
  Manager 532.8ms, large Options 319.5ms, large empty-Inbox Manager 305.5ms.
  Large Manager remains bounded at 6 cards / 190 shells / 196 slots / 120 rows;
  Manager Open Tabs calls remain 1 and Options calls remain 0.
- Started Phase 20 after the user identified that sidebar expand/collapse still
  jumped between endpoint layouts despite the four disclosure states working.
- Recovered the confirmed C1 Hybrid Rail reference from the repository preview:
  180ms `cubic-bezier(.2,.8,.2,1)` for shell/sidebar geometry, 150ms overlay
  shadow, and 75ms-delayed 80ms expanded-content fade; reduced motion disables
  all of these transitions.
- Root-cause source audit found that production transitions only
  opacity/transform even though width/grid tracks are the properties that
  change, and the layout regression test explicitly forbids both required
  transitions. Existing E2E checks only final classes/offsets, so they could not
  detect the one-frame jump.
- Added RED source and rendered regressions. Baseline production jumped from
  52px to 307.2px by the first useful sample; shell computed transition was
  generic and sidebar transition omitted width.
- Restored C1 geometry: shell grid and sidebar width use 180ms
  `cubic-bezier(.2,.8,.2,1)`, Peek/Drawer use overlay width + shadow, and
  reduced motion sets shell/sidebar transitions to none.
- Expanded Open Tab copy, Filter, header utilities, and context actions remain
  mounted for motion but become disabled/inert/aria-hidden/tabIndex -1 while
  collapsed. Their 75ms-delayed 80ms fade matches the confirmed preview.
- Added rendered acceptance for pinned intermediate frames, delayed copy,
  Peek fixed Board offset, rapid reversal, Drawer fixed offset/inert/focus
  return, reduced motion, stable favicon/Window centers, and 44px/8px Drawer
  geometry.
- Rendered review found and fixed two secondary geometry defects: animated
  favicon drift and an accidental overlay scroll owner. A stable desktop
  identity slot plus `overflow:clip` keep icon x fixed and leave scrolling to
  the Window switcher/Open Tabs list.
- Visual evidence:
  `/tmp/tabboard-sidebar-opening-mid-corrected.png`,
  `/tmp/tabboard-sidebar-pinned-corrected.png`,
  `/tmp/tabboard-sidebar-peek-final.png`, and
  `/tmp/tabboard-sidebar-drawer-final.png`. Video capture was unavailable
  because local `ffmpeg` is not installed; screenshots and frame measurements
  provide the acceptance evidence.
- Final Phase 20 gates: focused 5 files / 88 tests; full Vitest 103 files /
  1,472 tests; `npm run check` with 2,665 modules, 240-source cycle/import and
  137-production architecture scans; serial Chromium 59/59; `git diff --check`
  clean.
- Fresh startup medians: empty Manager 228.3ms, empty Options 409.4ms, medium
  Manager 378.6ms, medium Options 414.7ms, large Manager 513.8ms, large
  Options 413.3ms, large empty-Inbox Manager 296.7ms. Large Manager stays at
  6 cards / 190 shells / 196 slots / 120 rows and one Open Tabs call.
- Rebuilt unpacked production directly measures pinned disclosure as
  `52px -> 269.0px -> 307.2px`, confirming the intermediate frame outside the
  Vite preview. Production Manager axe reports 0 violations / 0 incomplete in
  resting pinned state. Peek/Drawer have 0 violations and one contrast
  incomplete caused by intentional overlay overlap; screenshots and semantic
  token review cover that manual boundary.
- Started Phase 21 after the user correctly rejected the prior page-level
  acceptance standard. The Workspace overlap and missing Sidebar motion prove
  that endpoint screenshots, axe, and green E2E do not establish detailed
  preview parity.
- Added
  `docs/reviews/2026-08-02-crisp-utility-forensic-parity-audit.md`. It maps every
  confirmed Preview 1-14 contract (with Preview 9 correctly superseded by
  Preview 10), the final Manager/Options visual compositions, and the final
  Gap Anchor/Empty/auto-scroll/cancel DnD contracts to their production owners.
- The new matrix has independent structure, rendered geometry, temporal motion,
  interaction/focus, and accessibility columns. Every cell begins unresolved;
  only current-turn reproducible evidence may close it. Intentional overlaps
  are limited to checkbox/favicon, pinned badge/favicon, Peek/Drawer/Board, and
  drag ghost/anchor.
- Started live evidence collection with dedicated agent-browser sessions for
  Manager, Popup, and Options against the real React preview harness. Captured
  `/tmp/tabboard-phase21-manager-default.png`,
  `/tmp/tabboard-phase21-popup-default.png`, and
  `/tmp/tabboard-phase21-options-default.png`, plus annotated variants.
- Default geometry scan found no unapproved visible sibling collision or
  horizontal overflow. Popup Save/Remove are exactly 80x32.
- Falsified two source-only Popup suspicions with rendered evidence: header
  actions remain 32x32 for a fine pointer even at the 320px extension viewport,
  and the visible pinned-checkbox icon is centered within its 24px owner. No
  production change was made for either.
- Serial Manager evidence confirmed Session Header action reveal and Open Tab
  tooltip geometry, then found one real mismatch: Saved Tab tooltip was 6px
  above its title trigger but only 2px above the visible row.
- Added a rendered Playwright regression covering both Open and Saved row gaps.
  It failed exactly `Expected 6, Received 2`. Updated the shared tooltip anchor
  resolver to use the owning visible row, then passed the regression and 3
  focused files / 110 overlay-session tests.
- Confirmed two Manage-surface parity gaps with the long/ZWJ/locked fixture.
  Manage Workspaces lacked its current-row material; Manage Categories had
  drifted into 29px borderless one-line menu rows instead of Preview 13's
  48px bordered two-line object rows.
- Added rendered RED gates, restored Workspace current material and Category
  active material/two-line geometry/14px swatch/32px actions, then added a
  second RED/GREEN cycle to reduce both list gaps from 10px to the preview's
  5px. Focused result: 2/2 Playwright and 4 files / 70 Vitest.
- Fixed evidence paths:
  `/tmp/tabboard-phase21-manage-workspaces-fixed.png` and
  `/tmp/tabboard-phase21-manage-categories-fixed.png`.
- Added focus-state REDs after the generic row interaction surface was found to
  overwrite current/active accent material. State material now survives focus;
  focused result is 2/2 E2E plus 3 files / 52 Vitest.
- Real nested Workspace Edit makes Manage inert/aria-hidden and restores Escape
  focus to `Edit Very Long Research Workspace Name`.
- Verified the actual 340px Session selection toolbar at empty and one-Link
  states. Its 314px inner width fits count + six 32px actions with zero
  overflow; action availability and initial focus match Preview 14.
- Direct final-HTML comparison found Popup was visually recompressed even
  though its actions and copy were correct. Added a dedicated rendered RED
  (`52px` expected, `44px` received), then restored the visible P2 hierarchy:
  52/16 header, 16/10 body, 22px brand, 700 count, 16px checkbox, two-line
  pinned helper, 40px duplicate row, and 80x32 actions.
- Popup parity is 1/1 and Popup/worker focused tests are 2 files / 78 tests.
  Removed one over-broad body-height assertion after proving it included
  preview-only empty feedback/separator scaffolding.
- Compared production Options to the final polished 680px preview rather than
  the earlier 440px thumbnail. Added two rendered REDs for O2 Basic tokens and
  A2 flat Advanced; they failed at 16px vs 32px page padding and 1px vs 0px
  Advanced border.
- Restored the final Options hierarchy/tokens locally: 680/32 surface, 96px
  Header, 24/32 H1, right-side save/action group, 24px Sections, same-line
  16/22 + 13/18 headings, 14/20 labels, 13/18 help, compact horizontal Restore,
  and unframed 52px Advanced with 24px Storage / 20px ordinary rows.
- Options rendered parity is 2/2 and 3 files / 24 focused tests pass.
- Added Popup No Pinned and Options Storage projection browser scenarios.
  Popup proves the body height equals only visible Save + gap + Duplicate rows
  plus padding, with no hidden pinned track. Options ready/fallback states pass
  through the real storage subscription, preserve configured folder context,
  and keep 24px layer separation with no overflow.
- The first Storage browser attempt reloaded a file-configured projection
  without an IndexedDB handle; the real authority correctly converted it to
  fallback. Changed the UI gate to subscription injection and retained real
  native handle/picker permission as an explicit manual boundary.
- 390px D1 screenshots confirmed no horizontal overflow after Popup/Options
  repair, but exposed stale native theme metadata on every page. Updated the
  shared A1/D1 `theme-color` values through RED/GREEN; 2 files / 22 tests pass.
- Found three additional Preview 10/5/1 gaps: Workspace switcher current state
  used ordinary hover gray; collapsed active Filter had no dot/result
  accessible name; Open Tabs selection exposed six actions instead of the
  confirmed four. All now have DOM/rendered RED/GREEN coverage.
- Related Manager gate: 3/3 Playwright and 3 files / 77 Vitest. Row-level X and
  close confirmation remain; only unapproved batch Close/Pin were removed.
- Completed menu parity repair. Session now has the nine final icon-led
  commands including Edit Session Note, object-specific labels, explicit
  `Session Actions`, first focus, danger separation, and Escape return.
- Added a shared initial-focus helper for keep-mounted Mantine Global,
  Workspace, and Category menus; cross-menu rendered checks now cover command
  sets, 29px/16px geometry, immediate keyboard C3 tip, delayed pointer C3 tip,
  and Saved title focus return.
- Workspace editor real-page evidence covers 16 favorites / 8 columns, no
  overflow, keyboard pressed-state movement, ZWJ Custom preview, enabled Create,
  and Escape focus return. Preview 11's current HTML script is broken in A mode
  (no `.emoji-grid`), so it is recorded as a reference-artifact boundary.
- Added real mobile/touch coarse-pointer acceptance. RED found 36px Window,
  30px Filter, 18px Workspace Pencil, 34.6px emoji cells, and 36px Options
  buttons. Coarse-only fixes produce 44px actions and a six-column emoji grid;
  desktop contracts stay unchanged. Coarse parity passes 2/2.
- Open Tabs hidden-selection browser path passes visible-only Select/Unselect,
  hidden payload retention, Collapse clear, and query retention.
- Serial verification: Sidebar motion 8/8, DnD acceptance 11/11, Whole-session
  Hybrid 3/3. A parallel exact-plus timing failure disappeared serially; the
  Hybrid helper needed one extra ArrowDown after adding Edit Session Note.
- Fresh axe: Manager selection 0/0, Session menu 0/0, Popup mixed 0/0, Options
  fallback 0/0, Drawer final frame 0 violations / 1 overlay contrast
  incomplete. The transient Drawer contrast violation only existed when
  auditing during the opening animation.
- Reopened Preview 10 directly from the retained Visual Companion source
  instead of relying on the earlier page-level parity conclusion. Its final v3
  row contract uses the same structured title/metadata grid for Open and Saved
  Tabs.
- Found that production Open rows omitted metadata entirely. Added a rendered
  RED that failed on the missing second child, restored the URL row, and kept
  checkbox/favicon/X ownership unchanged.
- The same computed-style scan found Open and Saved rows still differed
  materially: Open was 12/16 + 12/14 in a 36px row, while Saved inherited
  16/24.8 + 12/16. Added a second RED for the non-scaled production tokens,
  then fixed both to 14/20 title, 12/16 metadata, and at least 44px.
- The GREEN attempt initially remained red because the shared `font: inherit`
  shorthand silently reset the Saved title to 16px. Moving the dedicated title
  token after the shorthand resolved the actual cascade owner. The new browser
  gate now passes and checks both vertical hierarchy and horizontal slot
  separation.
- Continued the same-family scan instead of stopping after the first GREEN.
  Added and repaired hover/selected materials, Saved Note metadata, stale 36px
  Open-row intrinsic geometry, and the Session T1 14px title token. Session
  Rest/Hover/Focus/Menu timing and stable action geometry now have one rendered
  gate.
- Corrected the Phase 21 matrix's tooltip timing mix-up: Tab hover Tooltip is
  180ms; 550ms belongs to C3 menu-item descriptions. New rendered evidence
  covers 120ms absent / 190ms visible, immediate keyboard focus, top/bottom
  6px placement, 390px D1 clamping, line limits, and pointer transparency.
- Replayed all six confirmed Popup outcomes through the real React page:
  mixed, pinned-only, pinned-excluded, keep-all, regular-only, and all-pinned
  duplicates. Added the missing duplicate result helper and verified actual
  save closure leaves pinned sources open.
- Found the preview Chrome harness still used old pinned-closing rules for both
  capture and dedupe. Added REDs, aligned it with production, then extracted
  `classifyWindowDuplicates()` so worker, Popup, and preview harness no longer
  maintain separate removable/protected algorithms.
- The shared duplicate owner also fixes an uncovered Exclude URL edge:
  excluded tabs stay outside Save scope but remain correctly represented in
  the independent window-wide Remove duplicate scope.
- Restored final Options Capture helper copy for pinned-safe close/dedupe,
  grouped fallback Reconnect + Use Browser Storage actions, and restored the
  final toolbar/Keyboard/Reset wording.
- Long Local Folder names initially wrapped to 60.89px. Explicit 14/20
  ellipsis/nowrap now keeps folder name plus updated time on one line at
  1024px and 390px. Long fallback reason plus both 44px recovery actions passes
  at 390px D1 with zero document/storage overflow.
- Reopened all previously accepted cells after the user rejected the audit's
  level of detail. Responsive, disclosure-motion, and coarse-pointer repairs
  are now checked for side effects in every other state instead of being
  accepted from their own focused scenario.
- Fresh 1440x900 Manager screenshot:
  `/tmp/tabboard-phase21-reopen-manager-1440.png`.
- Fresh computed geometry found a possible contract conflict: pinned Open Tab
  rows use `43px 224px 32px`, with a `20px` owner centered at x=25.5 and copy
  beginning 53px from the row edge. Final Preview 10 uses a 24px leading
  column. The production 43px column came from Phase 20's stable icon-center
  motion repair, so no production change has been made yet.
- Next rendered regression will require both compact expanded spacing and
  continuous collapsed/pinned/Peek motion. It must fail for the excess
  expanded whitespace without weakening the confirmed no-jump animation.
- Investigated the remembered 65% Tooltip opacity as a possible omission.
  A temporary rendered RED received production opacity `1`, then reference
  ordering showed 65% belonged to the earlier white-tooltip exploration. The
  later dark competitor-style and above-row previews intentionally use an
  opaque native-tooltip material, matching the final bilingual spec. Removed
  the incorrect test and made no production change.
- Confirmed a structural Preview 12 omission: Manage Workspaces could edit,
  delete, and reorder but could not create, despite the user requiring all
  Workspace management capabilities inside this surface. Real-page screenshot
  before repair showed only the list and close action.
- Added a component RED that failed only because `New Workspace` was missing.
  Passed the existing `onCreate` owner into `WorkspaceManagerModal`, added
  manager-local `New Workspace` and `Done`, and reused the same Create/Edit
  `WorkspaceEditorModal`.
- Focused GREEN: Workspace Manager/Menu Vitest 2 files / 17 tests and rendered
  Playwright 1/1. Browser evidence confirms Create makes Manage inert/hidden;
  Escape restores focus to `New Workspace`; Done closes the manager. Fixed
  screenshot: `/tmp/tabboard-phase21-manage-workspaces-create-fixed.png`.
- Reopened Preview 8 at the concrete glyph level. Found that prior tests only
  guarded Lucide usage and stroke, allowing confirmed semantics to regress:
  Manager Save actions were Archive/floppy Save, batch Restore was RotateCcw,
  Options was Settings, and visible Bin/Delete actions used Trash2.
- Added REDs against rendered Lucide classes and replaced only primary semantic
  call sites with the confirmed `Inbox`, `SquareArrowOutUpRight`, `Settings2`,
  and `Trash`. Auxiliary Reset/Reconnect/Archive/Folder meanings stay intact.
- Focused GREEN is Open Tabs 26/26 plus five icon-owner files / 93 tests. Real
  DOM confirms Global Import/Export/Options as Download/Upload/Settings2 and
  Session selection as SquareArrowOutUpRight/Trash/X; all report stroke 1.75.
- Popup/Options reopened pass: Popup computed Lucide strokes are 1.75 despite
  raw SVG attributes reading 2; Options 1024 and 390 renders have no horizontal
  document or visible-element overflow, and compact primary buttons are
  358x44.
- Found one exact Preview 6 copy mismatch in the excluded-pinned state. Updated
  `Pinned tabs will stay open and will not be saved.` to the final
  `Pinned tabs will not be saved and will stay open.` after a focused RED.
  GREEN is Popup DOM 1/1 and rendered mixed/excluded/keep-all 1/1.
- Reopened management-shell placement after noticing the first Workspace
  functional repair still put New beside Done. Added shared Modal
  `headerSubtitle`/`headerAction`, moved Workspace New and Category Add to the
  header, added count + drag context, and gave Done a separated footer.
- The single-Workspace live fixture caught `1 Workspaces`; added RED and fixed
  singular/plural context. Component shell/Workspace/Category/Confirm result is
  41/41. Desktop and 390px screenshots show no collisions or overflow.
- Coarse RED received New Workspace at 36px. Management header action, footer
  action, and Close are now scoped to at least 44px; coarse E2E passes 1/1.
- Direct final Popup P2 comparison found Save/Remove should be pure text.
  Removed unconfirmed Inbox/Copy/check glyphs after rendered RED; action
  geometry remains 80x32 and the P2 browser gate passes.
- Direct Storage Browser comparison found Choose Folder in the wrong visual
  layer. Moved it to the primary `Storage location` row and added the lower
  `Session data is stored in this Chrome profile.` detail. Rendered 1024/390
  gate passes with 24px layer gap and no overflow; Popup/Options focused
  component tests are 43/43.
- Scanned every visible Manager icon-only action by real SVG bounds. Only Show
  Search drifted to 20x20 while the confirmed toolbar system is 18x18.
  Migrated it to `TabBoardIcon`; rendered toolbar gate and 47 related tests
  pass.
- Completed exact polished Options copy comparison. Restored final Basic
  capture/restore/focus helpers and the missing Exclude URL input-format
  sentence. The Exclude guidance matches the parser's comma/newline split.
  Options focused result is 24/24 plus rendered polished hierarchy 1/1.
- Verified the user's no-Active-Tab-data boundary: Manager `OpenTabInfo`,
  runtime parser, DnD validation, and row UI contain no Chrome active field or
  active styling. Chrome `active` remains only in Popup duplicate selection
  and Chrome API operations where it is required to preserve/focus tabs.
- Reopened the Phase 20/Preview 10 interaction instead of accepting the old
  stable-icon fix wholesale. Real unpacked geometry received a 43px leading
  column and 53px copy offset; final Preview 10 requires a compact 24px leading
  column.
- Added source and rendered REDs. Expanded/Peek rows now combine a 24px leading
  column with a 9.5px row inset; collapsed rows keep 43px + zero inset. Focused
  GREEN is 3 files / 116 tests and 5/5 serial disclosure tests.
- Latest unpacked pinned frames are
  `52 → 240.7 → 294.2 → 305.6 → 307.2px`; copy offset is 34px, content starts
  after 75ms, and favicon center remains exactly 25.5px throughout.
- Unpacked Peek opens in about 364ms, keeps Board x=52, and closes on pointer
  leave. Selection and Filter promote Peek to pinned/reflow but preserve the
  stored collapsed preference. Compact Drawer frames keep Board x=52 + inert,
  stable 44/flexible/44 columns, and return focus to Expand on close.
- Verified 901/900/760 boundaries and reduced motion in production:
  901 pinned, 900/760 collapsed, 760 topbar 48px, no horizontal overflow, and
  both shell/sidebar transition durations are 0s under reduced motion.
- Real management axe found focusable named Workspace/Category row `div`s
  without a role. Added REDs and `role="group"` to both sortable owners.
  Category unpacked is now 0 violations / 0 incomplete; the ARIA serious
  incomplete is gone in Workspace too.
- Matched final Preview 12's explicit ordinary Workspace row surface. The
  remaining Workspace meta contrast incomplete persists even with a direct
  text background probe; rect and elementsFromPoint evidence show no visual
  overlap, so it is documented as an axe derivation boundary.
- Latest unpacked Popup mixed is 320px / 52px header / pure-text 80x32 actions
  with axe 0/0. No-pinned/no-duplicate startup removes both DOM regions and
  leaves a 66px body with no empty track.
- Latest unpacked Options Browser is 680px / 32px padding / 96px header with a
  24px storage-layer gap and axe 0/0. At 390px D1, the long fallback folder
  remains one-line ellipsized with right-aligned updated time; both recovery
  actions are 44px, no overflow, correct `#1a1e24` theme, and axe 0/0.
- Latest unpacked Open Tooltip is absent at 120ms and present at 200ms, 6px
  above the row, 12/16 title, 10/14 link, 2x10px divider, read-only and
  pointer-transparent, axe 0/0. Saved Tooltip adds 9/12 timestamp; its one
  long-link contrast incomplete is another background-derivation boundary.
- Repeated Session header with a real pointer after discarding a synthetic
  mouseover sample: Rest is opacity 0 / pointer none; Hover, keyboard focus,
  and menu open are opacity 1 / pointer auto, with stable 32px Restore/More.
- Final full gates after the reopened repairs:
  - Vitest 104 files / 1,490 tests;
  - `npm run check` with 2,666 modules, 242-source cycle/import scan, and
    138-production architecture scan;
  - serial Chromium 88/88;
  - startup benchmark passed.
- Final benchmark medians: empty Manager 345.9ms / Options 453.3ms; medium
  Manager 346.4ms / Options 370.9ms; large Manager 536.7ms / Options
  344.6ms; large-empty-inbox Manager 362.6ms. Large Manager remains bounded at
  6 cards / 190 shells / 196 slots / 120 rows / one Open Tabs call, with max
  longest task 190ms.
- After benchmark rebuilt `dist`, repeated unpacked smoke rather than reusing
  pre-benchmark evidence: Manager 24px leading / 34px copy offset / 25.5px
  icon center, Popup no-pinned 52px header + 80x32 Save and no empty track,
  Options 390px D1 fallback with dark scheme, `#1a1e24`, 44px actions, zero
  overflow. All three final smoke states report axe 0/0.
- User screenshot exposed a duplicate whole-window capture action: header Save
  Window and context-bar Save All both reached the same `captureWindow` owner.
  Added REDs requiring exactly one action and prohibiting `onSaveWindow` in
  `OpenTabsWindowBar`; they failed with two actions and the legacy prop.
- Removed only the Window-bar action/props/count code. The context-bar Save All
  remains the sole entry; capture semantics, pinned retention, completion
  feedback, selection actions, and disclosure state machine are unchanged.
- Focused GREEN: OpenTabsPanel 26/26 and source/layout/accessibility 67/67.
- Serial browser result is 7/7, covering the sole Save All capture path,
  pinned source retention, pinned/Peek/Drawer disclosure, selection actions,
  and Window glyph semantics.
- Rebuilt unpacked evidence shows the Window bar contains only
  Window + Collapse, Window + Pin, or Window + Close by disclosure state.
  Whole-window capture is exactly one `Save All 2 Tabs` action in every
  expanded state; pinned rows remain included. Pinned axe is 0/0; Drawer keeps
  the already-documented overlay contrast incomplete.
- The first full Vitest attempt encountered an existing worktree Vite server
  on strict port 5173 and failed two preview-entry tests. Verified PID/cwd/port,
  stopped that three-hour-old server with TERM, then reran the failed file
  6/6 and full suite 104 files / 1,490 tests successfully.
- Final `npm run check` passes the 2,666-module build, extension artifact
  validation, 242-source cycle/import scan, and 138-production architecture
  scan.
- Audited all current tip owners after the duplicate-tip report. Added
  `TabBoardTooltip`, removed native `title`, nested Mantine Tooltip wrappers,
  and the global synthetic-mouseout patch. Standard controls now dismiss and
  cancel pending dwell on activation until real pointer movement/leave.
- Added equivalent stationary-pointer suppression to the custom Open/Saved tab
  preview without changing its approved 180ms delay, 6px placement, read-only
  content, or the C3 550ms description owner.
- Focused Tooltip evidence passes:
  - shared/component/static owner tests: 68/68;
  - overlay tests: 68/68;
  - Chromium standard action activation, tab preview activation/timing, and
    menu-description scenarios: 4 focused scenarios passed.
- Traced `document is not defined` through the real built chunks. The first
  candidate (`modulePreload:false`) passed programmatic builds but not `dist`;
  CLI debug revealed a tracked stale `vite.config.js` was the actual default
  config while tests loaded `vite.config.ts`.
- Unified Vite entry: dev/build/preview explicitly use `vite.config.ts`, and
  `vite.config.js` only re-exports it. The final preload policy keeps page
  entry modulepreload enabled and filters only the `activeAdapter` file/fs
  imports to empty dependency arrays.
- Added exact legacy fallback self-healing in Storage Authority and Options.
  Authority/production-entry focused verification passes 32/32; Options
  storage composition passes 7/7, including direct-page recovery and the
  negative permission-fallback case.
- Hardened direct Options recovery for cross-context consistency: after the
  local File Authority recovers, Options sends the existing
  `tabboard-storage-switched` message so a live service worker resets its stale
  Browser Authority. StrictMode coverage requires one authority init and one
  worker notification.
- Replaced global preload disable with a targeted Vite
  `resolveDependencies` policy. Manager/Popup/Options keep normal page
  modulepreload; only activeAdapter file/fs dynamic imports receive `[]`.
- Final fresh verification:
  - Vitest: 104/104 files, 1498/1498 tests;
  - `npm run check`: 2667-module build, extension sanity, 243 source
    import/cycle scan, 139 production architecture scan;
  - serial Chromium: 89/89, about 1.4 minutes;
  - final production `dist`: Manager/Popup/Options preload counts 10/9/4,
    no CRX dev loading pages, file/fs imports both empty-dependency;
  - `git diff --check` and `tsc --noEmit` passed.
- One serial Chromium attempt reported 88/89 because the interrupted Sidebar
  reverse test measured 45ms from click dispatch instead of from the React
  class commit. Product geometry still ended at 52px. The test now waits for
  the collapsed class, samples animation frames, and still requires a
  non-terminal descending frame plus final 52px. It then passed 5/5 repeated
  and 89/89 full.
- Real Chrome later exposed `File storage error: window is not defined`.
  Root cause: MV3 service workers reject dynamic `import()`; Vite's preload
  error handler then referenced `window`, masking the original import failure.
  Page contexts retain lazy file modules, while the service worker now injects
  statically imported file/fs modules through the existing loader seam.
- Reloaded the installed unpacked extension from this worktree and opened its
  real Options page. Storage returned to ready File mode; fallback copy and
  Reconnect disappeared. Evidence screenshot:
  `/tmp/tabboard-options-file-ready-20260803.png`.
- A fresh Chromium profile registered the real MV3 service worker with zero
  console errors and no `window` / `document` / dynamic-import failure.

## Phase 22 - Saved-tab title repair

- Restored the approved design after compaction and rechecked the worker,
  manager runtime, saved-row, drop-operation, and preview-harness seams.
- Confirmed the duplicate-title root cause: the incoming item is appended, then
  URL normalization keeps the old first item and drops the incoming title.
- Started TDD with duplicate Saved/Open drop regressions before production
  changes.
- Duplicate Saved/Open regressions failed only on the stale title, then passed
  after the shared drop owner updated the first existing target link from the
  first incoming same-URL title. Existing ID, position, note, favicon, and
  metadata remain unchanged.
- Strengthened duplicate tests with insertion before the existing item; this
  exposed and fixed the incoming-ID takeover that post-insert normalization
  would otherwise allow.
- Added the `refresh-saved-tab-title` worker/runtime/preview action and Saved
  Link context command. Locked Sessions disable the command; failure and
  unchanged title paths do not emit `update-tab`.
- Worker RED/GREEN coverage now includes exact-URL reuse, completed-tab
  preference, minimized/unfocused creation, stable-title quiet period,
  loading restart, listener-before-read race, timeout, oversized UTF-8 title,
  late `tabs.get()` settlement, and best-effort cleanup of already-closed
  windows.
- Rendered Manager preview exposed `Refresh Title` as a named menuitem with
  axe 0 violations / 0 incomplete. The action updated the preview title through
  runtime + `update-tab`, and the corrected fixture now yields
  `preview.example` rather than the URL itself.
- Browser DnD evidence: first drop created
  `drop_drop-operation_mslhjmjw_94fba078fb2f_tab_103` at index 2 with title
  `Duplicate URL one`; dropping the same URL again kept that exact ID/index,
  kept three total items, and changed only its title to `Duplicate URL two`.
- Pre-final gates before the last cleanup refinements passed:
  - focused: 8 files / 267 tests;
  - full Vitest: 108 files / 1,552 tests;
  - `npm run check`: 2,672-module build, 251-source cycle/import scan,
    143-production architecture scan, and 17 release tests.
- The final gates must be rerun because preview parity, failure/no-op DOM
  coverage, late-result cleanup, and best-effort window removal changed after
  those results.
- Final fresh gates after all refinements:
  - `npm test`: 108 files / 1,556 tests;
  - `npm run check`: 2,672-module production build, extension sanity,
    251-source import/cycle scan, 143-production architecture scan, and
    17 release tests;
  - `git diff --check` and `tsc --noEmit` passed;
  - rendered Saved Tab menu axe: 0 violations / 0 incomplete;
  - rendered duplicate Open Tab DnD preserved ID/index and replaced only title.

## Phase 23 - Hide refresh helper windows

- Screenshot reproduction matched the code path: an unspecified Chrome window
  type defaults to `normal`, so the minimized title-refresh helper appeared as
  an extra empty Open Tabs window.
- Added RED worker and preview regressions. Both failed because the helper was
  normal; after adding `type: 'popup'`, worker creation and concurrent preview
  Open Tabs projection tests pass.
- No Manager filtering state or cross-context temporary-window ID was added;
  the existing normal-window boundary remains the single owner.
- Rendered preview evidence while title loading was deliberately paused:
  `chrome.windows.getAll()` contained normal window IDs 1-6 plus popup helper
  ID 7; `list-open-tabs` returned only IDs 1-6 and the visible window selector
  remained at six buttons. Resolving the paused load removed popup ID 7.
- The first full Vitest run had one unrelated `useTabBoardStore` batch-delete
  expectation resolve instead of reject. No store/mutation owner changed; the
  exact test passed alone and the complete store file passed 92/92. No
  unrelated product fix was made; a fresh full-suite rerun is required.
- Final Phase 23 verification:
  - worker + preview focused files: 111/111;
  - clean full Vitest rerun: 108 files / 1,556 tests;
  - `npm run check`: 2,672-module build, extension sanity, 251-source
    import/cycle scan, 143-production architecture scan, and 17 release tests;
  - `tsc --noEmit` and `git diff --check` passed.

## Phase 24 - Restore final-title synchronization

- Wrote and approved the restore title sync design/implementation plan under
  `docs/superpowers/`.
- Added RED/GREEN mutation coverage: Locked Sessions accept title-only
  `update-tab`; note, URL, favicon, mixed patches, and other mutations stay
  locked.
- Added worker synchronization across single, group, selected, and Restore All
  paths. Tests prove final event title beats create-time URL/loading title,
  siblings wait concurrently, deleted records skip waiting, Locked records
  update, partial timeout preserves old title, and restore still succeeds.
- Persisted Saved Tab title clicks now call worker `restore-tab`; Bookmark
  read-only rows keep direct URL open.
- Locked manual Refresh Title is enabled and covered by mounted DOM tests.
- Preview restore now simulates final hostname titles and updates retained
  records while leaving deleted records absent.
- Added Restore All parity in production and preview. Mixed Locked/unlocked
  tests prove unlocked records are removed before title waiting while Locked
  records wait for and receive the final title.
- Added URL-race coverage: if a Saved record's URL changes while the restored
  page loads, the old restore result cannot overwrite the changed record.
- Focused owner verification before final gates: 7 files / 398 tests, plus
  Restore All and URL-race focused tests, all passing; `tsc --noEmit` and
  `git diff --check` pass.
- Latest focused owner verification after Restore All parity: 7 files /
  400 tests passing.
- Rendered preview verification: restoring a Locked saved link kept the
  two-item Locked group and changed its link title to `locked.example`.
- Final Phase 24 verification:
  - focused owners: 7 files / 400 tests;
  - `npm test`: 108 files / 1,565 tests;
  - `npm run check`: 2,672-module production build, extension sanity,
    251-source import/cycle scan, 143-production architecture scan, and
    17 release tests;
  - `tsc --noEmit` and `git diff --check` passed.

## Phase 25 - Session Refresh All Titles

- Approved bounded-concurrency design and wrote spec/plan under
  `docs/superpowers/`.
- Worker RED/GREEN covers five Links + Note, concurrency ceiling 3, one
  mutation batch, partial resolver failure, Locked Session, missing group, and
  canonical delete/URL-change races.
- Added `ManagerRuntime.refreshSavedGroupTitles(groupId)` and Session menu
  `Refresh All Titles`; read-only Sessions hide it and zero-Link Sessions
  disable it.
- Feedback is `Titles refreshed` for zero failures, otherwise
  `<refreshed> titles refreshed, <failed> failed`.
- Preview action mirrors result shape, Link-only behavior, and Locked updates.
- Rendered Saved Session menu exposes `Refresh All Titles` as a named menuitem;
  activation showed `Titles refreshed`. Read-only exclusion remains guarded by
  the `!readOnly` menu owner contract.
- Final Phase 25 verification:
  - focused owners: 7 files / 277 tests;
  - `npm test`: 108 files / 1,570 tests;
  - `npm run check`: 2,672-module production build, extension sanity,
    251-source import/cycle scan, 143-production architecture scan, and
    17 release tests;
  - `tsc --noEmit` and `git diff --check` passed.

## Phase 26 - Title refresh row loading

- Added worker lifecycle RED/GREEN for manual, Session queue, and restore
  deletion skip. Start/finish share operation IDs and finish runs in `finally`.
- Added page-local title refresh activity store with overlap and keyed
  subscription tests; Manager runtime adapter installs one listener.
- Saved Tab rows subscribe by group/tab ID and reuse the existing Delete
  `AccessibleIconAction` slot with `loading`, `Refreshing title`, and a
  resting-visible loading class.
- Manual runtime requests now include group/tab identity; Preview mirrors
  activity broadcasts for manual, batch, and restore paths.
- Focused activity/DOM/worker/preview tests pass; TypeScript and diff checks
  pass after Preview ref narrowing.
- Rendered frozen-queue evidence: active Link rows showed `Refreshing title`
  with `data-loading=true`; Note and the fourth queued Link retained `Delete`.
  Every trailing slot measured 32px. Releasing one resolver restored its Delete
  action and started the queued fourth Link. Screenshot:
  `/tmp/tabboard-title-refresh-loading-final.png`.
- Final Phase 26 verification:
  - focused owners: 10 files / 351 tests;
  - `npm test`: 110 files / 1,578 tests;
  - `npm run check`: 2,674-module production build, extension sanity,
    255-source import/cycle scan, 145-production architecture scan, and
    17 release tests;
  - `tsc --noEmit` and `git diff --check` passed.
