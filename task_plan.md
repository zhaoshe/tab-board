# ZipTab Nord UI Redesign Task Plan

## Goal

按 `docs/nord-ui-redesign.md` 实施 Nord + Web Awesome UI redesign，并在每个阶段使用该文档作为防漂移基线。

## Source of Truth

- Design and implementation contract：`docs/nord-ui-redesign.md`
- Research findings：`findings.md`
- Execution log：`progress.md`

## Current Status

Phase 0-6 的自动实现、测试、文档与 review 已完成；Phase 6 仍等待 Chrome manual gate，不能标记整体完成。

| Phase | Status | Gate |
|---|---|---|
| 0. Web Awesome dependency/delivery spike | complete | Automated local MV3 smoke passed; manual Manager check deferred |
| 1. Nord tokens and CSS consolidation | complete | 93 automated tests passed; visual acceptance deferred |
| 2. Unified header rail | complete | 97 automated tests passed; visual acceptance deferred |
| 3. Board and session surfaces | complete | Regression/source contracts and full check passed |
| 4. Web Awesome control migration | complete | Bounded shell-control tranche passed; broad shared controls deferred |
| 5. Popup and Options alignment | complete | Existing IA/behavior preserved; theme contracts passed |
| 6. Full verification and docs | in_progress | Automated/docs/review complete; Chrome manual gate pending |

### Manager Startup Resilience

- Development：complete。
- Automated verification：complete；最新 `npm test` 与 `npm run check` 均为 193/193，extension check passed，`git diff --check` passed；此前 `npm run check:release` 已验证 Web Awesome 3.10.0 provenance。
- Spec review / quality review：passed。
- Chrome manual regression：pending；遵守 GUI 单次最多 5 秒规则。
- Scope：不改 state schema、DnD 语义或 Chrome API；不调整既有 #211-#217 状态。

## Required Execution Loop

For every phase:

1. Read `docs/nord-ui-redesign.md`.
2. Read this plan and the latest `progress.md` entry.
3. Mark only one phase `in_progress`.
4. Implement only that phase scope.
5. Run focused tests.
6. Update `progress.md`.
7. Mark development complete after automated tests pass.

Phase 1–6 的剩余开发、自动验证、文档和 review 已完成。Chrome 人工操作遵守单次最多 5 秒限制；manual gate 仍 pending，无法在 5 秒内完成时停止并请求用户协助。

## Hard Constraints

- Do not migrate React or other frameworks.
- Do not use CDN/runtime remote assets.
- Do not modify capture/restore product rules.
- Do not change DnD semantics while migrating controls.
- Do not use `wa-card` for sessions.
- Do not add a second design system.
- Do not append another CSS override layer instead of consolidating current manager CSS.
- Do not mark complete without unpacked Chrome manual regression.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Previous planning files did not exist | 1 | Created canonical design doc and root planning files before implementation |
