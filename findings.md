# ZipTab Nord UI Redesign Findings

## User-confirmed Direction

- Overall tabExtend-inspired direction is accepted.
- A design system may be introduced.
- Preferred component foundation：Web Awesome.
- Required color family：Nord.
- Design and implementation rules must be persisted before coding to prevent drift.

## Direct tabExtend Inspection

Inspected local extension page：

`chrome-extension://ffikidnnejmibopbgbelephlpigeniph/assets/html/newtab.html`

Observed：

- Sidebar uses compact count/window context instead of raw window identifiers.
- Sidebar header is visually shallow and single-row.
- Open tabs occupy the full sidebar body.
- Filter tabs stays at the bottom.
- Main toolbar is sparse and single-row.
- Category navigation is compact and left-aligned.
- Utilities sit on the right with significant intentional whitespace between regions.
- Session columns are standalone white surfaces on a neutral canvas.
- No outer category card wraps the session list.
- Borders are weak; spacing and surfaces carry hierarchy.
- Accent is singular and blue.

## Current ZipTab Problems

- Sidebar header is two rows while main topbar is one row.
- Visible `Current window` and raw Chrome window ID waste width.
- Main topbar mixes 56px category controls, 40px search, 34px workspace select and 30px icon buttons.
- Workspace stats create a second baseline.
- Session board has nested padding and category-section framing.
- Manager CSS contains duplicate `.manager-board-shell`, `.manager-topbar` and `.board-workspace` definitions.
- Current manager mixes root teal and hard-coded `#4d9dfc` blue.

## Design-system Research

### Web Awesome

- Framework-agnostic Web Components.
- Can be self-hosted.
- Suitable for incremental migration from native DOM.
- Recommended for controls, menus, tooltips, dialogs, inputs, selects and feedback.
- Must be local in MV3; no CDN.
- Must not own ZipTab session layout or DnD.

### Fluent UI Web Components

- Strong productivity-app semantics and accessibility.
- More Microsoft-specific visual character.
- Bare module imports normally require build tooling.
- Kept as fallback, not selected.

### Material Web

- Accessible and complete, but Material 3 geometry is too opinionated and tall for the target.
- Requires module resolution/build tooling.
- Rejected for this redesign.

## Nord Decision

Chosen strategy：Polar Night/Snow Storm structure with Frost-blue interaction.

- Light accent：Nord10-derived darkened solid `#57759C`.
- Dark accent：Nord8 `#88C0D0`.
- Aurora green remains success only.
- Nord15 unused by default.
- Derived colors are allowed when required for hierarchy or WCAG, but must trace back to Nord primitives.

## Contrast Findings

- Nord0/Nord1/Nord2/Nord3 text on Nord6 are safe for normal text.
- Raw Frost colors are generally unsafe as normal text on Nord6.
- Nord10 on Nord6 is about 3.5:1; use `#506A8C` for normal accent text.
- Nord8 with white text is unsafe; use Nord0 text.
- Nord10 with white text is below normal-text AA; use darkened `#57759C` with Nord6 text.
- Raw Aurora colors should not be normal body text on light surfaces.
- Light Snow Storm colors are too weak as interactive boundaries; use a darker control-border token.
- Dark Polar Night neighbors are too close for interactive boundaries; use Snow Storm-derived borders.
- Muted/disabled states cannot rely only on opacity.

## Approved Structural Decisions

- 64px shared header rail.
- 40px main controls.
- 32px compact sidebar controls.
- Workspace becomes one dropdown trigger.
- Window context becomes icon/count/dropdown, no raw ID or visible `Current`.
- Dedupe moves into window More menu.
- Category tabs remain custom because they carry DnD behavior.
- Session columns remain custom and full-height.
- Category outer frame is removed.
- Board keeps one 12px gutter and 14px card gap.

## Phase 0 Delivery Findings

- Pinned local package：`@awesome.me/webawesome@3.10.0`。
- Complete `dist-cdn` tree must be vendored because component modules and styles use transitive relative imports.
- Phase 0 uses static button/tooltip imports; loader remains packaged but is not executed.
- `<wa-icon>` remains excluded because default icon resolution may request remote Font Awesome assets.
- Repository tests must target `tests/*.test.mjs`; bare `node --test` also discovers vendored `internal/test/*.d.ts` files.
- Local JavaScript and CSS dependency graph checks pass with no remote references or vendor-root escapes.
- Automated suite now reports 90 ZipTab tests, not results polluted by vendored declarations.
- Chrome command-line `--load-extension` is blocked in current official Chrome builds, so unpacked loading requires `chrome://extensions` or Chrome for Testing.
- User manually loaded unpacked ZipTab as `bbeenbecliammefefnfdfccajdjhcgpa`; extension-hosted `wa-button` rendered and `wa-tooltip` displayed correctly.
