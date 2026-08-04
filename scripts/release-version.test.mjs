import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readReleaseVersions,
  validateReleaseVersion,
} from './release-version.mjs';

async function fixture(versions = {}) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'tabboard-release-'));
  const version = versions.packageVersion ?? '0.1.0';
  await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({
    version,
  }));
  await writeFile(path.join(rootDir, 'package-lock.json'), JSON.stringify({
    version: versions.lockVersion ?? version,
    packages: { '': { version: versions.lockRootVersion ?? version } },
  }));
  await writeFile(path.join(rootDir, 'manifest.json'), JSON.stringify({
    version: versions.manifestVersion ?? version,
  }));
  return rootDir;
}

test('reads all release version sources', async () => {
  const rootDir = await fixture();
  assert.deepEqual(await readReleaseVersions(rootDir), {
    packageVersion: '0.1.0',
    lockVersion: '0.1.0',
    lockRootVersion: '0.1.0',
    manifestVersion: '0.1.0',
  });
});

test('accepts a matching semantic version tag', () => {
  assert.equal(validateReleaseVersion({
    tag: 'v0.1.0',
    versions: {
      packageVersion: '0.1.0',
      lockVersion: '0.1.0',
      lockRootVersion: '0.1.0',
      manifestVersion: '0.1.0',
    },
  }), '0.1.0');
});

test('rejects a non-release tag', () => {
  assert.throws(() => validateReleaseVersion({
    tag: 'release-0.1.0',
    versions: {
      packageVersion: '0.1.0',
      lockVersion: '0.1.0',
      lockRootVersion: '0.1.0',
      manifestVersion: '0.1.0',
    },
  }), /Expected tag vX\.Y\.Z/);
});

test('reports every observed version when one source differs', () => {
  assert.throws(() => validateReleaseVersion({
    tag: 'v0.1.0',
    versions: {
      packageVersion: '0.1.0',
      lockVersion: '0.1.0',
      lockRootVersion: '0.1.0',
      manifestVersion: '0.1.1',
    },
  }), (error) => {
    assert.match(error.message, /tag=0\.1\.0/);
    assert.match(error.message, /package=0\.1\.0/);
    assert.match(error.message, /lock=0\.1\.0/);
    assert.match(error.message, /lockRoot=0\.1\.0/);
    assert.match(error.message, /manifest=0\.1\.1/);
    return true;
  });
});
