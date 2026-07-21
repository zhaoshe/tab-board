# E2E tests (Playwright)

Browser-level smoke tests that drive the **real** React manager against the
mocked-Chrome preview harness (`dev/manager-preview.html` + `installPreviewChrome()`).
They cover things Vitest/happy-dom cannot: `@dnd-kit` pointer-drag lifecycle,
manager boot ordering, and storage-reload recovery — without needing an unpacked
extension.

## Running

```sh
npm run test:e2e        # headless
npm run test:e2e:ui     # Playwright UI mode
```

The config (`playwright.config.ts`) starts `npm run dev` itself and points at
`http://localhost:5173/dev/manager-preview.html`.

First-time setup (once per machine):

```sh
npx playwright install chromium
```

## Not part of `npm test` / `npm run check`

These are intentionally excluded from the default gates. Vitest (`npm test`)
stays fast and deterministic; Playwright needs a browser binary and a dev server,
so run it on demand or in a dedicated CI job.

## Seeding state

The preview harness reads `window.__TABBOARD_PREVIEW__` (set via Playwright
`addInitScript`) and forwards it to `installPreviewChrome()`. See `fixtures.ts`
for deterministic session seeds.

## Coverage split

- Pure drop resolution (ownership, indices, no-op detection, workspace
  boundaries): `src/manager/core/dnd.test.ts` (Vitest) — the primary regression.
- Browser drag lifecycle (overlay appears/tears down, Escape cancel), boot, and
  reload recovery: this directory.

## Known gap surfaced by these tests

The session-card drag activator (`.session-card__header`) spreads `@dnd-kit`
`listeners` but not `attributes`, so it exposes no `tabindex` / `role` /
`aria-roledescription`. As a result the `KeyboardSensor` cannot be activated by
tabbing to a session and pressing Space — keyboard-only session reordering does
not work today. The e2e suite therefore exercises the pointer path. If keyboard
DnD becomes a requirement, spread `attributes` onto the activator element and add
a keyboard-drag spec here.
