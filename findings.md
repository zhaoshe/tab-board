# TabBoard UI / UX Audit Findings

## Baseline

- Product intent: a local-first, manager-first Chrome extension that behaves as a dense but calm workbench.
- Main spatial model: full-height Open Tabs sidebar, 64px toolbar, category tabs, and a horizontally scrolling session board.
- Main UX risks already acknowledged by the project: icon-only discoverability, right-click-only filtering, session drag geometry, narrow-screen behavior, and very large boards.
- Latest external review rules were fetched from Vercel's Web Interface Guidelines on 2026-07-27.
- Prior project evidence recommends live browser measurements rather than inferring final geometry from CSS alone.

## 2026-08-02 Crisp Utility Implementation State

- Foundations, Manager interactions, and DnD are implemented and verified.
- Remaining production gaps are concentrated in Options/Popup and the icon/token
  migration: default toolbar action is still `store`; Options retains old
  subtitle/copy; Popup still exposes Group filtering; production surfaces still
  import Tabler icons.
- The final phase must preserve the lightweight Options settings projection and
  lazy Advanced chunk established by the startup performance work.
- Storage status is now its own bootstrap projection:
  `configuredTarget` expresses the user's durable choice while
  `activeBackend` expresses the current writer. Automatic file fallback keeps
  `configuredTarget: file`, folder name, fallback reason, and the last file
  freshness timestamp; it changes only `activeBackend` to `browser`.
- `DataStorageCard` can therefore render Browser, Local Folder Ready, and
  Local Folder Fallback without reading the canonical TabBoard state, loading
  the file adapter, or retrieving the directory handle from IndexedDB.

## Early Architecture Signals

- `src/manager/components/shell/ManagerLayout.tsx` is 1,010 lines.
- `src/manager/components/workspace/WorkspaceHeader.tsx` is 757 lines.
- `src/manager/styles/manager.css` is 1,699 lines.
- These sizes do not prove a defect, but they indicate mixed ownership and raise regression risk for visual iteration.
- The current architecture deliberately keeps `@dnd-kit` geometry and product surfaces custom; any refactor must preserve typed drag contracts and measurement behavior.

## External Guidelines Snapshot

High-value checks for this project:

- Semantic controls and accessible names for icon-only actions.
- Visible `:focus-visible` states and grouped `:focus-within` treatment.
- Reduced-motion support and no `transition: all`.
- Robust long-text handling and `min-width: 0` in flex layouts.
- Destructive actions must be confirmed or undoable.
- Large lists need virtualization or an equivalent rendering strategy.
- Stateful UI should be deep-linkable where useful.
- Modal/drawer overscroll containment.
- Intentional dark-mode native control treatment and matching `theme-color`.

## Code Audit

### Accessibility and interaction

- `manager.html:4` / `src/manager/components/shell/ManagerLayout.tsx:907` / `src/manager/components/shell/ManagerLayout.tsx:938` - Manager has landmarks but no skip link and no page-level heading. Keyboard users must traverse the full top bar/sidebar before main content.
- `src/manager/components/shell/ManagerLayout.tsx:569` / `src/manager/components/sidebar/Sidebar.tsx:119` - collapsing the sidebar tries to restore focus to `sidebarRailToggleRef`, but `Sidebar` never attaches that ref to an element. Focus restoration silently fails.
- `src/manager/components/sessions/SessionCard.tsx:435` - session title is a `<button>` whose only behavior is `onDoubleClick`; Enter/Space do nothing. This contradicts the feature spec's Enter/F2 rename path and exposes a focusable control without a keyboard action.
- `src/manager/components/sessions/SessionCard.tsx:497` - session note is a `Box`/`div` with `onClick`; it cannot be activated from the keyboard.
- `src/manager/components/sidebar/OpenTabsPanel.tsx:406` - open-tab row uses a non-semantic `MantineGroup`/`div` click target to toggle selection. The nested checkbox is accessible, but the larger advertised hit area is pointer-only.
- `src/manager/components/bin/BinView.tsx:78` - decorative file/session icon uses `ActionIcon`, producing a focusable button with no action or accessible name.
- `src/manager/components/bin/BinView.tsx:112` - restore icon button lacks `aria-label`; tooltip text is not a replacement for an accessible name.
- `src/manager/components/bin/BinView.tsx:122` - permanent-delete icon button lacks `aria-label`.
- `src/manager/components/import-export/ImportModal.tsx:170` - import textarea has no visible label or `aria-label`.
- `src/manager/hooks/useToast.tsx:96` - asynchronous notifications are rendered without an explicit live region; verify Mantine's generated semantics in the browser.
- `src/manager/hooks/useManagerOverlays.ts:708` / `src/manager/hooks/useManagerOverlays.ts:1114` - focus opens a portaled `role="dialog"`, but focus is not moved into it; leaving the trigger schedules close in 120ms. Pin/Copy/Edit actions inside the popover are effectively outside normal keyboard traversal.
- `src/options/OptionsApp.tsx:166` / `src/options/components/FolderPickerDialog.tsx:223` / `src/options/components/DisconnectDialog.tsx:72` - radio groups have no programmatic group label; adjacent explanatory text is not associated.
- `src/options/OptionsApp.tsx:64` - “Reset to defaults” applies immediately without confirmation or undo.
- `src/popup/PopupApp.tsx:150` - Dedupe immediately closes duplicate tabs and the popup without confirmation or an in-product undo path.

### Forms and copy

- `src/manager/components/search/SearchBar.tsx:58` - search input has no `name`, `autocomplete`, or explicit label/`aria-label`; placeholder alone is not a durable label.
- `src/manager/components/search/SearchBar.tsx:61` - placeholder uses `...` instead of `…`.
- `src/manager/components/import-export/ImportModal.tsx:171` - placeholder uses `...` instead of `…`.
- `src/manager/components/sessions/SessionCard.tsx:492` and `src/manager/components/sessions/TabItemRow.tsx:237` - note placeholders use `...` instead of `…`.
- `src/manager/components/workspace/WorkspaceHeader.tsx:659` / `src/manager/components/workspace/WorkspaceHeader.tsx:706` - category inputs have labels but no `name` or autocomplete policy.
- `src/manager/components/bin/BinView.tsx:28` - relative time is manually formatted; prefer `Intl.RelativeTimeFormat` and a locale-aware absolute fallback.
- `src/options/components/DataStorageCard.tsx:51` - “Last saved” relative time is manually formatted and can produce awkward future/negative values; use `Intl.RelativeTimeFormat`.
- `src/options/components/FolderPickerDialog.tsx:247` - “Continue” does not name the selected destructive migration action.

### Motion, layout, and theme

- `src/manager/components/import-export/ImportModal.tsx:141` - `transition: all` violates the guideline; transition border/background explicitly.
- `src/manager/styles/manager.css:19` - reduced-motion handling covers only `.manager-sidebar__overlay`; grid, control fades, highlight/scroll behavior, and other transitions remain active.
- `src/manager/components/shell/ManagerLayout.tsx:779` and `src/manager/components/sidebar/OpenTabsPanel.tsx:283` - programmatic smooth scrolling is not gated by `prefers-reduced-motion`.
- `src/manager/components/import-export/ImportModal.tsx:179` - fixed `gray-0` background is not semantic and is likely to produce low contrast in dark mode.
- `src/options/OptionsApp.tsx:86` - Options hard-codes `defaultColorScheme="light"` and does not call `useColorScheme`; the Appearance setting changes stored state but the settings page itself remains light.
- `src/shared/styles/tooltip.css:1` - every Mantine tooltip is forcibly hidden 1 second after mounting while the component can remain logically open. This reduces discoverability and conflicts with persistent hover/focus content expectations.
- `src/manager/styles/manager.css:158` and `src/manager/styles/manager.css:183` - duplicate `.manager-search-slot` and expanded-state declarations conflict (`flex: 1` then `flex: 0`, `min-width: 220px` then `240px`), making responsive behavior hard to reason about.
- `src/manager/styles/manager.css:550` and `src/manager/styles/manager.css:615` - collapsed sidebar overlay is defined first as an absolute hidden overlay and later overridden as a relative visible compact panel. The same state has competing spatial models.
- `src/manager/components/sidebar/Sidebar.tsx:26` - `SidebarRail` is defined but never rendered; it duplicates the current compact-sidebar concept and should be removed or made the single owner.
- `manager.html:4` / `popup.html:4` / `options.html:4` - entry pages lack `theme-color`; current dark-theme setup also needs verification of root `color-scheme`.

### Content and state

- `src/manager/components/workspace/WorkspaceHeader.tsx:480` - expanding search truncates category navigation to the first 3 categories and turns “+N” into a button that closes search rather than revealing categories. The control's accessible name promises more categories but performs a different action.
- `src/manager/components/shell/ManagerLayout.tsx:359` - selected category and Bin view are local state only; unlike search, they cannot be deep-linked or restored through URL/history.
- `src/manager/components/workspace/WorkspaceHeader.tsx:398` - workspace create/rename uses native `window.prompt`, creating a visual/validation/focus model inconsistent with category management.
- `src/options/components/FolderPickerDialog.tsx:239` - migration copy says “newer items win,” while product decision D040 specifies same-ID folder data wins. High-risk storage UI must describe the real conflict policy exactly.
- `src/options/OptionsApp.tsx:131` - settings begins with two large usage-stat cards before daily controls; this adds dashboard weight to a utility page and pushes the high-value configuration below the fold.
- `src/popup/PopupApp.tsx:172` - popup renders nothing while hydrating, creating a blank transient state with no progress or recovery affordance.

### Maintainability

- `src/manager/components/shell/ManagerLayout.tsx` is 1,010 lines and combines DnD geometry, capture feedback, URL cleanup, sidebar state, focus/highlight lifecycle, and composition.
- `src/manager/components/workspace/WorkspaceHeader.tsx` is 757 lines and combines workspace menus, category DnD, category CRUD modals, search expansion, and global shortcuts.
- `src/manager/styles/manager.css` is 1,699 lines with duplicated and later-overridden state rules. Refactoring should establish explicit shell/header/session style ownership before visual iteration.

## Rendered Audit

### Default desktop manager

- Preview: `http://127.0.0.1:5173/dev/manager-preview.html`, default viewport, seeded manager fixture.
- Runtime: manager shell rendered with no page errors.
- Accessibility tree exposes top-level workspace/category/header actions and the main board region, but no page heading.
- Axe 4.12.1: 1 confirmed violation (`page-has-heading-one`), plus incomplete checks for category menu `aria-controls` and text contrast that need manual interpretation.
- Open Tabs rows such as “Active HTTP tab” and “Pinned tab” are exposed as generic clickable nodes rather than buttons/links, confirming the static semantic concern.
- The default fixture opens Inbox while its 2 saved sessions live in Saved/custom category; the first board view is therefore an empty state despite substantial seeded content. Category counts/active context need visual verification to judge whether this is clear.
- Evidence screenshot: `/tmp/tabboard-manager-desktop.png`.

### Desktop geometry and keyboard

- At the measured 1280×577 viewport, `.manager-topbar` is 48px high but `.manager-category-nav` and every `.manager-category-item` are 100px high with `y=-26.5px`. The before/after reorder targets participate as vertical blocks around each 36px category button, so the nav is centered as a 100px column and clipped by the top bar. This is a concrete layout defect, not a spacing preference.
- Saved board geometry at the same viewport: sidebar 281.6px, main 998.4px, board 966.4px, session card 360×497px. The horizontal workbench model itself fits the viewport as designed.
- Focusing `.session-card__title` and pressing Enter leaves the button focused and does not create the title input; F2 behaves the same. This confirms the documented keyboard rename path is absent.
- Focusing a saved-tab title opens a detail popover with 2 actions. Pressing Tab closes the popover and moves focus to the row's Delete action, so the popover actions cannot be reached through normal forward keyboard navigation.
- Activating “Collapse sidebar” produces the expected 54px rail and expands main content from x=281.6 to x=54, but active focus becomes `<body>` because the intended rail-toggle focus target is not mounted.

### Responsive manager

- At 1440×900 the category nav remains 100px tall and vertically clipped, confirming the defect is not caused by a short viewport.
- At 800×800 the shell auto-collapses to a 54px sidebar as intended; all 4 utility actions remain visible and body dimensions stay at the viewport size.
- At 390×844 body dimensions still match the viewport (no global horizontal overflow), and the category nav becomes a 111px horizontal scroller.
- At 390px, Import, Export, and Trash are `display:none`; only Options remains. There is no overflow menu or alternate narrow-screen entry, so 3 product features become unreachable.
- Expanding search at 390px creates a 280px input at x=110 while category buttons remain underneath it. The controls overlap; Options is pushed to x=394 (outside the 390px viewport). The “1 more categories” control stays visible, but activating it closes search rather than exposing the missing category.
- Main board at 390px is 304px wide at x=70. A 360px session card therefore relies on board-level horizontal scrolling; this preserves the desktop-column model but should be an explicit compact-mode decision rather than an accidental fallback.
- Evidence screenshot: `/tmp/tabboard-manager-390.png`.
- Expanded-search evidence: `/tmp/tabboard-manager-390-search.png`.

### Theme

- Manager dark mode applies correctly at runtime: Mantine scheme is `dark`, native computed `color-scheme` is `dark`, and body/topbar backgrounds are dark.
- No `meta[name="theme-color"]` exists, so browser chrome/theme integration cannot match the page background.

### Popup

- Popup preview renders successfully with Save, pinned/group filters, Dedupe, Manager, and Settings actions exposed to the accessibility tree.
- Axe 4.12.1 reports 4 violations:
  - Save button text contrast is 3.55:1 (`#fff` on `#228be6`) at 14px normal weight; expected 4.5:1.
  - no main landmark;
  - no level-one heading;
  - content is outside landmarks.
- The product's compact quick-action hierarchy is otherwise easy to parse in the accessibility snapshot.
- Evidence screenshot: `/tmp/tabboard-popup.png`.

### Options

- Real `options.html` was loaded with a temporary browser-only Chrome API mock; no repository preview page or dependency was added.
- System preference is dark, but runtime `data-mantine-color-scheme`, computed `color-scheme`, and body background are all light/white. This confirms the Appearance setting does not apply to the Options surface.
- Default page content is 1,928px tall at a 577px viewport and contains 9 cards. The two usage-stat cards consume the first major block before settings, weakening utility-page scan speed.
- At 390×844 there is no horizontal page overflow, but the document grows to 2,052px. The header, statistics, and advanced actions remain 2-column/row layouts rather than switching to a more scannable compact stack.
- Axe 4.12.1 reports 3 violation groups:
  - 25 color-contrast nodes, dominated by `c="dimmed"` text at 3.32:1 and light-blue actions around 3.16:1;
  - no main landmark;
  - content outside landmarks.
- Axe also marks the Toolbar radiogroup's `aria-labelledby` as pointing to a missing ID, confirming it lacks a valid accessible group name. The segmented Appearance control also produced an incomplete contrast check for the selected “System” label.
- “Settings saved” uses a `role="alert"` notification, so it is announced despite lacking explicit `aria-live`; the Manager toast system still needs separate verification because it is implemented independently.
- “Reset to defaults” opens no dialog and applies immediately.
- Evidence screenshot: `/tmp/tabboard-options-live.png`.
- Narrow screenshot: `/tmp/tabboard-options-390.png`.

### Reduced motion

- With `prefers-reduced-motion: reduce` explicitly active, session action/created/drag-handle transitions remain 120ms and shell grid/sidebar transitions remain 140–180ms. The current reduced-motion CSS does not cover these selectors.

## Recommendation Themes

### Priority 0 - Fix before visual redesign

1. Repair category-strip geometry.
   - Make reorder targets overlay/inset hit areas instead of normal-flow blocks.
   - Keep each category item and nav at the 48px topbar height.
   - Add a browser assertion that nav/button boxes stay inside the topbar at 390, 800, 1280, and 1440px.

2. Define a real compact command model.
   - At <=760px, move Import/Export/Trash/Options into one labelled overflow menu instead of hiding 3 actions.
   - Search should replace the category/action lane or open as a command overlay; it must not coexist at fixed 280px width with the full header.
   - Keep the desktop board model, but explicitly set compact session-column width to `min(360px, available board width)` if narrow manager use is supported.

3. Restore keyboard contracts.
   - Session title: Enter/F2 starts rename; Space must not silently do nothing on a focusable button.
   - Session note: use a button/unstyled button or add complete keyboard semantics.
   - Detail popover: either make it a non-interactive tooltip and move actions into a menu, or make it a real popover/dialog with focus transfer, roving/tab order, Escape, and focus return.
   - Sidebar collapse: focus the visible collapsed control; remove the unmounted `SidebarRail` path or make it the single compact owner.

4. Correct high-risk settings behavior.
   - Apply the selected/system theme to Options.
   - Make file-migration conflict copy match the real folder-wins behavior.
   - Confirm reset-to-defaults and dedupe/close operations, or provide an explicit undo where technically possible.

5. Clear the accessibility baseline.
   - Add `main`/heading structure to Popup and Options; add a visually hidden H1 and skip link to Manager.
   - Fix Popup Save contrast and Options dimmed/action contrast.
   - Add missing names to Bin action icons, label radio groups, label Import/Search textareas/inputs, and remove fake non-action buttons.

### Priority 1 - Establish maintainable UI ownership

