# TabBoard UI / UX Audit Findings

## Baseline

- Product intent: a local-first, manager-first Chrome extension that behaves as a dense but calm workbench.
- Main spatial model: full-height Open Tabs sidebar, 64px toolbar, category tabs, and a horizontally scrolling session board.
- Main UX risks already acknowledged by the project: icon-only discoverability, right-click-only filtering, session drag geometry, narrow-screen behavior, and very large boards.
- Latest external review rules were fetched from Vercel's Web Interface Guidelines on 2026-07-27.
- Prior project evidence recommends live browser measurements rather than inferring final geometry from CSS alone.

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
