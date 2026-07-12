import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const VENDOR_ROOT = resolve(ROOT, "vendor/webawesome");
const DIST_ROOT = resolve(VENDOR_ROOT, "dist");
const SMOKE_HTML = resolve(ROOT, "tests/fixtures/webawesome-manager-smoke.html");
const SMOKE_ENTRY = resolve(ROOT, "tests/fixtures/webawesome-manager-smoke-entry.js");
const REMOTE_REFERENCE = /^(?:https?:)?\/\//i;
const BARE_IMPORT = /^(?![./])/;

const REQUIRED_VENDOR_FILES = [
  "LICENSE.md",
  "SHA256SUMS",
  "SOURCE.md",
  "VERSION",
  "dist/styles/webawesome.css",
  "dist/webawesome.js",
  "dist/webawesome.loader.js",
  "dist/components/button/button.js",
  "dist/components/tooltip/tooltip.js"
];

function readText(path) {
  return readFileSync(path, "utf8");
}

function assertRegularFile(path) {
  assert.equal(existsSync(path), true, `Missing file: ${path}`);
  const stats = lstatSync(path);
  assert.equal(stats.isSymbolicLink(), false, `Symbolic links are not allowed: ${path}`);
  assert.equal(stats.isFile(), true, `Expected regular file: ${path}`);
}

function moduleReferences(source) {
  const references = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\sfrom\s*)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      references.push(match[1]);
    }
  }
  return references;
}

function cssReferences(source) {
  const references = [];
  for (const match of source.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s]+)["']?\s*\)?/g)) {
    references.push(match[1]);
  }
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    references.push(match[1].trim());
  }
  return references;
}

function resolveLocalReference(fromPath, reference, { allowBare = false } = {}) {
  assert.equal(REMOTE_REFERENCE.test(reference), false, `Remote reference in ${fromPath}: ${reference}`);
  if (!allowBare) {
    assert.equal(BARE_IMPORT.test(reference), false, `Bare import in ${fromPath}: ${reference}`);
  }
  const resolved = resolve(dirname(fromPath), reference.split(/[?#]/, 1)[0]);
  const resolvedRealPath = realpathSync(resolved);
  const vendorRelativePath = relative(realpathSync(DIST_ROOT), resolvedRealPath);
  const isInsideVendor = vendorRelativePath
    && vendorRelativePath !== ".."
    && !vendorRelativePath.startsWith(`..${sep}`)
    && !isAbsolute(vendorRelativePath);
  assert.ok(isInsideVendor, `Reference escapes vendor root: ${reference}`);
  assertRegularFile(resolved);
  return resolved;
}

function walkModuleGraph(entries) {
  const pending = [...entries];
  const visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) {
      continue;
    }
    visited.add(path);
    for (const reference of moduleReferences(readText(path))) {
      pending.push(resolveLocalReference(path, reference));
    }
  }
  return visited;
}

function walkCssGraph(entries) {
  const pending = [...entries];
  const visited = new Set();
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) {
      continue;
    }
    visited.add(path);
    for (const reference of cssReferences(readText(path))) {
      if (reference.startsWith("data:")) {
        continue;
      }
      const resolved = resolveLocalReference(path, reference, { allowBare: true });
      if (resolved.endsWith(".css")) {
        pending.push(resolved);
      }
    }
  }
  return visited;
}