1. Split `ManagerLayout.tsx`.
   - `ManagerFrame`: landmarks and page grid only.
   - `useSidebarDisclosure`: expanded/collapsed/compact focus lifecycle.
   - `ManagerDndCoordinator`: sensors, geometry, overlay, drop lifecycle.
   - `useCaptureReveal`: query/category target reveal and highlight.
   - `ManagerDialogs`: Import/Export mounting.

2. Split `WorkspaceHeader.tsx`.
   - `WorkspaceMenu`.
   - `CategoryNav` + `CategoryManager`.
   - `ManagerSearchCommand`.
   - `ManagerGlobalActions` with desktop and compact renderers from one command model.

3. Split `manager.css` by stable ownership.
   - `shell.css`, `sidebar.css`, `header.css`, `session.css`, `overlays.css`, `responsive.css`.
   - Define one selector owner for each state. Remove duplicate `.manager-search-slot` and competing collapsed-sidebar models.
   - Use semantic color tokens in the Mantine theme for muted text, surfaces, danger, focus, and selected controls; test both color schemes.

4. Standardize interaction primitives.
   - A shared icon-action wrapper should guarantee accessible name, tooltip policy, target size, focus-visible, and coarse-pointer behavior.
   - A shared destructive-confirm flow should cover Bin, settings reset, category deletion, session deletion, and tab-closing actions.
   - A shared form policy should set labels, names, autocomplete behavior, inline error focus, and `…` copy.

### Priority 2 - Improve product clarity

1. Reduce Settings page weight.
   - Remove or demote the 2 usage-stat cards.
   - Keep Basic groups in one calm vertical form; move storage and dangerous/low-frequency controls into Advanced.
   - Stack header/stats/actions at narrow widths.

2. Make state understandable and recoverable.
   - Sync workspace/category/Bin/search to URL parameters or a small route-state owner so reload/back/forward preserve context.
   - Keep Open Tabs filter page-local; it is transient and correctly separate from saved-session search.

3. Improve discovery without increasing permanent chrome.
   - Keep hover disclosure as enhancement, but provide keyboard/touch-stable menus.
   - Surface category/session counts where they help orientation; do not rely on right-click-only knowledge for first-use critical flows.
   - Replace native prompts with the same validated modal/form pattern used by categories.

4. Complete platform polish.
   - Honor reduced motion across all shell/fade/scroll transitions.
   - Add `theme-color`; preserve root `color-scheme`.
   - Use `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`.
   - Add modal overscroll containment and intentional touch behavior.

### Approaches

#### A. Compliance-only patch

- Scope: fix P0 accessibility/layout defects in place.
- Benefit: fastest and lowest DnD risk.
- Cost: keeps 1,010-line shell, 757-line header, duplicate CSS ownership, and future regression risk.
- Use when: a release blocker must be cleared immediately.

#### B. Two-speed focused refactor - recommended

- Step 1: land P0 fixes without changing data or DnD contracts.
- Step 2: extract shell/header/command/style ownership while preserving current product layout.
- Step 3: simplify Options and add URL-backed manager context.
- Benefit: immediate usability gains plus lower long-term visual iteration cost.
- Cost: moderate; requires visual regression and keyboard/DnD gates for each slice.

#### C. Full adaptive redesign

- Scope: separate desktop workbench and compact manager compositions, redesign header/sidebar/popovers together.
- Benefit: strongest small-window experience.
- Cost: highest product and DnD risk; likely to reopen settled board decisions.
- Recommendation: defer until usage data proves the narrow manager is a primary workflow.

### Acceptance gates

- Axe: 0 serious/critical violations on Manager, Popup, and Options; no missing landmark/heading/name issues.
- Keyboard: all exposed controls reachable and actionable; session rename Enter/F2; popover/menu Escape and focus return; collapse retains visible focus.
- Responsive snapshots/geometry at 390×844, 800×800, 1280×800, and 1440×900:
  - no overlapping controls;
  - no action becomes unreachable;
  - category button boxes stay inside the topbar;
  - no body-level horizontal overflow.
- Theme: Manager/Popup/Options all follow system/light/dark; contrast passes in both schemes.
- Reduced motion: shell, disclosure fades, smooth scrolling, highlights, and spinners honor the preference.
- Preserve existing DnD manual gates and E2E: session reorder, cross-category move, saved/open tab drop, multi-select drop, new-session insertion.
- Preserve current performance strategy: structural sharing, fine-grained overlay subscriptions, deferred Open Tabs query, and `content-visibility`; do not add JS virtualization without new measurements.

## Final Guidelines Review - 2026-07-27

Fresh source: `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` (180 lines).

### Static findings to resolve

- `src/manager/components/sidebar/OpenTabsPanel.tsx` - Open Tabs filter lacks a meaningful `name`, explicit `autocomplete`, and ellipsis placeholder; favicon images lack explicit dimensions.
- `src/manager/components/sessions/SessionCard.tsx` - inline title/note editors lack names and labels; session deletion always uses native `confirm()` instead of the shared confirmation flow and ignores the user setting.
- `src/manager/components/sessions/TabItemRow.tsx` - note editor lacks name/label/autocomplete; note deletion is destructive and immediate.
- `src/manager/hooks/useManagerOverlays.ts` - saved time uses direct `toLocaleString()` rather than the shared `Intl.DateTimeFormat` owner; popover favicon images lack explicit dimensions.
- `src/manager/components/import-export/ExportModal.tsx` - format control lacks an accessible group name; export textarea lacks a meaningful `name`; copy feedback is visual-only.
- `src/manager/components/import-export/ImportModal.tsx` - import textarea should disable spellcheck; error copy needs an actionable next step; decorative icons need explicit hiding.
- `src/options/OptionsApp.tsx` - custom-filter placeholder lacks the required ellipsis/example pattern; setting controls should have stable names; hydration currently returns a blank page; toast visibility updates should be an explicit polite live region.
- `src/popup/PopupApp.tsx` - decorative icons are not consistently hidden from the accessibility tree; close-after-save is an async update without explicit status text.
- `src/manager/components/sidebar/OpenTabsPanel.tsx` / `src/manager/hooks/useOpenTabsRuntime.ts` - closing one or many browser tabs bypasses confirmation despite being irreversible; route the UI through a shared confirmation owner without changing runtime commands.
- `src/manager/components/sessions/SessionCard.tsx` / `src/manager/components/sessions/TabItemRow.tsx` / `src/manager/components/sidebar/OpenTabsPanel.tsx` - sortable/draggable source elements need an inert or equivalent non-interactive state while actively dragged.

### Reviewed and accepted by design

- Manager board and Open Tabs lists retain the full DOM but use `content-visibility`; this matches the project performance decision and the guideline's explicit alternative to JS virtualization.
- DnD and overlay code reads layout only in pointer/overlay event or layout effects, never during React render.
- URL-backed workspace/category/view/search state is complete; transient Open Tabs selection/filter remains intentionally page-local.
- The compact manager remains a horizontally scrollable workbench rather than a separate mobile product.

### Browser review round 1

- Popup at 390×844, light mode: axe 4.12.1 reports 0 violations and 0 incomplete checks; one main landmark, one H1, no page errors, no horizontal overflow.
- Options at 390×844, light mode: axe 4.12.1 reports 0 violations and 0 incomplete checks; one main landmark, one H1, no page errors, no horizontal overflow. The preview-only service-worker fallback warning is expected from the temporary Chrome API mock.
- Manager at 1280×800, light mode: category buttons are 36px high and fully contained by the 48px top bar; body width equals viewport; no page errors.
- `src/manager/components/shell/ManagerFrame.tsx` - the visually hidden H1 sits outside every landmark, producing the axe `region` violation.
- `src/manager/components/workspace/CategoryNav.tsx` / `src/manager/styles/header.css` - active and inactive category label colors measure 2.86:1 and 2.96:1 in light mode, below 4.5:1.
- `src/manager/components/workspace/CategoryManager.tsx` - the closed Mantine category menu leaves `aria-controls` pointing at an unmounted dropdown, producing one critical incomplete result.
- `src/manager/styles/sidebar.css` - browser-window tab-count glyphs are too low-confidence for axe contrast evaluation; strengthen the foreground/background pair so the incomplete color check resolves.

### Browser review round 2

- Manager light and dark at 1280×800: axe 0 violations / 0 incomplete; correct native `color-scheme` and `theme-color`; no runtime errors.
- Popup dark at 390×844: axe 0/0; correct dark page background, native scheme, and theme color; no runtime errors.
- Manager at 390×844: body width equals viewport; category strip, search, and compact command trigger fit inside the 48px top bar; expanded search exclusively replaces category/actions and spans the available lane without overlap.
- Reduced motion: media query is active; measured transition and animation durations are 1ms, iteration count is 1, and scroll behavior is `auto`; axe remains 0/0.
- `src/options/options.css` - dark-mode theme `SegmentedControl` labels use black/gray text against dark surfaces (1.87:1–2.01:1), producing 1 serious axe violation group.
- `src/manager/components/workspace/ManagerGlobalActions.tsx` - compact “More actions” uses the same closed-state Mantine `aria-controls` pattern previously fixed for Category options, producing 1 critical incomplete group at 390px.

### Browser review round 3 - open states

- Popup dedupe confirmation: axe 0/0; Escape closes the dialog and restores focus to the dedupe trigger; no runtime errors.
- Manager category and compact global menus now reach axe 0/0 after removing conditional `aria-controls`, targeting their portals into `#manager-main`, and removing Mantine's non-menu focus placeholder.
- Options dark default state now reaches axe 0/0 with explicit selected/inactive theme-control colors.
- Manager Import/Export open states expose an unnamed modal close button and duplicate banner landmarks because Mantine portals the modal header directly under `body`; render Manager-owned modals inside the main landmark and name each close control.
- Export open state also reports low contrast for Copy and Download; apply explicit light/dark action tokens.
- Options Advanced light state reports low contrast for the selected theme segment, Choose folder action, and Reset action; define the selected indicator/label pair explicitly and use stronger secondary/danger action styles.

### Final browser review

- Manager default light/dark, 390px closed/menu/search, and reduced-motion states: axe 0 violations / 0 incomplete; no page errors; no body overflow; category controls remain within the top bar.
- Manager open states: workspace menu, category menu, compact global actions, Import, Export, Add Link, and Delete Session confirmation all reach axe 0/0.
- Manager modal policy portals every Manager-owned modal into `#manager-main`, preserves Mantine title association, and names close controls.
- Popup light/dark and dedupe confirmation: axe 0/0; Escape restores focus to the dedupe trigger.
- Options light/dark/default/Advanced: axe 0/0; no horizontal overflow at 390px.
- Keyboard confirmation path: keyboard-opened Session menu → Delete → Escape restores focus to the Session “More” trigger.
- DnD audit repaired 2 CSS ownership regressions: the end target no longer overlaps the first insertion target, and placeholder/marker/overlay feedback styles are restored.
- Group keyboard DnD now advances by canonical insertion index instead of traversing duplicate Session body/insertion droppables. Keyboard reorder passed 10 consecutive isolated E2E repetitions; the complete pointer/keyboard DnD file passed 4/4.
- Manual browser DnD acceptance passed every AGENTS.md path: same-category session reorder, cross-category session move, saved-tab drop into an existing session, multi-selected Open Tabs drop into an existing session, and multi-selected Open Tabs drop at a new-session insertion target.

## Completion Matrix

| Recommendation | Artifact | Evidence |
|---|---|---|
| P0.1 category geometry | `CategoryNav.tsx`, `header.css` | 4 viewport geometry E2E; category boxes remain inside 48px topbar |
| P0.2 compact commands/search | `ManagerGlobalActions.tsx`, `ManagerSearchCommand.tsx`, `responsive.css` | 390px menu/search browser audit and `manager-boot.e2e.ts` |
| P0.3 keyboard contracts | `SessionCard.tsx`, `TabItemRow.tsx`, `useManagerOverlays.ts`, `useSidebarDisclosure.ts` | rename DOM tests, popover/confirm browser focus gates, sidebar tests |
| P0.4 high-risk settings | `ConfirmDialog.tsx`, `DestructiveConfirmation.tsx`, Popup/Options/storage dialogs | focused confirmation tests and open-dialog axe 0/0 |
| P0.5 accessibility baseline | shared accessibility/theme foundations and semantic entry landmarks | static contract plus all audited page states axe 0/0 |
| P1.1 Manager ownership | `ManagerFrame`, `ManagerDndCoordinator`, `useCaptureReveal`, `useSidebarDisclosure` | ownership/architecture tests and full E2E |
| P1.2 Header ownership | `WorkspaceMenu`, `CategoryNav`, `CategoryManager`, `ManagerSearchCommand`, `ManagerGlobalActions` | focused unit/source contracts |
| P1.3 CSS ownership | import-only `manager.css` plus 6 owner files | layout/session/overlay contracts, browser geometry, DnD feedback |
| P1.4 primitives/policies | accessible action, confirmation, Manager modal/menu policy, form metadata | focused DOM/static tests and open-state axe |
| P2.1 Settings hierarchy | `OptionsApp.tsx`, `options.css` | Options DOM tests and 390px light/dark Advanced audits |
| P2.2 recoverable URL state | `managerPageState.ts`, `useManagerPageState.ts` | unit tests and deep-link/history E2E |
| P2.3 progressive discovery | keyboard/touch-stable menus, labelled compact actions, semantic item triggers | accessibility snapshots and keyboard browser gates |
| P2.4 platform polish | `usePageTheme`, Intl formatters, reduced-motion/touch/overscroll CSS | formatter/theme tests and computed reduced-motion audit |

### Changed-file coverage

- Shared foundations: `src/shared/components/`, `src/shared/hooks/`, `src/shared/styles/`, `src/shared/utils/`, and entry HTML are covered by focused tests, build, and 3-surface browser audits.
- Manager behavior/ownership: all changed `src/manager/components/`, `hooks/`, `core/`, and `styles/` files are covered by 979-test Vitest, 19-test E2E, viewport/keyboard/axe audits, the repeated DnD gate, and all 5 manual DnD acceptance paths.
- Popup/Options: all changed `src/popup/` and `src/options/` files are covered by DOM tests and light/dark/default/open-state axe audits.
- Documentation/plans: `feature-spec`, `technical-architecture`, `feature-evolution`, `product-decisions`, approved design, implementation plan, `task_plan.md`, `findings.md`, and `progress.md` reflect the shipped behavior and final status.

## Independent Completion Audit - 2026-07-27

### Objective and success criteria

The active objective resolves to these concrete deliverables:

1. Implement every accepted P0, P1, and P2 recommendation.
2. Re-fetch and apply the latest `$web-design-guidelines` after optimization.
3. Fix every new static or browser finding and repeat until a review produces no unresolved issue.
4. Cover Manager, Popup, and Options across default/open, light/dark, desktop/narrow, keyboard/focus, reduced-motion, and destructive-action states.
5. Preserve product boundaries: no schema/protocol/DnD semantic expansion, no session merge, no runtime dependency, and no JS virtualization.
6. Produce fresh build/check/unit/E2E/browser/a11y/DnD evidence and keep the result reviewable in repository artifacts.

### Prompt-to-artifact checklist

| Requirement | Artifact / evidence | Audit result |
|---|---|---|
| Accept every recommendation | 13-row P0/P1/P2 Completion Matrix above; implementation files linked per row | Covered |
| Optimize all extension surfaces | `src/manager/`, `src/popup/`, `src/options/`, shared UI foundations, entry HTML | Covered |
| Use latest Guidelines after changes | Upstream source re-fetched at 180 lines; SHA-256 `eea73cb6dd46fee9faec9973e8e7fe198b5f07ec326f14d276a56e50287e1cab` | Covered |
| Repeat review/fix loop until zero findings | Static rounds plus browser rounds; final anti-pattern/image/form/icon/number/motion scan has 0 unresolved findings | Covered |
| Accessibility and semantics | `accessibilityMarkup.test.ts`, `uiCopy.test.ts`, DOM tests; all final audited states axe 0 violations / 0 incomplete | Covered |
| Responsive commands and geometry | `manager-boot.e2e.ts` at 390×844, 800×800, 1280×800, 1440×900; no body overflow | Covered |
| Theme and platform polish | `useColorScheme`, `usePageTheme`, matching theme-color, reduced motion, touch/overscroll, `Intl.*` formatters | Covered |
| URL recoverability | Manager `workspace/category/view/q`; Options `advanced=1`; unit, DOM, and browser evidence | Covered |
| Keyboard and focus | Rename Enter/F2/Space; menu/modal Escape; confirmation safe focus and trigger focus return | Covered |
| DnD product gates | 4/4 DnD E2E, isolated keyboard 10/10, and all 5 AGENTS.md manual paths | Covered |
| Preserve full DOM performance strategy | session/Open Tabs/Trash use `content-visibility`; no runtime dependency or JS virtualization added | Covered |
| Preserve DnD semantics | `dnd.ts` regression tests; no session-to-session merge intent; same/cross-category and tab-drop paths verified | Covered |
| Fresh project verification | `npm run check`; 75 Vitest files / 979 tests; E2E 19/19; `git diff --check` | Covered |
| Reviewable documentation | design spec, execution plan, `findings.md`, `progress.md`, feature/architecture/evolution/decision docs | Covered |
| Safety / repository state | no generated artifacts or runtime dependency diff; changes remain uncommitted on `zhaoshe/dev` | Covered |

