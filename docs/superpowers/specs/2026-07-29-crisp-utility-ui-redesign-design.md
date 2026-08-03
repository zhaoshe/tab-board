# TabBoard Crisp Utility UI Redesign

## Status

Design validated in the visual companion. Production implementation has not started.

## Goals

- Make TabBoard feel like a calm, dense desktop productivity tool.
- Keep Manager, Options, Popup, dialogs, menus, buttons, icons, and themes visually consistent.
- Preserve verified performance, persistence, DnD, accessibility, and storage behavior unless this document explicitly changes product behavior.
- Use real rendered measurements and screenshots during implementation.

## Visual System

### Direction

- Light: A1 Balanced Crisp.
- Dark: D1 Neutral Graphite.
- Accent: restrained cobalt.
- Surfaces use 6-8px radii, subtle borders, and light elevation.
- No decorative gradients, oversized headings, nested cards, or marketing composition.

### Typography

- Font family: Inter with existing system fallbacks.
- Page title: 24px / 32px, weight 700.
- Section title: 16px / 22px, weight 700.
- Setting and row label: 14px / 20px, weight 600-700.
- Body and helper text: 13px / 18px.
- Dense row metadata may use 12px / 16px.
- Letter spacing remains 0.

### Spacing And Geometry

- Spacing scale: 4, 8, 12, 16, 24, 32px.
- Standard text control height: 36px.
- Compact text action height: 32px.
- Desktop icon button hit area: 32px.
- Mobile/coarse-pointer hit area remains at least 44px.
- Control radius: 6px.
- Panel/card radius: 7-8px.

### Button Widths

- Icon-only: fixed 32px.
- Compact text action: hug content, minimum 72px.
- Standard text action: hug content, minimum 96px.
- Full width: only for an explicit form submission or modal primary CTA.
- Buttons sharing a row and hierarchy should use the same height and width class.

## Icon System

- Final library: `lucide-react`.
- Remove the temporary `@phosphor-icons/react` dependency.
- Global Lucide stroke width: 1.75.
- Toolbar and row actions: 18px icon in a 32px hit area.
- Menu and text-button leading icons: 16px.
- Empty-state icons: 48px with reduced opacity.
- Use outline icons at the same hierarchy level. Filled treatment is reserved for selected state or a tiny badge.
- Danger actions color only the icon/text, not the entire container.
- Window counts and favicon property badges remain CSS glyphs.

### Confirmed Mapping

| Semantic | Lucide icon |
| --- | --- |
| Search | `Search` |
| More | `Menu` |
| Settings | `Settings2` |
| Trash / Bin | `Trash` |
| Import | `Download` |
| Export | `Upload` |
| Save | `Inbox` |
| Restore | `SquareArrowOutUpRight` |
| Pin / Pinned | `Pin` |
| Open Manager | `AppWindow` |
| Collapse sidebar | `PanelLeftClose` |
| Expand sidebar | `PanelLeftOpen` |
| Change folder | `FolderOpen` |
| Keyboard shortcuts | `Keyboard` |
| Selection | `SquareCheckBig` |
| Close | `X` |

## Manager

### Overall Layout

- Use A1 material with M1 Balanced Columns.
- Keep a balanced expanded sidebar, compact board gutters, and stable session column widths.
- Use N1 Quiet Hierarchy for navigation.
- Use B3 Priority Commands for the board topbar.

### Sidebar Header

- Do not display `Window N` labels.
- Each window is represented by a window glyph containing its tab count.
- The current focused Chrome window uses a small accent badge on the window glyph.
- Do not show a manual Refresh action.
- Do not duplicate whole-window capture in the window row; the sole Save All action lives in the Open Tabs context bar below.
- In expanded state, Collapse stays at the end of the window row.
- In temporary preview state, the same slot becomes Pin Sidebar.

### Open Tabs Context Bar

Normal expanded state:

- Left: open-tab count.
- Right: Enter Selection Mode and Save All actions.
- Save All includes pinned tabs.

Selection state replaces the same bar in place:

- Selected count.
- Select All / Unselect All icon.
- Save Selected icon, disabled when the selection is empty. Pointer/touch defaults to creating a New Session.
- `Save to` opens the C Hybrid target picker for an Existing Session or eligible New Session position.
- Exit Selection Mode icon.
- Do not insert a second selection toolbar.

Collapsed state:

- The same bar becomes a centered Expand Sidebar action.
- The arrow must be centered in the 52px rail.
- Collapsing clears selection and exits selection mode.

### Open Tab Rows

