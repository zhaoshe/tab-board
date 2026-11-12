import { describe, expect, it, vi } from 'vitest';
import {
  assertManagerPreviewIdentity,
  resolvePlaywrightPreviewServer,
  resolveTabBoardPorts,
} from './previewValidation';

describe('TabBoard preview validation', () => {
  it('uses the E2E port as the default HMR port when only the E2E override is present', () => {
    expect(resolvePlaywrightPreviewServer({
      TABBOARD_E2E_PORT: '5394',
    })).toEqual({
      baseURL: 'http://127.0.0.1:5394',
      previewURL: 'http://127.0.0.1:5394/dev/manager-preview.html',
      webServerEnv: expect.objectContaining({
        TABBOARD_DEV_PORT: '5394',
        TABBOARD_HMR_PORT: '5394',
      }),
    });
  });

  it('keeps default dev, E2E, and HMR ports aligned when no overrides are present', () => {
    expect(resolveTabBoardPorts({})).toEqual({
      devPort: 5173,
      e2ePort: 5173,
      hmrPort: 5173,
    });
  });

  it('supports independent dev, E2E, and HMR port overrides', () => {
    expect(resolveTabBoardPorts({
      TABBOARD_DEV_PORT: '5394',
      TABBOARD_E2E_PORT: '4394',
      TABBOARD_HMR_PORT: '5395',
    })).toEqual({
      devPort: 5394,
      e2ePort: 4394,
      hmrPort: 5395,
    });
  });

  it('drives Playwright from the resolved preview origin and passes explicit ports to the dev server', () => {
    expect(resolvePlaywrightPreviewServer({
      TABBOARD_E2E_PORT: '5394',
      TABBOARD_HMR_PORT: '5395',
    })).toEqual({
      baseURL: 'http://127.0.0.1:5394',
      previewURL: 'http://127.0.0.1:5394/dev/manager-preview.html',
      webServerEnv: expect.objectContaining({
        TABBOARD_DEV_PORT: '5394',
        TABBOARD_HMR_PORT: '5395',
      }),
    });
  });

  it('rejects any 200 page that is not the real manager preview harness', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('<!doctype html><title>Totally Different App</title>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));

    await expect(assertManagerPreviewIdentity(
      'http://127.0.0.1:5394/dev/manager-preview.html',
      fetchImpl,
    )).rejects.toThrow(/TabBoard Manager Preview/);
  });

  it('accepts the real manager preview markers', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(`<!doctype html>
        <html>
          <head>
            <meta name="tabboard-preview" content="manager" />
            <title>TabBoard Manager Preview</title>
          </head>
          <body>
            <div id="root"></div>
            <script type="module">
              import { installPreviewChrome } from '/src/dev/previewChrome.ts';
              installPreviewChrome();
              await import('/src/manager/main.tsx');
            </script>
          </body>
        </html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));

    await expect(assertManagerPreviewIdentity(
      'http://127.0.0.1:5394/dev/manager-preview.html',
      fetchImpl,
    )).resolves.toEqual({
      previewURL: 'http://127.0.0.1:5394/dev/manager-preview.html',
      verified: true,
    });
  });

  it('accepts a faithful served preview page after the CRX inline-script rewrite', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(`<!DOCTYPE html>
        <html lang="en">
          <head>
            <script src="@crx/inline-script/dev/manager-preview?t=1794499951629" type="module"></script>
            <meta charset="UTF-8" >
            <meta name="viewport" content="width=device-width, initial-scale=1.0" >
            <meta name="tabboard-preview" content="manager" >
            <title>TabBoard Manager Preview</title>
          </head>
          <body style="margin: 0; padding: 0;">
            <div id="root"></div>
          </body>
        </html>`, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }));

    await expect(assertManagerPreviewIdentity(
      'http://127.0.0.1:5394/dev/manager-preview.html',
      fetchImpl,
    )).resolves.toEqual({
      previewURL: 'http://127.0.0.1:5394/dev/manager-preview.html',
      verified: true,
    });
  });
});
