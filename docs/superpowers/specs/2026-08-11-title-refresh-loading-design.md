# Title Refresh Loading Design

## Goal

Show row-level loading feedback for every title-refresh path by replacing the
Saved Tab row's trailing Delete action with a spinner while that exact record
is being resolved.

## Behavior

- Covers manual `Refresh Title`, Session `Refresh All Titles`, and automatic
  title synchronization after Saved Tab/Session restore.
- Only actively resolving records show loading. Session batch items waiting for
  the three-worker queue do not show loading yet.
- Loading occupies the existing 32px Delete action slot, remains visible
  without hover, and does not change row geometry.
- The action is disabled and named `Refreshing title` while loading.
- Completion, failure, timeout, deletion, and URL-race paths all clear loading.
- Overlapping operations use operation IDs; one finish cannot clear another
  active refresh for the same record.
- Read-only Bookmark rows do not participate.

## Architecture

- Worker broadcasts
  `tabboard-title-refresh-activity` messages with
  `{ groupId, tabId, operationId, status: start|finish }`.
- Manual single refresh includes group/tab identity in its request.
- Restore sync and Session batch refresh wrap each actual resolver invocation
  in the same lifecycle helper.
- Manager owns a page-local, non-persistent per-record activity store backed by
  `useSyncExternalStore`; each row subscribes only to its own key.
- `ManagerLayout` installs one runtime listener. Activity never enters Zustand
  canonical state or Storage Authority.
- Preview mirrors lifecycle messages.

## Accessibility And Motion

- Reuse Mantine `ActionIcon loading` through `AccessibleIconAction`.
- Preserve the existing action geometry and reduced-motion behavior.
- Spinner is decorative; the button's accessible name is
  `Refreshing title`.

## Verification

- Pure activity store tests cover overlap, duplicate events, and keyed
  subscriptions.
- Worker tests cover start/finish ordering for manual, batch, restore, failure,
  and deletion skip paths.
- DOM tests verify loading replaces Delete, remains visible without hover, and
  restores Delete after finish.
- Preview and rendered Manager verification confirm parity.
