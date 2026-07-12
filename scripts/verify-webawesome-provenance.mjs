import { createHash, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_NAME = "@awesome.me/webawesome";
const EXPECTED_VERSION = "3.10.0";
const EXPECTED_TARBALL_URL = "https://registry.npmjs.org/@awesome.me/webawesome/-/webawesome-3.10.0.tgz";
const EXPECTED_INTEGRITY = "sha512-QrVKGTiz9OhtIoDic7RF6o1x5ShnJI7jgxK93uoSBh3INYlUyejKYXohXqpJ2cgjIJqfo0jMSQygd1Ty96QOMA==";
const EXPECTED_TARBALL_SHA256 = "95487f23ce9363fad926e27752b7538349a4f327d546cab130f5178798697796";
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_TARBALL_BYTES = 20 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 30 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5000;
const MAX_RESPONSE_CHUNKS = 4096;
const REQUEST_TIMEOUT_MS = 30_000;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_ROOT = join(PROJECT_ROOT, "vendor/webawesome");
const REGISTRY_ROOT = "https://registry.npmjs.org";

function listTreeEntries(root, directory = root) {
  const rootStats = lstatSync(directory);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error(`Expected a regular provenance directory: ${directory}`);
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    const stats = lstatSync(path);
    const relativePath = relative(root, path).split(sep).join("/");
    if (stats.isSymbolicLink()) {
      throw new Error(`Symbolic links are not allowed in provenance trees: ${path}`);
    }
    if (stats.isDirectory()) {
      return [
        { path: `${relativePath}/`, type: "directory", size: 0 },
        ...listTreeEntries(root, path)
      ];
    }
    if (stats.isFile()) {
      return [{ path: relativePath, type: "file", size: stats.size }];
    }
    throw new Error(`Unsupported provenance tree entry: ${path}`);
  });
}

function sourceValue(source, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^- ${escapedLabel}: ` + "`?([^`\\n]+)`?$", "m"));
  if (!match) {
    throw new Error(`Missing ${label} in vendor/webawesome/SOURCE.md`);
  }
  return match[1];
}

function assertPathInside(root, path) {
  const rootRealPath = realpathSync(root);
  const relativePath = relative(rootRealPath, realpathSync(path));
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Provenance path escapes expected root: ${path}`);
  }
}

export function assertRegularDirectory(path, root) {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`Expected a regular directory: ${path}`);
  }
  assertPathInside(root, path);
}

export function readBoundedRegularText(path, root, maximumBytes) {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Expected a regular file: ${path}`);
  }
  assertPathInside(root, path);
  if (stats.size > maximumBytes) {
    throw new Error(`Provenance file exceeds the ${maximumBytes}-byte limit: ${path}`);
  }
  return readFileSync(path, "utf8");
}

export function verifyBufferIntegrity(contents, integrity) {
  const candidate = String(integrity)
    .trim()
    .split(/\s+/)
    .find((value) => value.startsWith("sha512-"));
  if (!candidate) {
    throw new Error("Expected sha512 registry integrity");
  }

  const expected = Buffer.from(candidate.slice("sha512-".length), "base64");
  const actual = createHash("sha512").update(contents).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Web Awesome registry integrity mismatch");
  }
}

