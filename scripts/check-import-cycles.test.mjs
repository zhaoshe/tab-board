import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptPath = new URL('./check-import-cycles.mjs', import.meta.url);

function createFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'tabboard-cycle-test-'));
  const sourceRoot = join(root, 'src');
  mkdirSync(sourceRoot, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    const file = join(sourceRoot, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return {
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function runCycleCheck(root, ...args) {
  return spawnSync(
    process.execPath,
    [scriptPath.pathname, '--root', root, ...args],
    { encoding: 'utf8' },
  );
}

test('reports a denied pair when both modules occur in one import cycle', () => {
  const fixture = createFixture({
    'a.ts': "import './b';\n",
    'b.ts': "import './a';\n",
  });
  try {
    const result = runCycleCheck(
      fixture.root,
      '--deny-together',
      'src/a.ts,src/b.ts',
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /src\/a\.ts/);
    assert.match(result.stdout, /src\/b\.ts/);
    assert.match(result.stderr, /denied import cycle/i);
  } finally {
    fixture.dispose();
  }
});

test('passes a denied pair when the import graph is acyclic', () => {
  const fixture = createFixture({
    'a.ts': "import './b';\n",
    'b.ts': 'export const value = 1;\n',
  });
  try {
    const result = runCycleCheck(
      fixture.root,
      '--deny-together',
      'src/a.ts,src/b.ts',
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No denied import cycles/);
    assert.equal(result.stderr, '');
  } finally {
    fixture.dispose();
  }
});

test('strict mode rejects any import cycle without a deny filter', () => {
  const fixture = createFixture({
    'a.ts': "import './b';\n",
    'b.ts': "import './a';\n",
  });
  try {
    const result = runCycleCheck(fixture.root);

    assert.equal(result.status, 1);
    assert.match(result.stdout, /Import cycle:/);
    assert.match(result.stderr, /Denied import cycle count: 1/);
  } finally {
    fixture.dispose();
  }
});

test('strict mode passes an acyclic source graph', () => {
  const fixture = createFixture({
    'a.ts': "import './b';\n",
    'b.ts': 'export const value = 1;\n',
  });
  try {
    const result = runCycleCheck(fixture.root);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No denied import cycles/);
    assert.equal(result.stderr, '');
  } finally {
    fixture.dispose();
  }
});

test('rejects forbidden external and resolved internal import edges', () => {
  const fixture = createFixture({
    'owner.ts': "import { create } from 'zustand';\nimport './ui/component';\nexport const owner = create;\n",
    'ui/component.ts': 'export const component = 1;\n',
  });
  try {
    const result = runCycleCheck(
      fixture.root,
      '--deny-imports',
      'src/owner.ts,zustand,src/ui',
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /forbidden import edge/i);
    assert.match(result.stderr, /src\/owner\.ts -> zustand/);
    assert.match(result.stderr, /src\/owner\.ts -> src\/ui\/component\.ts/);
  } finally {
    fixture.dispose();
  }
});

test('passes when forbidden targets are imported by a different owner', () => {
  const fixture = createFixture({
    'owner.ts': "import './model';\n",
    'model.ts': 'export const model = 1;\n',
    'ui.ts': "import { create } from 'zustand';\nexport const ui = create;\n",
  });
  try {
    const result = runCycleCheck(
      fixture.root,
      '--deny-imports',
      'src/owner.ts,zustand,src/ui',
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No forbidden import edges/);
    assert.equal(result.stderr, '');
  } finally {
    fixture.dispose();
  }
});
