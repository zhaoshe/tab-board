import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, sep } from "node:path";

const PROJECT_ROOT = realpathSync(".");
const DIST_ROOT = "dist";

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

function assertRegularDirectory(path) {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`Expected regular directory: ${path}`);
  }
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

function assertDistFile(path) {
  if (typeof path !== "string") {
    throw new Error(`Invalid dist path: ${path}`);
  }
  const normalizedPath = path.replaceAll("/", sep);
  if (!normalizedPath || isAbsolute(normalizedPath) || normalizedPath.split(sep).includes("..")) {
    throw new Error(`Invalid dist path: ${path}`);
  }
  assertRegularProjectFile(join(DIST_ROOT, normalizedPath));
}

function assertManifestIcons(manifest, root = "") {
  for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    if (!/^\d+$/.test(size) || typeof iconPath !== "string") {
      throw new Error(`Invalid icon manifest entry: ${size}`);
    }
    if (root) {
      assertDistFile(iconPath);
    } else {
      assertRegularProjectFile(iconPath);
    }
  }
}

function assetReferences(html) {
  return [...html.matchAll(/(?:src|href)="([^\"]+)"/g)]
    .map((match) => match[1])
    .filter((reference) => reference.startsWith("/assets/") || reference.startsWith("assets/"));
}

function assertBuiltPage(page, { requireModuleScript = false } = {}) {
  const path = join(DIST_ROOT, page);
  assertRegularProjectFile(path);
  const html = readFileSync(path, "utf8");
  const references = assetReferences(html);
  if (references.length === 0) {
    throw new Error(`Built ${page} does not reference dist assets`);
  }
  for (const reference of references) {
    assertDistFile(reference.replace(/^\//, ""));
  }

  if (requireModuleScript) {
    const moduleScript = [...html.matchAll(/<script\b([^>]*)><\/script>/g)]
      .map((match) => match[1])
      .find((attributes) => /\btype="module"/.test(attributes) && /\bsrc="[^\"]+"/.test(attributes));
    const scriptReference = moduleScript?.match(/\bsrc="([^\"]+)"/)?.[1];
    if (!scriptReference || !/(?:^|\/)assets\/[^/]+\.js$/.test(scriptReference)) {
      throw new Error(`Built ${page} does not reference a built module asset`);
    }
  }

  return html;
}

const sourceManifestPath = "manifest.json";
assertRegularProjectFile(sourceManifestPath);
const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
const requiredSourceFiles = [
  sourceManifestPath,
  sourceManifest.background.service_worker,
  "src/manager/main.tsx",
  "src/popup/main.tsx",
  "src/options/main.tsx",
  ...Object.values(sourceManifest.icons || {})
];

for (const file of requiredSourceFiles) {
  assertRegularProjectFile(file);
}

assertManifestIcons(sourceManifest);

assertRegularDirectory(DIST_ROOT);
assertRegularDirectory(join(DIST_ROOT, "assets"));
const builtAssetFiles = listRegularFiles(join(DIST_ROOT, "assets"));
if (builtAssetFiles.length === 0) {
  throw new Error("Built dist/assets directory is empty");
}

for (const page of ["manager.html", "popup.html", "options.html"]) {
  assertBuiltPage(page, { requireModuleScript: page === "manager.html" });
}

const builtManifestPath = join(DIST_ROOT, "manifest.json");
assertRegularProjectFile(builtManifestPath);
const builtManifest = JSON.parse(readFileSync(builtManifestPath, "utf8"));
if (builtManifest.manifest_version !== 3) {
  throw new Error("Built manifest must use Manifest V3");
}
for (const permission of sourceManifest.permissions || []) {
  if (!builtManifest.permissions?.includes(permission)) {
    throw new Error(`Built manifest dropped permission: ${permission}`);
  }
}
if (builtManifest.action?.default_popup !== "popup.html") {
  throw new Error("Built manifest action popup is invalid");
}
if (builtManifest.options_page !== "options.html") {
  throw new Error("Built manifest options page is invalid");
}
if (builtManifest.chrome_url_overrides?.newtab !== "manager.html") {
  throw new Error("Built manifest new-tab override is invalid");
}
assertDistFile(builtManifest.background?.service_worker);
assertManifestIcons(builtManifest, DIST_ROOT);
for (const iconPath of Object.values(builtManifest.action?.default_icon || {})) {
  assertDistFile(iconPath);
}

for (const file of [...requiredSourceFiles, ...builtAssetFiles]) {
  if (/\.m?js$/.test(file)) {
    const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
    if (result.status !== 0) {
      process.exit(result.status || 1);
    }
  }
}

console.log(`TabBoard ${builtManifest.version} extension check passed`);
