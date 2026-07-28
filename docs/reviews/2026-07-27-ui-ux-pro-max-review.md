# TabBoard UI / UX Pro Max Review

## Status

Review, implementation, iterative rendered review, and independent completion
audit completed on 2026-07-27. One complete final pass produced no unresolved
finding. This document evaluates product usability, visual hierarchy,
interaction discoverability, responsive behavior, and UI ownership after the
Web Interface Guidelines work.

## 中文结论摘要

这轮复审不是重复检查 aria、对比度和 landmark。上一轮已经把这些基础问题清完，
本轮重点是看核心工作流是否直观，以及当前拆分后的组件边界是否适合继续迭代。

初始复审确认视觉和可访问性基线稳定，但发现 12 个产品、交互、密度和 ownership
问题。三阶段方案已全部实施；随后 rendered review 又发现 compact rail、触控间距、
confirmation focus 和 info-action semantics 四组问题，也已按 RED/GREEN 关闭。

当前方向保持不变：横向 session board、完整 DOM + `content-visibility`、typed
DropIntent 与本地优先数据边界全部保留；没有引入 runtime dependency、session
merge 或营销式视觉重做。

## Review Basis

- Product: local-first Chrome tab manager and desktop-first productivity workbench.
- Stack: React 18, Mantine v7, Zustand, `@dnd-kit`, Tabler icons.
- Surfaces: Manager, Popup, Options.
- Target style: flat/minimal productivity utility, low motion, high density,
  functional color, light/dark parity.
- Preserved constraints: horizontal session board, full-DOM `content-visibility`
  strategy, existing DnD semantics, no new runtime dependencies.

The generic `ui-ux-pro-max --design-system` result incorrectly classified the
product as a portfolio/landing page and recommended exaggerated minimalism. That
output is rejected. The matching database results are Productivity Tool and File
Manager: flat design, minimalism, clear functional hierarchy, compact 8-12px
spacing, Inter/system typography, and restrained micro-interactions.

## Confirmed Findings

### P0 - Collapsed Sidebar Hover Reflows the Board

The feature specification says hover/focus expansion should overlay the board
without moving it. The rendered Manager does the opposite:

- Collapsed, pointer outside sidebar: grid columns are `54px 1386px`; Manager
  main starts at x=54.
- Pointer inside sidebar: grid columns become `300px 1140px`; Manager main starts
  at x=300.

This shifts the entire horizontal board by 246px during hover. It changes the
visual frame, makes session positions unstable, and can invalidate a user's
pointer or drag target expectation.

Evidence:

- `/private/tmp/tabboard-uiux-manager-collapsed.png`
- CSS owner: `src/manager/styles/sidebar.css`

Recommended direction:

- Keep the shell grid at the rail width while collapsed.
- Expand only `.manager-sidebar__overlay` with absolute positioning.
- Never change the main column geometry on hover/focus.
- Add a browser assertion that `.manager-main.left` remains constant before,
  during, and after collapsed-sidebar disclosure.

### P0 - Hover-Hidden Actions Remain Interactive

Session and tab-row secondary controls use `opacity: 0` as their resting state.
The controls remain in the focus order and retain pointer hit areas:

- Session Restore and More measure 22x22px and have computed opacity 0.
- The session drag handle measures 18x22px and has computed opacity 0.
- Saved-tab More controls measure 18x18px and have computed opacity 0.
- Open-tab close controls also use hover/focus disclosure and measure 22x22px.

This is workable for a mouse user who discovers the hover state, but it is not a
valid touch model. On coarse-pointer or touch-capable desktop devices, users can
tap invisible controls, while the same controls remain undiscoverable. These hit
areas are also below the 44px touch target recommendation from `ui-ux-pro-max`.

Evidence:

- `/private/tmp/tabboard-uiux-manager-touch.png`
- CSS owners: `src/manager/styles/session.css`,
  `src/manager/styles/sidebar.css`
