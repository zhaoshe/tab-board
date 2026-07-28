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
