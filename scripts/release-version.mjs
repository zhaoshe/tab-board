import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function readReleaseVersions(rootDir) {
  const [pkg, lock, manifest] = await Promise.all([
    readJson(path.join(rootDir, 'package.json')),
    readJson(path.join(rootDir, 'package-lock.json')),
    readJson(path.join(rootDir, 'manifest.json')),
  ]);
  return {
    packageVersion: String(pkg.version ?? ''),
    lockVersion: String(lock.version ?? ''),
    lockRootVersion: String(lock.packages?.['']?.version ?? ''),
    manifestVersion: String(manifest.version ?? ''),
  };
}

export function validateReleaseVersion({ tag, versions }) {
  const match = TAG_PATTERN.exec(tag);
  if (!match) throw new Error(`Expected tag vX.Y.Z, received ${tag}`);

  const version = match[1];
  const observed = {
    tag: version,
    package: versions.packageVersion,
    lock: versions.lockVersion,
    lockRoot: versions.lockRootVersion,
    manifest: versions.manifestVersion,
  };
  if (new Set(Object.values(observed)).size !== 1) {
    throw new Error(Object.entries(observed)
      .map(([key, value]) => `${key}=${value}`)
      .join(' '));
  }
  return version;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isEntry = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
  const rootDir = path.resolve(argument('--root') ?? process.cwd());
  const tag = argument('--tag') ?? process.env.GITHUB_REF_NAME ?? '';
  const version = validateReleaseVersion({
    tag,
    versions: await readReleaseVersions(rootDir),
  });
  process.stdout.write(`${version}\n`);
}
