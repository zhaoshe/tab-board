import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { packageRelease } from './package-release.mjs';

const execFileAsync = promisify(execFile);

async function fixture({
  includeManifest = true,
  managerHtml = 'manager.html',
} = {}) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'tabboard-package-'));
  const outputDir = path.join(rootDir, 'release');
  const distDir = path.join(rootDir, 'dist');
  await mkdir(distDir);
  for (const file of ['package.json', 'manifest.json']) {
    await writeFile(path.join(rootDir, file), JSON.stringify({
      version: '0.1.0',
    }));
  }
  await writeFile(path.join(rootDir, 'package-lock.json'), JSON.stringify({
    version: '0.1.0',
    packages: { '': { version: '0.1.0' } },
  }));
  if (includeManifest) {
    await writeFile(
      path.join(distDir, 'manifest.json'),
      '{"version":"0.1.0"}',
    );
  }
  await writeFile(path.join(distDir, 'manager.html'), managerHtml);
  await writeFile(path.join(distDir, 'popup.html'), 'popup.html');
  await writeFile(path.join(distDir, 'options.html'), 'options.html');
  return { rootDir, outputDir };
}

async function zipEntries(archivePath) {
  const { stdout } = await execFileAsync('unzip', ['-Z1', archivePath]);
  return stdout.trim().split('\n');
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  hash.update(await readFile(filePath));
  return hash.digest('hex');
}

test('refuses to package without dist/manifest.json', async () => {
  const { rootDir, outputDir } = await fixture({ includeManifest: false });
  await assert.rejects(
    packageRelease({ rootDir, outputDir, tag: 'v0.1.0' }),
    /dist\/manifest\.json/,
  );
});

test('refuses to package a CRXJS development loader', async () => {
  const { rootDir, outputDir } = await fixture({
    managerHtml: '<title>CRXJS DEV MODE</title><script src="http://localhost:5173"></script>',
  });
  await assert.rejects(
    packageRelease({ rootDir, outputDir, tag: 'v0.1.0' }),
    /production build.*manager\.html/i,
  );
});

test('creates a root-level extension ZIP and matching checksum', async () => {
  const { rootDir, outputDir } = await fixture();
  const result = await packageRelease({
    rootDir,
    outputDir,
    tag: 'v0.1.0',
  });
  assert.equal(path.basename(result.archivePath), 'tabboard-v0.1.0.zip');
  assert.equal(path.basename(result.checksumPath), 'tabboard-v0.1.0.sha256');

  const entries = await zipEntries(result.archivePath);
  assert.ok(entries.includes('manifest.json'));
  assert.ok(entries.includes('manager.html'));
  assert.ok(entries.includes('popup.html'));
  assert.ok(entries.includes('options.html'));
  assert.ok(entries.every((entry) => !entry.startsWith('dist/')));

  const checksumLine = await readFile(result.checksumPath, 'utf8');
  assert.match(
    checksumLine,
    /^[a-f0-9]{64}  tabboard-v0\.1\.0\.zip\n$/,
  );
  assert.equal(await sha256(result.archivePath), checksumLine.slice(0, 64));
});