### Final iterative findings closed

- Corrected singular/plural browser-window labels and added stable names to checkbox/radio-like controls.
- Added lazy favicon loading, tabular numerals, `Intl.NumberFormat`, and `translate="no"` product-name protection.
- Removed non-compositor layout/color transitions and moved SVG transforms/animations to wrappers.
- Eliminated the system-theme first-frame race and matched dark `theme-color` to the rendered body.
- Deep-linked Options Advanced state, made error copy actionable, and standardized Title Case plus explicit `…` loading copy.
- Kept Manager Tooltip/Menu/Modal content inside `#manager-main`, removed stale fade states, and restored persistent tooltips.
- Added Trash paint containment and high-contrast destructive confirmation tokens.
- Verified the final Options Reset confirmation in shipped code at axe 0 violations / 0 incomplete before and after Escape.

## UI / UX Pro Max Review Loop

### Product classification

- TabBoard is a local-first productivity tool and file-manager-like workbench,
  not a portfolio, landing page, or content marketing site.
- The generated `ui-ux-pro-max --design-system` result again returned Portfolio
  Grid, Exaggerated Minimalism, orange surfaces, oversized type, Lora/Raleway,
  and scroll reveals. Those recommendations are rejected because they conflict
  with the product model, existing design language, and the approved dense but
  calm workbench direction.
- Applicable skill rules: keyboard-complete controls, 44px coarse-pointer
  targets with 8px spacing, stable press/loading states, explicit overflow
  ownership, light/dark contrast parity, reduced motion, tabular numbers,
  predictable navigation, stable list keys, and selective memoization.
- React list virtualization remains reviewed-and-accepted by design: this
  project deliberately uses stable structural sharing plus full DOM with
  `content-visibility`; introducing a runtime windowing dependency would reopen
  DnD geometry and search contracts without evidence of a current performance
  failure.

### Final ownership state

- `OpenTabsPanel` owns workflow/confirmation/focus orchestration and composes
  `OpenTabsWindowBar`, `OpenTabsSelectionBar`, `OpenTabsList`, and
  `OpenTabsFilterFooter`.
- `SessionCard` owns state and commands and composes `SessionCardHeader`,
  `SessionCardMeta`, `SessionCardEditor`, and `SessionTabList`.
- `ManagerDndCoordinator` owns lifecycle coordination and composes
  `managerDndGeometry`, `useManagerDndSensors`, and `ManagerDragOverlay`.
- Source-contract failures after this split were stale test paths, not missing
  product behavior. The migrated contracts still verify canonical tab indexes,
  drag markers, keyboard coordinates, close loading, and focus fallback.

### Verification checkpoint

- Final owner focused suite: 4 files / 98 tests passed.
- Production build: passed, 7,024 modules transformed.
- `git diff --check`: passed.
- At this checkpoint, full static, rendered, axe, DnD, and prompt-to-artifact
  gates remained pending; the Independent completion audit below records their
  final results.

### Rendered review round 1

- A stale Vite process and a second HTTP port initially caused repeated HMR
  reconnects because `vite.config.ts` fixes both server and HMR to port 5173.
  Those sessions were discarded. The audit now uses one clean 5173 server.
- Manager at 1280x800, Saved category: axe 4.12.1 reports 0 violations and 0
  incomplete checks; browser page errors are empty.
- Popup at 390x844: axe reports 0/0; browser page errors are empty.
- Options at 390x844 with the temporary `/tmp` Chrome API init script: axe
  reports 0/0; browser page errors are empty.
- The Manager accessibility tree confirms the intended final interaction model:
  separate category label/reorder buttons, `Save 7 Tabs in This Window`,
  explicit Open Tab Focus/More/Close actions, and separate session drag,
  Restore, and More actions.

### Rendered review round 2 - compact Open Tabs

- At 390x844, the collapsed 62px rail initially kept Drag, Focus, and More as
  visible 44px controls. Drag and More extended to x=140 and were clipped by the
  rail. This was a real geometry/focus defect even though axe remained 0/0.
- The collapsed window bar initially kept all 6 Window controls plus Save,
  Refresh, and Collapse focusable. Several controls had negative x positions or
  overlapped inside the clipped rail.
- The collapsed rail now exposes exactly one current-window control and one
  Focus control per Open Tab row. All visible targets stay fully inside the
  rail; the bottom Expand Sidebar command opens the full drawer.
- In the expanded compact drawer, direct Close duplicated the More action and
  produced 2px spacing between 44px controls. The coarse/compact row now keeps
  Select, Drag, Focus, and More at 44px with 8px spacing; Close remains in More.
  Fine-pointer desktop rows retain the direct Close shortcut.
- The compact drawer keeps the topbar and main surface inert, uses sidebar
  z-index 20, and remains axe 0 violations / 0 incomplete.
- RED/GREEN evidence: the compact E2E failed for each original control set,
  then passed after the owner CSS fixes. Related focused evidence is 4 Vitest
  files / 83 tests plus the compact Playwright scenario.

### Rendered review round 3 - open states and focus

- Popup Dedupe and Options Reset initially focused Cancel correctly but returned
  Escape focus to `body`. `ConfirmDialog` now supports an explicit
  `finalFocusRef`; both surfaces return to their triggering action.
- Open Tab info actions initially rendered unnamed `role="menuitem"` buttons
  inside a dialog/region, causing critical `aria-required-parent` and
  `button-name` violations. They now use named ordinary button semantics while
  preserving the shared overlay close/mutation/focus lifecycle.
- Manager compact global menu, Open Tab details, Import, Export, Popup Dedupe,
  and Options Advanced/Reset all return axe 0 violations / 0 incomplete.
- Reduced motion samples are 1ms, one iteration, and auto scroll; dark body and
  theme-color both resolve to `#242424`.

### Independent completion audit

- `npm run check`: passed; 7,024 transformed modules, 187 source files with no
  forbidden edge/cycle, and 111 production files passing architecture gates.
- `npm test`: 76 files / 1,006 tests passed.
- `npm run test:e2e`: 26/26 passed.
- DnD repeated gate: 15/15 over three runs; category handle isolation 5/5.
- Fresh browser state-level acceptance passed all 5 required DnD paths,
  including saved/Open Tabs existing-session and new-session drops.
- Compact geometry repeated gate: 3/3.
- `git diff --check`: passed.
- No package/lockfile/manifest/schema/storage/background or runtime dependency
  diff; no tracked generated/browser artifact.
- Final complete static and rendered pass: zero unresolved finding.

## React Startup Performance Review - 2026-07-28

### Applicable Vercel rules

- `async-parallel` and `async-defer-await`: startup currently performs
  sequential full-state operations before useful UI.
- `bundle-dynamic-imports` and `bundle-conditional`: Options loads closed
  Advanced file-storage controls and dialogs in its initial graph.
- `bundle-barrel-imports`: `@tabler/icons-react` barrel imports make Vite
  analyze thousands of modules. Production tree shaking limits shipped icon
  code, so this is currently a build/dev cost and a secondary cold-evaluation
  concern, not the measured runtime root cause.
- `rerender-defer-reads`: Options should not subscribe to or hydrate session
  collections it does not render.
- `rendering-content-visibility`: the existing CSS skips off-screen
  layout/paint, but does not skip React component creation, hooks, Zustand
  subscriptions, overlay registration, or dnd-kit sortable registration.
- `rerender-memo`: already used for `SessionCard`; it cannot remove the initial
  cost because every card and row mounts once.

### Production bundle baseline

- Manager initial JavaScript graph: about 683 KB raw / 208 KB gzip across the
  page entry, shared Mantine/theme, storage authority, icon, and accessible
  action chunks.
- Options initial JavaScript graph: about 475 KB raw / 146 KB gzip across the
  page entry, shared Mantine/theme, storage authority, and icon chunks.
- Shared Mantine CSS is about 205 KB raw / 30 KB gzip. Manager adds about 26 KB
  raw CSS; Options adds about 3 KB.
- Extension assets are local, so transfer latency is not the issue; parse,
  evaluation, and module initialization still run on the page main thread.

### Hydration data flow

`AuthoritativePublication.hydrate()` currently waits for these operations in
series before setting `hydrated: true`:

1. `ensureStateForHydration()` sends `tabboard-ensure-state` to the MV3 worker.
   The worker reads and normalizes the full state and returns the full object
   through runtime messaging.
2. The page initializes Storage Authority. It reads
   `tabboardStorageConfig`, then reads and normalizes `tabboardState`.
3. Hydration subscribes to authority updates.
4. `readAuthoritativeState()` reads and normalizes `tabboardState` again.
5. The page structurally shares and publishes the result, then React can render
   the useful Manager or Options surface.

The first worker result is not reused by publication. The same state therefore
crosses storage/context boundaries repeatedly and is normalized at least three
times. Options pays the full cost even though its Basic page initially needs
only settings and persistence status.

### Production startup measurements

Measurements used the real unpacked `dist` extension in isolated Chrome
profiles with an init-script probe. `first useful UI` means `.manager-shell` or
`.options-header` first appeared.

| State | Data size | Manager useful UI | Options useful UI | Dominant evidence |
|---|---:|---:|---:|---|
| empty | minimal | 509 ms | 505 ms | bundle + sequential hydration |
| 60 sessions x 2 tabs | 62.6 KB | 726 ms | 1,186 ms | Options worker ensure-state was 860 ms |
| 300 sessions x 20 tabs | 2.30 MB | 2,857 ms | 708 ms / 1,247 ms | Manager state reads ended by 757 ms; React commit consumed about 2.10 s |

The large Options variance tracks cold/warm service-worker behavior. Both
large runs still read and normalize the entire 2.30 MB state despite rendering
no session. The large Manager rendered 196 Inbox sessions and 3,920 tab rows;
the other sessions belonged to Saved, Archive, or custom categories.

### Confirmed root causes

1. **P0 - Options is coupled to full application hydration.**
   Its startup latency grows and varies with unrelated session data and MV3
   worker cold-start behavior.
2. **P0 - Manager constructs the complete visible-category React/DnD tree
   before first useful commit.** `content-visibility` cannot skip the 3,920
   `TabItemRow` components, their `useSortable` registrations, Mantine controls,
   Zustand subscriptions, and overlay hooks.
3. **P1 - Hydration performs redundant serial full-state reads and
   normalization.** The worker result is discarded, then the page reads the
   same state twice through Storage Authority.
4. **P1 - Open Tabs startup receives an event burst.** Empty-state production
   startup issued four `list-open-tabs` messages; large-state startup continued
   queued refreshes for seconds after the first Manager commit.
5. **P1 - Options statically loads Advanced file-storage UI.** The Basic page
   reaches `DataStorageCard`, folder migration, merge, and disconnect modules
   even while `<details>` is closed.
6. **P2 - Manager contains avoidable repeated work.**
   `WorkspaceContent` calls `categoryGroups.findIndex` inside
   `visibleGroups.map` (O(n²)); category counts repeatedly scan groups per
   category; diagnostics persist every breadcrumb via storage read + write.

### Rejected or lower-priority explanations

- Network transfer is not the bottleneck; extension assets load locally.
- Generic local `useMemo` additions will not solve initial mount. Every visible
  card/row still mounts and registers hooks.
- The 330 KB shared Mantine/theme chunk matters for the roughly 0.2-0.5 s empty
  baseline, but it does not explain the Manager's additional 2.1 s at 3,920
  rows.
- Replacing structural sharing is not indicated. It protects update paths after
  hydration and should remain the authoritative reconciliation strategy.

### Implementation completion matrix

| Finding | Implemented owner | Current evidence |
|---|---|---|
| P0 Options full-state hydration | `settingsProjection.ts`, `useOptionsSettings.ts` | Basic reads projection; large benchmark records 0 canonical reads |
| P0 Manager full interaction mount | `SessionSlot`, `SessionCardShell`, `useSessionActivation` | 60 slots / 6 initial cards E2E; production large rows bounded to 120 |
| P1 duplicate hydration reads | `authoritativePublication.ts`, `useTabBoardStore.ts` | subscribe-first single initializer contracts; no page worker ensure message |
| P1 Open Tabs event burst | `refreshCoalescer.ts`, `useOpenTabsRuntime.ts` | one active + one trailing contract; production startup records 1 request |
| P1 optional file UI/backend | Options lazy Advanced, ActiveAdapter literal imports | default Options preloads neither Authority nor file chunks |
| P1 row subscription fan-out | Session-owned command ports | `TabItemRow` has no Zustand store import |
| P2 repeated scans/serialized keys | selector Maps/count pass and stable group/tab references | focused selector/overlay/DnD contracts |
| P2 diagnostics contention | 250ms info batch, immediate warn/error flush | 25 breadcrumbs produce one storage get/set |

### Vercel React practices re-review

- `async-defer-await`: file modules and canonical Options state are awaited only
  inside the branches that require them.
- `bundle-conditional` / `bundle-dynamic-imports`: Advanced Settings,
  `fileStorage`, and `fsDirectory` are separate literal dynamic chunks.
- `rerender-defer-reads`: Options Basic and `TabItemRow` no longer subscribe to
  unrelated application state.
- `rendering-content-visibility`: retained for Open Tabs/Trash and combined
  with session interaction activation, because containment alone did not bound
  React mount work.
- `js-index-maps` / `js-combine-iterations`: canonical group indexes and
  category counts are built once; overlay and DnD lifecycle use structurally
  shared references instead of all-item strings.
- `bundle-barrel-imports` and selective Mantine CSS remain intentionally
  deferred. The measured empty-state cost is within the target, while changing
  those imports has higher build/design-system regression risk than current
  evidence justifies.

No Critical or Important source finding remains after the local final review.
Final evidence: empty/large Options useful UI 469.4ms/435.4ms, large Manager
536.7ms with 120 rows and 182ms longest task, `npm run check`, 81 files /
1,040 Vitest, 32/32 Playwright, rendered axe matrix 0/0, and five persisted-state
pointer DnD paths 5/5.

## Design Taste Review - 2026-07-28

### Design direction

- TabBoard remains a low-motion, high-density productivity workbench:
  design variance 3/10, motion 2/10, density 8/10.
- Mantine, Tabler, the horizontal session board, stable DnD geometry, and the
  blue functional accent remain appropriate.
- The taste skill's landing-page and portfolio defaults are out of domain; only
  its redesign, hierarchy, material, and state principles apply.

### New evidence-ranked findings

1. P0: a bare Manager URL defaults to Inbox even when Inbox is empty and other
   categories contain sessions. The live fixture showed `Inbox 0`, `Saved 1`,
   custom category `1`, and an empty main board.
2. P0: Options toggles local `savePending` true/false synchronously while
   `useOptionsSettings` persists asynchronously, so `Saved` can appear before
   authoritative commit.
3. P1: `Restore groups in new window` makes `Restore next to current tab`
   inapplicable, but Options exposes both as independent active switches.
4. P1: the current workspace name is accessible but not visibly rendered in the
   48px topbar trigger.
5. P1: each category adds a navigation stop and a permanent reorder stop.
   Explicit reorder mode can remove normal navigation cost, but ordinary
   `category-column` droppables must remain for cross-category session drops.
6. P1: saved tab rows ignore stored `favIconUrl` and use one generic link icon,
   weakening scan recognition compared with Open Tabs.
7. P1: Advanced Settings nests shadowed cards inside a framed disclosure after
   Basic already established an unframed section/divider grammar.
8. P2: Popup brands TabBoard with Chrome's logo despite shipping extension
   icons, and gives conditional Dedupe nearly the same visual weight as Save.
9. P2: session cards can drop the resting shadow while retaining their real
   repeated-object boundary and all board geometry.

### Recommended execution order

- Stage 1: authoritative Options status, restore dependency, bare-URL Manager
  category preference.
- Stage 2: visible workspace context, explicit category reorder mode, shared
  favicon primitive.
- Stage 3: Advanced Options flattening, Popup brand/hierarchy, quieter session
  card material.

Full review: `docs/reviews/2026-07-28-design-taste-review.md`.

## Design Taste Implementation and Review Loop

### Initial finding coverage

- P0 bare Manager category: page-local, versioned per-workspace preference with
  explicit URL priority and first-nonempty fallback.
- P0 Options status: authoritative external-store queue owns Saving/Saved/Error,
  rollback, field-scoped failed patches, and Retry.
- P1 Restore strategy: Destination/Placement owner maps existing booleans and
  disables only inapplicable placement UI.
- P1 visible context: desktop workspace label, compact icon-only fallback.
- P1 category cost: explicit reorder mode; ordinary category-column droppables
  remain mounted.
- P1 scan recognition: shared fixed-size Favicon owner across Open Tabs, saved
  links, and info overlays; inactive shells remain image-free.
- P1 Advanced hierarchy: one framed storage tool plus three flat sections.
- P2 Popup brand and maintenance hierarchy: TabBoard icon, primary Save,
  secondary duplicate Remove row.
- P2 session material: no resting card shadow; semantic state borders.

### Iterative findings closed

1. Compact reorder overlap: exclusive 390px lane and 44×44 Done.
2. Visible em-dashes: replaced with sentence/colon copy and guarded by test.
3. Non-zero Popup letter spacing: removed; tabular numerals retained.
4. Incomplete duplicate copy: `Duplicate Tab/Tabs`.
5. Compact Retry height: raised to 44px.
6. Stale same-field settings error: field-scoped failed patches are discarded
   when a newer queued update supersedes them.
