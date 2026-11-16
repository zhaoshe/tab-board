# TabBoard Review and Refactor Plan

## Goal

Implement every approved recommendation from the Web Interface Guidelines and
`ui-ux-pro-max` reviews, then repeat static and rendered review until one
complete pass produces no unresolved issue. After that baseline, investigate
the reported Manager and Options startup delay with production measurements and
produce an evidence-ranked React performance refactor plan.

## Current Phase

Phase 26 complete - every title refresh shows row-level loading in the Delete
slot.

## Phases

### Phase 1 - Audit and design

Status: complete

- Audit artifacts: `findings.md`, `progress.md`.
- Approved design: `docs/superpowers/specs/2026-07-27-ui-ux-refactor-design.md`.
- Execution plan: `docs/superpowers/plans/2026-07-27-ui-ux-refactor.md`.

### Phase 2 - Shared foundations

Status: complete

- Accessible icon action and destructive confirmation.
- Locale-aware formatters.
- Theme metadata, focus, touch, modal, and reduced-motion foundations.

### Phase 3 - Manager behavior and responsive shell

Status: complete

- Semantics, keyboard, popover, sidebar focus.
- Category geometry, compact commands, exclusive search.
- URL-backed page context and validated workspace dialogs.

### Phase 4 - Popup and Options

Status: complete

- Popup loading, landmarks, contrast, dedupe confirmation.
- Options theme, hierarchy, contrast, labels, advanced disclosure, reset confirmation.

### Phase 5 - Ownership refactor and docs

Status: complete

- Split Manager shell/header responsibilities.
- Split Manager CSS by owner.
- Update behavior, architecture, evolution, and decision docs.

### Phase 6 - Iterative review and completion audit

Status: complete

- Re-fetch and run Web Interface Guidelines review.
- Fix every finding with TDD; repeat until zero findings.
- Run build/check/unit/E2E/browser/a11y/DnD gates.
- Complete prompt-to-artifact coverage audit.

### Phase 7 - UI / UX Pro Max product review

Status: complete

- Reviewed Manager, Popup, and Options as a dense local-first productivity
  workbench.
- Rejected the database's portfolio/exaggerated-minimalism classification.
- Recorded 12 product, interaction, visual-density, and ownership findings in
  `docs/reviews/2026-07-27-ui-ux-pro-max-review.md`.
- Approved the complete P0/P1/P2 three-stage refactor.

### Phase 8 - UI / UX Pro Max refactor

Status: complete

- Corrected sidebar, category DnD, Save Window, Open Tab, Popup, and Options
  interaction contracts.
- Split Open Tabs, Session Card, and Manager DnD responsibilities into
  explicit owners.
- Added touch density, orientation counts, draft-save feedback, and overflow
  cues without changing schema, storage, mutation, or DropIntent contracts.
- Migrated source contracts to the final owners; focused verification is
  4 files / 98 tests and the production build passes.

### Phase 9 - Iterative UI / UX Pro Max review

Status: complete

- Re-run the skill's product, UX, React, and pre-delivery rules.
- Review static source across all three surfaces.
- Review rendered desktop, compact, touch, dark, reduced-motion, overflow,
  menu, and dialog states.
- Fix each new finding and repeat until a complete pass has zero unresolved
  findings.

### Phase 10 - Independent completion audit

Status: complete

- Map every finding, stage, constraint, changed owner, and verification gate
  to concrete evidence.
- Run fresh check, unit, E2E, browser/axe, DnD, and diff gates.
- Update current behavior and product-decision documentation.

### Phase 11 - Manager and Options startup performance investigation

Status: complete

- Commit the verified UI/UX refactor as a clean performance baseline.
- Measure production Manager and Options startup with empty and representative
  large state.
- Separate bundle parse/evaluation, storage hydration, Chrome API work, React
  commit, and post-hydration list rendering.
- Apply the relevant `$vercel-react-best-practices` rules to current source,
  rejecting framework-specific rules that do not fit a Vite MV3 extension.
