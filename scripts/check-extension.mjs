import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, sep } from "node:path";

const PROJECT_ROOT = realpathSync(".");

function listRegularFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed: ${path}`);
    }
    if (entry.isDirectory()) {
      return listRegularFiles(path);
    }
    return entry.isFile() ? [path] : [];
  });
}

function assertRegularProjectFile(path) {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Expected regular project file: ${path}`);
  }

  const projectRelativePath = relative(PROJECT_ROOT, realpathSync(path));
  const isInsideProject = projectRelativePath
    && projectRelativePath !== ".."
    && !projectRelativePath.startsWith(`..${sep}`)
    && !isAbsolute(projectRelativePath);
  if (!isInsideProject) {
    throw new Error(`File escapes project root: ${path}`);
  }
}

function validateVendorChecksums(vendorFiles) {
  const checksumLines = readFileSync("vendor/webawesome/SHA256SUMS", "utf8").trim().split("\n");
  const expectedChecksums = new Map(checksumLines.map((line) => {
    const match = line.match(/^([a-f0-9]{64})  (dist\/.+)$/);
    if (!match) {
      throw new Error(`Invalid Web Awesome checksum line: ${line}`);
    }
    return [match[2], match[1]];
  }));

  if (expectedChecksums.size !== vendorFiles.length) {
    throw new Error("Web Awesome checksum manifest does not match vendored file count");
  }

  for (const file of vendorFiles) {
    const relativePath = relative("vendor/webawesome", file).split(sep).join("/");
    const actualChecksum = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (expectedChecksums.get(relativePath) !== actualChecksum) {
      throw new Error(`Web Awesome checksum mismatch: ${relativePath}`);
    }
  }
}

assertRegularProjectFile("manifest.json");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const vendorFiles = listRegularFiles("vendor/webawesome/dist");
const testFiles = readdirSync("tests", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => join("tests", entry.name));
const requiredFiles = [
  "manager.html",
  "options.html",
  "popup.html",
  manifest.background.service_worker,
  "src/manager.js",
  "src/options.js",
  "src/popup.js",
  "src/model.js",
  "src/store.js",
  "src/styles.css",
  "scripts/verify-webawesome-provenance.mjs",
  "tests/fixtures/webawesome-manager-smoke.html",
  "tests/fixtures/webawesome-manager-smoke-entry.js",
  "vendor/webawesome/LICENSE.md",
  "vendor/webawesome/SHA256SUMS",
  "vendor/webawesome/SOURCE.md",
  "vendor/webawesome/VERSION",
  "vendor/webawesome/dist/styles/webawesome.css",
  "vendor/webawesome/dist/webawesome.js",
  "vendor/webawesome/dist/webawesome.loader.js",
  "vendor/webawesome/dist/components/button/button.js",
  "vendor/webawesome/dist/components/tooltip/tooltip.js",
  "vendor/heroicons/LICENSE",
  "vendor/heroicons/SOURCE.md",
  ...vendorFiles,
  ...Object.values(manifest.chrome_url_overrides || {}),
  ...Object.values(manifest.icons)
];

for (const file of requiredFiles) {
  assertRegularProjectFile(file);
}

validateVendorChecksums(vendorFiles);

for (const file of requiredFiles.filter((file) => /\.m?js$/.test(file))) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const test = spawnSync(process.execPath, ["--test", ...testFiles], { stdio: "inherit" });
if (test.status !== 0) {
  process.exit(test.status || 1);
}

console.log(`ZipTab ${manifest.version} extension check passed`);