7. Benchmark coverage drift: automatic bare new-tab startup is seeded to Inbox,
   and samples record initial/final URL plus active board.

### Zero-new-finding review

- Round 4 rechecked Manager ordinary/reorder, 390/800/1440, dark/light,
  card/favicons/overflow; Popup duplicate/dialog/dark/light/wrap; Options
  Basic/Advanced/strategy/error/Retry/dialog/dark/light at 390/1280.
- Every representative browser state reports axe 0 violations / 0 incomplete.
- Static pre-flight found no remaining shipped visible em-dash, non-zero letter
  spacing, sub-12px functional text, decorative card shadow, image dimension
  omission, or prohibited interaction pattern.
- No new P0/P1/P2 recommendation remained.

### Final verification

- `npm run check`: PASS, 209 source files and 124 production architecture files.
- `npm test`: 85 files / 1,061 tests PASS.
- `npx playwright test --workers=1`: 33/33 PASS.
- Large production benchmark: Manager 560.4ms median with 6/190/196/120 and one
  startup list request; Options 367.5ms median with zero canonical reads.
- `git diff --check`: PASS.

## Crisp Utility Gap Preview Proposals

### Preview 1 - explicit selection mode and filter scope (confirmed: A)

- Selection mode remains active when the selected count reaches zero. Entering
  the mode and selecting records are separate state.
- The context bar keeps stable geometry across ordinary, zero-selected,
  partial-selected, and all-selected states.
- While the Open Tabs text filter is active, Select All / Unselect All applies
  only to currently visible rows. Existing hidden selections remain selected
  and continue to contribute to the selected count and Save Selected payload.
- The ordinary context count shows visible and total rows when filtered, for
  example `3 of 8 open tabs`.
- Save Selected uses the complete current-window selection, including hidden
  selected rows. Save All ignores the text filter and captures every eligible
  tab in the selected window.
- Collapsing the sidebar clears the selection and exits selection mode; the
  Open Tabs text filter remains page-local and is not cleared by collapse.

### Preview 2 - sidebar disclosure state model (confirmed)

- Desktop states are `collapsed`, `peek`, and `pinned`; compact uses
  `collapsed` and `drawer`.
- `collapsed` keeps a 52px rail. The ordinary Board track starts immediately
  after the rail and remains active.
- `peek` opens after 350ms pointer dwell or immediately from keyboard intent.
  It overlays the Board without moving or disabling it. Leaving a pointer peek
  closes it; moving focus outside a keyboard peek closes it.
- `pinned` changes the grid track to the full sidebar width and keeps the Board
  active for Open Tabs-to-Session DnD. Pin Sidebar, Selection, or Filter focus
  can promote `peek` to `pinned`.
- `drawer` is compact-only. It overlays instead of reflowing and is the only
  disclosure state that makes the topbar and Board inert.
- Hidden disclosure controls are also removed from keyboard traversal; CSS
  clipping alone is not an acceptable focus policy.
- Icon concerns observed during this preview are intentionally deferred to the
  global icon-system review. They do not reopen the confirmed disclosure
  structure or transitions.

### Preview 3 - keyboard equivalent without visible drag icons (confirmed: B)

- Pointer DnD is identical in all options: a non-interactive Open Tab row
  surface or Session title/meta/note surface uses `grab` / `grabbing`, starts
  only after the existing movement threshold, and excludes buttons, links,
  checkboxes, and editors.
- Option A keeps normal surfaces out of the keyboard Tab order.
  Session More adds Move Left, Move Right, Move to Saved, and Move to Archive.
  Open Tab More adds Add to Session and Save as New Session while retaining
  Filter, Pin, and explicit Close.
- Confirmed option B makes Session summary and Open Tab text surfaces focusable. Space
  picks up, arrows move or open a target chooser, Space drops, and Escape
  cancels. Enter/F2 retain title edit or primary-open behavior; Restore, More,
  links, checkboxes, and editors do not start keyboard or pointer DnD.
- Option C adds explicit Arrange Sessions mode. It replaces ordinary row More
  with Add to actions and reveals card Move Left / Move Right controls. It is
  clearest but adds a mode switch to routine organization.
- Hidden menus and inactive option controls must be both visually hidden and
  removed from keyboard traversal. Menu commands return focus to their source
  More button after execution.
- A final dedicated review will inventory the command contents of every menu
  level: Global, Workspace, Category, Session, Saved Tab, Open Tab, Selection,
  and any context-menu-only surface.

### Preview 4 - read-only tooltip and interactive menu separation (confirmed: A)

- One shared `role="tooltip"` instance renders title, domain, link, and saved
  timestamp. Open Tabs omit the timestamp. Title clamps to two lines and link
  clamps to four.
- Tooltip is pointer-transparent and contains no buttons or other interaction.
  It appears 6px above the row by default, flips below when top space is
  insufficient, and clamps horizontally to an 8px app inset.
- Confirmed option A shows the same visual tooltip after pointer dwell and immediately
  from keyboard focus. Option B keeps the visual tooltip pointer-only.
- Both options use one always-available visually hidden description owner for
  `aria-describedby`; visual tooltip visibility does not change screen-reader
  information.
- More immediately closes the tooltip and opens a separate `role="menu"`.
  Tooltip and menu can never be visible together. Menu opening focuses its
  first item, and Escape/action completion returns focus to the source More.
- Menu commands remain placeholders in this preview. Their exact contents are
  deferred to the final menu inventory.

### Preview 5 - window semantics and collapsed filter indicator (confirmed: A)

- Manager `selectedWindowId` and Chrome `window.focused` are independent.
  Selected uses the light active surface plus `aria-pressed`; Chrome focused
  uses only the accent dot. They may belong to different windows.
- Window glyph count is the raw normal Chrome-window tab count. Open Tabs
  context count is the rows remaining after extension/custom policy. Text
  filter count is `visible rows / Open Tabs rows`; these require separate
  protocol/projection fields rather than one overloaded `tabCount`.
- The text filter persists when switching selected windows and when collapsing
  or reopening the sidebar. The query is re-applied to the newly selected
  window.
- In collapsed rail, the Expand accessible name includes the result and total,
  for example `2 of 10 open tabs match the filter`.
- Filter indicator options are A status dot, B visible-result count badge, and
  C filter glyph badge. Confirmed A uses the quiet status dot; the result and
  total remain available in the Expand accessible name rather than as visible
  rail text.
- Collapsed rail Open Tab favicons remain real Focus Tab buttons. Hidden
  context actions and Filter input are removed from keyboard traversal.

### Preview 6 - Popup pinned and duplicate outcome copy (confirmed: B, setting-aware)

- Popup does not expose Chrome tab-group filtering. Capture still preserves
  group metadata underneath the Popup scope.
- The confirmed B strategy is generic about the tab composition but dynamic
  about the global save-and-close setting. When enabled, the main helper reads
  `Save and close tabs`; when disabled, it reads
  `Save and keep tabs open`. These fit the fixed 320px Popup without ellipsis.
- The main helper does not switch between regular, pinned, or mixed wording.
  Pinned-specific scope and the invariant that pinned sources stay open belong
  only to the checkbox and its subordinate helper text.
- Pinned checkbox is transient Popup state. Checked helper says pinned tabs
  save and stay open; unchecked helper says they do not save and stay open.
  When no pinned tabs exist, the entire control disappears without leaving a
  layout gap.
- Save count includes only the current Popup capture scope. Closed-after-save
  count includes regular tabs only. Pinned source tabs remain open in every
  capture setting.
- Duplicate Remove count includes only non-pinned duplicates that the action
  may actually close. Pinned duplicates are protected. If no removable
  duplicate exists, both separator and Remove row are absent and non-focusable.

### Preview 7 - Options storage status and recovery semantics (confirmed: A)

- Normal Browser and Local Folder states preserve the previously confirmed
  two-row A2 layout. Folder detail remains
  `Local folder name: TabBoard` with `updated: HH:mm:ss` right aligned.
- The open question is how to represent fallback, where the configured target
  remains a Local Folder but the Storage Authority is currently writing to
  browser storage.
- Option A keeps the configured Local Folder as the primary context and adds an
  inline warning that new changes are temporarily saved in browser storage.
  It keeps `Reconnect folder` and `Use browser storage` as distinct recovery
  actions.
- Option B promotes the active Browser backend to the primary label and leaves
  the folder failure as secondary context. This resembles current production
  behavior but hides that the user has not formally changed their configured
  target.
- Option C explicitly lists configured target, current write backend, folder
  status, and last file update. It is the most exact but introduces internal
  storage terminology and substantially more hierarchy.
- File freshness must come from `meta.json.updatedAt`; a newer browser fallback
  state timestamp must not overwrite the last successful file update.
- Fallback reason and folder identity must survive Options reload. A transient
  in-memory `onFallback` callback cannot be the only source for this status.
- The user confirmed option A. The configured target changes to Browser only
  after the explicit `Use browser storage` migration commits; automatic
  fallback changes the active backend but not the target shown as primary.

### Preview 8 - global icon theme and state matrix (confirmed)

- The preview uses the already-confirmed Lucide mappings rather than reopening
  per-icon selection: Search, Menu, Settings2, Trash, Download, Upload, Inbox,
  SquareArrowOutUpRight, Pin, AppWindow, PanelLeftClose, PanelLeftOpen,
  FolderOpen, Keyboard, SquareCheckBig, and X.
- Global geometry is 18px glyphs in 32px desktop icon buttons, 16px menu
  leading glyphs, and stroke width 1.75 in both A1 and D1. All tested controls
  retain the same 32x32 box through resting, hover, selected, disabled, and
  danger states.
- Resting icon actions remain neutral. Hover changes only foreground and a
  quiet surface. Selected uses cobalt foreground plus soft fill. Disabled uses
  opacity without geometry changes. Danger colors only the destructive glyph.
- Opening Bin is navigation, not a destructive action, so its resting icon is
  neutral. Permanent delete and destructive menu commands use danger color.
- CSS remains the owner for Chrome-focused Window dots, Window counts, and
  favicon property badges. Pin remains the action glyph for Pin Sidebar or menu
  commands; the pinned favicon badge does not embed a tiny Lucide icon.
- Auxiliary production semantics map to the same family: Pencil, Copy,
  Lock/LockOpen, Star, Archive, Folder, CircleAlert, TriangleAlert, RefreshCw,
  Link, and FileText.
- Final rendered checks: 16 confirmed mappings, stroke 1.75 throughout, no
  horizontal overflow, no hidden focusable controls, theme view switching
  works, and axe reports 0 violations / 0 incomplete.

### Menu inventory review (superseded by confirmed B2 revision)

- Current application menus are split across two implementations:
  Mantine `Menu` owns Global, Workspace, and Category surfaces, while the
  fixed-position `ManagerOverlayPortal` owns Session/context menus. Their
  padding, item structure, icon coverage, focus behavior, and submenu treatment
  are not yet one visual system.
- Global desktop currently exposes Import, Export, Trash, and Options as four
  separate actions; only compact uses a More menu. This conflicts with the
  confirmed B3 topbar, where desktop and compact share one command model and
  Import, Export, and Options belong in More while Bin remains direct.
- Workspace menu mixes a selectable workspace list, an inline current-row
  Rename action, a non-interactive current check, and New Workspace in one
  250px surface. It needs a clear distinction between switching context and
  managing the active workspace.
- Category Options currently contains Reorder Categories, Manage Categories,
  and Add Category. Rename/Delete live only inside the management dialog even
  though older product documentation still mentions custom-category
  right-click actions.
- Session More currently contains Add Link, Add Note, Rename, a second
  fixed-position Move to Category menu, Lock/Unlock, Copy, and Delete.
  Restore remains a direct action. The nested move surface has no visible
  submenu affordance in the current item markup.
- Saved Tab and Open Tab do not currently have true action menus. Their actions
  live in the interactive detail popover: Saved Tab exposes Add/Edit Note and
  Copy; Open Tab exposes Pin and Close. This conflicts with confirmed Preview 4,
  where the hover/focus tooltip is read-only and all actions move to a separate
  menu.
- Browser/extension context menus are a separate Chrome-native surface. They
  contain Open TabBoard and seven capture scopes. Their native appearance is
  not themeable and should be reviewed for command naming/grouping only, not
  forced into the in-app menu visual style.
- Selection bars are contextual toolbars, not popup menus. Dialogs, Select
  controls, Tooltip, and read-only tab preview are also excluded from the menu
  style system.
- Preview 9 compares three visual systems with identical content:
  A Quiet Command uses 34px rows and a stable 16px icon slot; B Dense Native
  uses 29px rows; C Descriptive uses 42px rows with helper copy. A is
  recommended for the dense desktop workbench because Session remains 309px
  tall versus B at 261px and C at 441px, while still preserving scanability,
  submenu affordance, and coarse-pointer expansion to 44px.
- Proposed Global More contains Import, Export, and Options. Bin is removed
  from More because it remains a direct topbar destination.
- Proposed Workspace Switcher lists workspaces with a check on the current
  item, then separates Rename Current Workspace and New Workspace. Inline
  rename controls inside the selected list row are removed.
- Proposed Category Options retains Reorder Categories, Manage Categories, and
  Add Category. Per-category Rename/Delete stay in the named management dialog.
- Proposed Session More groups Add Link/Add Note; Rename Session/Edit Session
  Note/Move to Category; Lock/Copy Links; and Delete Session. Restore remains
  direct, and Move to Category displays a submenu chevron.
- Proposed Saved Tab More contains Add/Edit Note, Copy URL, Select Tab, and
  Delete Saved Tab. Proposed Open Tab More contains Pin/Unpin Tab, Filter
  Sessions by This URL, and Close Tab. Both replace actions currently embedded
  in the old interactive details popover.
- Menu keyboard contract is first-item focus on keyboard open, wrapped
  ArrowUp/ArrowDown, Home/End, Escape close and trigger focus return. Danger is
  a final separated group; coarse pointer rows grow to at least 44px.

### Menu and selection revision after Preview 9

- The user selected B Dense Native for application menus: 29px fine-pointer
  rows and 16px Lucide icons. Coarse-pointer rows still grow to at least 44px.
  C Descriptive helper copy is retained as a delayed, pointer-transparent item
  tooltip instead of increasing every menu row's height. Keyboard focus shows
  the same description without a dwell delay.
- Row-level progressive More buttons are removed. On fine pointer hover or
  focus-within, the trailing quick action is X: Close for Open Tabs and Delete
  for Saved Tabs. The leading checkbox overlays the favicon in the same state.
- Open Tabs no longer expose an application action menu. Pin/Unpin and
  Filter Sessions by URL are removed from the Open Tab surface. The title
  continues to focus the Chrome tab, selection owns batch save, and X closes
  the source tab.
- Saved Tabs retain a right-click / ContextMenu-key / Shift+F10 menu for
  Add/Edit Note, Copy URL/text, and Delete. Select is removed from the menu;
  clicking the hover/focus checkbox selects that tab and enters selection mode.
- Right-click cannot be the only accessible entry for any retained menu.
  Keyboard context keys open the same menu, and coarse-pointer behavior needs a
  non-hover path in the later responsive review. Long-press must not conflict
  with existing Saved Tab DnD without an explicit activation policy.
- Workspace rows use a user-selected emoji instead of a repeated workspace
  glyph. The current row's background is the current-state indicator; its
  trailing control becomes Rename, so the separate Rename menu item is removed.
  Workspace menu also exposes New Workspace and Manage Workspaces.
- Workspace now requires a persisted emoji field. Existing workspaces need a
  normalization fallback; creation must collect name plus emoji. Manage
  Workspaces must support create, delete, reorder, rename, and emoji change.
  Creation and management need dedicated previews before the spec is final.
- Category Options removes Reorder Categories. Ordering is available through
  direct category-tab drag and Manage Categories. This supersedes the earlier
  explicit-reorder-only decision; category click remains navigation, pointer
  drag uses an activation threshold, and keyboard reordering remains available
  in Manage Categories. A dedicated management preview is required.
- Session More adds `Select Tabs`. Activating it enters selection mode for that
  Session with zero selected tabs. It does not select the Session as a board
  object. The Session header changes to a contextual selection toolbar.
- Selection scope is local to the current list:
  Open Tabs selection belongs to the selected Chrome window; Saved Tab
  selection belongs to one Session. Clicking any eligible tab checkbox both
  selects that item and enters its list's selection mode. Once active, all
  eligible checkboxes remain visible; clearing the last item does not exit the
  mode. Entering selection in another Session exits the previous Session's
  mode and clears its selection.
- Open Tabs keeps the already-confirmed contextual bar: selected count,
  Select/Unselect All, Save Selected, and Exit. The proposed Session bar needs a
  separate preview for selected count, Select/Unselect All, Restore Selected,
  Copy URLs, Delete Selected, and Exit, including mixed link/note disabled
  states.
- Preview 10 makes the revised contract interactive. Open/Saved hover and
  focus-within both produce checkbox opacity 1, X opacity 1, and favicon
  opacity 0. The first checkbox click enters the owning list mode and selects
  that item; clearing the final checkbox leaves `0 selected`.
- The preview enforces one active selection scope across the Manager. Entering
  a Session Saved Tab mode exits and clears Open Tabs mode, and vice versa.
  This avoids simultaneous selection toolbars with ambiguous batch scope.