- Use L1 Progressive Actions.
- Never display a drag-handle icon.
- The non-interactive row surface uses `grab` / `grabbing` cursor state.
- Checkbox overlays the favicon slot during hover and selection.
- Hover / focus-within exposes only a trailing X action that closes the Chrome tab.
- Open Tabs do not expose an application context or More menu.
- Click / Enter on the title focuses the Chrome tab.
- Pinned is a small favicon property badge.
- Pinned tabs support selection, drag, Save Selected, and Save All.
- Do not display textual row-state groups such as Normal, Hover, or Selected.
- Do not visually represent Chrome `active` tab state.

### Saved Tab Rows

- Hover / focus-within overlays the checkbox on the favicon and exposes a trailing X that deletes the Saved Tab.
- Right-click, ContextMenu key, and Shift+F10 open the same B2 menu.
- The menu contains Add/Edit Note, Copy URL/Text, and Delete only. Select is not a menu command.
- Clicking the checkbox selects the item and enters that Session's Selection Mode.
- Clicking a saved link title opens it; Notes keep their editing semantics.
- Open/Saved title and metadata always occupy separate rows.

### Sidebar Disclosure

- Rail width: 52px.
- Explicit Expand pushes the board and pins the expanded sidebar.
- Hovering the rail for roughly 350ms opens a temporary overlay preview without moving the board.
- Leaving the temporary overlay closes it.
- Entering Selection Mode or focusing Filter while temporarily expanded automatically pins the sidebar and reflows the board.
- Temporary overlay exposes Pin Sidebar in the normal Collapse button slot.
- Respect `prefers-reduced-motion`.

### Board Topbar

- Workspace remains a bounded context control.
- Category tabs use the quiet light-fill active state.
- Keep Category Options immediately after categories.
- Right-side persistent actions: Search, Bin, More.
- Search is neutral, with no resting border or highlight.
- Import, Export, and Options live in More.
- Search expansion consumes the category area without changing topbar height.

### Session Cards

- Use S1 Balanced Sections.
- Move the session note into the title-summary region, immediately after metadata.
- Keep the S1 note visual treatment.
- Use T1 Clean Two-line title hierarchy.
- Remove the session drag-handle icon.
- The non-interactive title, metadata, note, and whitespace form the session drag activator.
- Restore and More remain independent interactive controls and do not start drag.

### Session Saved Tabs Selection

- `selectionMode` is independent state and is not derived from `selectedIds.size > 0`.
- Session More > `Select Tabs` enters selection mode for that Session with `0 selected`.
- The Session header is replaced in place by one icon toolbar:
  - Selected count.
  - Select / Unselect All Visible.
  - Restore Selected Links.
  - Copy Selected URLs.
  - Move Selected Tabs.
  - Delete Selected Items.
  - Exit Selection Mode.
- Restore / Copy operate on selected Links only. Notes remain selectable, movable, and deletable but have no restore/copy-URL action.
- Locked Sessions disable Restore, Move, and Delete; Copy remains available.
- Restore / Delete clear selection but preserve `0 selected` mode. Copy preserves selection. Exit clears selection and restores the normal header.
- Select All affects visible rows only and preserves hidden selection.
- Manager allows one global selection scope. Entering another Session or Open Tabs selection exits and clears the previous scope.

### Workspace Creation And Management

- Persist a Workspace `emoji` field and normalize legacy Workspaces to a stable fallback.
- Render emoji and title in separate columns. The current Workspace uses background state only, without a check.
- The current row's 14px Pencil opens Edit Workspace in a stable 18px action slot.
- New Workspace uses A Inline Favorites: 16 common emoji in eight columns plus a Custom one-grapheme input supporting ZWJ and skin tone.
- Workspace names use trim + NFC + case-insensitive duplicate validation.
- Edit Workspace fully reuses the creation dialog and atomically saves name + emoji. Do not provide separate Rename, Change Emoji, or inline editors.
- Manage Workspaces uses A Dense Rows:
  - One compact list.
  - Whole-row pointer drag with no visible handle.
  - Keyboard Move Up / Move Down.
  - Edit and Delete only.
  - Delete shows Session / Category counts, cannot remove the only Workspace, and is blocked by locked Sessions.
- Workspace order is persisted through a typed mutation; UI code must not rewrite canonical arrays directly.

### Category Management

- Manage Categories uses A Unified Dense List with Built-in and Custom categories in one canonical order.
- Inbox, Saved, and Archive may be reordered but not renamed, recolored, or deleted.
- Custom Categories support Edit and Delete.
- Topbar Category tabs support direct whole-tab pointer drag after the 5px activation threshold, with no visible handle.
- Keyboard ordering uses Move Up / Move Down in Manage Categories.
- Remove the explicit Reorder Categories Mode.
- New / Edit Category share the name + color modal.
- Deleting a Custom Category names the affected Session count and Inbox destination; locked Sessions block deletion.

