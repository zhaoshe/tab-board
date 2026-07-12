import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertRegularDirectory,
  compareFileTrees,
  readBoundedRegularText,
  removeRemoteFontImport,
  validateArchiveEntries,
  validateRegistrySizeMetadata,
  verifyBufferIntegrity
} from "../scripts/verify-webawesome-provenance.mjs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const verifierSource = readFileSync(new URL("../scripts/verify-webawesome-provenance.mjs", import.meta.url), "utf8");

test("verifies registry-provided Subresource Integrity values", () => {
  const contents = Buffer.from("trusted Web Awesome tarball");
  const integrity = `sha512-${createHash("sha512").update(contents).digest("base64")}`;

  assert.doesNotThrow(() => verifyBufferIntegrity(contents, integrity));
  assert.throws(
    () => verifyBufferIntegrity(Buffer.from("modified tarball"), integrity),
    /integrity mismatch/i
  );
});

test("applies only the documented remote-font removal patch", () => {
  const upstream = [
    "@import url('https://fonts.bunny.net/css?family=noto-sans:400,600');",
    ":root { color: #2e3440; }",
    ""
  ].join("\n");

  assert.equal(removeRemoteFontImport(upstream), ":root { color: #2e3440; }\n");
  assert.equal(removeRemoteFontImport(":root { color: #2e3440; }\n"), ":root { color: #2e3440; }\n");
});

test("compares patched upstream and vendored file trees", () => {
  const root = mkdtempSync(join(tmpdir(), "ziptab-webawesome-provenance-"));
  const upstreamRoot = join(root, "upstream");
  const vendorRoot = join(root, "vendor");

  try {
    mkdirSync(join(upstreamRoot, "components"), { recursive: true });
    mkdirSync(join(vendorRoot, "components"), { recursive: true });
    writeFileSync(join(upstreamRoot, "components/button.js"), "export const button = true;\n");
    writeFileSync(join(vendorRoot, "components/button.js"), "export const button = true;\n");

    assert.deepEqual(compareFileTrees(upstreamRoot, vendorRoot), []);

    mkdirSync(join(vendorRoot, "empty"));
    assert.deepEqual(compareFileTrees(upstreamRoot, vendorRoot), ["empty/"]);
    rmSync(join(vendorRoot, "empty"), { recursive: true });

    writeFileSync(join(vendorRoot, "components/button.js"), "export const button = false;\n");
    assert.deepEqual(compareFileTrees(upstreamRoot, vendorRoot), ["components/button.js"]);

    writeFileSync(join(vendorRoot, "components/button.js"), "export const button = true;\n");
    symlinkSync("button.js", join(vendorRoot, "components/link.js"));
    assert.throws(() => compareFileTrees(upstreamRoot, vendorRoot), /symbolic links/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unsafe archive entries before extraction", () => {
  assert.doesNotThrow(() => validateArchiveEntries([
    { path: "package/", type: "directory", size: 0 },
    { path: "package/dist-cdn/webawesome.js", type: "file", size: 1024 }
  ]));
  assert.throws(() => validateArchiveEntries([{ path: "../escape", type: "file" }]), /unsafe archive path/i);
  assert.throws(() => validateArchiveEntries([{ path: "/absolute", type: "file" }]), /unsafe archive path/i);
  assert.throws(
    () => validateArchiveEntries([{ path: "package/dist-cdn/theme.css", type: "symlink", size: 0 }]),
    /unsupported archive entry type/i
  );
  assert.throws(
    () => validateArchiveEntries([{ path: "package/dist-cdn/huge.bin", type: "file", size: 31 * 1024 * 1024 }]),
    /unpacked size/i
  );
});

test("reads provenance metadata only from bounded regular files", () => {
  const root = mkdtempSync(join(tmpdir(), "ziptab-webawesome-metadata-"));
  try {
    const versionPath = join(root, "VERSION");
    const linkPath = join(root, "VERSION-LINK");
    writeFileSync(versionPath, "3.10.0\n");
    symlinkSync("VERSION", linkPath);

    assert.equal(readBoundedRegularText(versionPath, root, 32), "3.10.0\n");
    assert.throws(() => readBoundedRegularText(linkPath, root, 32), /regular file/i);
    assert.throws(() => readBoundedRegularText(versionPath, root, 4), /byte limit/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a provenance root that is a symlink or leaves the project boundary", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "ziptab-webawesome-project-"));
  const externalRoot = mkdtempSync(join(tmpdir(), "ziptab-webawesome-external-"));
  try {
    const localVendorRoot = join(projectRoot, "vendor");
    const linkedVendorRoot = join(projectRoot, "linked-vendor");
    mkdirSync(localVendorRoot);
    symlinkSync(externalRoot, linkedVendorRoot);

    assert.doesNotThrow(() => assertRegularDirectory(localVendorRoot, projectRoot));
    assert.throws(() => assertRegularDirectory(linkedVendorRoot, projectRoot), /regular directory/i);
    assert.throws(() => assertRegularDirectory(externalRoot, projectRoot), /escapes expected root/i);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(externalRoot, { recursive: true, force: true });
  }
});

test("rejects missing or invalid npm registry size metadata", () => {
  assert.doesNotThrow(() => validateRegistrySizeMetadata({ fileCount: 2121, unpackedSize: 14048101 }));
  for (const metadata of [
    {},
    { fileCount: -1, unpackedSize: 100 },
    { fileCount: 1.5, unpackedSize: 100 },
    { fileCount: 10, unpackedSize: Number.NaN },
    { fileCount: "2121", unpackedSize: 14048101 },
    { fileCount: null, unpackedSize: 14048101 },
    { fileCount: false, unpackedSize: 14048101 },
    { fileCount: [2121], unpackedSize: 14048101 }
  ]) {
    assert.throws(() => validateRegistrySizeMetadata(metadata), /invalid npm registry size metadata/i);
  }
});

test("pins provenance in executable code and bounds network input", () => {
  assert.match(verifierSource, /const EXPECTED_VERSION = "3\.10\.0"/);
  assert.match(verifierSource, /const EXPECTED_INTEGRITY = "sha512-QrVKGTiz9OhtIoDic7RF6o1x5ShnJI7jgxK93uoSBh3INYlUyejKYXohXqpJ2cgjIJqfo0jMSQygd1Ty96QOMA=="/);
  assert.match(verifierSource, /sourceValue\(source, "Package"\)/);
  assert.match(verifierSource, /AbortSignal\.timeout\(/);
  assert.match(verifierSource, /MAX_TARBALL_BYTES/);
  assert.match(verifierSource, /MAX_UNPACKED_BYTES/);
});

test("exposes upstream provenance verification as an explicit release check", () => {
  assert.equal(packageJson.scripts["verify:vendor"], "node scripts/verify-webawesome-provenance.mjs");
  assert.equal(packageJson.scripts["check:release"], "npm run check && npm run verify:vendor");
});
