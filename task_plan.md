# TabBoard UI / UX Refactor Plan

## Goal

Implement every approved recommendation in `findings.md`, then repeatedly run the latest Web Interface Guidelines review and browser verification until no unresolved issue remains.

## Current Phase

Complete - all phases and verification gates passed.

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

## Decisions

| Decision | Reason |
|---|---|
| Audit all 3 extension surfaces | The user requested a project-level UI/UX review, not a single component review. |
| Use live rendered measurements | Prior work established that CSS-only reasoning caused layout drift in this project. |
| Preserve the "dense but calm" product direction | Recommendations should improve usability without turning the manager into a spacious dashboard or landing page. |
| Treat drag-and-drop as a constrained surface | Product guidance identifies DnD as fragile; recommendations must avoid casual structural changes to its geometry. |
| Implement all accepted findings | The user explicitly approved the entire recommendation set. |
| Use inline execution | Subagents were not explicitly requested; perform TDD locally in this worktree. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Reduced-motion computed-style probe queried a missing session card while Inbox was empty | 1 | Switch to Saved before measuring session-specific transitions; keep shell-only checks independent of content. |
| `agent-browser network route` did not fulfill a top-level navigation to a nonexistent Options preview path | 1 | Use the real Vite-served `options.html` with a browser init script that installs a minimal Chrome API before application modules run. Discard the Chrome error-page audit. |
| New component tests used `.test.tsx`, but Vitest includes only `src/**/*.test.ts` | 1 | Rename tests to `.test.ts`; they already use `createElement` and require no JSX transform. |
| Split CSS lost end-target and drag-feedback geometry, breaking keyboard DnD and visual placeholders | 1 | Restored the original target/placeholder/marker rules and added canonical insertion-index keyboard coordinates plus repeated E2E coverage. |
| Concurrent browser/build verification caused cold-run keyboard timing failures | 1 | Serialize final gates and synchronize the E2E with dnd-kit live-region target announcements. |

## Next Step

No implementation work remains. Summarize the verified changes and evidence.