### Menus And Command Ownership

- Application menus use B2 Dense Native: 29px fine-pointer rows, 16px Lucide leading icons, and at least 44px on coarse pointers.
- C3 descriptions become item tooltips: roughly 550ms pointer dwell and immediate keyboard-focus display. They do not capture the pointer.
- Global More: Import, Export, Options. Bin remains direct.
- Workspace: workspace list, New Workspace, Manage Workspaces; the current-row Pencil opens Edit.
- Category Options: Manage Categories and Add Category; no Reorder command.
- Session: Add Link, Add Note, Edit Session Note, Move, Lock/Unlock, Copy Links, Select Tabs, Delete.
- Saved Tab: Add/Edit Note, Copy URL/Text, Delete.
- Open Tab: no application menu.
- Danger commands form the final separated group. Escape closes and restores trigger focus.

### Tab Preview Tooltip

- Use a dark, native-tooltip-like presentation.
- Position the tooltip above the hovered row with a 6px gap.
- If there is insufficient space above, place it below.
- `pointer-events: none`; it must not block vertical pointer movement between rows.
- Reuse one tooltip instance and update its content and position as hover changes.
- No favicon, buttons, click, double-click, or keyboard interaction.
- Show title, domain, link, and saved timestamp only.
- Open Tabs have no saved timestamp.
- Title: 12px / 16px, weight 700, maximum 2 lines.
- Domain: 10px / 14px, weight 500, prefixed by a CSS-drawn 2px x 10px vertical line.
- Link: 10px / 14px, weight 400, maximum 4 lines.
- Saved timestamp: 9px / 12px, weight 500.

## Options

### Basic Layout

- Use O2 Compact Stack.
- Content width: 680px.
- Remove the subtitle `Configure how TabBoard works`.
- Keep authoritative save status, but render Saved as quiet text rather than a green badge.
- Saving, error, and Retry remain authoritative and accessible.
- Default toolbar action becomes Open Popup for new installs and Reset to Defaults.
- Existing user settings are not migrated.

### Capture

- Switches align on the right.
- Pinned tabs may be saved and selected but remain open after save and dedupe cleanup.
- Rename `Custom filter rules` to `Exclude URL rules`.
- Exclude rule helper text must state that matching tabs are hidden from Open Tabs and excluded from selection, drag, and save.
- Exclude rules use normal setting layout, not a nested panel.

### Advanced

- Use A2 flat settings list.
- Do not add one-item section wrappers for Safety, Keyboard Shortcuts, or Recovery.
- Present these settings directly:
  - Storage location.
  - Confirm before deleting saved items.
  - Keyboard shortcuts.
  - Reset settings.

Storage location uses two semantic rows:

1. Title and description paired with `Use browser storage`.
2. Folder details paired with `Change folder`.

Storage copy:

- `Storage location`
- `Choose where TabBoard saves session data.`
- `Local folder name: <name>`
- `updated: HH:mm:ss`

Storage normal state:

- Do not show Connected.
- Do not show Reconnect.
- `Change folder` reselects or changes the folder.
- `Use browser storage` starts the switch-back flow.

Storage failure state:

- Keep the configured Local Folder as primary context; automatic fallback must not look like a user-configured switch.
- Explain inline that new writes are temporarily stored in browser storage.
- Offer `Reconnect folder` and `Use browser storage`.
- Read file freshness from `meta.json.updatedAt`; browser fallback timestamps must not replace the last successful file update.
- Persist fallback reason and folder identity rather than relying on a page-local callback.

### Switching To Browser Storage

Keep the existing safe migration capability. Configured target changes to Browser only after explicit `Use browser storage` completes. Automatic fallback changes the active backend, not the configured target.

## Popup

- Use P2 Compact Action Row.
- Remove top header divider.
- Keep one Open Manager and one Settings entry in the header only.
- Do not show selected/total ratio.
- Do not show groups.
- Count row and duplicate row use the same hierarchy.
- `7 tabs` and `2 duplicate tabs` use 13px / 18px.
- Save and Remove are compact actions, 32px high and 80px wide.
- Save button copy is `Save`.
- Under the count, display one short no-wrap behavior line:
  - `Save and close tabs`, or
  - `Save and keep tabs open`.
- Pinned checkbox appears only when pinned tabs exist.
- Pinned helper text appears below the checkbox at 12px / 16px:
  - `Pinned tabs will be saved and stay open after capture.`