export function removeRemoteFontImport(source) {
  return source.replace(
    /^@import\s+url\((['"]?)https:\/\/fonts\.bunny\.net\/[^)]*\1\);\r?\n?/gm,
    ""
  );
}

export function validateArchiveEntries(entries) {
  if (!Array.isArray(entries) || entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("Web Awesome archive has too many entries");
  }

  let totalBytes = 0;
  for (const entry of entries) {
    if (!entry || !["file", "directory"].includes(entry.type)) {
      throw new Error(`Unsupported archive entry type: ${entry?.type || "unknown"}`);
    }
    const path = String(entry.path || "");
    const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
    const segments = normalizedPath.split("/");
    const isUnsafePath = !normalizedPath
      || normalizedPath.startsWith("/")
      || /^[a-z]:/i.test(normalizedPath)
      || normalizedPath.includes("\\")
      || segments.some((segment) => !segment || segment === "." || segment === "..");
    if (isUnsafePath) {
      throw new Error(`Unsafe archive path: ${path}`);
    }

    const size = Number(entry.size);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Invalid archive entry size: ${path}`);
    }
    totalBytes += size;
    if (totalBytes > MAX_UNPACKED_BYTES) {
      throw new Error("Web Awesome archive exceeds the unpacked size limit");
    }
  }
}

export function validateRegistrySizeMetadata({ fileCount, unpackedSize } = {}) {
  const values = [fileCount, unpackedSize];
  if (values.some((value) => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid npm registry size metadata");
  }
  if (values[0] > MAX_ARCHIVE_ENTRIES || values[1] > MAX_UNPACKED_BYTES) {
    throw new Error("npm registry metadata exceeds Web Awesome safety limits");
  }
}

export function compareFileTrees(expectedRoot, actualRoot) {
  const expectedEntries = new Map(listTreeEntries(expectedRoot).map((entry) => [entry.path, entry]));
  const actualEntries = new Map(listTreeEntries(actualRoot).map((entry) => [entry.path, entry]));
  const paths = [...new Set([...expectedEntries.keys(), ...actualEntries.keys()])].sort();

  return paths.filter((path) => {
    const expected = expectedEntries.get(path);
    const actual = actualEntries.get(path);
    if (!expected || !actual || expected.type !== actual.type) {
      return true;
    }
    if (expected.type === "directory") {
      return false;
    }
    return !readFileSync(join(expectedRoot, path)).equals(readFileSync(join(actualRoot, path)));
  });
}

function runTar(argumentsList, description) {
  const result = spawnSync("tar", argumentsList, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`Unable to ${description}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function readArchiveEntries(archivePath) {
  const paths = runTar(["-tzf", archivePath], "list Web Awesome archive paths")
    .split("\n")
    .filter(Boolean);
  const verboseLines = runTar(["-tvzf", archivePath], "inspect Web Awesome archive entries")
    .split("\n")
    .filter(Boolean);
  if (paths.length !== verboseLines.length) {
    throw new Error("Web Awesome archive listing is ambiguous");
  }

  return paths.map((path, index) => {
    const fields = verboseLines[index].trim().split(/\s+/);
    const marker = fields[0]?.[0];
    const type = marker === "-" ? "file" : marker === "d" ? "directory" : "unsupported";
    const sizeField = fields[1]?.includes("/") ? fields[2] : fields[4];
    const size = Number(sizeField);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Unable to read archive entry size: ${path}`);
    }
    return { path, type, size };
  });
}

function validateExtractedTree(root) {
  const entries = listTreeEntries(root);
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (entries.length > MAX_ARCHIVE_ENTRIES || totalBytes > MAX_UNPACKED_BYTES) {
    throw new Error("Extracted Web Awesome tree exceeds safety limits");
  }
}

async function fetchRequired(url, description) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch ${description}: ${response.status} ${response.statusText}`);
  }
  return response;
}

async function readLimitedResponse(response, maximumBytes, description) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maximumBytes) {
    throw new Error(`${description} exceeds the ${maximumBytes}-byte limit`);
  }
  if (!response.body) {
    throw new Error(`${description} response has no body`);
  }

  const reader = response.body.getReader();
  let chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (chunks.length >= MAX_RESPONSE_CHUNKS) {
      await reader.cancel();
      throw new Error(`${description} uses too many response chunks`);
    }
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error(`${description} exceeds the ${maximumBytes}-byte limit`);
    }
    chunks = [...chunks, Buffer.from(value)];
  }
  return Buffer.concat(chunks, totalBytes);
}

export async function verifyWebAwesomeProvenance() {
  assertRegularDirectory(VENDOR_ROOT, PROJECT_ROOT);
  assertRegularDirectory(join(VENDOR_ROOT, "dist"), VENDOR_ROOT);
  const version = readBoundedRegularText(join(VENDOR_ROOT, "VERSION"), VENDOR_ROOT, 32).trim();
  const source = readBoundedRegularText(join(VENDOR_ROOT, "SOURCE.md"), VENDOR_ROOT, MAX_METADATA_BYTES);
  if (version !== EXPECTED_VERSION) {
    throw new Error("Vendored Web Awesome version differs from the executable pin");
  }
  if (sourceValue(source, "Package") !== `${PACKAGE_NAME}@${EXPECTED_VERSION}`
      || sourceValue(source, "Registry tarball") !== EXPECTED_TARBALL_URL
      || sourceValue(source, "npm integrity") !== EXPECTED_INTEGRITY
      || sourceValue(source, "Tarball SHA-256") !== EXPECTED_TARBALL_SHA256) {
    throw new Error("Documented Web Awesome provenance differs from the executable pin");
  }

  const metadataUrl = `${REGISTRY_ROOT}/${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(EXPECTED_VERSION)}`;
  const metadataResponse = await fetchRequired(metadataUrl, "npm package metadata");
  const metadata = JSON.parse(
    (await readLimitedResponse(metadataResponse, MAX_METADATA_BYTES, "npm package metadata")).toString("utf8")
  );
  if (metadata.name !== PACKAGE_NAME || metadata.version !== EXPECTED_VERSION) {
    throw new Error("npm registry metadata does not match the pinned Web Awesome package");
  }
  if (metadata.dist?.tarball !== EXPECTED_TARBALL_URL || metadata.dist?.integrity !== EXPECTED_INTEGRITY) {
    throw new Error("npm registry metadata differs from the executable Web Awesome pin");
  }
  validateRegistrySizeMetadata(metadata.dist);

  const tarballResponse = await fetchRequired(EXPECTED_TARBALL_URL, "Web Awesome tarball");
  const tarball = await readLimitedResponse(tarballResponse, MAX_TARBALL_BYTES, "Web Awesome tarball");
  verifyBufferIntegrity(tarball, EXPECTED_INTEGRITY);

  const actualTarballSha256 = createHash("sha256").update(tarball).digest("hex");
  if (actualTarballSha256 !== EXPECTED_TARBALL_SHA256) {
    throw new Error("Web Awesome tarball SHA-256 mismatch");
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), "ziptab-webawesome-provenance-"));
  try {
    const archivePath = join(temporaryRoot, "webawesome.tgz");
    const extractedRoot = join(temporaryRoot, "extracted");
    writeFileSync(archivePath, tarball);
    validateArchiveEntries(readArchiveEntries(archivePath));
    mkdirSync(extractedRoot);
    runTar(
      [
        "-xzf",
        archivePath,
        "-C",
        extractedRoot,
        "--no-same-owner",
        "--no-same-permissions",
        "package/dist-cdn"
      ],
      "extract Web Awesome tarball"
    );
    validateExtractedTree(extractedRoot);

    const upstreamRoot = join(extractedRoot, "package/dist-cdn");
    const upstreamAwesomeTheme = join(upstreamRoot, "styles/themes/awesome.css");
    assertPathInside(extractedRoot, upstreamRoot);
    assertPathInside(upstreamRoot, upstreamAwesomeTheme);
    const patchedTheme = removeRemoteFontImport(readFileSync(upstreamAwesomeTheme, "utf8"));
    writeFileSync(upstreamAwesomeTheme, patchedTheme);

    const mismatches = compareFileTrees(upstreamRoot, join(VENDOR_ROOT, "dist"));
    if (mismatches.length) {
      const preview = mismatches.slice(0, 20).join(", ");
      const remainder = mismatches.length > 20 ? ` (+${mismatches.length - 20} more)` : "";
      throw new Error(`Vendored Web Awesome tree differs from patched upstream: ${preview}${remainder}`);
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  console.log(`Web Awesome ${EXPECTED_VERSION} provenance verified against npm registry metadata`);
}

const isDirectRun = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  await verifyWebAwesomeProvenance();
}