- Saved Tab context menu contains only Add Note, Copy URL, and Delete Saved
  Tab. Open Tab exposes no application menu. Session `Select Tabs` enters the
  active Session mode with zero selected tabs.
- Workspace current row uses its emoji, active background, and a trailing
  Pencil action named `Rename Personal`; it does not show a check or a separate
  Rename menu item. Manage Workspaces and New Workspace are separate commands.
- B2 item descriptions appear in a pointer-transparent tooltip after 550ms
  hover or immediately on keyboard focus. Tooltip placement flips to the left
  when right-side space is insufficient and clamps to the app bounds.
- Preview 10 keyboard contract passes Shift+F10 opening a specifically named
  `Saved Tab Actions` menu, first-item focus, Escape close, and trigger focus
  return. Final axe is 0 violations / 0 incomplete with no page/app overflow or
  hidden focusable controls.
- Screenshot follow-up exposed two Preview 10 implementation defects. Workspace
  emoji was concatenated into the label while the menu still reserved an empty
  leading icon column, and the active row had no current-state class. Tab rows
  used a 14px checkbox over a 16px favicon, while title/meta remained inline
  spans inside an otherwise unstructured button.
- Preview 10 v2 fixes these at their owners: Workspace menu data now has
  separate `emoji`, `label`, `current`, and trailing rename action fields; every
  row uses the same 18px leading slot and 5px icon-title gap. Emoji renders at
  16x16 like Lucide glyphs, Personal uses the accent-soft current background,
  and its Pencil action is named `Rename Personal`.
- Checkbox visuals are now 16x16 over the 16x16 favicon at the same center
  point. Row main content is a grid and title/meta are block rows. Fresh
  geometry confirms every Workspace item shares leading X=697 and title X=720,
  Open checkbox/favicon are both 16px, and Open/Saved title/meta do not share a
  line. Final axe remains 0 violations / 0 incomplete with no overflow or
  hidden focusable controls.
- A second screenshot review showed that the Pencil's diagonal visual mass was
  still too large and that the checkbox visual could appear shifted despite the
  parent centers matching. Root-cause measurement found native button padding
  still affecting the pseudo-element's content box.
- Preview 10 v3 clears checkbox button padding and fixes its bordered outer box
  to `inset: 2px` within the 20px slot. The resulting 16x16 visual starts at the
  exact favicon coordinate `(56, 323)`. Pencil is reduced to 14x14 but remains
  centered in the stable 18x18 trailing action slot. Workspace title X remains
  720 for every row. Fresh axe remains 0/0.
- The user confirmed Preview 10 after v3. B2 menus, C3 item tips, row-level
  checkbox/X disclosure, context-menu ownership, and single active selection
  scope are locked for the written spec.

### Preview 11 - Create Workspace and emoji picker (confirmed: A)

- All options keep the same modal form contract: visible Workspace name label,
  inline empty/duplicate errors, disabled Create while invalid, explicit emoji
  selection, live `emoji + name` preview, Cancel, and Create Workspace.
- Option A Inline Favorites shows 16 common choices in an 8-column grid plus a
  Custom entry for one arbitrary emoji. It has no nested overlay and is
  recommended for the shortest keyboard and pointer path.
- Option B Searchable Popover uses a compact trigger and a searchable 24-emoji
  popover. Selection closes it; Escape closes and returns focus to the current
  trigger. It offers broader discovery at the cost of nested focus management.
- Option C Free Input accepts one emoji grapheme and keeps 8 suggestions as
  shortcuts. Validation rejects normal text or multiple graphemes but accepts
  ZWJ/skin-tone emoji such as `👩🏽‍💻`.
- Name normalization remains trim + NFC + case-insensitive duplicate
  comparison. Empty and duplicate states disable Create with explicit errors.
  Creation makes the new Workspace active and the right-side B2 menu preview
  renders persisted emoji and name in separate 16px/label columns.
- Emoji grid keyboard navigation supports arrows plus Home/End with
  `aria-pressed` selection. A uses no runtime dependency; all three can be
  implemented with `Intl.Segmenter` plus an Extended_Pictographic boundary.
- Fresh checks: A grid ArrowRight moves test-tube to rocket; B search `rocket`
  yields only 🚀 and selection closes; C accepts `👩🏽‍💻`; menu emoji is 16x16
  with 7px label gap; Empty/Duplicate disable Create. Final axe is 0 violations
  / 0 incomplete with no dialog/stage overflow or hidden focusable controls.
- The user selected option A Inline Favorites. The final creation contract is
  16 visible common emoji in an 8-column grid plus Custom for one arbitrary
  grapheme, with no nested picker dependency.

### Preview 12 - Manage Workspaces (confirmed: A)

- Current architecture has create, rename, activate, and delete mutations but
  no Workspace reorder mutation. The implementation plan must add an explicit
  ordered-workspace mutation rather than relying on array rewrites in UI code.
- Workspace deletion is cascading: it removes the Workspace, its Sessions,
  Categories, and category order. It cannot delete the only Workspace, and any
  locked Session in the target Workspace blocks deletion under the current
  mutation safety contract.
- Management therefore needs explicit session/category counts and a
  confirmation step; a hover Trash action must never delete immediately.
- Three layouts will be compared with identical actions: A Dense Rows, B
  Select + Inspector, and C explicit Edit Mode. A is recommended for the
  existing dense workbench unless action density becomes visually unstable.
- Option A Dense Rows shows all Workspaces at once. The row itself is the
  pointer drag surface with grab/grabbing and no visible drag glyph. Hover or
  row focus exposes Move Up, Move Down, Rename, Change Emoji, and Delete; hidden
  actions are removed from the declared Tab sequence. Rename uses inline
  name/emoji editing.
- Option B Select + Inspector separates object selection from a persistent
  right-side editor. It is clearest for one Workspace but introduces a heavier
  two-pane management tool.
- Option C keeps the list read-only until `Edit Workspaces`; entering the mode
  enables whole-row drag and every edit action. This is quieter but adds a mode
  transition to common management.
- Delete confirmation is centered above an inert manager modal and includes
  Session/Category counts. Locked Sessions disable Delete and focus Cancel;
  the only Workspace is also non-deletable. Deleting the active Workspace names
  the replacement context before confirmation.
- Workspace row order must be persisted through a new typed mutation and
  structural sharing owner. Pointer row drag and Move Up/Down issue the same
  ordered ID payload; UI must not rewrite canonical arrays directly.
- Final checks: A has no drag handle, normal hidden actions use tabIndex -1 and
  row focus enables them; B selection updates the Inspector; C edit toggles
  both draggable and action Tab state; locked/only deletion boundaries pass.
  Axe reports 0 violations / 0 incomplete with no hidden focusable controls or
  overflow.
- User feedback removed separate Rename and Change Emoji commands. Preview 12
  v2 gives every Workspace exactly one `Edit` action and one `Delete` action in
  addition to ordering controls. Inline editors and direct Inspector form
  fields are removed.
- A/B/C now call the same `Edit Workspace` modal. It reuses confirmed Create
  Workspace A: visible name field, 16 inline favorite emoji, Custom one-grapheme
  input, live preview, duplicate/empty validation, Cancel, and Save Workspace.
  It pre-fills the current Workspace and excludes that Workspace from duplicate
  comparison.
- B Inspector is read-only summary plus Edit Workspace/Delete; C Edit Mode only
  controls whether ordering/Edit/Delete actions are visible. Neither layout
  owns another editing form.
- Edit modal makes Manage Workspaces inert, accepts name and emoji in one
  atomic save, and returns focus to the triggering Edit action on Cancel or
  Escape. Legacy emoji outside the favorite set opens Custom with its value.
- Fresh v2 checks: Dense actions are Move Up, Move Down, Edit, Delete; quick Edit
  preloads Research + 🧪; duplicate name and invalid emoji disable Save; valid
  `👩🏽‍💻` plus `Research Lab` updates the same row in one save. Escape focus
  return passes. Axe remains 0 violations / 0 incomplete with no overflow or
  hidden focusable controls.
- The user selected option A Dense Rows. Manage Workspaces is one dense,
  reorderable list with whole-row pointer drag, Move Up/Down keyboard
  equivalents, one Edit action, and confirmed Delete.
- Individual editing always uses the shared Edit Workspace modal that reuses
  Create Workspace A. There are no separate Rename, Change Emoji, inline edit,
  or Inspector form owners.

### Preview 13 - Manage Categories (confirmed: A)

- Category management must distinguish built-in and custom capabilities.
  Inbox, Saved, and Archive participate in ordering but cannot be renamed,
  recolored, or deleted. Custom Categories can be edited and deleted.
- Category order has two entry paths: direct whole-tab pointer drag in the
  topbar and ordered rows inside Manage Categories. Both must publish the same
  canonical `set-category-order` payload. The prior explicit Reorder Mode is
  superseded.
- Topbar category drag needs a movement activation threshold so a click remains
  navigation. No visible drag handle is shown. Keyboard reorder stays in Manage
  Categories through Move Up/Down.
- Deleting a custom Category moves its Sessions to Inbox. Existing mutation
  safety blocks deletion when the target contains locked Sessions; the
  confirmation must show affected Session count and the Inbox destination.
- The management layout will compare A one unified dense list, B split
  Built-in/Custom sections, and C table-like columns. A is recommended because
  splitting sections conflicts with one cross-type canonical order.
- Option A Unified Dense List keeps Built-in and Custom items in one ordered
  surface. Whole-row pointer drag has no visible drag glyph; row focus/hover
  exposes Move Up/Down for every Category and Edit/Delete only for Custom.
- Option B visually separates Built-in and Custom, making capability boundaries
  obvious but changing the visible cross-type order. It is therefore unsuitable
  if the topbar order remains canonical across all Categories.
- Option C uses explicit Type, Sessions, and Actions columns. It is precise but
  reads like an admin table rather than the quiet desktop workbench.
- New and Edit Category share one name + color modal. Name validation uses
  trim/NFC/case-insensitive comparison; Edit excludes itself. Delete confirmation
  names the affected Session count and Inbox destination. A locked Session
  disables Delete and focuses Cancel.
- Topbar direct drag preserves click navigation below 5px movement. At or above
  the threshold it shows dragging status and an insertion line. Dropping and
  Manage Move Up/Down both update the same ordered ID list, reflected
  immediately in both surfaces.
- Fresh checks: 3px movement activates Saved without reorder; 7px starts Work
  drag and drops it after Archive with synchronized topbar/manager order.
  Built-in actions are order-only; Custom actions include Edit/Delete. Create,
  duplicate validation, color choice, Edit prefill, locked delete, and focus
  return pass. Final axe is 0 violations / 0 incomplete with no hidden focusable
  controls or overflow.
- The user selected option A Unified Dense List. Built-in and Custom Categories
  remain in one canonical order, with direct topbar drag and dense management
  rows publishing that same order.

### Dedicated drag-and-drop review (confirmed)

- The user requested one later review covering every draggable surface because
  Workspace, Category, Session, Saved Tab, and Open Tab feedback is currently
  inconsistent and unsatisfactory.
- The review must not pretend every drag has the same domain result. Workspace,
  Category, Session, and Saved Tab reorder/move persisted objects; Open Tab drag
  copies browser tabs into an existing or new Session and does not reorder
  Chrome tabs.
- The visual system should still unify source attachment, pointer preview,
  source placeholder, insertion line, valid/invalid target treatment, cross-
  container transition, cancellation, auto-scroll, reduced motion, and keyboard
  equivalents. Each scenario must name whether its outcome is move, reorder, or
  copy.
- Scope includes Manage Workspace row reorder, topbar/Manage Category reorder,
  Session same/cross-category move, Saved Tab same/cross-Session move, selected
  Saved Tabs, one/multiple selected Open Tabs into existing/new Sessions, and
  category drop targets. This review happens after the remaining selection and
  icon previews.
- Fresh production-code audit confirms the current implementation is not yet
  aligned with the approved interaction direction. Session still renders a
  visible/focusable drag handle, and Category still mounts reorder activators
  only inside an explicit reorder mode. The final design instead requires
  whole-title/header Session pointer drag with a keyboard alternative, direct
  topbar Category drag after a movement threshold, and Manage rows as the
  explicit keyboard ordering path.
- Current typed DnD already distinguishes the important domain results:
  `move-session`, `reorder-category`, `move-tabs`, `copy-open-tabs`, and new
  Session creation. The visual review must preserve these protocol boundaries
  rather than hide them behind one generic "move" animation.
- Existing `@dnd-kit` foundations worth retaining are a 5px pointer activation
  threshold, delayed touch activation, Escape cancellation, immutable source
  rectangle capture, target locking/hysteresis, typed compatibility filtering,
  stable Session slots, and explicit insertion targets.
- Current automated coverage includes Session pointer overlay/drop/cancel,
  Session keyboard reorder, Category keyboard pickup/cancel, Open Tab selected
  payloads, source invalidation, and pure geometry/intent resolution. It does
  not visually prove that Workspace, Category, Session, Saved Tab, and Open Tab
  feedback form one coherent system.

### DnD Preview 1 - unified visual grammar (superseded)

- The first DnD preview compares three systems across all five object families:
  A Anchored Insertion, B Live Reflow, and C Destination Outline.
- A Anchored Insertion is recommended. Move/reorder removes the dragged
  content from its source while preserving an exact-size neutral placeholder;
  the compact pointer preview remains 158x48 and the final placement uses a
  3px marker. It communicates an exact result without pushing neighboring
  content during targeting.
- B Live Reflow uses a 210x62 preview and 13px opening gap. It feels more
  dynamic but causes the horizontal Session board and dense Manage lists to
  visibly jump, increasing target instability near auto-scroll boundaries.
- C Destination Outline highlights the entire target. It works for append or
  category assignment but cannot clearly distinguish before/after order for
  Workspace, Category, Session, or Saved Tab reorder.
- A shared pickup/target language does not erase result semantics. Workspace,
  Category, and same-container objects say Reorder; cross-container Session or
  Saved Tabs say Move; Open Tabs always say Copy and add a `+` badge while
  leaving the browser-tab source unchanged.
- The preview includes 10 concrete subscenarios: Manage Workspace, topbar and
  Manage Category, same/cross-category Session, same/cross/new-Session Saved
  Tabs, and existing/new-Session Open Tabs.
- Normal state has no visible drag glyph. Whole rows or the Session title/header
  use `grab`; activation still waits for 5px movement. The preview sits in a
  stable lane above the workbench so it never occludes the actual drop target.
- Invalid targets use a neutral no-drop treatment and a concise reason. They do
  not shake the layout or color the full target red. Escape/release restores
  the original state without persistence.
- Multi-selected Saved Tabs reserve one placeholder for each moved source row;
  multi-selected Open Tabs reserve none because the operation is copy.
- Fresh browser verification covers all 10 option-A subscenarios with
  0 axe violations / 0 incomplete each, no page/stage overflow, no hidden
  focusable controls, and no visible drag icons. Replay advances
  Ready -> Pickup -> Target.
- The user rejected option A's retained source placeholder. It does not match
  the expected direct-manipulation model because the dragged object appears to
  occupy both its old position and the pointer/target at the same time.

### DnD Preview 1 v2 - Live Target Reflow (superseded by Gap Anchor)

- The user corrected the initial v2 model: Pickup must not collapse the source
  slot because the source is also the first current target. The dragged object
  therefore stays in its original in-flow slot at Pickup and the visible order
  remains exactly the Ready order.
- A new valid target moves the in-flow `.live-slot` / `.live-tab-stack` to that
  slot. Existing Workspace rows, Category tabs/rows, Sessions, or Saved Tabs
  reflow around it through a 180ms FLIP transition. The current target uses a
  170ms scale emphasis with full-opacity text.
- There is always one current target while dragging. Leaving valid target
  geometry does not jump the object back to source or collapse the list; the
  last valid target and its order remain visible with a concise invalid reason.
  Escape/cancel alone restores the original order.
- Move/reorder Target states do not render a simultaneous detached pointer
  overlay. The in-flow target occupant is the spatial source of truth.
- Workspace and Category reorder show the dragged row/tab at its new index.
  Session reorder shows the complete post-drop Session order. Cross-category
  Session move switches to the target Category and previews its resulting
  board.
- Saved Tab reorder inserts the dragged row at its target index. Multi-selected
  Saved Tabs occupy one target stack containing each selected row. When all
  tabs leave an unlocked, note-free source Session, that Session disappears in
  the preview, matching `drop-operations.ts`.
- New Session is not a standing target shown in Ready or Pickup. It appears
  only after the pointer enters a new-session insertion target. This separates
  New Session from Other Session: Other Session inserts the dragged stack into
  an existing Session body/row, while New Session inserts a new in-flow Session
  slot at the board target position.
- Existing Session and New Session are not separate drag modes or payloads.
  Saved Tabs use one `tabs` payload and Open Tabs use one `open-tabs` payload;
  the currently hit target alone chooses `move-tabs` / `copy-open-tabs` versus
  `create-session`. The preview therefore uses one shared Ready/Pickup baseline
  and exposes Existing Target and New Session Target as states of the same
  drag. The UI no longer presents them as preselected subscenarios.
