import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  benchmarkPageStorage,
  benchmarkPagePath,
  createBenchmarkSchedule,
  createBenchmarkState,
  summarizeRuns,
} from './startup-benchmark-core.mjs';

const DIST_PATH = resolve('dist');
const DEFAULT_RUNS = 5;
const SCENARIOS = {
  empty: {
    state: createBenchmarkState({
      groupCount: 0,
      tabsPerGroup: 0,
      folderCount: 0,
    }),
    pages: ['manager', 'options'],
  },
  medium: {
    state: createBenchmarkState({
      groupCount: 60,
      tabsPerGroup: 2,
      folderCount: 8,
    }),
    pages: ['manager', 'options'],
  },
  large: {
    state: createBenchmarkState({
      groupCount: 300,
      tabsPerGroup: 20,
      folderCount: 24,
    }),
    pages: ['manager', 'options'],
  },
  'large-empty-inbox': {
    state: createBenchmarkState({
      groupCount: 300,
      tabsPerGroup: 20,
      folderCount: 24,
      archiveAll: true,
    }),
    pages: ['manager'],
  },
};

async function assertProductionBuild() {
  const managerHtml = await readFile(resolve(DIST_PATH, 'manager.html'), 'utf8');
  if (managerHtml.includes('localhost:5173') || managerHtml.includes('CRXJS DEV MODE')) {
    throw new Error(
      'dist contains the CRXJS development loader. Run npm run build before benchmarking.',
    );
  }
}

function parseArguments(argv) {
  let runs = DEFAULT_RUNS;
  let scenario = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--runs') {
      runs = Number(argv[index + 1]);
      index += 1;
    } else if (argv[index] === '--scenario') {
      scenario = argv[index + 1];
      index += 1;
    }
  }
  if (!Number.isSafeInteger(runs) || runs < 1) {
    throw new Error('--runs must be a positive integer');
  }
  if (scenario && !Object.hasOwn(SCENARIOS, scenario)) {
    throw new Error(`Unknown scenario: ${scenario}`);
  }
  return { runs, scenario };
}

function extensionIdForPath(path) {
  return [...createHash('sha256').update(path).digest('hex').slice(0, 32)]
    .map((character) => String.fromCharCode(97 + Number.parseInt(character, 16)))
    .join('');
}

async function launch(profilePath) {
  return chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
    ],
  });
}

async function gotoExtensionPage(page, extensionId, pagePath) {
  const relativePath = pagePath.includes('.html')
    ? pagePath
    : `${pagePath}.html`;
  const url = `chrome-extension://${extensionId}/${relativePath}`;
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 15_000 });
  } catch (error) {
    if (!page.url().startsWith(url)) throw error;
  }
}

async function activateWorker(context, extensionId) {
  let worker = context.serviceWorkers()[0];
  if (worker) return worker;

  const page = context.pages()[0] ?? await context.newPage();
  await gotoExtensionPage(page, extensionId, 'options');
  await page.waitForLoadState('load');
  worker = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const actualId = new URL(worker.url()).host;
  if (actualId !== extensionId) {
    throw new Error(`Extension ID mismatch: expected ${extensionId}, got ${actualId}`);
  }
  return worker;
}

function startupProbe() {
  const record = {
    scriptStart: performance.now(),
    initialLocation: window.location.href,
    firstRootContent: null,
    firstUsefulUi: null,
    calls: [],
    historyCalls: [],
    longTasks: [],
  };
  globalThis.__TABBOARD_STARTUP_BENCHMARK__ = record;

  const wrap = (owner, method, label) => {
    const original = owner?.[method];
    if (typeof original !== 'function') return;
    try {
      owner[method] = function wrapped(...args) {
        const call = {
          label: label(...args),
          start: performance.now(),
          end: null,
        };
        record.calls.push(call);
        return Promise.resolve(original.apply(this, args)).finally(() => {
          call.end = performance.now();
        });
      };
    } catch {
      // A future Chrome version may expose non-writable API methods.
    }
  };

  wrap(chrome.runtime, 'sendMessage', (message) =>
    `runtime:${message?.type || 'unknown'}`);
  wrap(chrome.storage?.local, 'get', (keys) =>
    `storage:get:${Array.isArray(keys) ? keys.join(',') : String(keys)}`);

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method].bind(history);
    history[method] = function wrappedHistory(state, unused, url) {
      record.historyCalls.push({
        method,
        from: window.location.href,
        url: String(url ?? ''),
      });
      return original(state, unused, url);
    };
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        record.longTasks.push({
          start: entry.startTime,
          duration: entry.duration,
        });
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // Long-task observation is supporting evidence, not a startup dependency.
  }

  const inspect = () => {
    const root = document.getElementById('root');
    if (record.firstRootContent === null && root?.childElementCount) {
      record.firstRootContent = performance.now();
    }
    if (
      record.firstUsefulUi === null
      && document.querySelector('.manager-shell, .options-header')
    ) {
      record.firstUsefulUi = performance.now();
    }
  };
  new MutationObserver(inspect).observe(document, {
    childList: true,
    subtree: true,
  });
}