test("vendors the complete pinned Web Awesome smoke dependencies locally", () => {
  for (const relativePath of REQUIRED_VENDOR_FILES) {
    assertRegularFile(resolve(VENDOR_ROOT, relativePath));
  }
  assert.equal(readText(resolve(VENDOR_ROOT, "VERSION")).trim(), "3.10.0");

  const source = readText(resolve(VENDOR_ROOT, "SOURCE.md"));
  const checksums = readText(resolve(VENDOR_ROOT, "SHA256SUMS")).trim().split("\n");
  assert.match(source, /@awesome\.me\/webawesome@3\.10\.0/);
  assert.match(source, /sha512-QrVKGTiz9OhtIoDic7RF6o1x5ShnJI7jgxK93uoSBh3INYlUyejKYXohXqpJ2cgjIJqfo0jMSQygd1Ty96QOMA==/);
  assert.match(source, /95487f23ce9363fad926e27752b7538349a4f327d546cab130f5178798697796/);
  assert.match(source, /fonts\.bunny\.net/);
  assert.ok(checksums.length > 100, "Expected complete vendored file checksums");
  for (const checksum of checksums) {
    assert.match(checksum, /^[a-f0-9]{64}  dist\//);
  }
});

test("keeps the vendored runtime visible to Git and free of remote theme imports", () => {
  const gitignore = readText(resolve(ROOT, ".gitignore"));
  const awesomeTheme = readText(resolve(DIST_ROOT, "styles/themes/awesome.css"));

  assert.match(gitignore, /!vendor\/webawesome\/dist\//);
  assert.match(gitignore, /!vendor\/webawesome\/dist\/\*\*/);
  assert.doesNotMatch(awesomeTheme, /@import[^;]+https?:\/\//i);
});

test("resolves the actual smoke HTML entry and its local dependency graphs", () => {
  const html = readText(SMOKE_HTML);
  const scriptReference = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  const styleReference = html.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i)?.[1];

  assert.ok(scriptReference, "Expected smoke module script");
  assert.ok(styleReference, "Expected smoke stylesheet");

  const scriptPath = resolve(dirname(SMOKE_HTML), scriptReference);
  const stylePath = resolve(dirname(SMOKE_HTML), styleReference);
  assert.equal(scriptPath, SMOKE_ENTRY);
  assertRegularFile(scriptPath);
  assertRegularFile(stylePath);

  const modules = walkModuleGraph([scriptPath]);
  const styles = walkCssGraph([stylePath]);
  assert.ok(modules.has(resolve(DIST_ROOT, "components/button/button.js")));
  assert.ok(modules.has(resolve(DIST_ROOT, "components/tooltip/tooltip.js")));
  assert.ok(styles.has(resolve(DIST_ROOT, "styles/webawesome.css")));
});

test("uses path-boundary checks instead of string prefixes for vendor references", () => {
  assert.doesNotMatch(resolveLocalReference.toString(), /startsWith\(DIST_ROOT\)/);
  assert.match(resolveLocalReference.toString(), /realpathSync\(/);
  assert.match(resolveLocalReference.toString(), /relative\(/);
});

test("resolves the Web Awesome JavaScript and CSS smoke graphs without remote assets", () => {
  const modules = walkModuleGraph([
    resolve(DIST_ROOT, "webawesome.js"),
    resolve(DIST_ROOT, "components/button/button.js"),
    resolve(DIST_ROOT, "components/tooltip/tooltip.js")
  ]);
  const styles = walkCssGraph([resolve(DIST_ROOT, "styles/webawesome.css")]);

  assert.ok(modules.size > 3, "Expected transitive Web Awesome JavaScript modules");
  assert.ok(styles.size > 1, "Expected transitive Web Awesome stylesheets");
});

test("keeps the Web Awesome smoke surface isolated from production manager controls", () => {
  assertRegularFile(SMOKE_HTML);
  assertRegularFile(SMOKE_ENTRY);

  const html = readText(SMOKE_HTML);
  const entry = readText(SMOKE_ENTRY);
  const managerHtml = readText(resolve(ROOT, "manager.html"));
  const managerSource = readText(resolve(ROOT, "src/manager.js"));

  assert.match(html, /<wa-button\s+id="phase0SmokeButton"/);
  assert.match(html, /<wa-tooltip\s+for="phase0SmokeButton"/);
  assert.match(html, /vendor\/webawesome\/dist\/styles\/webawesome\.css/);
  assert.match(entry, /setBasePath\(/);
  assert.match(entry, /components\/button\/button\.js/);
  assert.match(entry, /components\/tooltip\/tooltip\.js/);
  assert.doesNotMatch(entry, /https?:\/\//i);
  assert.doesNotMatch(entry, /@awesome\.me\/webawesome/);
  assert.doesNotMatch(managerHtml, /<wa-(?:button|tooltip)\b/);
  assert.match(managerSource, /iconOnlyButton\(/);
  assert.match(managerSource, /iconTextButton\(/);
});

test("keeps the MV3 manifest unchanged and validates Web Awesome files in the extension checker", () => {
  const manifest = JSON.parse(readText(resolve(ROOT, "manifest.json")));
  const packageJson = JSON.parse(readText(resolve(ROOT, "package.json")));
  const checker = readText(resolve(ROOT, "scripts/check-extension.mjs"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.chrome_url_overrides.newtab, "manager.html");
  assert.match(checker, /assertRegularProjectFile\("manifest\.json"\);\s*const manifest = JSON\.parse/);
  assert.doesNotMatch(JSON.stringify(manifest), /https?:\/\//i);
  assert.equal(packageJson.scripts.test, "node --test tests/*.test.mjs");
  assert.equal(packageJson.scripts["verify:vendor"], "node scripts/verify-webawesome-provenance.mjs");
  assert.match(checker, /scripts\/verify-webawesome-provenance\.mjs/);
  assert.match(checker, /tests\/fixtures\/webawesome-manager-smoke\.html/);
  assert.match(checker, /vendor\/webawesome\/dist/);
  assert.match(checker, /vendor\/webawesome\/LICENSE\.md/);
  assert.match(checker, /vendor\/webawesome\/SHA256SUMS/);
  assert.match(checker, /vendor\/webawesome\/SOURCE\.md/);
  assert.match(checker, /vendor\/webawesome\/VERSION/);
  assert.match(checker, /createHash\("sha256"\)/);
  assert.match(checker, /const testFiles =/);
  assert.match(checker, /\["--test", \.\.\.testFiles\]/);
  assert.match(checker, /lstatSync\(/);
  assert.match(checker, /realpathSync\(/);
  assert.match(checker, /relative\(/);
  assert.match(checker, /isSymbolicLink\(\)/);
  assert.doesNotMatch(checker, /\["--test"\]\s*,/);
});