- The shared `AccessibleIconAction` primitive exists but has no production
  consumer, so it currently does not enforce a target-size policy.

Recommended direction:

- Keep hover-minimized controls only under `@media (hover: hover) and
  (pointer: fine)`.
- On coarse pointer or `hover: none`, show one stable 32-40px More action per
  session/row; put destructive and low-frequency actions in its menu.
- Never use opacity alone to hide an interactive target. Hidden controls must
  also be non-interactive, or remain visibly discoverable.
- Extend the shared action primitive with explicit `compact` and `touch`
  density contracts, then use it on Manager, Popup, and Options icon actions.
- Validate 44px effective hit areas using pseudo-element/inset hit slop where a
  44px visual button would be too heavy for the desktop workbench.

### P0 - Manager Omits the Primary Save-Window Action

The product promise is "save fast, organize later", and both README and Feature
Spec describe Manager > Open Tabs > Save selected window as a primary capture
entry. The current `OpenTabsPanel` renders window switching, refresh, collapse,
row selection, and filter controls, but no command that saves the selected
window in one step.

The available Manager path is therefore:

1. select one or more individual tab checkboxes;
2. enter selection mode;
3. activate Create Session.

That replaces a core one-step workflow with a multi-step batch workflow. It also
makes Manager behavior inconsistent with the toolbar and popup.

Recommended direction:

- Add a stable Save Window action in the Open Tabs window bar.
- Treat it as the single primary command for that surface; Refresh, Select, and
  window management remain secondary icon actions.
- Reuse the same capture-policy and authoritative completion path as selection
  capture; do not add a second persistence path.
- Include the eligible tab count in the tooltip/status copy, and disable with an
  explanatory tooltip when no tab is capturable.

### P0 - Category Navigation and Keyboard Drag Share One Activator

Each category label button receives both its navigation `onClick` and the
`@dnd-kit` draggable attributes/listeners. In the rendered Manager:

1. focus the Inbox category while Saved is active;
2. press Enter;
3. the URL stays on `category=saved`;
4. the shell enters `manager-shell--drag-active`;
5. the live region announces that `category-inbox` is being moved.

Enter therefore starts keyboard DnD instead of activating the navigation button.
This breaks the primary keyboard contract for category tabs and makes the
visible button's role ambiguous.

Recommended direction:

- Keep the category label as a pure navigation button.
- Add a separate category drag handle as the `@dnd-kit` activator.
- Make the handle visible on hover/focus and persistently available in category
  management; on touch, use an explicit reorder mode instead of long-pressing a
  navigation label.
- Preserve keyboard category reorder on the handle with Space/arrow keys.
- Add a browser test: Enter on a category label changes URL/category and never
  creates a drag overlay; Space on the focused drag handle starts DnD.

### P0 - Dedupe Setting Copy Contradicts Runtime Behavior

Options says: "Skip tabs whose URL is already saved somewhere." The current
runtime and technical architecture instead deduplicate duplicate URLs within the
source capture and close duplicate source tabs; historical saved sessions do not
exclude a URL from the new session.

This is high-risk copy because it changes the user's expectation about what will
be saved and what browser tabs may be closed.

Recommended copy:

> Remove duplicate URLs within the tabs being saved. Keep one copy in the new
> session and close duplicate source tabs.

The exact sentence can be shortened, but it must preserve both scope and side
effect.

### P1 - Popup Does Not Show the Actual Save Result

Popup displays `7 Tabs` as the current capturable-window total. When the user
unchecks pinned tabs and Chrome groups, the same total remains visible, while
the Save button continues to say only `Save` and its accessible name remains
`Save Selected Tabs as a Session`.

The user cannot see how many tabs will be saved without manually subtracting the
filter counts. This weakens confidence in the highest-frequency destructive
workflow because saving may also close source tabs.

Recommended direction:

- Keep the total window count as context, but add a live selected result:
  `Save 4 Tabs` or `4 of 7 tabs`.
