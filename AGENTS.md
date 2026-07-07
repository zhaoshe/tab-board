# ZipTab Agent Guide

This file is the shared operating guide for AI agents working in this repo. `CLAUDE.md` should be a symlink to this file so Codex and Claude Code read the same project context.

## Project Snapshot

ZipTab is a local-first Chrome Manifest V3 tab manager inspired by OneTab and tabExtend. It saves browser tabs into recoverable sessions, then lets the user organize them with workspaces, categories, search, notes, drag and drop, import/export, and a new-tab manager page.

The project has no build step. It uses native ES modules, native DOM APIs, Chrome extension APIs, and `chrome.storage.local`.

## Read First

Before making meaningful changes, read these docs in order:

1. `README.md` for install, feature summary, and verification commands.
2. `docs/project-overview.md` for product positioning, current scope, and concepts.
3. `docs/feature-spec.md` for current behavior and interaction rules.
4. `docs/technical-architecture.md` for module boundaries, data schema, and key flows.
5. `docs/feature-evolution.md` and `docs/product-decisions.md` when changing product direction.

## Important Files

- `manifest.json`: extension permissions, entries, new-tab override, commands, omnibox.
- `manager.html` plus `src/manager.js` and `src/styles.css`: main workspace UI.
- `popup.html` plus `src/popup.js` and `src/popup.css`: compact toolbar popup.
- `options.html` plus `src/options.js` and `src/options.css`: settings page.
- `src/background.js`: service worker, Chrome API boundary, capture/restore/context menus/omnibox.
- `src/model.js`: state schema, normalize, creation helpers, import/export, matching logic.
- `src/store.js`: `chrome.storage.local` get/set/update wrapper.
- `src/icons.js`: local SVG icon registry and tooltip hydration.
- `tests/model.test.mjs`: model/import/export tests.
- `scripts/check-extension.mjs`: project sanity check used by `npm run check`.

## Commands

Use these from the repo root:

```sh
npm run icons
npm run check
npm test
```

`npm run icons` regenerates extension icons if needed. `npm run check` validates required files, JS syntax, and tests. There is no bundler or TypeScript compiler.

## Architecture Rules

- Keep pure data logic in `src/model.js`; it must not depend on DOM or Chrome APIs.
- Keep persistence in `src/store.js`; all writes should pass through `normalizeState()`.
- Keep Chrome API interactions in `src/background.js` unless a UI page must call an API directly.
- Keep manager UI work in `src/manager.js` and styling in `src/styles.css`.
- Prefer small, localized edits. `src/manager.js` is already large, so do not add broad abstractions unless they clearly reduce complexity.
- Do not introduce React, Vue, a bundler, TypeScript, or new runtime dependencies without an explicit product/maintenance reason.

## Product Model

- Workspace is the top-level context.
- Session is a saved browsing context.
- Tab item is either a link or a note. Legacy todo data is normalized to notes; do not reintroduce todo UI.
- Category is a single session assignment. A session can belong to at most one category.
- Built-in categories:
  - `Inbox`: sessions with no custom category and not starred.
  - `Starred`: sessions marked as starred.
- There is no separate `All items` category in the sidebar.
- Quick list / pinned workflow was removed; do not rebuild it unless explicitly requested.

## UX Rules

- The primary screen is the usable manager, not a landing page.
- The UI should feel like a dense but calm workbench: scannable, compact, and suitable for repeated use.
- Prefer icon buttons with tooltips over long text buttons.
- Keep common actions near the object they affect.
- The workspace switcher/header belongs in the main top bar.
- Search belongs in the workspace header area, not the left sidebar.
- The sidebar is for open tabs and categories.
- Open Tabs should only show tabs that can be stored under current settings.
- Selection mode for open tabs is explicit. Checked tabs are for creating sessions or batch dragging, not for automatic filtering.
- Filtering sessions by an open tab is triggered from a right-click/context action, not by merely checking a tab.
- Session tab items open on click. Per-item action buttons are intentionally minimized; use right-click menus for secondary actions.

## Drag And Drop Rules

Drag and drop is one of the most fragile areas. Be conservative.

- Session drag should reorder sessions and move them between categories.
- Do not merge session A into session B by dropping one session onto another; this was removed because it caused accidental merges.
- While dragging a session, show a clear target line/placeholder at the final insertion point.
- On drag start, if the target position is not yet recalculated, the placeholder should stay at the session's original position.
- The dragged session should remain visually attached to the pointer via a valid drag image.
- Dragging one or more tab items can either add them to an existing session or create a new session at the indicated insertion point.
- Avoid persistent "New session" cards. New-session targets should appear as part of drag feedback when relevant.
- If changing drag behavior, manually test dragging:
  - a session within the same category,
  - a session across categories,
  - one saved tab into another session,
  - multiple selected open tabs into an existing session,
  - multiple selected tabs into a new session position.

## Import And Export

- Import should support ZipTab JSON/text and OneTab export text through the normal Import entry.
- Do not add a separate "Import from OneTab" entry unless explicitly requested.
- Export should preserve enough data for round-tripping ZipTab sessions.
- The sidebar utility actions are Bin, Import, Export, and Options.
- Import icon semantics should point inward/down; Export should point outward/up.

## Settings And Special URLs

- Capture settings can exclude pinned tabs, duplicate URLs, `chrome://` URLs, and `file://` URLs.
- `chrome://` and `file://` storage are separate settings and default to off.
- Respect Chrome API restrictions when restoring or storing special URLs.

## Documentation Rules

When a change affects product behavior or project direction:

1. Update `docs/feature-evolution.md`.
2. Update `docs/product-decisions.md` if there is a meaningful tradeoff.
3. Update `docs/product-story.md` if the user-facing positioning changes.
4. Update `docs/feature-spec.md` or `docs/technical-architecture.md` if the current behavior or architecture changes.

Keep docs concise and traceable: problem, decision, reason, tradeoff, current status.

## Git And Safety

- The working tree may contain user changes. Never revert unrelated changes.
- Check `git status --short` before large edits or commits.
- Keep generated artifacts and local indexes out of git. `.codegraph/`, `.agents/`, build output, zips, CRX, PEM files, and `node_modules/` are ignored.
- Prefer non-destructive git commands. Do not run `git reset --hard` or checkout files unless explicitly requested.

## Verification Checklist

For most changes, run:

```sh
npm run check
npm test
```

For syntax-only or documentation-only changes, at least confirm the changed files and run the relevant lightweight check when practical. For UI/drag changes, also manually test in Chrome because automated tests do not cover browser DnD behavior.
