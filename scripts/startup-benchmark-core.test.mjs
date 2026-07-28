import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBenchmarkState,
  median,
  summarizeRuns,
} from './startup-benchmark-core.mjs';

test('createBenchmarkState builds deterministic canonical state', () => {
  const state = createBenchmarkState({
    groupCount: 2,
    tabsPerGroup: 3,
    folderCount: 1,
  });

  assert.equal(state.groups.length, 2);
  assert.equal(state.groups[0].tabs.length, 3);
  assert.equal(state.folders.length, 1);
  assert.equal(state.groups[0].folderId, 'folder_0');
  assert.equal(state.groups[1].folderId, null);
  assert.equal(state.groups[0].tabs[2].url, 'https://example.com/session/0/tab/2?query=performance');
  assert.equal(state.settings.theme, 'system');
  assert.equal(state.mutationRevision, 1);
});

test('createBenchmarkState can keep a large state out of the initial Inbox', () => {
  const state = createBenchmarkState({
    groupCount: 3,
    tabsPerGroup: 1,
    folderCount: 2,
    archiveAll: true,
  });

  assert.deepEqual(
    state.groups.map(({ archived, starred, folderId }) => ({
      archived,
      starred,
      folderId,
    })),
    [
      { archived: true, starred: false, folderId: null },
      { archived: true, starred: false, folderId: null },
      { archived: true, starred: false, folderId: null },
    ],
  );
});

test('median handles odd and even samples without mutating input', () => {
  const even = [8, 2, 4, 6];

  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median(even), 5);
  assert.deepEqual(even, [8, 2, 4, 6]);
  assert.throws(() => median([]), /at least one sample/i);
});

test('summarizeRuns reports hand-derived startup medians and maxima', () => {
  const summary = summarizeRuns([
    {
      usefulMs: 900,
      rootMs: 100,
      stateReadEndMs: 400,
      cards: 8,
      rows: 40,
      listOpenTabsCalls: 2,
      longestTaskMs: 120,
    },
    {
      usefulMs: 500,
      rootMs: 80,
      stateReadEndMs: 300,
      cards: 6,
      rows: 30,
      listOpenTabsCalls: 1,
      longestTaskMs: 70,
    },
    {
      usefulMs: 700,
      rootMs: 90,
      stateReadEndMs: 350,
      cards: 7,
      rows: 35,
      listOpenTabsCalls: 2,
      longestTaskMs: 90,
    },
  ]);

  assert.deepEqual(summary, {
    runs: 3,
    medianUsefulMs: 700,
    medianRootMs: 90,
    medianStateReadEndMs: 350,
    medianCards: 7,
    medianRows: 35,
    maxListOpenTabsCalls: 2,
    maxLongestTaskMs: 120,
  });
});