- Update the button's visible text and accessible name from the same derived
  count.
- When zero tabs remain selected, explain which filters excluded them instead
  of showing only `No Tabs`.
- Keep the layout stable by reserving enough width for the longest localized
  label.

### P1 - Options Autosave Feedback Is Too Eager

All setting changes call the same `handleSettingChange()` path. That is correct
for switches and radio controls, but the custom URL filter textarea persists and
shows `Settings saved` on every input event.

Consequences:

- a long edit can enqueue many persistence mutations;
- repeated two-second toast timers compete with each other;
- the UI announces success while the user is still composing an unfinished
  rule;
- the transient fixed toast is the only visible model for whether settings are
  saved.

Recommended direction:

- Keep immediate save for switches, radios, and segmented controls.
- Give long-form settings a local draft; commit on blur or after 400-600ms of
  inactivity.
- Replace repeated per-control toast creation with one stable page-level
  `Saved`, `Saving…`, or `Could not save` status near the title.
- Coalesce timers and persist only the latest draft revision.
- Keep field-level error copy close to the textarea if parsing or persistence
  fails.

### P1 - Options Still Uses Card-Per-Section Dashboard Weight

At 1280x800 the Basic settings occupy four bordered/shadowed cards and the
Advanced disclosure begins around y=1215. The page is usable, but the card stack
adds repeated borders, padding, and shadows to what is fundamentally one form.

Recommended direction:

- Use one unframed settings form with full-width section bands separated by
  headings and dividers.
- Reserve cards for Data Storage status, migration dialogs, and other genuinely
  framed tools.
- Add a sticky or compact section index only if the page grows beyond the
  current four Basic sections; do not introduce dashboard navigation now.
- Preserve the current single-column width and Advanced disclosure.

### P1 - Open Tab Rows Mix Four Interaction Models

An Open Tabs row currently combines:

- single click: open an information popover;
- double click: focus the real Chrome tab;
- drag: create a saved-session drop payload;
- hover/focus disclosure: reveal selection and close actions.

The button is named `Open <title>`, but a single activation does not open or
focus the tab. Browser instrumentation confirms that single click opens the
popover and sends no focus command. The only focus path is double click, which
has no touch equivalent and is not communicated by the control name.

Recommended direction:

- Make single click/Enter focus the real open tab. The accessible name then
  matches the behavior.
- Put metadata and secondary actions behind a visible Info/More action.
- Keep dragging on a separate handle or a clearly defined non-action row region.
- Keep checkbox selection as the only selection owner.
- Remove double-click-only behavior from the required workflow.

### P1 - Category and Window Navigation Lack Orientation Data

The top category strip shows labels without counts, while the compact browser
window selector shows only tab counts. In the default fixture, Inbox is empty
while Saved and a custom category contain sessions, yet the user sees no counts
until visiting each category. Six browser windows include four identical `0`
glyphs, so the controls are not visually distinguishable.

Recommended direction:

- Add compact category counts with tabular numerals, but show zero only for the
  active category to avoid visual noise.
- Give windows a stable ordinal or title plus count in the expanded sidebar,
  while the collapsed rail keeps the compact window glyph.
- Preserve the current accessible labels and add current-window state through
  text/icon, not color alone.
- Do not add dashboard KPI cards; these are navigation orientation cues.

### P2 - Session Metadata Is Below the Readability Floor

Session metadata is explicitly rendered at 11px. It carries useful link/note,
lock, and date information, so it is not incidental decoration.

Recommended direction:

- Raise the metadata role to 12px with a 16px line height.
- Use a compact two-level type scale: 14px session/tab titles, 12px metadata and
  URLs, 13-14px controls.
- Keep tabular numerals and use weight/spacing before adding more color.
- Avoid adding a second font family; the current Inter/system stack matches the
  productivity-tool recommendation.

### P2 - Nested Scroll Ownership Needs Stronger Cues

