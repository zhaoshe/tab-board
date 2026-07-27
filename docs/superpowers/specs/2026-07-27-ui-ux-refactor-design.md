# TabBoard UI / UX Refactor Design

## Status

Approved for implementation on 2026-07-27. The user accepted the complete recommendation set from `findings.md`.

## Objective

Bring Manager, Popup, and Options to a clean Web Interface Guidelines baseline while preserving TabBoard's local-first, dense-but-calm workbench model and existing DnD/domain contracts.

Completion requires:

- no unresolved `$web-design-guidelines` findings in shipped UI files;
- zero serious or critical axe violations on Manager, Popup, and Options;
- keyboard-complete rename, note edit, menus/popovers, sidebar disclosure, and destructive flows;
- usable layouts at 390×844, 800×800, 1280×800, and 1440×900;
- consistent system/light/dark behavior and complete reduced-motion handling;
- URL-backed Manager workspace/category/Bin/search context;
- smaller, single-purpose Manager shell/header/style units;
- full project build, check, Vitest, E2E, and DnD regression gates passing.

## Product Constraints

- Keep Manager as the primary workbench; do not create a landing page.
- Preserve the horizontal session board and 360px desktop session-column model.
- Preserve all typed `@dnd-kit` payload, target, collision, replay, and persistence semantics.
- Do not merge one session into another by dropping session cards.
- Keep all session/open-tab rows in the DOM and retain `content-visibility`; do not add JS virtualization without new performance evidence.
- Keep Open Tabs query page-local and separate from saved-session search.
- Do not add runtime dependencies.

## Architecture

### Shared UI Foundations

Create small shared UI contracts:

- `AccessibleIconAction` owns icon-only accessible naming, tooltip policy, target size, and decorative icon semantics.
- `ConfirmDialog` owns destructive confirmation copy, safe initial focus, loading state, and explicit cancel/confirm actions.
- locale formatting helpers own `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`.
- page theme metadata keeps Mantine color scheme, native `color-scheme`, and `theme-color` synchronized.

These foundations may depend on React and Mantine, but not on Manager domain or storage modules.

### Manager Composition

Split responsibilities without changing behavior:

- `ManagerFrame`: page landmarks, skip link, topbar/sidebar/main composition.
- `ManagerDndCoordinator`: sensors, collision geometry, drag state, and overlay.
- `useSidebarDisclosure`: expanded/collapsed/compact state and focus restoration.
- `useCaptureReveal`: captured-session URL cleanup, category reveal, scrolling, and highlight.
- `WorkspaceMenu`: workspace switch/create/rename dialogs.
- `CategoryNav`: category DnD and selected navigation.
- `CategoryManager`: category CRUD and ordering dialogs.
- `ManagerSearchCommand`: search disclosure and shortcut handling.
- `ManagerGlobalActions`: one command model rendered as desktop actions or compact overflow.

The current `ManagerLayout` and `WorkspaceHeader` remain public composition entrypoints while their implementation delegates to these units.

### Responsive Header

- Category reorder hit areas are absolute overlays and never contribute to topbar height.
- Desktop mode shows workspace, categories, search, and utility icons in one 48px bar.
- Compact mode exposes one labelled “More actions” menu containing Import, Export, Trash, and Options; no capability disappears.
- Expanded compact search replaces the category/action lane instead of overlapping it.
- Session columns use `min(360px, available board width)` only below the compact breakpoint.

### Keyboard and Progressive Disclosure

- Session title supports double-click, Enter, and F2 rename.
- Session note is a semantic button when displayed.
- Item details use a stable popover: focus can enter actions, Escape closes, and focus returns to the trigger.
- Open Tabs row selection uses the checkbox as the semantic owner; no clickable generic wrapper is exposed.
- Sidebar collapse always focuses a visible control.
- Hover remains an enhancement; touch and keyboard paths do not depend on hover timing.

### Manager URL State

Use one framework-neutral page-state owner for:

- `workspace=<workspaceId>`
- `category=inbox|saved|archive|folder:<id>`
- `view=board|bin`
- existing `q=<search query>`

Initialization validates IDs against current state and falls back safely. Mutations use `history.replaceState` for transient search and `history.pushState` for user navigation. `popstate` restores the view without writing persistent TabBoard state.

### Popup

- Add `main` and a visually hidden H1.
- Show a compact hydration/loading state instead of blank content.
- Use contrast-safe primary styling.
- Dedupe requires confirmation because it closes browser tabs and the popup cannot provide durable undo.

### Options

- Follow the stored/system color scheme.
- Add `main`, valid radio-group labels, and contrast-safe semantic text tokens.
- Remove the dashboard-style usage cards.
- Keep daily controls in Basic; put Data Storage, Safety, shortcuts, and reset in an Advanced disclosure section.
- Stack header and actions on narrow screens.
- Reset requires confirmation.
- Storage migration copy exactly states the folder-wins conflict policy.

## Styling

`src/manager/styles/manager.css` becomes an import-only entrypoint for:

- `shell.css`
- `header.css`
- `sidebar.css`
- `session.css`
- `overlays.css`
- `responsive.css`

Each state selector has one owner. Shared page styles cover skip links, visually hidden headings, semantic muted text, focus-visible, touch action, modal overscroll containment, and reduced motion.

## Error and Feedback Behavior

- Form validation remains inline and focuses the first invalid field.
- Errors include a corrective next step.
- Async success/info uses polite announcements; errors use assertive alerts.
- Loading buttons remain enabled until work begins, then expose loading state.
- Unsaved inline title/note edits warn before navigation or view replacement.

## Verification

Automated:

- focused Vitest/DOM tests for every behavior change;
- `npm test`;
- `npm run build`;
- `npm run check`;
- `npm run test:e2e`;
- `git diff --check`.

Browser:

- `agent-browser a11y` for Manager, Popup, Options in light and dark;
- geometry assertions at 390×844, 800×800, 1280×800, 1440×900;
- reduced-motion computed-style checks;
- keyboard rename, popover action traversal, sidebar collapse focus, destructive confirmation, URL back/forward;
- existing DnD manual scenarios.

Review loop:

1. Fetch the latest Web Interface Guidelines.
2. Review all shipped HTML, TSX, and CSS UI files in `file:line` format.
3. Fix every finding with a failing test first.
4. Re-run targeted and broad verification.
5. Repeat until the review has no findings.
