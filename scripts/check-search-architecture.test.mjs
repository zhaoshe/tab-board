import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptPath = new URL('./check-search-architecture.mjs', import.meta.url);

function createFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'tabboard-search-architecture-'));
  for (const [name, source] of Object.entries(files)) {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function runCheck(root) {
  return spawnSync(
    process.execPath,
    [scriptPath.pathname, '--root', root],
    { encoding: 'utf8' },
  );
}

test('rejects hidden saved-search window events in production source', () => {
  const fixture = createFixture({
    'src/manager/hooks/query.ts': `
      window.dispatchEvent(new CustomEvent('tabboard-search-change'));
    `,
  });
  try {
    const result = runCheck(fixture.root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /query\.ts: saved search must not use a window event bus/);
  } finally {
    fixture.dispose();
  }
});

test('rejects SearchBar window listeners', () => {
  const fixture = createFixture({
    'src/manager/components/search/SearchBar.tsx': `
      window.addEventListener('tabboard-search-change', handler);
    `,
  });
  try {
    const result = runCheck(fixture.root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /SearchBar\.tsx: SearchBar must subscribe through the query store/);
  } finally {
    fixture.dispose();
  }
});

test('rejects WorkspaceContent group scans and inline category membership', () => {
  const fixture = createFixture({
    'src/manager/components/workspace/WorkspaceContent.tsx': `
      const allGroups = state.groups;
      const visible = allGroups.filter((group) =>
        group.starred || group.archived || group.folderId === folderId);
    `,
  });
  try {
    const result = runCheck(fixture.root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /WorkspaceContent\.tsx: WorkspaceContent must not read all groups/);
    assert.match(result.stderr, /WorkspaceContent\.tsx: WorkspaceContent must not own category membership/);
  } finally {
    fixture.dispose();
  }
});

test('rejects framework, browser-global, and TabBoard store dependencies in the core owner', () => {
  const fixture = createFixture({
    'src/manager/core/searchQueryStore.ts': `
      import { useState } from 'react';
      import { create } from 'zustand';
      import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
      export const query = window.location.search + sessionStorage.getItem('query');
    `,
  });
  try {
    const result = runCheck(fixture.root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /searchQueryStore\.ts: core query owner must not import React/);
    assert.match(result.stderr, /searchQueryStore\.ts: core query owner must not import Zustand/);
    assert.match(result.stderr, /searchQueryStore\.ts: core query owner must not import TabBoard store/);
    assert.match(result.stderr, /searchQueryStore\.ts: core query owner must not read browser globals/);
  } finally {
    fixture.dispose();
  }
});

test('passes clean owners and ignores architecture strings in test files', () => {
  const fixture = createFixture({
    'src/manager/core/searchQueryStore.ts': `
      export const createStore = (ports) => ports;
    `,
    'src/manager/components/search/SearchBar.tsx': `
      export const SearchBar = () => useSearchQuery();
    `,
    'src/manager/components/workspace/WorkspaceContent.tsx': `
      export const WorkspaceContent = () => useBoardProjection('inbox');
    `,
    'src/manager/hooks/query.test.ts': `
      window.dispatchEvent(new CustomEvent('tabboard-search-change'));
      const allGroups = state.groups.filter((group) => group.starred);
    `,
  });
  try {
    const result = runCheck(fixture.root);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Search architecture checks passed/);
    assert.equal(result.stderr, '');
  } finally {
    fixture.dispose();
  }
});