The Manager intentionally combines a horizontal board, vertical session-card
lists, a vertical Open Tabs list, and horizontally scrolling category/window
strips. This is appropriate for the domain but creates multiple adjacent scroll
owners with minimal affordance.

Recommended direction:

- Keep the current scroll architecture, but add subtle edge fades or inset
  dividers only when more content exists in that direction.
- On horizontal wheel/trackpad input over the board, keep board ownership
  predictable and do not capture vertical wheel input.
- Preserve session title/header visibility while its tab list scrolls.
- Add browser tests for scroll chaining and ensure sidebar/session scroll does
  not move the page or category strip.

## Recommended Design System

### Product Character

- Flat, quiet, utilitarian productivity workbench.
- Dense but readable, not spacious dashboard composition.
- One cool functional accent; amber only for warnings/duplicates and red only
  for destructive actions.
- Border-led hierarchy with little or no decorative elevation.
- Motion limited to direct state feedback, 80-160ms on fine pointers, and
  reduced-motion parity.

### Tokens

- Spacing: 4, 8, 12, 16, 24, 32.
- Radius: 4px compact controls, 6px cards/modals, pill only for true status
  badges or insertion markers.
- Type: 12 metadata, 13-14 controls/body, 16 section title, 20-24 page title.
- Icon sizes: 14 row action, 16 compact action, 18-20 primary tool action.
- Surfaces: canvas, panel, raised overlay, selected, danger; define both themes
  as semantic tokens instead of adding component-specific hex values.
- Effective pointer targets: 32px fine pointer, 44px coarse pointer or expanded
  hit slop.

### Keep

- Inter/system type stack.
- Tabler outline icon family.
- Nord-derived neutral surfaces and blue focus/action color.
- Horizontal session workbench and full-DOM `content-visibility` strategy.
- URL-backed Manager state, confirmation flows, light/dark parity, reduced
  motion, and current accessibility foundations.

### Avoid

- The generated exaggerated-minimalism/portfolio recommendation.
- Orange-dominant marketing palette.
- More permanent cards, hero-like headings, gradients, glass, or decorative
  motion.
- Replacing the current board with a generic vertical dashboard.

## Refactor Plan

### Stage 1 - Correct Core Interaction Contracts

Scope:

- collapsed sidebar overlay geometry;
- separate category navigation and drag handles;
- restore Manager Save Window;
- correct dedupe copy;
- make Open Tabs single click perform its named action;
- coarse-pointer visible action policy.

Primary owners:

- `src/manager/styles/sidebar.css`
- `src/manager/components/workspace/CategoryNav.tsx`
- `src/manager/components/sidebar/OpenTabsPanel.tsx`
- `src/manager/hooks/useOpenTabsRuntime.ts`
- `src/options/OptionsApp.tsx`
- `src/shared/components/AccessibleIconAction.tsx`

Risk: medium, concentrated in DnD and sidebar geometry. Keep typed payloads and
persistence unchanged.

### Stage 2 - Consolidate Interaction Surfaces

Split remaining multi-purpose components:

- `OpenTabsPanel` into window bar, selection bar, tab list, and filter footer.
- `SessionCard` into header/action model, metadata, editor, and tab list.
- `ManagerDndCoordinator` into sensor configuration, collision selection, drag
  lifecycle, and overlay renderer while keeping one public coordinator.
- Extract a shared action-density policy used by Manager, Popup, and Options.

The goal is not line-count reduction by itself. Each unit should own one
interaction contract and expose typed commands/state.

### Stage 3 - Visual and Feedback Polish

- category/window orientation counts;
- selected-result count in Popup;
- Options draft/debounced save and stable status;
- unframed Options section layout;
- 12px metadata floor and consistent type/icon tokens;
- conditional scroll edge cues.

This stage should not begin until Stage 1 browser and DnD gates are green.

## Alternatives

### A. Interaction Repair Only

Implement Stage 1 and stop.

- Lowest visual churn.
- Fixes all correctness and primary-workflow findings.
- Leaves remaining component complexity and visual inconsistency.

