# Session Refresh All Titles Design

## Goal

Add `Refresh All Titles` to each persisted Session menu so every saved Link can
refresh to its final stable page title without opening visible browser tabs.

## Behavior

- Available for unlocked and Locked Sessions; hidden for read-only Bookmark
  projection Sessions.
- Notes are skipped.
- Exact-URL open tabs are reused. Missing URLs use the existing
  minimized/unfocused popup helper.
- At most three links resolve concurrently.
- Each link keeps the existing final-title contract: `status: complete`,
  non-empty/non-URL title stable for 400ms, maximum 15s.
- Successful titles are committed in one mutation batch. Missing, changed,
  unchanged, failed, or timed-out records are not overwritten.
- Result shape: `{ refreshed: number, failed: number }`.
- UI feedback:
  - all successful: `Titles refreshed`;
  - partial/total failure: `<N> titles refreshed, <M> failed`.

## Architecture

- Add runtime action `refresh-saved-group-titles` in the service worker.
- Validate one canonical group ID, snapshot its Link records, resolve them with
  a fixed three-worker queue, re-read canonical state, then submit title-only
  `update-tab` mutations once.
- Reuse the current `refreshSavedTabTitle(url)` resolver so open-tab reuse,
  popup filtering, stable-title timing, title-size bounds, and cleanup remain
  single-owned.
- Add `refreshSavedGroupTitles(groupId)` to `ManagerRuntime`; `SessionCard`
  owns menu feedback.
- Mirror the action in preview.

## Error Handling

- Individual resolver failures increment `failed` and do not reject the batch.
- Invalid/missing group rejects the runtime request.
- Persistence failure rejects the runtime request and uses the existing Manager
  error toast.
- Canonical records removed or URL-changed during resolution are counted as
  failures and skipped.

## Verification

- Worker: three-concurrency ceiling, open-tab reuse, popup cleanup, one mutation
  batch, partial failure, Locked Session, Notes skipped, URL race.
- Manager: menu entry, read-only exclusion, Locked availability, success and
  partial-failure copy.
- Preview parity.
- Final `npm test`, `npm run check`, and rendered menu verification.
