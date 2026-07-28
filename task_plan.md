# TabBoard Review and Refactor Plan

## Goal

Implement every approved recommendation from the Web Interface Guidelines and
`ui-ux-pro-max` reviews, then repeat static and rendered review until one
complete pass produces no unresolved issue. After that baseline, investigate
the reported Manager and Options startup delay with production measurements and
produce an evidence-ranked React performance refactor plan.

## Current Phase

Complete - production Manager/Options startup has been measured, root causes
ranked, and an owner-by-owner refactor plan recorded.

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
| Preserve full-DOM list rendering | Existing structural sharing plus `content-visibility` is an explicit project decision; this review does not add a runtime virtualization dependency. |
| Diagnose startup before optimizing | The reported delay can come from local bundle execution, storage initialization, state normalization, or first render; each needs separate evidence. |
| Reopen D033 only with profiler evidence | Hundreds of sessions and thousands of tab rows now reproduce a multi-second initial mount, satisfying the prior decision's threshold for reconsidering full interactive DOM. |

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

## Next Step

Review the performance report, then execute Stage 1-4 with TDD and fresh
production benchmarks if implementation is approved.