- Produce an evidence-ranked optimization and ownership refactor plan without
  changing schema, storage protocol, or DnD semantics.

### Phase 12 - React startup performance implementation

Status: complete

- Establish a repository-owned production startup benchmark.
- Collapse page hydration to one Storage Authority read.
- Decouple Options Basic settings from full application hydration.
- Preserve stable session geometry while activating expensive card content near
  the viewport.
- Coalesce startup runtime work and defer non-critical modules/diagnostics.
- Re-run full correctness, browser, accessibility, DnD, and performance gates.

### Phase 13 - Design taste review

Status: complete

- Applied the relevant `design-taste-frontend` redesign principles without
  treating the productivity workbench as a landing page.
- Re-read the current product, architecture, prior UI/UX review, component
  owners, and style system at `bfe49eb`.
- Reviewed rendered Manager default/populated states, Popup, and Options
  geometry; Manager and Popup axe checks remain 0/0.
- Recorded evidence-ranked P0/P1/P2 recommendations, owner boundaries, three
  implementation stages, preserved constraints, and acceptance gates in
  `docs/reviews/2026-07-28-design-taste-review.md`.
- Kept this phase review-only; no product implementation was changed.

### Phase 14 - Design taste implementation and iterative review

Status: complete

- Implemented all 10 P0/P1/P2 findings with RED/GREEN tests.
- Preserved schema, mutation wire, DropIntent, stable session geometry,
  cross-category droppables, and runtime dependency set.
- Ran 4 post-implementation taste review rounds.
- Closed new compact-reorder, copy, letter-spacing, duplicate-label, Retry
  target, and queued stale-error findings.
- The final complete static + rendered taste pass produced zero new findings.
- Completed check/unit/E2E/benchmark/browser/axe and prompt-to-artifact audits.

### Phase 15 - Crisp Utility gap previews

Status: complete

- Confirm selection-mode ownership, filtered counts, Select All, Save Selected,
  and Save All behavior.
- Confirm collapsed / peek / pinned / compact drawer sidebar states and motion.
- Confirm pointer and keyboard session/Open Tab DnD affordances without visible
  drag icons.
- Confirm the read-only tooltip and separate More/context action surfaces.
- Confirm window selected/focused/count semantics and filtered rail indicator.
- Confirm Popup pinned/mixed/dedupe copy and Options storage status semantics.
- Confirm the remaining Lucide mappings, theme state matrix, and rendered
  dimensions before updating the written specification.
- Confirm B2 menus with C3 item tips and row-level X/checkbox disclosure.
- Confirm Workspace creation and management with persisted emoji.
- Confirm Category management plus direct-drag reorder behavior.
- Confirm Session-local Saved Tab selection toolbar and cross-list ownership.
- Review every draggable surface together after icon confirmation, using one
  feedback grammar while preserving reorder, move, and copy outcomes.

### Phase 16 - Crisp Utility implementation planning

Status: complete

- Consolidated every confirmed Preview 1-14 and DnD decision into matching
  Chinese and English specifications.
- Split implementation into ordered Foundation, Manager, DnD, and
  Options/Popup/Acceptance plans plus one index.
- Defined cross-plan interfaces for Workspace emoji/order, explicit
  `new-session-insert`, and Hybrid Session target choices.
- Added focused RED/GREEN commands, serial browser/DnD gates, documentation
  updates, and final acceptance matrices.
- Self-reviewed paths, placeholders, type names, spec coverage, and dependency
  ordering.

### Phase 17 - Crisp Utility production implementation

Status: complete

- Foundations, Manager interactions, and DnD plans are complete.
- Options Basic/storage/Advanced semantics are complete.
- Popup compact action rows and pinned-tab closure guarantees are complete.
- Lucide migration, A1/D1 tokens, and current documentation are complete.
- Automated, rendered, accessibility, DnD, and startup performance gates are
  complete through the final B2/C3 menu audit.