- New Session creation requires deliberate precision. During an eligible
  Saved/Open Tabs drag, each inter-Session gap shows one 20x20 plus icon centered
  in the gap; its visual box is also its complete pointer hit box. Ordinary
  board whitespace and the rest of the gap do not create a Session.
- Entering the plus replaces it with a full in-flow New Session preview and
  reflows neighboring Sessions. This was revised: entering the plus only makes
  that 20x20 icon active; it does not insert or reflow anything. Releasing while
  active creates the Session and then shows the resulting slot. Leaving before
  release immediately returns the plus to rest. This target deliberately does
  not use the ordinary 12px target-lock hysteresis.
- The active plus shows `Release to create session` as a compact,
  pointer-transparent drag-state tip. Color alone would confirm hit-testing but
  would not communicate the release outcome for such a small, precise target.
  The tip appears only while active and disappears immediately on leave.
- Plus Active also renders the actual selected tabs as a pointer-transparent
  drag stack near the active plus. Its card surfaces use 58% alpha while tab
  titles/domains remain identifiable. The stack is offset from the pointer and
  sits below the plus in z-order, so the complete 20x20 plus stays visible and
  remains the only hit target. Open Tabs use the same stack with a copy badge.
- The user required New Session anchors at the start as well as every
  inter-Session gap and the end. The preferred production geometry uses fixed
  340px Session columns, 16px gaps, and full Board height. Anchors belong to the
  track, so tab count and Session content never move their x/y coordinates.
- Drag ghosts keep the captured source width and selected-row height from
  Pickup through Plus Active; target changes move the ghost but never shrink or
  swap its template.
- Empty Category compares two placements. First Slot Center is recommended:
  one 20px plus sits at the center of the first fixed Session slot, and the
  created Session expands in place. Board Center is more conspicuous but causes
  a large spatial jump when the first Session must settle into the left track.
- The user selected First Slot Center and made Empty Category an intentional
  exception to the precise 20px hit rule. With no existing Session targets to
  disambiguate, the entire first fixed slot outline is the New Session target.
  Activation highlights the full slot; the centered plus remains an affordance.
- Empty activation replaces `No sessions here yet` in place with
  `Release to create session`. It does not add a second tooltip near the plus,
  so the empty-state hierarchy stays quiet and stable.
- A follow-up experiment applies ghost-above-plus globally. Ghost z-index is
  17, plus is 15, and the release tip is 18. In non-empty gaps the translucent
  ghost fully overlaps the 20x20 plus, which remains visible through the ghost;
  hit testing still belongs to the exact plus geometry. Empty Category uses the
  same layering while the first-slot outline owns target activation.
- If selected Saved Tabs are exactly all tabs from one source Session, every
  New Session plus and New Session Target state is suppressed. The same payload
  may still hit an existing Session and merge there. Open Tabs never use this
  suppression because creating their first saved Session is a valid intent.
- Open Tabs use the same current-target model without changing Chrome data.
  Pickup groups the selected sidebar rows as the initial source target; entering
  a Session or new-Session target inserts an in-flow copy slot with a `+` badge
  while all source rows remain visible.
- Replay verification for Session reorder observes
  `Ready -> Pickup at source -> new Target -> Invalid`. Ready and Pickup both
  show `Startup -> Research -> Reading`; Target and Invalid show
  `Research -> Startup -> Reading`. Escape restores the original order and
  focus returns to the Ready control.
- All 10 subscenarios satisfy the state invariants:
  `Pickup order == Ready order`, `Invalid order == last Target order`, and one
  current-target occupant in Pickup/Target/Invalid. Twenty-four representative
  Pickup/Target/Invalid states pass axe with 0 violations / 0 incomplete. The
  page has no body/stage overflow, hidden focusable controls, or resting drag
  icons.

### DnD Preview 3 - horizontal auto-scroll (confirmed: A)

- Current production relies on `@dnd-kit` default auto-scroll because
  `DndContext` has no explicit auto-scroll policy. The horizontal Board owns
  overflow, but threshold, acceleration, and scroll-vs-target behavior are not
  product contracts.
- Option A Progressive Edge is recommended: 48px left/right edge zones and
  speed increasing from 3 to 12px per frame by edge depth. At 32px from the
  right edge, measured speed is 6px/frame; at 8px it is 10.5px/frame.
- Option B jumps to a constant 8px/frame on entering the same 48px zone. Option
  C uses an 80px zone and already reaches 7.6px/frame at 32px from the edge,
  interfering earlier with ordinary Session targets.
- Pointer and ghost remain fixed in viewport coordinates while the Session
  track moves. Anchors remeasure after every scroll step.
- Existing Session targets retain short hysteresis while scrolling. Exact 20px
  New Session plus targets use no hysteresis. Because an anchor could otherwise
  cross a stationary pointer in one or two frames, real plus activation pauses
  Board scrolling immediately. Leaving the plus resumes edge scrolling.
- Browser probes confirm progressive scroll accumulation, stable pointer/ghost
  geometry, plus activation at scroll 158px with 0px/frame, and resumed
  10.5px/frame scrolling after leaving the plus.
- The user selected option A Progressive Edge. The accepted contract is a 48px
  Board-owned edge zone, 3-12px/frame depth-based speed, per-frame anchor
  measurement, short Existing-target hysteresis, and immediate scroll pause
  only while the pointer is truly inside an exact New Session plus.

### DnD Preview 4 - cancellation and keyboard alternatives (confirmed: C)

- Current production KeyboardSensor depends on focusable Session/Open/Category
  drag-handle buttons. That conflicts with the confirmed rule that resting UI
  never exposes a drag icon, and a visually hidden focus stop would be harder
  to understand than a named command.
- Option A keeps KeyboardSensor everywhere: Space pickup, arrows target,
  Space drop, Escape cancel. It preserves direct manipulation but requires an
  activator and creates key conflicts on Saved/Open tab title buttons.
- Option B moves every keyboard path into named command menus. It is explicit
  but makes high-frequency Workspace/Category ordering unnecessarily verbose.
- Option C Hybrid Commands is recommended:
  Workspace and Category use Move Up/Down in their confirmed Manage lists;
  Session reorder uses direct before/after commands and cross-category movement
  opens a target picker; Saved Tabs selection uses Move to; Open Tabs selection
  uses Save to. Exact placement of those named commands remains part of the
  final menu-content review.
- Target pickers are preview-first. Arrow keys change the preview; Enter/Space
  commits; Escape or Cancel restores original data and selection. Commit and
  cancel return focus to the moved object, or to its surviving Session/list
  fallback when the source object no longer exists.
- Pointer/touch DnD remains unchanged and uses the object surface rather than a
  resting drag icon. Keyboard equivalence does not need to mimic pointer
  mechanics as long as every move/create result is available through a named,
  focusable command.

### Preview 14 - Session Saved Tab selection toolbar (confirmed)

- The preferred structure mirrors Open Tabs: selection mode is independent
  from selected IDs, and the single-line Session header is replaced in place by
  selected count plus Select/Unselect All, Restore Selected Links, Copy URLs,
  Delete Selected, and Exit.
- Selection scope is one Session. One active selection scope remains global
  across Manager; entering this mode clears Open Tabs or another Session scope.
- Mixed item semantics need explicit counts: Restore and Copy operate only on
  selected Link items and disable when zero links are selected. Delete operates
  on all selected items but disables for locked Sessions. Notes remain
  selectable and draggable even though they are not restorable or URL-copyable.
- Successful Restore/Delete clears selected IDs but keeps the Session in
  selection mode at `0 selected`; Copy preserves the current selection. Exit
  clears IDs and exits the mode. This preserves the already-confirmed
  empty-but-active state.
- The user selected option A Icon Toolbar. The Session header is replaced in
  place by selected count plus Select/Unselect All, Restore selected Links,
  Copy selected URLs, Delete selected items, and Exit. It intentionally
  mirrors the already-confirmed Open Tabs contextual bar.
- Option A keeps five 32x32 icon actions in a 58px Session header. Fresh
  geometry confirms all controls fit in the 430px Session with no horizontal
  overflow or hidden focus targets.
- Browser state checks confirm the action matrix: empty disables
  Restore/Copy/Delete; Links enables all three; Notes enables Delete only;
  locked disables Restore/Delete but keeps Copy; mixed counts all selected
  items while Restore/Copy name only selected Links.
- Filtered selection keeps hidden selected IDs. The count can therefore exceed
  the number of visibly selected rows, while Select/Unselect All operates only
  on visible rows.
- This selection decision does not settle drag feedback. Workspace, Category,
  Session, Saved Tab, selected Saved Tabs, and Open Tabs remain in the
  dedicated all-scenarios DnD review, where visual feedback is unified but the
  domain result must still be labelled reorder, move, or copy.
- Comparison-only option C now closes on Escape and returns focus to its menu
  trigger. The final page is restored to A + `0 selected`; axe reports
  0 violations / 0 incomplete.

### Final C3 production menu audit

- The confirmed B2/C3 interaction requires actual description data on every
  production menu item. The custom overlay owner already had delayed pointer
  and immediate keyboard behavior, but Global, Workspace, Category, Session,
  and Saved Tab menus supplied no descriptions, so production showed none.
- One shared description owner now drives both Mantine and custom menus:
  550ms pointer dwell, immediate keyboard focus, pointer-transparent portal,
  `aria-describedby`, and viewport-edge flipping.
- Portaled menus and tips must remain inside the Manager `main` landmark.
  Mounting them directly under `body` causes axe `region` failures even though
  fixed-position geometry is visually correct.
- Custom destructive menu rows must use `--tabboard-danger`, not Mantine
  `red-7`. In D1, `red-7` measured only 3.56:1 on the menu surface, while the
  semantic token resolves to `#e48795` and clears the rendered audit.
- Vite may retain stale transformed TSX/CSS during long iterative sessions.
  Before rejecting a browser result that conflicts with current source and a
  fresh production build, inspect the served transformed module and restart
  Vite.

## Phase 18 - Preview-to-production parity audit

### Audit scope

- Treat the approved bilingual Crisp Utility spec and confirmed Preview 8-14
  evidence as the source of truth; production tests that assert a conflicting
  aesthetic are defects, not stronger product decisions.
- Compare six surfaces: global material/hierarchy, Sidebar/context bar,
  Session card/header, Open/Saved rows, Workspace/Category/topbar, and
  Popup/Options.
- Verify resting, hover, focus, selection, open-menu, collapsed/peek/pinned,
  light/dark, and compact states through rendered geometry and screenshots.

### Initial confirmed divergences

- `OpenTabsSelectionBar` does not pass `variant="subtle"` to its icon actions.
  `AccessibleIconAction` therefore inherits Mantine's filled default, producing
  the two bright blue square buttons called out in the user's screenshot. The
  approved Preview 8 contract requires neutral resting actions with soft
  foreground/background change only on hover or selected state.
- Production `session-rendering.test.ts` explicitly asserts that Session cards
  have no `box-shadow`, while the approved visual spec says surfaces use subtle
  borders and light elevation. The screenshot confirms that the current card
  reads as a flat bordered column rather than the preview's raised work
  surface.
- `.session-card__actions` uses resting `opacity: 0.45`; Restore and More are
  therefore always visible as pale controls. The approved progressive
  disclosure contract requires these secondary header actions to appear on
  Session-header hover/focus, remain visible while a menu is open, and stay
  directly available on coarse pointers.
- This audit must also test the other `AccessibleIconAction` call sites for the
  same missing-variant failure and compare title/note/header geometry, row
  disclosure, workspace/category material, Popup, and Options before coding.

### Rendered parity matrix findings

- The missing neutral variant is systemic, not local. Desktop Open Tabs
  Selection / Save All and collapsed Expand render as solid cobalt; Session and
  Open Tabs selection toolbars contain the same unqualified shared primitive.
  `AccessibleIconAction` should own the neutral resting default so a new caller
  cannot silently inherit Mantine's filled primary variant.
- Session Restore and More bypass `AccessibleIconAction` and render as raw
  Mantine `ActionIcon size="sm"` controls. Their measured box is 22x22 rather
  than the confirmed 32x32 action geometry. Moving them to the shared primitive
  is required for size, icon stroke, tooltip, and neutral-state parity.
- Header actions are measured at `opacity: 0.45`, `visibility: visible`, and
  `pointer-events: auto` in the resting fine-pointer state. Approved
  progressive disclosure is `opacity: 0` plus no pointer hit until header
  hover/focus, with visibility retained while the Session menu is open and
  always visible for coarse pointers.
- Session title is still one-line `white-space: nowrap`; T1 requires a compact
  two-line clamp. Long Session titles therefore truncate too early and leave
  the title-summary hierarchy flatter than the preview.
- The group-level Session note renders as unframed dimmed text. S1 requires a
  compact quiet fill and a 2px left accent rule immediately after metadata.
- Active Category currently combines the confirmed accent-soft fill with an
  extra 2px inset underline. N1 Quiet Hierarchy uses the fill only; the
  underline increases contrast and makes topbar navigation busier than the
  preview.
- 390px geometry, 772px topbar containment, Window glyph/focused badge,
  Workspace context, Open/Saved title/meta rows, checkbox/X ownership,
  Popup P2 composition, and Options O2/A2 structure show no new structural
  parity gap. Existing axe checks remain 0 violations / 0 incomplete.

### Final parity result

- Shared neutral action ownership removes the filled-cobalt leak from normal,
  collapsed, Open selection, and Session selection states. Explicit
  selected/danger callers preserve their semantic treatment.
- Session Resting / Header Hover / Keyboard Focus / Menu Open now form four
  coherent states: actions are visually quiet at rest, 32x32 when disclosed,
  remain keyboard reachable, and stay visible while the menu owns focus.
- Card elevation is intentionally minimal and visible because ordinary slots
  reserve 3px/5px around the card. Empty Category remains a full-height target;
  the created card settles into the same column with the ordinary inset.
- T1 titles render up to two 18px lines without overlapping the 66px action
  lane. S1 group notes sit directly below metadata with 6px/8px padding,
  accent-soft fill, and a 2px accent rule.
- Open/Saved row checkbox remains visible throughout selection mode; trailing X
  remains hover/focus progressive on fine pointers and expands to 44px in the
  drawer/narrow path. Locked disabled X remains hidden at rest and 0.45 only
  when disclosed.
- Final rendered review found no additional preview-to-production mismatch in
  Workspace, Category management, tooltip/menu, Popup, or Options surfaces.

## Phase 19 - Compound-control collision audit

### Reported Workspace collision

- The real unpacked extension shows the default `🗂️` Workspace emoji visibly
  touching or overlapping `Personal` in the topbar trigger. This is a defect,
  not an acceptable dense-layout tradeoff.
- The trigger currently places the emoji, label, and chevron in Mantine's
  button label flow with only a 4px gap. Shared CSS constrains the emoji to a
  fixed 16x16 inline-grid box at 16px font size.
- Color emoji glyph ink is not guaranteed to stay inside a 16px CSS advance
  box. The default `🗂️` is especially wide, so its painted pixels can extend
  beyond the fixed box and consume the already-small label gap.
- Existing source-contract tests only prove that separate emoji/label spans
  exist. Existing browser fixtures commonly omit `Workspace.emoji` and rely
  on normalization. No test measures adjacent rendered visual bounds or
  exercises multiple emoji grapheme shapes, so the collision escaped the
  previous page-level parity matrix.
- The prior statement that Workspace had no remaining parity gap was therefore
  too broad. Passing screenshots, axe, and DOM bounding boxes do not prove that
  color glyph ink does not overflow its assigned box.

### Audit boundary

- Treat every same-line icon/emoji/favicon/checkbox/badge + label/count/chevron
  + trailing-action composition as a compound control.
- Check both stable layout boxes and visible glyph separation. For emoji,
  reserve a wider icon slot and use a gap large enough for platform color-font
  overhang; do not treat a 16px text glyph as equivalent to a 16px Lucide SVG.
- Verify default `🗂️`, ZWJ `👩🏽‍💻`, ordinary single emoji, long Workspace names,
  light/dark, desktop/compact, menu rows, and manage/editor surfaces.
- Extend the same collision scan to Category navigation, Session header/meta,
  Open/Saved rows, Popup action rows, and Options setting/action rows before
  claiming the problem is isolated.

### Confirmed related defects

- Workspace root cause was structural: Mantine put emoji, name, and chevron
  inside `.mantine-Button-label`, while the declared 4px gap belonged to the
  outer `.mantine-Button-inner`. Rendered gaps were exactly 0px for both
  emoji/name and name/chevron.
- Category label/count repeated the same owner mistake. `Saved` and its count
  rendered at 0px separation because the gap was on Button inner while both
  children lived in Button label.
- Session metadata icon/copy had no explicit inline layout owner. The repair
  uses `inline-flex`, center alignment, and a 4px gap.
- At 390px, the Category nav was only 41px wide while active `Saved 1` needed
  75.5px. Desktop Category Options margins and `max-width: calc(100% - 68px)`
  leaked into compact layout, and selected navigation did not reveal the active
  item.

### Final rendered result

- Workspace trigger now uses Mantine left/label/right sections. Production
  unpacked extension measures 6px from default `🗂️` to `Personal` and 4px from
  the name to chevron. ZWJ `👩🏽‍💻` plus a long Workspace name passes the same
  contract; compact centers its 20px emoji in the 44px target with 0px center
  delta.
