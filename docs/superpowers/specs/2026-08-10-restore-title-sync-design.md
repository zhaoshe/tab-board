# Restore Title Sync Design

## Goal

Whenever TabBoard opens a persisted Saved Tab or Saved Session, update each
still-saved link with the page's final stable title rather than its initial
loading placeholder.

## Behavior

- Applies to single Saved Tab restore, Session restore, Restore Selected,
  Restore All, Popup restore, and Omnibox restore because they converge on the
  background restore functions.
- Newly created Chrome tabs are identified by tab ID. The worker waits for
  `status: complete` and a non-empty, non-URL title to remain stable for 400ms,
  with the existing 15s timeout.
- Tabs in one restore operation wait concurrently.
- A failed or timed-out title read does not fail the restore and does not
  overwrite the old title.
- If `deleteRestoredTabs` removes an unlocked Saved Tab, title sync skips it.
- If the record remains, including in a Locked Session, only its `title` is
  updated. An unchanged title produces no mutation.
- Read-only Bookmark projections open URLs without canonical title writes.

## Architecture

- Reuse `waitForStableTabTitle()` in `src/background/service-worker.ts`.
- After Chrome tab creation and any configured removal, resolve stable titles
  and submit one `update-tab` mutation batch for live group records.
- Keep title synchronization inside the worker restore queue so the worker
  remains alive and mutations are serialized.
- Allow title-only `update-tab` mutations in Locked Sessions while retaining
  lock rejection for URL, note, favicon, and all other tab changes.
- Mirror the restore/title behavior in `src/dev/previewChrome.ts`.

## Error And Race Handling

- Re-read canonical state before constructing mutations.
- Match by group ID, tab ID, item type, and original URL; skip missing or
  changed records.
- Use `Promise.allSettled()` so one page cannot block successful siblings.
- Preserve restore success even if every title read or title write fails.

## Verification

- Worker tests cover single, group, selected, delete-on-restore, Locked Session,
  final-title timing, and partial title failures.
- Mutation tests prove locked title-only updates are accepted while other
  locked tab updates remain rejected.
- Manager DOM tests prove manual Refresh Title is enabled for Locked Sessions.
- Preview tests mirror final-title synchronization.
- Finish with `npm test`, `npm run check`, and rendered verification where
  practical.
