import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptPath = new URL('./check-import-cycles.mjs', import.meta.url);

function createFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'tabboard-cycle-test-'));
  const sourceRoot = join(root, 'src');
  mkdirSync(sourceRoot, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(sourceRoot, name), source);
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
