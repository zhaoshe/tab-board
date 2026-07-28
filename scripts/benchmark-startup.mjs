import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
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

async function gotoExtensionPage(page, extensionId, pageName) {
  const url = `chrome-extension://${extensionId}/${pageName}.html`;
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
  await gotoExtensionPage(page, extensionId, 'manager');
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
    firstRootContent: null,
    firstUsefulUi: null,
    calls: [],
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

async function measure(profilePath, extensionId, pageName, state) {
  const context = await launch(profilePath);
  try {
    const worker = await activateWorker(context, extensionId);
    await worker.evaluate(async (seed) => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({
        tabboardStorageConfig: { mode: 'browser' },
        tabboardState: seed,
      });
    }, state);
    await context.addInitScript(startupProbe);
    const targetUrl = `chrome-extension://${extensionId}/${pageName}.html`;
    const pagePromise = context.waitForEvent('page', { timeout: 15_000 });
    await worker.evaluate(async (url) => {
      await chrome.tabs.create({ url, active: true });
    }, targetUrl);
    const page = await pagePromise;
    await page.waitForURL(`${targetUrl}*`, { timeout: 15_000 });
    const selector = pageName === 'manager' ? '.manager-shell' : '.options-header';
    await page.locator(selector).waitFor({ state: 'attached', timeout: 30_000 });
    const result = await page.evaluate(() => {
      const record = globalThis.__TABBOARD_STARTUP_BENCHMARK__;
      const stateReads = record.calls.filter(({ label, end }) =>
        label === 'storage:get:tabboardState' && end !== null);
      const listCalls = record.calls.filter(({ label }) =>
        label === 'runtime:list-open-tabs');
      return {
        usefulMs: record.firstUsefulUi,
        rootMs: record.firstRootContent,
        stateReadEndMs: stateReads.length
          ? Math.max(...stateReads.map(({ end }) => end))
          : 0,
        cards: document.querySelectorAll('.session-card').length,
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
const extensionId = extensionIdForPath(DIST_PATH);
const selected = scenario ? [[scenario, SCENARIOS[scenario]]] : Object.entries(SCENARIOS);
const results = [];

for (const [name, configuration] of selected) {
  for (const pageName of configuration.pages) {
    const samples = [];
    for (let index = 0; index < runs; index += 1) {
      const profilePath = await mkdtemp(resolve(
        tmpdir(),
        `tabboard-${name}-${pageName}-`,
      ));
      try {
        samples.push(await measure(
          profilePath,
          extensionId,
          pageName,
          configuration.state,
        ));
      } finally {
        await rm(profilePath, { recursive: true, force: true });
      }
    }
    results.push({
      scenario: name,
      page: pageName,
      bytes: Buffer.byteLength(JSON.stringify(configuration.state)),
      summary: summarizeRuns(samples),
      samples,
    });
  }
}

console.table(results.map(({ scenario: name, page, bytes, summary }) => ({
  scenario: name,
  page,
  bytes,
  usefulMs: summary.medianUsefulMs,
  rows: summary.medianRows,
  listCalls: summary.maxListOpenTabsCalls,
  longestTaskMs: summary.maxLongestTaskMs,
})));
console.log(JSON.stringify({ extensionId, results }, null, 2));
