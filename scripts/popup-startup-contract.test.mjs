import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertPopupStartupBuild,
  assertPopupStartupSample,
} from './popup-startup-contract.mjs';

const sourceHtml = `
  <div id="root">
    <main data-popup-boot-shell>Loading current window…</main>
  </div>
  <script type="module" src="/src/popup/main.tsx"></script>
`;

function builtHtml(preloads = []) {
  return `
    <main data-popup-boot-shell>Loading current window…</main>
    <script type="module" src="/assets/popup-abc.js"></script>
    ${preloads.map((href) =>
      `<link rel="modulepreload" crossorigin href="/assets/${href}">`).join('\n')}
  `;
}

test('Popup build contract requires the static boot shell in source and output', () => {
  assert.throws(
    () => assertPopupStartupBuild({
      sourceHtml: '<div id="root"></div>',
      builtHtml: builtHtml(),
    }),
    /source.*boot shell/i,
  );
  assert.throws(
    () => assertPopupStartupBuild({
      sourceHtml,
      builtHtml: '<script type="module" src="/assets/popup-abc.js"></script>',
    }),
    /built.*boot shell/i,
  );
});

test('Popup build contract rejects full-store and Storage Authority preloads', () => {
  assert.throws(
    () => assertPopupStartupBuild({
      sourceHtml,
      builtHtml: builtHtml(['useTabBoardStore-abc.js']),
    }),
    /useTabBoardStore/i,
  );
  assert.throws(
    () => assertPopupStartupBuild({
      sourceHtml,
      builtHtml: builtHtml(['activeAdapter-abc.js']),
    }),
    /activeAdapter/i,
  );
});

test('Popup build contract accepts the static shell with lightweight preloads', () => {
  assert.doesNotThrow(() => assertPopupStartupBuild({
    sourceHtml,
    builtHtml: builtHtml([
      'usePageTheme-abc.js',
      'settingsProjection-abc.js',
      'capture-policy-abc.js',
    ]),
  }));
});

const validSample = {
  stateReadCount: 0,
  projectionReadCount: 1,
  tabQueryCount: 1,
  projectionReadStartMs: 100,
  projectionReadEndMs: 140,
  tabQueryStartMs: 110,
  tabQueryEndMs: 120,
};

test('Popup startup sample rejects canonical reads and duplicate startup calls', () => {
  assert.throws(
    () => assertPopupStartupSample({ ...validSample, stateReadCount: 1 }),
    /canonical state/i,
  );
  assert.throws(
    () => assertPopupStartupSample({ ...validSample, projectionReadCount: 2 }),
    /settings projection.*once/i,
  );
  assert.throws(
    () => assertPopupStartupSample({ ...validSample, tabQueryCount: 2 }),
    /current-window tabs.*once/i,
  );
});

test('Popup startup sample requires projection and tab query to overlap', () => {
  assert.throws(
    () => assertPopupStartupSample({
      ...validSample,
      tabQueryStartMs: 141,
      tabQueryEndMs: 150,
    }),
    /overlap/i,
  );
  assert.doesNotThrow(() => assertPopupStartupSample(validSample));
});