- When no pinned tabs exist, Save and Duplicate rows remain vertically aligned with no empty pinned region.

## Drag And Drop

### Unified Visual Model

- Pointer/touch drag never exposes a resting drag icon.
- Workspace, Category, Session, and Saved Tabs reorder or move persisted objects. Open Tabs copy and remain in Chrome.
- Drag ghost content, width, and height remain immutable from Pickup through every target. Do not shrink or switch templates on plus activation.
- Ghost surfaces are translucent, preserve identifiable title/domain content, and use `pointer-events: none`.
- Ghost is above New Session plus in all scenes; the plus remains visible through the translucent surface.
- Session track geometry is fixed:
  - Desktop Session width: 340px.
  - Gap: 16px.
  - Session/slot fills available Board height.
  - Compact uses `min(340px, available width)` while staying fixed within one viewport.
- Source slot is the current target at pickup, so pickup does not change visible order.
- Entering a new target places the dragged object in that slot and reflows siblings with a 180ms FLIP transition.
- Ordinary targets retain short hysteresis. Escape / Cancel restores original order.

### Existing Session And New Session

- Saved/Open Tabs use one payload. Existing vs New is chosen by the currently hit target, not a preselected drag mode.
- Existing Session:
  - Hit `group-body` or `tab-before`.
  - Saved Tabs produce `move-tabs`.
  - Open Tabs produce `copy-open-tabs`.
- New Session:
  - Add explicit `new-session-insert` target.
  - Only a New Session plus owns this target.
  - It produces `create-session`.
- `group-insert` is Session reorder only and must not implicitly create a Session from Saved/Open Tabs.
- `category-column` is Session cross-category movement only and must not implicitly create a Session from Saved/Open Tabs.

### Gap Anchors

- Eligible non-empty categories show a 20px plus:
  - Before the first Session.
  - Between every pair of Sessions.
  - After the final Session.
- The visual plus box is the complete hit target. It is not enlarged and does not span Session height.
- Coordinates belong to the fixed track: x is the fixed gap center; y is 50% of the full-height slot. Content and tab-list scrolling cannot move anchors.
- Hitting the plus only activates its filled accent state and shows `Release to create session`.
- Plus Active does not insert, reflow, or create a Session.
- Releasing on the active plus commits `create-session`.
- Leaving immediately returns the plus to rest and hides the tip. Plus uses no 12px hysteresis.
- The tip is pointer-transparent, appears after roughly 300ms pointer dwell, and is announced immediately through the screen-reader live region.
- `All Source Tabs`: if selected Saved Tabs are all tabs from one source Session:
  - Hide every New Session plus.
  - Remove the New Session keyboard target.
  - Still permit explicit merge into an Existing Session.
- Open Tabs do not use this all-source suppression.

### Empty Category

- Use First Slot Center, not Board Center.
- The entire first fixed Session-slot outline is the New Session target; the centered 20px plus is only an affordance.
- Ghost stays above plus. The full slot handles hit testing.
- Activation highlights the complete slot with accent border and soft fill.
- Replace `No sessions here yet` in place with `Release to create session`; do not show a second plus tooltip.
- Release expands the new Session in that same slot.

### Horizontal Auto-scroll

- Use A Progressive Edge:
  - 48px edge zones on the Board.
  - Speed increases from 3 to 12px/frame by edge depth.
  - Pointer and ghost keep viewport coordinates while the Session track scrolls.
  - Remeasure slots and anchors after each frame.
- Scroll only the Session Board, not the page, Sidebar, or a Session tab list.
- Existing Session targets retain short hysteresis during scroll.
- Exact plus targets are not sticky. Real plus activation pauses auto-scroll immediately; leaving resumes it.
- Reduced motion minimizes visual transitions but does not disable required drag scrolling.

### Cancel And Keyboard Equivalence

- Use C Hybrid Commands. Do not depend on a visible or hidden drag-handle focus stop.
- Pointer/touch keeps direct surface drag.
- Workspace / Category use Move Up / Move Down in their Manage lists.
- Session uses named Before / After reorder commands and a target picker for cross-category movement.
- Saved Tabs selection toolbar exposes Move and opens a target picker with Existing Session and eligible New Session positions.
- Open Tabs selection toolbar exposes Save to and opens the same target model.
- Target picker:
  - Arrow keys change preview.
  - Enter / Space commits.
  - Escape / Cancel preserves data and selection.
  - Commit / Cancel restores focus to the moved object or surviving Session/list fallback.
  - Preview, Cancel, and Commit use an `aria-live` announcement.

