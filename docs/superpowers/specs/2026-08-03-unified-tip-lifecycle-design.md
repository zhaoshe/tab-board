# Unified Tip Lifecycle Design

## Goal

Make every hover/focus tip in TabBoard follow one lifecycle while preserving
the four approved content types, delays, and visual treatments.

## Tip Types

| Type | Examples | Pointer delay | Keyboard |
| --- | --- | ---: | --- |
| Compact action | Search, Bin, More, selection actions, Popup actions | 1000ms | Accessible name only |
| Menu description | Import, Workspace, Category, Session, Saved Tab menu items | 550ms | Menu open: no tip. First arrow-key move: immediate tip |
| Rich tab preview | Open Tab and Saved Tab title/domain/link/timestamp | 180ms | Focus: immediate preview |
| Drag-state tip | New Session target | 300ms active dwell | Existing command alternative remains |

## Single Lifecycle Owner

TabBoard has one tip coordinator per rendered page. It owns:

- the pending timer;
- the current target;
- the current tip kind;
- `aria-describedby`;
- dismissal and replacement.

Individual buttons, menu items, tab rows, and drag targets register content and
request ownership. They do not keep independent open state.

Only one visible tip may exist on a page. Claiming a new target first clears:

- the previous timer;
- previous visible content;
- previous `aria-describedby`;
- previous target ownership.

The four existing render templates remain separate. The coordinator only owns
their lifecycle.

## Pointer Rules

- Pointer enter starts the type-specific delay.
- Pointer leave clears pending and visible state immediately.
- Moving from target A to target B clears A before starting B.
- Pointer down, click, context menu, drag start, menu close, dialog open,
  viewport change, page blur, and visibility loss clear the current tip.
- After pointer activation, the same target stays suppressed until real pointer
  movement or leave.
- Opening More by pointer does not focus or highlight the first item.
- A menu pointer tip appears only after 550ms dwell on the current item.
- Starting a drag clears compact, menu, and rich tips.
- The New Session drag tip appears only while the exact target remains active
  for 300ms and clears on leave, drop, or cancel.

## Keyboard Rules

- Icon-only actions retain `aria-label`; compact action tips do not become a
  second keyboard announcement.
- Keyboard-opened menus focus the first item but show no description tip.
- The first Up/Down navigation arms menu descriptions and immediately shows the
  newly focused item's description.
- Subsequent Up/Down navigation replaces the same single tip.
- Tab rich preview opens immediately on focus.
- Escape closes the current menu/preview, clears the tip, and restores focus
  according to the existing overlay contract.

## Scope

Included:

- Manager, Popup, and Options compact action tips;
- Global, Workspace, Category, Session, and Saved Tab menu descriptions;
- Open/Saved Tab rich previews;
- New Session drag-state tips.

Not changed:

- tooltip copy;
- existing visual styles;
- 1000/550/180/300ms delays;
- menu inventory;
- DnD semantics;
- focus-return destinations;
- native form descriptions, alerts, modal titles, or toast content.

## Verification

Automated checks must prove:

- each page renders at most one visible `role="tooltip"`;
- pointer-opened menus have no focused item and no tip;
- keyboard-opened menus focus the first item but have no tip;
- first arrow navigation shows exactly one description tip;
- moving between menu items removes the old description before opening the new;
- activation suppresses a target until real pointer movement or leave;
- rich preview replaces compact/menu tips;
- drag start replaces all non-drag tips;
- drag target leave/drop/cancel clears the drag tip;
- Popup and Manager compact actions retain accessible names and delayed pointer
  tips.

Manual preview acceptance is the approved
`public/menu-tip-preview/` interaction.