### B. Three-Stage Focused Refactor - Recommended

Implement all three stages in separate commits, preserving existing domain
contracts.

- Best balance of product improvement and regression control.
- Makes the next UI iteration materially easier.
- Requires explicit browser/DnD gates after each stage.

### C. Full Adaptive Redesign

Create different desktop and touch compositions.

- Could produce the strongest tablet experience.
- Reopens settled product geometry and greatly increases DnD risk.
- Not recommended without usage evidence that touch Manager is a primary path.

## Acceptance Gates

- Enter on a category label navigates; Space/Enter on its separate drag handle
  starts keyboard reorder.
- Collapsed sidebar expansion leaves `.manager-main.left` unchanged.
- No invisible interactive controls at rest on coarse pointer.
- Every primary command has one click/tap path and a name that matches it.
- Manager exposes Save Window with authoritative success/error feedback.
- Popup visibly states how many tabs will be saved after filters.
- Options long-text edits create one coalesced persistence update and one stable
  feedback state.
- No 11px functional text remains.
- 390x844, 800x800, 1280x800, and 1440x900 remain free of overlap and body-level
  overflow.
- Light/dark/reduced-motion and Manager/Popup/Options axe audits remain 0
  violations and 0 incomplete checks.
- Existing 19 E2E tests, repeated keyboard DnD, and the five manual DnD paths
  remain green.
- No schema, storage protocol, mutation wire, or session-merge behavior changes.

## Baseline Confirmations

- Manager at 1440x900 light mode: axe 4.12.1 reports 0 violations and 0
  incomplete checks.
- No runtime page errors were observed.
- The current navigation, landmarks, focus names, URL state, confirmation
  dialogs, and reduced-motion baseline from the previous audit remain intact.

## Completion Matrix

| Recommendation | Implemented owners | Evidence |
|---|---|---|
| P0 Sidebar reflow | `sidebar.css`, `manager-boot.e2e.ts` | main x remains fixed while overlay expands |
| P0 Touch/hidden actions | `AccessibleIconAction`, shared/owner CSS | 44px compact targets, 8px row spacing, no clipped focus targets |
| P0 Save Window | `OpenTabsWindowBar`, `useOpenTabsRuntime`, `Sidebar` | eligible count, disabled copy, authoritative completion tests |
| P0 Category nav vs DnD | `CategoryNav`, `header.css` | Enter navigates; separate handle owns keyboard/pointer reorder |
| P0 Dedupe copy | `OptionsApp`, `uiCopy.test.ts` | exact source-capture scope and source-tab close side effect |
| P1 Popup result | `PopupApp`, `popup.css` | visible/accessibility count share one projection; zero-state recovery |
| P1 Options save feedback | `useSettingsDraft`, `OptionsApp` | 500ms debounce, blur flush, stable save status |
| P1 Options hierarchy | `SettingsSection`, `options.css` | Basic uses unframed sections; low-frequency tools stay Advanced |
| P1 Open Tab interaction | `OpenTabRow`, overlay actions | click/Enter Focus; independent Drag/More; named info actions |
| P1 Orientation | `CategoryNav`, `OpenTabsWindowBar`, `SessionCardMeta` | category/window counts and tabular 12px metadata |
| P2 Metadata floor | `session.css` | 12px/16px functional metadata contract |
| P2 Scroll cues | `useOverflowCues`, shell/session/sidebar CSS | passive conditional board/list edge cues |
| Stage 2 ownership | Open Tabs, Session, DnD owner modules | strict `uiOwnership.test.ts` and migrated source contracts |

## Iterative Review Findings

Rendered review after implementation found and closed the following additional
issues:

1. The 62px collapsed rail visually clipped row Drag/More but left them visible
   and focusable outside the rail. It now exposes only row Focus.
2. The collapsed window bar kept all windows plus Save/Refresh/Collapse
   focusable at negative or overlapping x positions. It now exposes only the
   current window; Expand Sidebar restores the full workflow.