## Product And Data Rules

### Remove OpenTabInfo.active

- Remove `active` from the TabBoard `OpenTabInfo` protocol.
- Remove parser validation, equality comparisons, UI weight changes, DnD data validation, and test fixtures tied to the field.
- Chrome may expose `chrome.tabs.Tab.active` as platform input, but TabBoard must not project it into `OpenTabInfo`.
- Active state is not represented in Open Tabs UI.

### Pinned Tabs

- Pinned tabs are storable when allowed by the shared capture policy.
- Pinned tabs support selection, drag, Save Selected, and Save All.
- After successful capture, pinned source tabs remain open even when `closeTabsAfterSave` is enabled.
- Pinned duplicate source tabs also remain open during dedupe cleanup.
- Explicit user Close remains available.

## Theme Tokens

### Light A1

- Canvas: `#f3f5f8`
- Surface: `#ffffff`
- Sidebar: `#f8f9fb`
- Toolbar: `#fcfcfd`
- Text: `#202a3b`
- Secondary: `#5f6c80`
- Muted: `#7b8799`
- Accent: `#315ec9`
- Accent soft: `#eaf0fc`

### Dark D1

- Canvas: `#1a1e24`
- Sidebar: `#20252c`
- Toolbar: `#242930`
- Surface: `#282e36`
- Surface hover: `#303741`
- Border: `#3a424d`
- Strong border: `#444d59`
- Text: `#eef2f7`
- Secondary: `#c1c9d4`
- Muted: `#919cab`
- Accent: `#5a80dd`
- Accent soft: `#2b3a61`
- Accent text: `#b6c8fa`

## Performance And Architecture Constraints

- Preserve structural sharing and stable store references.
- Keep Options Basic on the lightweight settings projection.
- Keep Advanced lazy-loaded and unmounted while closed.
- Preserve authoritative save status and Retry behavior.
- Do not add broad state selectors or eager file-backend imports.
- Preserve stable slot activation and content visibility; make Session columns fixed at 340px.
- Do not restore implicit Session-card-A onto Session-card-B merge behavior.
- Explicit Saved Tabs `move-tabs` into an Existing Session remains allowed, including merging all tabs from one source Session.
- Persistent schema changes are limited to the confirmed minimum:
  - Add Workspace `emoji`.
  - Add canonical Workspace order.
  - Removing transient `OpenTabInfo.active` is not a persistent-schema change.
- Workspace order uses a typed mutation and structural sharing; UI code must not rewrite arrays directly.
- Preserve persistent DropIntent result kinds. Change the UI-local `DropTarget` contract by adding `new-session-insert` and narrowing `group-insert/category-column` compatibility.

## Accessibility

- Every icon-only action has an accessible name and tooltip.
- Focus rings remain visible.
- Selection, disabled, and danger states are not color-only.
- Collapsed rail actions remain keyboard reachable.
- Temporary preview does not capture focus.
- Reduced motion disables sidebar width, opacity, and position transitions.
- Coarse-pointer controls remain at least 44px.
- The exact 20px Gap Anchor is a fine-pointer DnD target, not an ordinary click control. Coarse pointers use Hybrid Commands for New Session creation.
- Every pointer DnD result has a named keyboard-command equivalent.

## Responsive Behavior

- Manager keeps the 52px rail at narrow breakpoints.
- Search may take over the topbar content region.
- Low-frequency Manager actions stay in More.
- Session columns use `min(340px, available board width)` and remain fixed within one viewport.
- Fine pointers use the exact 20px Gap Anchor. Coarse pointers do not enlarge it and use the Hybrid target picker instead.
- Options stacks header and action rows on narrow widths.
- Popup remains 320px wide and prevents text wrapping in compact action rows.

## Verification

Implementation must include:

- Focused unit and DOM tests for changed behavior.
- Build, check, and full Vitest suite.
- Browser verification of Manager, Options, and Popup in light and dark themes.
- Rendered measurement checks for 52px rail, tooltip gap, icon/button sizes, and text clamping.
- Manual DnD verification for session reorder, cross-category move, saved tabs, and selected Open Tabs.
- Manual verification of start/between/end Gap Anchors, all-source suppression, and Empty Category first-slot target.
- Manual verification of 48px edge auto-scroll, plus scroll pause, and Existing-target hysteresis.
- Manual verification of Hybrid target picker, Escape/Cancel, focus restoration, and live announcements.
- Manual sidebar verification for hover preview, pin, selection, filter, collapse, and reduced motion.
- Verification that pinned tabs save but remain open.
- Verification that OpenTabInfo no longer contains `active`.