- Final full regression and source/diff audit are complete. Native
  `showDirectoryPicker()` permission UI remains explicitly manual-only.

### Phase 18 - Preview-to-production parity repair

Status: complete

- Reconstructed the approved visual and interaction contracts from the confirmed
  preview, bilingual spec, findings, and implementation plans.
- Audited production Manager, Popup, and Options in rendered light/dark,
  desktop/compact, resting/hover/focus/selection/menu states.
- Recorded every visual, state, geometry, and copy mismatch rather than limiting
  the repair to the three screenshot callouts.
- Added RED regressions for each confirmed mismatch, then repaired the owning
  component/style without changing persistence or DnD result semantics.
- Repeated browser screenshots, geometry, accessibility, full unit/check/E2E,
  and production-extension acceptance.

### Phase 19 - Compound-control collision audit

Status: complete

- Reproduce and measure the reported Workspace emoji/name overlap with the real
  default `🗂️` glyph rather than a generic icon approximation.
- Add a rendered regression that checks sibling visual boxes for overlap across
  default, multi-code-point, long-label, dark, and compact states.
- Audit Manager, Popup, and Options rows where an icon, emoji, favicon,
  checkbox, badge, label, count, chevron, or trailing action share one line.
- Repair confirmed ownership or spacing defects without changing product
  behavior, persistence, DnD semantics, or the approved density direction.
- Re-run focused tests, full unit/check/E2E, screenshots, accessibility, and
  production-extension verification before making another global UI claim.

### Phase 20 - Sidebar disclosure motion parity

Status: complete

- Reproduce the current pinned/collapsed and peek/collapsed transitions with
  frame-by-frame geometry rather than checking only endpoints.
- Restore the approved C1 motion contract: 180ms shell/sidebar geometry,
  delayed 75ms / 80ms expanded-content reveal, overlay-only Peek, and
  reduced-motion suppression.
- Keep collapsed controls mounted only where required for a continuous fade,
  while preserving inert, aria-hidden, and keyboard-tab-order contracts.
- Verify pinned expand/collapse, hover Peek open/close, Peek-to-Pinned promote,
  compact Drawer, rapid reversal, and reduced motion in the rendered Manager.
- Re-run focused/full unit, check, serial E2E, accessibility, screenshots, and
  rebuilt unpacked-extension acceptance.

### Phase 21 - Forensic preview-to-production parity audit

Status: complete

- Reconstruct every user-confirmed Preview 1-14 contract plus the final Gap
  Anchor, auto-scroll, and keyboard/cancel drag contracts from the actual HTML
  previews, bilingual design spec, implementation plans, and decision log.
- Maintain a persistent contract matrix that maps each approved surface to its
  production owner and records separate evidence for structure, visible pixel
  geometry, temporal motion, interaction/focus lifecycle, and accessibility /
  tab order. Missing evidence means unresolved, never implicitly accepted.
- Audit the real rendered Manager, Popup, and Options in light/dark,
  desktop/compact, fine/coarse pointer, and relevant empty/populated,
  selected, filtered, pinned, locked, long-name, emoji/ZWJ, and drag states.
- Record and explicitly whitelist intentional overlaps only: checkbox over
  favicon, pinned badge over favicon, Peek/Drawer over Board, and drag ghost
  over insertion anchors. Treat every other overlap, clipping, jump, or
  mismatch as a defect until disproved with rendered evidence.
- For every confirmed mismatch, add the narrowest failing regression first,
  then repair the owning component/style without changing persistence schema,
  DropIntent semantics, selection ownership, or storage protocol.
- Re-run focused and full automated gates, rebuilt unpacked-extension checks,
  screenshots, frame measurements, keyboard/focus paths, and accessibility
  audits. Report any browser-native or manual-only boundary explicitly instead
  of claiming total UI acceptance.

### Phase 22 - Saved-tab title repair

Status: complete

- Preserve duplicate URL dedupe while replacing the existing saved link title
  with the title from a dragged saved or open tab.
