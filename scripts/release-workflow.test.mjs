import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL(
  '../.github/workflows/release.yml',
  import.meta.url,
);

test('release workflow is tag-only and minimally privileged', async () => {
  const source = await readFile(workflowPath, 'utf8');
  assert.match(source, /tags:\s*\n\s*-\s*'v\*\.\*\.\*'/);
  assert.match(
    source,
    /permissions:\s*\n\s{2}contents:\s*write\s*\n\s*\n\s*jobs:/,
  );
  assert.doesNotMatch(source, /pull_request:/);
  assert.doesNotMatch(source, /branches:/);
});

test('release workflow gates publication on validation and tests', async () => {
  const source = await readFile(workflowPath, 'utf8');
  for (const command of [
    'npm ci',
    'npm run release:validate -- --tag "$GITHUB_REF_NAME"',
    'npm run check',
    'npm test',
    'npx playwright install --with-deps chromium',
    'npx playwright test --workers=1',
    'npm run release:package -- --tag "$GITHUB_REF_NAME"',
    'gh release create "$GITHUB_REF_NAME"',
  ]) {
    assert.ok(source.includes(command), `missing command: ${command}`);
  }
  assert.doesNotMatch(source, /uses:\s*[^\n]*release-action/i);
});

test('README exposes binary installation and update limitations', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /releases\/latest/);
  assert.match(readme, /tabboard-vX\.Y\.Z\.zip/);
  assert.match(readme, /Load unpacked/);
  assert.match(readme, /does not update automatically/i);
  assert.match(readme, /Chrome Web Store.*pending/i);
});

test('privacy policy states local storage and no network transfer', async () => {
  const privacy = await readFile(
    new URL('../PRIVACY.md', import.meta.url),
    'utf8',
  );
  assert.match(privacy, /chrome\.storage\.local/);
  assert.match(privacy, /local folder/i);
  assert.match(privacy, /does not make network requests/i);
  assert.match(privacy, /does not sell/i);
});

test('release dependencies resolve from the public npm registry', async () => {
  const lockfile = await readFile(
    new URL('../package-lock.json', import.meta.url),
    'utf8',
  );
  const npmrc = await readFile(new URL('../.npmrc', import.meta.url), 'utf8');
  assert.doesNotMatch(lockfile, /bnpm\.byted\.org|bytedance\.net/);
  assert.equal(npmrc.trim(), 'registry=https://registry.npmjs.org/');
});
