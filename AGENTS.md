# TabBoard Agent Guide

This file is the shared operating guide for AI agents working in this repo. `CLAUDE.md` is a symlink to this file so Codex and Claude Code read the same project context.

## Project Snapshot

TabBoard is a local-first Chrome Manifest V3 tab manager inspired by OneTab and tabExtend. It saves browser tabs into recoverable sessions, then lets the user organize them with workspaces, categories, search, notes, drag and drop, import/export, and a new-tab manager page.

The project is a React + TypeScript app built with Vite. It uses React 18, Mantine v7, Zustand, `@dnd-kit`, `lucide-react`, Chrome extension APIs, and a browser/file Storage Authority. The extension is packaged with `@crxjs/vite-plugin`.

## Read First

Before making meaningful changes, read these docs in order:

1. `README.md` for install, feature summary, and verification commands.
2. `docs/project-overview.md` for product positioning, current scope, and concepts.
3. `docs/feature-spec.md` for current behavior and interaction rules.
4. `docs/technical-architecture.md` for module boundaries, data schema, and key flows.
5. `docs/feature-evolution.md` and `docs/product-decisions.md` when changing product direction.

## Important Files

- `manifest.json`: extension permissions, entries, new-tab override, commands, omnibox.
- `manager.html` plus `src/manager/main.tsx`: main workspace UI entry; `src/manager/ManagerApp.tsx` composes the app.
- `popup.html` plus `src/popup/`: compact toolbar popup.
- `options.html` plus `src/options/`: settings page.
- `src/background/service-worker.ts`: service worker, Chrome API boundary, capture/restore/context menus/omnibox.
- `src/background/statePersistence.ts`: serialized mutation queue and normalized atomic writes.
- `src/shared/model/`: state schema, types, normalize, creation helpers, import/export, matching logic.
- `src/shared/store/`: browser/file Storage Authority, projections, immutable state mutations, mutation validation, Zustand facade.
- `src/manager/components/`: Mantine shell, workspace header, sidebar/Open Tabs, session board, Bin, import/export, search, overlays.
- `src/manager/core/`: pure selectors, commands, capture, open-tabs, typed DnD contracts, and core tests.
- `src/manager/hooks/`: hydration, runtime message, Open Tabs, and overlay lifecycle adapters.
- `scripts/check-extension.mjs`: project sanity check used by `npm run check`.

## Commands

Use these from the repo root:

```sh
npm run dev
npm run build
npm run check
npm test
npm run icons
```

`npm run dev` starts the Vite dev server. `npm run build` runs `tsc --noEmit` then `vite build`. `npm run check` builds and then validates required files and build output via `scripts/check-extension.mjs`. `npm test` runs the Vitest suite (`vitest run`, happy-dom environment). `npm run icons` regenerates extension icons if needed.

## Architecture Rules

- Keep pure data logic in `src/shared/model/`; it must not depend on DOM or Chrome APIs.
- Keep persistence in `src/shared/store/`; all writes should pass through `normalizeState()`.
- Keep Chrome API interactions in `src/background/` unless a UI page must call an API directly.
- Keep manager UI work in `src/manager/components/`, pure logic in `src/manager/core/`, and runtime adapters in `src/manager/hooks/`.
- Prefer small, localized edits. Keep the model/store/background boundaries clean, and do not add broad abstractions unless they clearly reduce complexity.
- Do not add new runtime dependencies without an explicit product/maintenance reason.

## Product Model

- Workspace is the top-level context.
- Session is a saved browsing context.
- Tab item is either a link or a note. Legacy todo data is normalized to notes; do not reintroduce todo UI.
- Category is a single session assignment. A session can belong to at most one category.
- Built-in categories:
  - `Inbox`: sessions with no custom category and not starred.
  - `Saved`: sessions marked as starred.
  - `Archive`: sessions marked as archived.
- There is no separate `All items` category in the sidebar.
- Quick list / pinned workflow was removed; do not rebuild it unless explicitly requested.

## UX Rules

- The primary screen is the usable manager, not a landing page.
- The UI should feel like a dense but calm workbench: scannable, compact, and suitable for repeated use.
- Prefer icon buttons with tooltips over long text buttons.
- Keep common actions near the object they affect.
- The workspace switcher/header belongs in the main top bar.
- Search belongs in the workspace header area, not the left sidebar.
- The sidebar is for open tabs and browser windows.
- Open Tabs hides extension pages and custom URL exclusions. Pinned tabs are storable when allowed by the shared capture policy and stay open after automatic capture/dedupe.
- Selection mode for open tabs is explicit. Checked tabs are for creating sessions or batch dragging, not for automatic filtering.
- Filtering sessions by an open tab is triggered from a right-click/context action, not by merely checking a tab.
- Session tab items open on click. Per-item action buttons are intentionally minimized; use right-click menus for secondary actions.
- Workspace names and emoji are edited together. Workspace/category order is persisted through typed mutations.

## Drag And Drop Rules

Drag and drop is one of the most fragile areas. Be conservative.

- Session drag should reorder sessions and move them between categories.
- Do not merge session A into session B by dropping one session onto another; this was removed because it caused accidental merges.
- Pointer/touch drag uses object surfaces, never a visible or hidden drag handle. Keyboard-equivalent results use named Hybrid Commands.
- While dragging a session, show a clear target line/placeholder at the final insertion point. At pickup the source slot remains the current target.
- The dragged session should remain visually attached to the pointer via a valid drag image.
- Dragging tab items can add them to an existing session. Creating a new session requires an explicit start/between/end `new-session-insert` Gap Anchor, or the empty-category first slot.
- Avoid persistent "New session" cards. New-session targets should appear as part of drag feedback when relevant.
- If all tabs from one saved session are selected, suppress New Session targets while still allowing an explicit merge into another existing session.
- If changing drag behavior, manually test dragging:
  - a session within the same category,
  - a session across categories,
  - one saved tab into another session,
  - multiple selected open tabs into an existing session,
  - multiple selected tabs into a new session position.

## Import And Export

- Import should support TabBoard JSON/text and OneTab export text through the normal Import entry.
- Do not add a separate "Import from OneTab" entry unless explicitly requested.
- Export should preserve enough data for round-tripping TabBoard sessions.
- Bin is direct in the manager top bar; Import, Export, and Options live in the global More menu.
- Import icon semantics should point inward/down; Export should point outward/up.

## Settings And Special URLs

- Capture settings include duplicate handling, one custom exclusion rule set, and separate compatibility toggles for `chrome://` / `file://` URLs.
- Pinned tabs are selectable and savable, but automatic capture and dedupe never close pinned source tabs.
- Respect Chrome API restrictions when restoring or storing special URLs.
- Local-folder mode is a substitute backend. Keep the directory handle in IndexedDB; persist only the configured-target/active-backend status projection in `chrome.storage.local`.

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
- Keep generated artifacts and local indexes out of git. `dist/`, build output, zips, CRX, PEM files, and `node_modules/` are ignored.
- Prefer non-destructive git commands. Do not run `git reset --hard` or checkout files unless explicitly requested.

## Verification Checklist

For most changes, run:

```sh
npm run build
npm run check
npm test
```

For documentation-only changes, at least confirm the changed files and run the relevant lightweight check when practical. For UI/drag changes, also manually test in Chrome because automated tests do not cover browser DnD behavior.
