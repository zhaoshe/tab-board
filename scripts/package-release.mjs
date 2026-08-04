import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  readReleaseVersions,
  validateReleaseVersion,
} from './release-version.mjs';

const execFileAsync = promisify(execFile);
const REQUIRED_DIST_FILES = [
  'manifest.json',
  'manager.html',
  'popup.html',
  'options.html',
];

async function requireDistFiles(rootDir) {
  await Promise.all(REQUIRED_DIST_FILES.map(async (file) => {
    const filePath = path.join(rootDir, 'dist', file);
    try {
      await access(filePath);
    } catch {
      throw new Error(`Missing required release file: dist/${file}`);
    }
  }));
}

async function requireProductionHtml(rootDir) {
  for (const file of ['manager.html', 'popup.html', 'options.html']) {
    const source = await readFile(path.join(rootDir, 'dist', file), 'utf8');
    if (
      source.includes('CRXJS DEV MODE')
      || source.includes('localhost:5173')
      || source.includes('/assets/loading-page-')
    ) {
      throw new Error(`Expected production build for dist/${file}`);
    }
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  hash.update(await readFile(filePath));
  return hash.digest('hex');
}

export async function packageRelease({
  rootDir,
  tag,
  outputDir = path.join(rootDir, 'release'),
}) {
  const version = validateReleaseVersion({
    tag,
    versions: await readReleaseVersions(rootDir),
  });
  await requireDistFiles(rootDir);
  await requireProductionHtml(rootDir);

  const distDir = path.join(rootDir, 'dist');
  const archiveName = `tabboard-v${version}.zip`;
  const checksumName = `tabboard-v${version}.sha256`;
  const archivePath = path.resolve(outputDir, archiveName);
  const checksumPath = path.resolve(outputDir, checksumName);
  const entries = (await readdir(distDir)).sort();

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await execFileAsync('zip', [
    '-X',
    '-r',
    archivePath,
    ...entries,
    '-x',
    '*.map',
    '*.pem',
    '*.crx',
  ], { cwd: distDir });

  const digest = await sha256(archivePath);
  await writeFile(checksumPath, `${digest}  ${archiveName}\n`);
  return { version, archivePath, checksumPath };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isEntry = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
  const rootDir = path.resolve(argument('--root') ?? process.cwd());
  const outputDir = path.resolve(
    argument('--output-dir') ?? path.join(rootDir, 'release'),
  );
  const tag = argument('--tag') ?? process.env.GITHUB_REF_NAME ?? '';
  const result = await packageRelease({ rootDir, tag, outputDir });
  process.stdout.write(`${result.archivePath}\n${result.checksumPath}\n`);
}