- Add a locked-session-safe Refresh Title action for saved links.
- Resolve titles from an already-open exact-URL tab first; otherwise use a
  minimized, unfocused temporary window and always remove it after success or
  failure.
- Keep the existing tab identity, position, note, favicon, and other metadata;
  persist only the refreshed title through the existing `update-tab` mutation.
- Mirror the worker runtime behavior in the preview Chrome harness.
- Update current behavior and architecture documentation, then run focused and
  full verification.

### Phase 23 - Hide refresh helper windows

Status: complete

- Reproduce the temporary title-refresh window appearing in the Open Tabs
  normal-window selector.
- Create helper windows as minimized/unfocused popup windows so the existing
  normal-window projection excludes them without adding shared hidden IDs.
- Mirror the window type in preview tests and update current behavior docs.
- Re-run focused tests and fresh repository gates.

### Phase 24 - Restore final-title synchronization

Status: complete

- Route persisted Saved Tab title clicks through the canonical worker restore
  path while keeping read-only Bookmark links as direct opens.
- Wait for each newly-created Chrome tab's stable final title and update every
  still-persisted exact group/tab/URL record.
- Skip unlocked records removed by `deleteRestoredTabs`; update retained
  records, including Locked Sessions.
- Allow only title-only `update-tab` mutations in Locked Sessions and enable
  their manual Refresh Title command.
- Mirror restore title synchronization in preview and update current behavior,
  architecture, evolution, and decision docs.
- Run focused tests, full Vitest, production check, and rendered verification.

### Phase 25 - Session Refresh All Titles

Status: complete

- Add `Refresh All Titles` to persisted Session menus, including Locked
  Sessions; hide it for read-only Bookmark Sessions.
- Resolve Link titles with the existing stable-title owner and a maximum of
  three concurrent refreshes.
- Skip Notes; re-read canonical records before one title-only mutation batch.
- Report full success or refreshed/failed counts in existing toast surfaces.
- Mirror the action in preview and update product/architecture docs.
- Run focused, rendered, and full repository verification.

### Phase 26 - Title refresh row loading

Status: complete

- Broadcast per-record start/finish lifecycle events from manual, Session
  batch, and automatic restore title resolvers.
- Keep overlap-safe operation IDs in a page-local, non-persistent Manager store.
- Subscribe each Saved Tab row only to its own activity key.
- Replace the trailing Delete action in place with the existing Mantine loading
  spinner, visible without hover and named `Refreshing title`.
- Mirror lifecycle messages in preview and update docs.
- Run focused, rendered, and complete repository verification.

## Decisions