3. The compact drawer rendered five adjacent 44px controls with 2px spacing.
   It now keeps Select/Drag/Focus/More at 8px spacing; Close remains in More.
4. Popup Dedupe and Options Reset confirmations relied on unreliable implicit
   focus return. Both now pass an explicit `finalFocusRef`.
5. Open Tab info actions used unnamed `menuitem` buttons in a dialog region.
   They now retain overlay lifecycle behavior with named ordinary buttons.

Fresh browser evidence after these fixes:

- Manager default desktop, 390px collapsed/drawer, compact global menu, Open Tab
  details, Import, Export, dark/reduced-motion: axe 0 violations / 0 incomplete.
- Popup light/dark and Dedupe confirmation: axe 0/0; Escape returns focus to
  Dedupe.
- Options light/dark/default/Advanced/Reset: axe 0/0; URL, body overflow, and
  explicit Reset focus return pass.
- Reduced motion samples report 1ms transitions/animations, one iteration, and
  `scroll-behavior: auto`.

## Constraint Audit

- No persistent schema, storage protocol, mutation wire, background, manifest,
  or package dependency change.
- No session-to-session merge behavior.
- No JavaScript virtualization; full DOM plus structural sharing and
  `content-visibility` remains intentional.
- No generated assets, browser mocks, or screenshots are tracked.
- The generic portfolio/exaggerated-minimalism/orange design-system result was
  rejected as a domain misclassification; the applied rules are Productivity
  Tool/File Manager density, hierarchy, touch, feedback, and accessibility.

## Independent Completion Audit

### Fresh project gates

- `npm run check`: passed. Vite transformed 7,024 modules; extension packaging
  passed; 187 source files had no forbidden edge or denied cycle; 111
  production files passed search/feedback architecture checks.
- `npm test`: passed, 76 files / 1,006 tests.
- `npm run test:e2e`: passed, 26/26.
- Repeated DnD gate: `session-dnd.e2e.ts` passed 15/15 across three runs.
- Repeated compact gate: the compact sidebar scenario passed 3/3.
- Category-handle isolation passed 5/5 after its locator was updated to use the
  stable category ID instead of the count-bearing accessible name.
- Fresh browser state-level acceptance passed all 5 AGENTS.md DnD paths:
  same-category session reorder, cross-category session move, one saved tab
  into an existing session, multiple selected Open Tabs into an existing
  session, and multiple selected Open Tabs into a new insertion position.
- `git diff --check`: passed.

### Browser and accessibility gates

- Manager: desktop default, dark/reduced motion, 390px collapsed rail/drawer,
  compact global menu, Open Tab details, Import, and Export all report axe
  4.12.1 at 0 violations / 0 incomplete.
- Popup: light/dark default and Dedupe confirmation report axe 0/0; Cancel is
  initially focused and Escape returns focus to Dedupe.
- Options: light/dark default, Advanced, and Reset confirmation report axe 0/0;
  Advanced persists in `?advanced=1`, and Escape returns focus to Reset.
- Manager/Popup/Options browser page-error checks are empty in the audited
  default states.

### Repository gates

- No diff in `package.json`, lockfile, `manifest.json`, `src/shared/model`,
  `src/shared/store`, or `src/background`.
- `dist/`, `node_modules/`, and Playwright output remain ignored.
- No new zip, CRX, PEM, screenshot, video, or browser mock is tracked; only the
  existing extension icons are present.
- Changes remain uncommitted on `zhaoshe/dev`.

### Prompt-to-artifact result

All 12 review recommendations, all 3 refactor stages, the final ownership
modules, every named responsive/theme/open-state gate, and every product
constraint map to the Completion Matrix, Iterative Review Findings, and fresh
project/browser evidence above. No checklist item remains weakly verified or
unresolved.

## Next Step

Complete. No unresolved UI/UX Pro Max finding or verification gate remains.
