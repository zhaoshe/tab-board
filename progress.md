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