| Decision | Reason |
|---|---|
| Audit all 3 extension surfaces | The user requested a project-level UI/UX review, not a single component review. |
| Use live rendered measurements | Prior work established that CSS-only reasoning caused layout drift in this project. |
| Preserve the "dense but calm" product direction | Recommendations should improve usability without turning the manager into a spacious dashboard or landing page. |
| Treat drag-and-drop as a constrained surface | Product guidance identifies DnD as fragile; recommendations must avoid casual structural changes to its geometry. |
| Implement all accepted findings | The user explicitly approved the entire recommendation set. |
| Use inline execution | Subagents were not explicitly requested; perform TDD locally in this worktree. |
| Reject the generated portfolio design system | It conflicts with the extension's productivity-tool domain, existing dense workbench model, and product constraints. |
| Preserve stable DnD geometry, not every interaction tree | Every session slot/insertion target remains mounted; expensive card/tab trees activate near the viewport without a runtime virtualization dependency. |
| Diagnose startup before optimizing | The reported delay can come from local bundle execution, storage initialization, state normalization, or first render; each needs separate evidence. |
| Reopen D033 only with profiler evidence | Hundreds of sessions and thousands of tab rows now reproduce a multi-second initial mount, satisfying the prior decision's threshold for reconsidering full interactive DOM. |
| Prefer stable references over serialized lifecycle keys | Structural sharing now drives DnD, overlay, Open Tabs, and activation invalidation without joining every group/tab ID during render. |
| Treat the taste skill as contextual guidance | Its landing-page defaults do not fit this dense productivity tool; use only redesign, hierarchy, material, and state principles that match the product. |
| Preserve cross-category drop targets in normal navigation | Explicit category reorder mode may remove category draggable/reorder targets from normal mode, but session-to-category droppables must remain active. |
| Pin benchmark Manager samples to Inbox | Bare-entry product preference may select a lighter category; production performance evidence must seed Inbox preference and record final active board. |
| Use serial full E2E as final DnD evidence | Five-worker runs can compete on pointer/overlay timing; full `--workers=1` still covers all 33 scenarios deterministically. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Reduced-motion computed-style probe queried a missing session card while Inbox was empty | 1 | Switch to Saved before measuring session-specific transitions; keep shell-only checks independent of content. |
| `agent-browser network route` did not fulfill a top-level navigation to a nonexistent Options preview path | 1 | Use the real Vite-served `options.html` with a browser init script that installs a minimal Chrome API before application modules run. Discard the Chrome error-page audit. |
| New component tests used `.test.tsx`, but Vitest includes only `src/**/*.test.ts` | 1 | Rename tests to `.test.ts`; they already use `createElement` and require no JSX transform. |
| Split CSS lost end-target and drag-feedback geometry, breaking keyboard DnD and visual placeholders | 1 | Restored the original target/placeholder/marker rules and added canonical insertion-index keyboard coordinates plus repeated E2E coverage. |
| Concurrent browser/build verification caused cold-run keyboard timing failures | 1 | Serialize final gates and synchronize the E2E with dnd-kit live-region target announcements. |
| Final owner split left 6 source-contract assertions reading old files | 1 | Combined the new list/sensor owners into the contracts without weakening behavior assertions; 98/98 focused tests pass. |
| Full Vitest initially failed 4 tests | 1 | Stopped the external 5173 server, migrated stale source/harness assertions to the final owners, and reran 76 files / 1,006 tests. |
| Category DnD E2E could not find exact `Inbox` | 1 | Category counts changed the accessible name to `Inbox 0`; use stable `data-category-id="inbox"` and verify 5/5 repeated runs. |
| Parallel repeated Playwright commands competed for port 5173 | 1 | Serialize critical browser gates; DnD then passed 15/15 and compact geometry 3/3. |
| Playwright benchmark waited for an inactive MV3 worker | 1 | Identified that extension activation must precede worker discovery; discarded the run. |
| Direct Playwright extension activation returned `ERR_INVALID_URL` / `ERR_ABORTED` in the prototype | 2 | Stopped iterating on the temporary benchmark and retained the already-valid agent-browser production measurements; the plan requires a repository-owned stable benchmark harness before implementation claims. |
| CPU profiler relaunched the browser onto `about:blank` | 1 | Restarted profiling before navigating to the known extension URL; used profile shape only because profiler overhead distorted absolute startup time. |
| Manager browser wait used the wrong visible workspace text | 1 | Switched to stable `.manager-shell`, category controls, card counts, and accessibility-tree checks. |
| Combined Manager screenshot/eval command stalled after the page became ready | 1 | Split browser probes, retained successful axe/snapshot evidence, and did not treat the automation stall as a product defect. |
| Initial production benchmark measured only 12 slots | 1 | Instrumented initial/final URL and active board; Chromium auto-opened bare new-tab Manager before `page.goto`. Seeded page-local Inbox preference and restored 196-slot coverage. |
| Compact reorder nav collapsed to 0px | 1 | Added rendered 390px regression; gave reorder mode an exclusive toolbar lane and 44×44 Done action. |
| Full E2E with 5 workers had 2 timing failures | 1 | Both passed independently; final complete serial run passed 33/33 without increasing timeouts. |
| Preview 8 agent-browser session could not start its socket | 1 | Reuse the already-healthy Visual Companion browser session instead of retrying a new daemon. |
| Preview 8 full-page and viewport screenshots stalled | 2 | Interrupted both stuck captures and stopped retrying the same path; the page remained responsive and geometry, computed-state, and axe probes completed. |
| Visual Companion URL stopped responding after idle timeout | 1 | Restarted from the same project directory, preserving port/token, restored the latest Menu Review page, and increased timeout to 8 hours. |
| Preview 10 verification read the closed Workspace menu after switching preview state | 1 | Split Workspace and Tab-row geometry probes so each reads its target before the state transition closes the menu. |
| Preview 11 focus probe read a stale emoji trigger after picker rerender | 1 | Re-query the current trigger after each render; add explicit Escape/focus-return behavior before the final comparison. |
| Preview 11 Escape verification script contained a stray diff marker | 1 | Removed the invalid `+` from the probe and reran the corrected browser evaluation. |
| Preview 12 patch contained an unrelated trailing context fragment | 1 | The patch was rejected atomically; split emoji semantics and row-action focus policy into two valid patches. |
| Phase 21 evidence append guessed a non-existent `findings.md` heading | 1 | The patch was rejected atomically. Read the actual file tail and append under a new Phase 21 heading instead of guessing an anchor. |
| Parallel hover probes in one browser session overwrote each other's pointer state | 1 | Discarded the concurrent samples and reran Session, Saved, and Open hover states serially with pointer reset between each. |
| Session selection script clicked Global `More Actions` through fuzzy role matching | 1 | Read the live snapshot, then use the exact Session `.session-card__actions [aria-label="More"]` trigger. |
| Popup no-pinned probe mutated Chrome tabs after mount but Popup does not subscribe to tab removal | 1 | Move the scenario to an isolated startup seed; verify layout from the first render. |
| Options ready-folder reload lacked an IndexedDB directory handle and correctly fell back | 1 | Exercise ready/fallback projection through the real storage subscription; keep native handle/picker lifecycle as a manual unpacked-Chrome boundary. |
| Vitest rejected Jest-only `--runInBand` | 1 | Use the repository's supported `npx vitest run <file>` form; no product test ran under the rejected command. |
| Agent-browser Session probe opened a restricted `about:blank` page | 1 | Discard the sample and use deterministic Playwright preview fixtures for Session/Popup timing and geometry. |
| First Saved Note E2E selector matched the second Saved Link | 1 | Seed a dedicated Note record and locate it by its exact title button before asserting its metadata. |
| Progressive checkbox click was intercepted by the resting favicon | 1 | Hover the row first, matching the confirmed disclosure interaction, then click the revealed checkbox. |
| Browser DnD probe waited for a nonexistent `Moved` toast after a successful Open Tab drop | 1 | Use the saved row URL/title and item count as the completion condition; the first drop had already committed. |
| Popup-helper browser probe used top-level `await` in `agent-browser eval` | 1 | Re-read the still-frozen helper state with an async IIFE; product behavior was unaffected. |
| First Phase 23 full Vitest run had one unrelated authoritative batch-delete test resolve instead of reject | 1 | Confirmed no diff in store/mutation owners; the exact test passed alone and the full 92-test store file passed. Treat as existing suite state/concurrency fluctuation and rerun the full suite without changing unrelated code. |
| Vitest focused retry combined `--pool=forks --maxWorkers=1` with the repository's default minimum worker count | 1 | Vitest rejected the conflicting pool bounds before running tests; rerun with the repository's normal pool settings. |
| Bookmark rendered probe waited for `Preview Bookmarks`, but the retained fixture/category route exposed different visible copy | 1 | Saved Session menu and toast evidence completed; use the existing `!readOnly` source/DOM contract for Bookmark exclusion instead of retrying a guessed label. |
| Phase 26 rendered retry attempted to start a second Vite server on port 5173 | 1 | Reuse the still-running preview server from the prior probe instead of creating another process. |

## Next Step

Phase 26 is complete. Title refresh activity is overlap-safe, page-local, and
fully verified.