async function seedProfile(profilePath, extensionId, state) {
  const context = await launch(profilePath);
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await gotoExtensionPage(page, extensionId, 'options');
    await page.evaluate(async (seed) => {
      await chrome.storage.local.clear();
      for (const [key, value] of Object.entries(seed.pageStorage)) {
        localStorage.setItem(key, value);
      }
      await chrome.storage.local.set({
        tabboardStorageConfig: { mode: 'browser' },
        tabboardState: seed.state,
        tabboardSettingsProjection: {
          settings: seed.state.settings,
          mutationRevision: seed.state.mutationRevision,
          updatedAt: seed.state.updatedAt,
        },
      });
    }, {
      state,
      pageStorage: benchmarkPageStorage(),
    });
  } finally {
    await context.close();
  }
}

async function measure(profilePath, extensionId, pageName) {
  const context = await launch(profilePath);
  try {
    await context.addInitScript(startupProbe);
    const page = context.pages()[0] ?? await context.newPage();
    await gotoExtensionPage(
      page,
      extensionId,
      benchmarkPagePath(pageName),
    );
    const selector = pageName === 'manager' ? '.manager-shell' : '.options-header';
    await page.locator(selector).waitFor({ state: 'attached', timeout: 30_000 });
    const result = await page.evaluate(() => {
      const record = globalThis.__TABBOARD_STARTUP_BENCHMARK__;
      const stateReads = record.calls.filter(({ label, end }) =>
        label === 'storage:get:tabboardState' && end !== null);
      const projectionReads = record.calls.filter(({ label, end }) =>
        label === 'storage:get:tabboardSettingsProjection' && end !== null);
      const listCalls = record.calls.filter(({ label }) =>
        label === 'runtime:list-open-tabs');
      return {
        initialLocation: record.initialLocation,
        historyCalls: record.historyCalls,
        location: window.location.href,
        activeBoard: document.querySelector('.manager-board')
          ?.getAttribute('aria-label') ?? null,
        usefulMs: record.firstUsefulUi,
        rootMs: record.firstRootContent,
        stateReadEndMs: stateReads.length
          ? Math.max(...stateReads.map(({ end }) => end))
          : 0,
        projectionReadEndMs: projectionReads.length
          ? Math.max(...projectionReads.map(({ end }) => end))
          : 0,
        cards: document.querySelectorAll('.session-card:not(.session-card--shell)').length,
        shells: document.querySelectorAll('[data-session-shell="true"]').length,
        slots: document.querySelectorAll('[data-session-slot-id]').length,
        rows: document.querySelectorAll('.tab-item-row').length,
        listOpenTabsCalls: listCalls.length,
        longestTaskMs: record.longTasks.length
          ? Math.max(...record.longTasks.map(({ duration }) => duration))
          : 0,
      };
    });
    return result;
  } finally {
    await context.close();
  }
}

const { runs, scenario } = parseArguments(process.argv.slice(2));
await assertProductionBuild();
const extensionId = extensionIdForPath(DIST_PATH);
const selected = scenario ? [[scenario, SCENARIOS[scenario]]] : Object.entries(SCENARIOS);
const sampleGroups = new Map();

for (const {
  scenario: name,
  page: pageName,
  configuration,
} of createBenchmarkSchedule(selected, runs)) {
  const profilePath = await mkdtemp(resolve(
    tmpdir(),
    `tabboard-${name}-${pageName}-`,
  ));
  try {
    await seedProfile(profilePath, extensionId, configuration.state);
    const key = `${name}:${pageName}`;
    const group = sampleGroups.get(key) ?? {
      scenario: name,
      page: pageName,
      bytes: Buffer.byteLength(JSON.stringify(configuration.state)),
      samples: [],
    };
    group.samples.push(await measure(profilePath, extensionId, pageName));
    sampleGroups.set(key, group);
  } finally {
    await rm(profilePath, { recursive: true, force: true });
  }
}

const results = [...sampleGroups.values()].map((group) => ({
  ...group,
  summary: summarizeRuns(group.samples),
}));

console.table(results.map(({ scenario: name, page, bytes, summary }) => ({
  scenario: name,
  page,
  bytes,
  usefulMs: summary.medianUsefulMs,
  cards: summary.medianCards,
  shells: summary.medianShells,
  slots: summary.medianSlots,
  rows: summary.medianRows,
  listCalls: summary.maxListOpenTabsCalls,
  longestTaskMs: summary.maxLongestTaskMs,
})));
console.log(JSON.stringify({ extensionId, results }, null, 2));