- Workspace menu measures 6px emoji/name and 9px name/edit. Workspace Manage
  measures 8px emoji/summary and 8px summary/actions. Editor preview measures
  8px emoji/name.
- Category label/count uses the true Button label owner. Compact reclaims
  non-semantic Category Options margins, keeps the count, and gives the nav
  enough width for `Saved 0`; the active item is revealed after selection or
  resize without document overflow.
- Open/Saved rows already used explicit owner/copy/action grid columns. Their
  checkbox-over-favicon and pinned-badge-over-favicon states are intentional
  product overlays, not collisions.
- Popup buttons measure 10px icon/label and the brand measures 10px icon/name.
  Options desktop and 390px measure 10px icon/label with no horizontal
  overflow. No additional compound-control defect was found on those surfaces.
- Fresh axe reports 0 violations / 0 incomplete for compact Manager, Popup,
  compact Options Advanced, and the rebuilt unpacked production Manager.

## Phase 20 - Sidebar disclosure motion parity

### Confirmed reference

- The approved preview is
  `.superpowers/brainstorm/35386-1785370668/content/crisp-utility-sidebar-four-state-v1.html`,
  derived from the selected C1 Hybrid Rail motion preview.
- Fixed desktop expand/collapse changes both sidebar width and shell track over
  180ms with `cubic-bezier(.2, .8, .2, 1)`, so the Board is continuously
  reflowed instead of jumping between 52px and the expanded track.
- Peek keeps the shell/Board at the 52px rail and animates only the overlay
  sidebar width plus a 150ms shadow. Drawer follows the same overlay model at
  the compact breakpoint.
- Expanded-only content starts after a 75ms delay and fades for 80ms
  `ease-out`; closing reverses without the delay. Reduced motion collapses the
  transition duration to effectively zero.

### Production divergence

- `.manager-shell` has no transition, while pinned/collapsed state swaps
  `grid-template-columns` immediately.
- `.manager-sidebar__overlay` declares only opacity/transform transitions, but
  every state sets `transform: none`; its actual changing property is width.
  The declared transition therefore animates nothing.
- `layout.test.ts` explicitly requires no `transition: width` and no
  `transition: grid-template-columns`. That source contract contradicts the
  later confirmed sidebar preview and is the primary reason motion was removed.
- Expanded Open Tab content and Filter are conditionally unmounted or set to
  `display:none` in collapsed state. These cannot participate in the approved
  delayed fade even after width motion is restored.
- Existing browser checks assert only final offsets/classes after state
  changes. They cannot distinguish a continuous 180ms transition from a
  one-frame jump, so the missing motion escaped Phase 17-19 gates.

### First GREEN evidence

- Restoring shell `grid-template-columns` and sidebar `width` transitions makes
  the new browser geometry assertions pass: at 45ms both sidebar width and
  Manager main offset are strictly between 52px and the final expanded width.
- Existing endpoint tests immediately read geometry after Collapse. With real
  motion they now observe values such as 52.5px before the final frame; those
  tests must wait for the endpoint instead of assuming class change equals
  visual completion.
- Existing DOM tests require Filter and Open Tab Focus controls to be absent.
  The motion contract requires them to remain mounted for opacity transitions,
  so the correct collapsed contract is disabled + `aria-hidden` +
  `tabIndex=-1`, not node absence.
- The initial expanded-copy probe still reads opacity 1 at the first sampled
  frame. Geometry motion is therefore fixed, but content reveal timing still
  needs direct computed-style tracing before completion.

### Final motion implementation findings

- The content probe initially read `.manager-open-tab-details`, whose own
  opacity is always 1. The real animation owner is
  `.manager-open-tab-content`; frame tracing shows opacity 0 for the first six
  frames, then a progressive fade to 1 after the 75ms delay.
- Keeping animation content mounted changed the collapsed accessibility
  contract from "node absent" to "node inert": Filter and Open Tab Focus stay
  in the DOM but are disabled, `aria-hidden`, `tabIndex=-1`, invisible, and
  pointer-inactive.
- Rendered screenshots exposed a 11.5px favicon jump that source-level
  alignment tests missed. A stable 43px desktop identity column plus shared
  owner centering keeps the favicon center fixed through pinned and Peek
  transitions.
- Compact Drawer needs a distinct 44px identity owner. A later session style
  rule initially overrode it back to 20px, causing the 44px checkbox to overlap
  the title by 4px. An owner-specific media rule restores the exact
  44px / 8px / flexible-title / 8px / 44px geometry.
- `overflow:hidden` made the animated sidebar overlay an accidental horizontal
  scroll owner. `scrollIntoView()` shifted its whole content 4px left at 390px.
  Using `overflow:clip` leaves horizontal scrolling with the dedicated Window
  switcher and removes the rail overflow.
- The successful motion matrix now covers pinned intermediate geometry,
  delayed content reveal, stable icon centers, Peek overlay with a fixed Board,
  rapid reversal, compact Drawer, focus restoration, and reduced motion.

## Phase 21 - Forensic preview-to-production parity audit

### Acceptance correction

- The acceptance model is now contract-first rather than page-first. Each
  confirmed preview needs independent structure, rendered geometry, temporal,
  interaction/focus, and accessibility evidence. A green endpoint E2E or axe
  pass does not close the other columns.
- Initial default rendered scans at Manager 1440x900, Popup 320x700, and
  Options 1024x900 found no unapproved visible sibling collisions or
  horizontal document overflow. Visually-hidden accessibility text was
  correctly excluded from the overflow result.
- The production Open/Saved row accessibility tree exposes a generic outer row
  with pointer listeners plus nested checkbox, primary button, and X button.
  This is not yet classified as a defect; pointer activation boundaries and
  keyboard order must be exercised before accepting the compound interaction.

### Popup default evidence

- The default Popup measures 320x198. Save and Remove are both exactly 80x32,
  and the main copy columns do not clip.
- A source-only read suggested that the 320px viewport media query could force
  header actions to 44px. Rendered computed values disprove that hypothesis:
  both actions remain 32x32 with fine pointer / hover capability because the
  shared input-capability rule owns the final size.
- Mantine's pinned checkbox has a 24x24 owner and a 20x20 transparent native
  input offset by -2px. The visible check icon is centered within the owner
  within 0.01px on X and exactly on Y. This is not the previously reported
  visible checkmark-alignment defect, so no production change is justified.

### Confirmed difference 1 - Saved Tab tooltip row gap

- Serial pointer evidence disproved the earlier concurrent-hover samples.
  Session Header hover correctly reveals both 32px actions with a 6px title
  gap. Open Tab hover correctly overlays the checkbox at the favicon center,
  reveals the X, and places the tooltip 6px above the full row.
- Saved Tab hover over the same shared tooltip placed it 6px above the inner
  title button but only 2px above the visible row. The final contract says the
  tooltip is 6px above the current row; the row's 4px top padding was lost
  because `ManagerOverlayPortal` measured `preview.trigger` directly.
- A real Playwright regression first failed with `Expected 6, Received 2`.
  The minimal shared-owner repair resolves the visual anchor through
  `.manager-open-tab-row, .tab-item-row__content` and falls back to the trigger.
  The same test now passes for both Open and Saved rows; 110 focused overlay /
  session tests remain green.

### Confirmed differences 2-3 - Manage list visual contracts

- The final Manage Workspaces preview gives the current Workspace an
  accent-soft background and visible quiet border. Production rendered the
  correct 49px row and four progressive actions, but the current row was
  completely transparent with only a `Current` text suffix.
- A rendered RED failed because `workspace-manager-row--current` was absent.
  Production now adds the state class and semantic material without changing
  ordering or deletion behavior.
- Manage Categories had drifted further: production used 29px, borderless,
  one-line rows with 24px actions, effectively applying the B2 popup-menu
  density to an object-management list. Final Preview 13 uses approximately
  48px bordered rows, a 14px color swatch, separate name/meta lines, 32px
  actions, and active-row material.
- Rendered RED received `29` for an expected row height of at least `48`.
  Production now measures exactly 48px, has a 1px border, zero name/meta gap,
  32px actions, no row overflow, and active Category accent-soft material.
- Both final previews use 5px row gaps. The first repaired render still
  measured 10px because Mantine `Stack gap="xs"` remained the owner. Separate
  rendered REDs received 10px for both Workspace and Category lists; shared
  list CSS now resolves both to 5px.
- Focused verification is 2/2 rendered E2E plus 4 files / 70 component-layout
  tests. The updated tests replace the earlier incorrect source assertion that
  mandated a 29px borderless Category row.
- A later focus-state pass found both semantic materials were overwritten by
  the generic row hover/focus surface. Rendered REDs showed A1 accent-soft
  `rgb(234, 240, 252)` changing to ordinary hover `rgb(241, 243, 246)`.
  State-specific interactive selectors now preserve current/active material;
  2/2 E2E and 3 files / 52 focused tests pass.
- Workspace nested Edit is correct in the real page: the Manage dialog becomes
  inert + `aria-hidden`, only the Edit dialog remains active, and Escape
  returns focus to the exact long-name Edit action while re-enabling Manage.

### Session selection toolbar evidence

- The production Session track is 340px; card inner width is 314px. Despite the
  confirmed preview being demonstrated at 430px, the actual toolbar fits the
  count plus all six 32px actions without horizontal overflow (`314/314`,
  `scrollLeft=0`) in both `0 Selected` and one-Link-selected states.
- Empty mode focuses Select All Visible and disables Restore/Copy/Move/Delete.
  Selecting one Link enables all five data actions; Exit remains available.
  Every action remains fully inside the toolbar bounds.

### Confirmed difference 4 - Popup P2 geometry

- Direct measurements against the final Popup HTML found that production kept
  only the 80x32 action and 13/18 text portions of the approved P2 contract.
  The surrounding hierarchy had been recompressed: 44px header instead of
  52px, 12px body padding instead of 16px, 18px brand instead of 22px,
  count weight 500 instead of 700, 24px checkbox owner instead of the
  confirmed 16px visual, and a forced one-line pinned helper.
- A dedicated rendered RED first failed `Expected 52, Received 44`.
  Production now matches the approved visible geometry: 52px header / 16px
  inline padding, 16px body padding / 10px row gap, 22px brand, 700 count,
  16px checkbox, 4px checkbox/helper gap, 32px two-line helper, 40px duplicate
  row, and equal 80x32 actions.
- The preview HTML's empty feedback row and separator are demonstration
  scaffolding, not final product requirements. An initial 206px total-body
  assertion was removed after checking the written spec and prior preview:
  product must not reserve an empty pinned or duplicate region.
- Focused verification: Popup rendered parity 1/1 and Popup + Service Worker
  2 files / 78 tests.

### Confirmed difference 5 - Options final-polished hierarchy and tokens

- The latest approved Options source is
  `crisp-utility-options-polished-v1.html`, not the earlier 440px O2 thumbnail.
  It fixes the real surface at 680px with 32px inner padding and specifies
  96px Header, 24/32 H1, 24px Sections, 16/22 Section titles, 13/18
  descriptions, 14/20 setting labels, 13/18 help, 36px controls, and a flat
  52px Advanced disclosure.
- Production retained the correct information architecture but had fallen back
  to Mantine defaults: 16px container padding, 51.6px Header, 22/30.8 H1,
  20px Sections, 16/24 headings, 14/20 help, and a bordered 8px-radius
  Advanced card. Save status also lived below H1 instead of beside Open
  Manager, and Section description lived below its title.
- Two rendered REDs first failed at `container padding 16 vs 32` and
  `Advanced border 1px vs 0px`.
- Options now uses a page-local polished owner without changing projection or
  lazy loading: 680/32 surface, 96px Header, status + Manager action group,
  same-line Section title/description, exact typography, horizontal compact
  Restore radios, and no redundant Capture Divider.
- Advanced is an unframed continuation with a 52px summary, four direct rows,
  24px Storage padding, 20px ordinary row padding, and no nested Card or
  one-item Section wrappers.
- Rendered parity is 2/2; Options focused tests are 3 files / 24 tests.
- Storage projection was then exercised through the real preview
  `chrome.storage.onChanged` subscription. Ready Local Folder retains the
  configured name, `updated: HH:mm:ss`, Change Folder, and Use Browser Storage;
  the two visual layers remain 24px apart with no overflow. Fallback retains
  the same folder/time context and adds the Browser temporary-write warning,
  persisted reason, Reconnect, and Use Browser Storage.
- A page reload with only `configuredTarget=file` but no IndexedDB directory
  handle correctly falls back during Storage Authority initialization. That is
  an environment boundary, not a UI defect. The status-projection UI is covered
  in browser; native picker/permission and a genuinely healthy persisted handle
  remain unpacked-Chrome manual checks.

### Confirmed differences 6-9 - cross-theme and Open Tabs state details

- Manager, Popup, and Options rendered D1 canvas `#1a1e24` but advertised
  browser `theme-color=#242424`; light similarly used Surface white instead of
  A1 canvas `#f3f5f8`. The existing hook test encoded stale values although the
  docs claimed metadata matched body. RED received `#242424` vs `#1a1e24`;
  shared theme metadata now uses A1/D1 canvas. Two files / 22 tests pass.
- Workspace switcher geometry was already exact at 29px row, 18px Edit slot,
  and 14px Pencil. Its current row still used ordinary hover gray even though
  no check exists and final Preview 10 makes accent-soft the sole current-state
  cue. Rendered RED received `rgb(241,243,246)` vs `rgb(234,240,252)`.
  Current material now remains accent-soft through focus and hover.
- Collapsed active Filter had no visible state or result semantics. A retained
  query reduced 7 Open Tabs to 2, but Expand stayed named `Expand Sidebar` and
  had no dot. DOM/rendered REDs now guard a 7px pointer-transparent dot at a
  visible 3px inset and the name
  `Expand Sidebar, 2 of 7 open tabs match the filter`; reopening retains query.
- Open Tabs selection had drifted from the confirmed four-action contract to
  six by reintroducing Close Selected and Pin Selected. Final Preview 1 and the
  bilingual spec contain only Select/Unselect, Create Session, Save To, and
  Exit. DOM/rendered REDs received six; composition is now four. Row-level X
  and its irreversible close confirmation remain unchanged. Lower-level
  workflow methods remain internal and are no longer surfaced here.
- Focused results: 3 Manager rendered scenarios and 3 files / 77 related tests
  pass.

### Menu and Workspace editor completion evidence

- Session menu had only eight text-only commands. Final Preview 10 requires
  nine icon-led commands and explicitly adds Edit Session Note. Production now
  exposes Add Link, Add Note, Rename Session, Edit Session Note, Move Session,
  Lock/Unlock Session, Copy Links, Select Tabs, and Delete Session. Every row
  is 29px with a 16px Lucide icon; Delete is the final danger-separated item.
- Session keyboard context open is named `Session Actions`, focuses the first
  item, and Escape returns focus to the Session. Focused verification is 1/1
  rendered and 4 files / 126 tests.
- Mantine Global/Workspace/Category menus originally opened without first-item
  focus because `keepMounted` disables its focus trap and the previous source
  test explicitly rejected autofocus. A shared next-frame helper now focuses
  the first enabled item for all three owners. Global and Category command sets
  retain 29px/16px geometry.
- Saved Tab menu now names its final action `Delete Saved Tab` /
  `Delete Saved Note` instead of generic Delete. Keyboard opening shows the C3
  description immediately; pointer opening stays quiet at 400ms and shows the
  pointer-transparent item description after 550ms. Escape restores the title.
- Workspace editor rendered 16 favorites in eight 38.25px square columns
  inside the 380px production Modal with no overflow. ArrowRight updates
  pressed/focus from test tube to rocket; Custom accepts `👩🏽‍💻`; preview and
  Create availability update; Escape returns to New Workspace.
- The approved Preview 11 HTML currently displays A Inline but fails to render
  its `.emoji-grid` even after reselecting A. Its running script is therefore
  not usable for direct geometry comparison; production behavior is covered by
  browser + component tests, while preview CSS/decision records remain the
  static visual reference.

### Coarse pointer, DnD, and accessibility completion evidence

- Real 390x844 mobile/touch context found four small-target defects that
  desktop/viewport-only checks could not expose: Drawer Window buttons were
  36px, Drawer Filter 30px, Workspace current-row Pencil 18px, Options buttons
  36px, and the eight-column emoji picker gave only 34.6px cells.
- Coarse-only owners now make Drawer and Options actions at least 44px,
  Workspace Pencil 44px while retaining its 14px glyph, and the emoji grid six
  44px columns without overflow. Desktop remains eight columns and preserves
  the confirmed 18px Pencil slot. Coarse rendered parity passes 2/2.
- Open Tabs hidden-selection rendered path passes: a selected hidden ID
  survives filtering; Select/Unselect All modifies only two visible rows;
  hidden selection remains in count/payload; Collapse clears selection/mode
  but preserves the query.
- Sidebar motion serial subset passes 8/8. Final DnD acceptance passes 11/11,
  including exact 20px plus, 300ms tip, all-source suppression, empty first
  slot, immutable ghost, source replacement, and reduced-motion auto-scroll.
  Whole-session Hybrid commands pass 3/3 after updating the keyboard traversal
  for the newly restored Edit Session Note item.
- Axe 4.12.1 results: Manager selection, Session menu, Popup mixed, and Options
  Advanced fallback are each 0 violations / 0 incomplete. Compact Drawer final
  frame is 0 violations / 1 contrast incomplete because overlay overlap blocks
  automatic background determination. An immediate audit during its 180ms
  animation briefly reported low contrast; waiting for width and opacity final
  values removed it, confirming a transition-sampling false positive.

### Confirmed differences 10-11 - Open/Saved row composition and typography

- The final Preview 10 v3 source is still present at
  `.superpowers/brainstorm/19390-1785459648/content/crisp-utility-row-menu-selection-revision-v1.html`.
  It gives Open and Saved rows the same structured `row-main` grid, with title
  and metadata in separate block rows.
- Production Open rows rendered only the title. Their accessibility tree and
  live DOM had one copy child, while Saved links had title plus URL. The first
  rendered RED failed because the Open row was missing its metadata child.
  Open rows now render their URL as an independent metadata line.
- The first structural repair exposed a second parity gap that endpoint
  screenshots had hidden: Open title/URL computed to 12/16 and 12/14, while
  Saved title/URL inherited 16/24.8 and 12/16 from the native button/Mantine
  defaults. The two row types therefore had different density and hierarchy
  despite both being technically two-line.
- The production design contract supplies the non-scaled tokens: row titles
  are 14/20 at weight 600-700 and dense metadata is 12/16. A second rendered
  RED received a 36px Open row and later caught `font: inherit` overriding the
  Saved title back to 16px.
- The shared visual grammar now computes to 14/20 title, 12/16 metadata, and
  at least 44px for both Open and Saved link rows. The regression also checks
  title-before-metadata order, owner/copy/X separation, and row containment.
  It passed only after moving the Saved title token after the shared font
  shorthand, proving the gate reads computed styles rather than source text.

### Confirmed differences 12-17 - row states, Session T1, Popup, and Options

- Preview 10 also specifies quiet hover material, accent-soft selected
  material, and a second `note` metadata line for Saved Notes. Production
  emitted `data-selected=true` but had no matching Saved-row material; Open and
  Saved hover both remained transparent; Saved Notes had only one child.
  Rendered REDs reproduced all three. Both row types now use quiet hover,
  selected accent-soft, and two-layer Link/Note copy while preserving the exact
  16px checkbox/favicon visual-box alignment.
- The Open-row height changed from 36px to 44px, but its
  `contain-intrinsic-size` remained 36px. That stale offscreen placeholder could
  shift scroll height as content-visibility activated rows. The intrinsic
  placeholder now matches the rendered 44px row and has a source regression.
- T1's retained source defines a 14px Session title. Production had restored
  the two-line clamp and 18px line height but still inherited 16px through the
  shared font shorthand. A real four-state RED received 16px. The dedicated
  owner now computes to 14/18 and the same gate verifies Rest, 100ms Hover,
  Keyboard Focus, and Menu Open plus two stable 32px actions.
- Popup duplicate scope had three independent drift paths:
  1. no result helper under the duplicate count;
  2. the preview harness still removed pinned duplicates and pinned capture
     sources although production no longer did;
  3. Popup calculated duplicate count from capture-filtered tabs while the
     worker Remove command evaluates the whole eligible window.
- A shared pure `classifyWindowDuplicates()` owner now classifies removable
  and protected-pinned copies without Chrome dependencies. Worker, Popup, and
  preview harness consume the same algorithm and URL eligibility. This keeps
  Exclude URL rules scoped to Save while independent Remove still reports its
  actual window-wide result. Pure/unit/worker/preview/Popup gates cover active
  or recent regular preservation, mixed pinned, all-pinned, and distinct URLs.
- Popup now renders the confirmed subordinate helper:
  `Pinned duplicates stay open` when protected copies exist, otherwise
  `Keep one copy in this window`. Six rendered scenarios cover mixed,
  pinned-only, pinned-excluded, keep-all, regular-only, and all-pinned
  duplicates, including actual post-save source retention.
- Options had lost the approved pinned-safe Capture copy. The two helpers now
  state that only regular sources close and pinned sources stay open.
- A long Local Folder name wrapped to 60.89px in the desktop Options detail
  line, breaking the confirmed single-line folder/time composition. Explicit
  14/20 ellipsis/nowrap now keeps the folder name and right-aligned updated time
  on one line at both 1024px and 390px.
- In fallback, `Use browser storage` remained in the primary row while
  `Reconnect folder` lived inside the warning. Preview 7 groups these as two
  recovery choices for one failure. They now share one fallback action group;
  ready state still keeps Use Browser Storage in the primary row. Long reason,
  long folder name, both 44px actions, D1, and 390px pass without overflow.
- Final-polished Options copy was also restored for the toolbar question,
  Keyboard Shortcuts scope, and Reset data-preservation guarantee.

### Reopened forensic pass after user rejection

- The prior matrix still over-accepted implementation-derived tokens as if
  they were Preview evidence. This pass reopens every "consistent" cell where
  a later responsive, animation, or touch rule may have changed another state.
- A first cross-state conflict is now under investigation. Phase 20 introduced
  a stable `43px` Open Tab identity column so the favicon center would not move
  during Sidebar disclosure. In the current 1440px pinned render, the visible
  owner is only `20px`, starts `15.5px` from the row edge, and the title copy
  starts `53px` from the row edge. Final Preview 10 instead uses a `24px`
  leading column with a `20px` owner and was confirmed after the user asked to
  remove excessive whitespace to the left of the tab icon.
- This is not yet classified as a fixable defect because the later compact-row
  contract must be reconciled with the confirmed no-jump disclosure contract.
  The next regression must prove both: compact expanded geometry and continuous
  collapsed/pinned/Peek motion. A source-only column change is not acceptable.
- The current real-page snapshot for this reopened pass is
  `/tmp/tabboard-phase21-reopen-manager-1440.png`. Computed evidence also
  confirms Session cards remain `340px` wide with a subtle `0 1px 3px` shadow,
  while Open and Saved rows currently use different leading columns
  (`43px` versus `20px`).
- A suspected Tooltip opacity regression was disproved by reference ordering.
  The intermediate white Tooltip previews explicitly used `opacity: 0.65`,
  but the later competitor-inspired dark Tooltip and final positioning preview
  changed to an opaque native-tooltip surface. The bilingual final spec keeps
  the dark native material and omits the old opacity requirement. A temporary
  rendered assertion correctly received `1`; it was removed and no production
  style was changed.

### Confirmed difference 18 - Manage Workspaces could not create

- The user explicitly required Manage Workspaces to create, delete, reorder,
  rename, and change emoji. Final Preview 12 places `New Workspace` in the
  manager header and `Done` in its footer, while every individual edit reuses
  the shared Workspace editor.
- Production exposed `New Workspace` only in the parent Workspace menu.
  Opening Manage Workspaces showed only the rows and close icon; there was no
  create command or explicit completion action. This made the management
  surface structurally incomplete even though its row geometry and reorder
  behavior passed.
- A component RED failed only with `Missing button: New Workspace`. The manager
  now receives the existing `onCreate` command and renders `New Workspace` plus
  `Done`. Create and Edit share the existing `WorkspaceEditorModal`; no schema,
  mutation, or validation owner changed.
- Nested lifecycle is preserved: opening Create makes Manage inert and
  `aria-hidden`; Escape closes only the editor, restores focus to the exact
  manager-local `New Workspace` action, and re-enables Manage. Focused evidence
  is 17/17 Vitest and 1/1 rendered Playwright. Screenshot:
  `/tmp/tabboard-phase21-manage-workspaces-create-fixed.png`.

### Confirmed difference 19 - confirmed Lucide glyphs had drifted

- The prior icon gate proved library, size, and stroke width but did not lock
  the user's selected semantic glyph at each visible action. Phase 17 even
  recorded `Save uses Inbox` and `Restore uses SquareArrowOutUpRight`, while
  current source had drifted to `Archive` for Save Window/Save All, floppy
  `Save` for Save To, and `RotateCcw` for Session batch Restore.
- The same drift affected the other confirmed primary mappings: Manager
  Options used `Settings` instead of `Settings2`, while Bin and visible
  Delete actions used `Trash2` instead of `Trash`.
- Rendered/component REDs now inspect the actual Lucide classes rather than
  accepting any Lucide SVG. Production primary actions use:
  Save=`Inbox`, Restore=`SquareArrowOutUpRight`, Settings=`Settings2`,
  Trash/Bin/Delete=`Trash`, More=`Menu`, and Close=`X`.
- Auxiliary semantics remain distinct: Reset/Reconnect may use
  `RotateCcw`/`RefreshCw`; Archive categories use `Archive`; ordinary
  move-to-category affordances may use `Folder`. This repair does not flatten
  those meanings into the primary mapping.
- Focused GREEN is 5 files / 93 Vitest plus the 26-test Open Tabs suite.
  Real Manager evidence reads `Download / Upload / Settings2` in the Global
  menu and `SquareArrowOutUpRight / Trash / X` in Session selection, all with
  `stroke-width=1.75`.

### Confirmed difference 20 - excluded pinned copy order

- Final Popup Preview 6 states the excluded case as
  `Pinned tabs will not be saved and will stay open.` Production reversed the
  clauses to `will stay open and will not be saved`. The meaning was similar,
  but it was not the confirmed copy and made scope come after the outcome.
- DOM RED reproduced the exact string mismatch. Production now leads with the
  capture-scope consequence and keeps the stay-open outcome second. Focused
  evidence is 1/1 DOM and 1/1 rendered Popup scenario; geometry and behavior
  are unchanged.

### Confirmed differences 21-23 - management shell and Popup/Options composition

- Final Manage Workspaces and Manage Categories previews share one explicit
  management shell: title + count/drag subtitle, New/Add beside Close in the
  header, and Done in a separated footer. Production initially had no subtitle;
  Category Add was in the body footer; the first Workspace repair also put New
  beside Done instead of in the header.
- `TabBoardModal` now owns optional `headerSubtitle` and `headerAction` slots
  without placing content inside the associated `h2`. Both management surfaces
  use dynamic singular/plural context, header-local New/Add, and a 1px
  separated Done footer. The single-Workspace live fixture exposed and fixed
  `1 Workspaces` to `1 Workspace`.
- Desktop and 390px rendered geometry show no title/action/Close overlap or
  dialog overflow. Coarse-pointer RED received New Workspace at 36px; scoped
  management-header/footer/Close targets now measure at least 44px without
  globally enlarging every Modal. Focused evidence is 41/41 component tests and
  1/1 coarse Playwright. Screenshots:
  `/tmp/tabboard-phase21-manage-workspaces-final.png`,
  `/tmp/tabboard-phase21-manage-categories-final.png`, and
  `/tmp/tabboard-phase21-manage-workspaces-header-390.png`.
- Popup P2 final previews use equal pure-text Save/Remove actions. Production
  inserted Inbox/Copy glyphs and dynamically swapped Save to a check glyph,
  adding an unconfirmed visual lane. Rendered RED found one SVG in each action;
  both are now text-only, still exactly 80x32, with no state-driven label shift.
- Options Browser storage preview places Choose Folder in the primary
  `Storage location` row and keeps `Browser storage` plus its profile
  explanation in the detail row. Production put Choose Folder in the detail
  row and had no explanation. Rendered RED failed to find the primary action;
  the two-layer owner now passes at 1024px and 390px with a 24px gap and zero
  document/storage overflow.

### Confirmed differences 24-25 - toolbar geometry and exact Options guidance

- The final icon system requires 18px toolbar glyphs. A real scan of every
  visible Manager icon-only action found only Show Search at 20x20; Category
  Options, Bin, More, Save, Collapse, Selection, Session Restore/More, and row
  X actions were already 18x18. Rendered RED received 20px. Search now uses
  `TabBoardIcon`, locking 18px and 1.75 stroke without changing its neutral
  32px target.
- Final polished Options copy also specifies action-relevant guidance that had
  drifted or been truncated. Basic now uses:
  `Show the manager after capturing tabs.`,
  `Remove restored items from the session.`, and
  `Bring focus to the first newly opened tab.`
- Exclude URL rules now restores both final sentences: matching tabs are
  excluded from Open Tabs selection/drag/save, and rules are separated with
  commas or new lines. The latter matches the actual `/[\n,]/` parser and is
  operational help, not decorative copy.
- Focused evidence: Manager rendered toolbar 1/1 plus 47 related tests; Options
  DOM 24/24 and rendered polished hierarchy 1/1.

### Confirmed differences 26-28 - reopened cross-state and unpacked parity

- Phase 20 conflated a stable page-space icon center with one fixed leading
  column in every disclosure state. Expanded Open rows therefore retained a
  43px identity column and started copy 53px from the row edge, while final
  Preview 10 uses a compact 24px leading column.
- A source RED received `43px`; a rendered RED received a 53px copy offset.
  Expanded/Peek rows now use a 24px leading column plus a 9.5px row inset,
  while collapsed rail rows keep the 43px column and zero inset. The copy
  offset is 34px and the favicon page-space center remains 25.5px through all
  pinned intermediate frames.
- Latest unpacked pinned frames are
  `52 → 240.7 → 294.2 → 305.6 → 307.2px`; Board offset follows, content starts
  fading after 75ms, and the final row stays non-overlapping. Peek keeps Board
  x=52. Drawer keeps Board x=52 + inert while its columns remain
  44/flexible/44.
- Real Manage Workspaces axe exposed `aria-label` on focusable sortable `div`
  rows without a valid role. Category rows used the same pattern. Both owners
  now use `role="group"`, matching final Preview 12/13. The serious
  `aria-prohibited-attr` incomplete disappears without changing tab order,
  drag surface, or row actions.
- Final Preview 12 gives ordinary Workspace rows an explicit white surface.
  Production ordinary rows were transparent even though Category rows already
  used the explicit surface. Workspace rows now use
  `var(--tabboard-surface)`; current rows retain accent-soft through
  hover/focus.
- Workspace meta still produces one axe contrast incomplete even after a
  temporary explicit background was applied directly to the text. Pixel-stack
  inspection shows no covering sibling: title/meta only share a boundary,
  actions begin 8px later, and `elementsFromPoint()` resolves through the row.
  This is an automatic background-derivation boundary, not a visual collision.
- The same distinction applies to Peek/Drawer's intentional Board overlap and
  a long Saved Tooltip link: violations remain zero, but incomplete results
  are recorded honestly instead of being reported as 0/0.

### Confirmed difference 29 - duplicate whole-window capture actions

- The Window header Save Window and the context-bar Save All both called
  `onCaptureSelectedWindow`, which delegates to the same `captureWindow`
  workflow. Eligible count, pinned behavior, persistence, feedback, and final
  result were identical; the two adjacent buttons had no product distinction.
- The older UI/UX review introduced Save Window before the later Crisp Utility
  context-bar contract was confirmed. Production kept both layers instead of
  applying the later replacement decision.
- RED coverage received two whole-window actions and found `onSaveWindow` in
  `OpenTabsWindowBar`. Production now keeps only Save All in
  `OpenTabsSelectionBar`; Window bar owns glyph selection plus Collapse/Pin/
  Close only.
- The capture workflow and `onCaptureSelectedWindow` owner are unchanged.
  Save All still ignores the text filter, includes eligible pinned tabs, and
  preserves pinned source tabs after capture.

### Confirmed differences 30-31 - duplicate tips, stale dwell, and worker preload

- The two visible tips in the user screenshot had two independent owners:
  `AccessibleIconAction` rendered a Mantine Tooltip and also set native
  `title`; `OpenTabsWindowBar` additionally wrapped the same action in another
  Mantine Tooltip. Search Clear still used native `title` only.
- A global ManagerFrame pointerdown patch dispatched synthetic `mouseout` to
  every element with `aria-describedby`. It could close an already-open
  tooltip, but it could not cancel Mantine's pending 1000ms timer and also
  treated non-tooltip accessibility descriptions as tooltip targets.
- `TabBoardTooltip` now owns every standard control tip. Pointer activation
  clears visible and pending state, suppresses the current target while the
  pointer is stationary, and starts a new delay only after real movement or
  leave. The 180ms tab preview and 550ms C3 description remain separate
  approved surfaces; tab activation now follows the same stationary-pointer
  suppression.
- Static production scanning now rejects direct Mantine Tooltip owners and
  native `title` on action controls. Chromium proved standard action
  click/1.1s stationary/move behavior, tab preview click/300ms stationary/move,
  and the existing C3 delayed/focus menu flow.
- `File storage error: document is not defined` did not originate in
  `fileStorage.ts`. Vite's dynamic-import preload helper was shared into the
  service-worker graph and received non-empty dependencies from
  `activeAdapter`, entering a DOM-only `document` branch.
- The repository tracked independent `vite.config.js` and `vite.config.ts`.
  Programmatic tests explicitly loaded the updated TS config, while real
  `npm run build` loaded stale JS config. This explained why a temporary build
  was worker-safe while the actual unpacked `dist` remained broken.
- Scripts now bind to `vite.config.ts`; the JS file only re-exports it.
  Module preload stays enabled for page entries, while `resolveDependencies`
  filters only the activeAdapter file/fs imports. The real `dist` contains
  `import(fileStorage), []` and `import(fsDirectory), []`, and Manager HTML
  retains its normal modulepreload links.
- Storage Authority retries only the exact historical preload fallback.
  Options also initializes that recovery when opened directly. Permission,
  corruption, missing-folder, and offline fallbacks keep their explicit
  Reconnect path.
