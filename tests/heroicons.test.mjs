import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const iconsSource = readFileSync(new URL("../src/icons.js", import.meta.url), "utf8");
const checkerSource = readFileSync(new URL("../scripts/check-extension.mjs", import.meta.url), "utf8");

const heroiconsSourceUrl = new URL("../vendor/heroicons/SOURCE.md", import.meta.url);
const heroiconsLicenseUrl = new URL("../vendor/heroicons/LICENSE", import.meta.url);

test("vendors Heroicons 20 Solid with local provenance", () => {
  assert.equal(existsSync(heroiconsSourceUrl), true);
  assert.equal(existsSync(heroiconsLicenseUrl), true);
  assert.match(readFileSync(heroiconsSourceUrl, "utf8"), /heroicons@2\.2\.0/);
  assert.match(readFileSync(heroiconsLicenseUrl, "utf8"), /MIT License/);
  assert.match(checkerSource, /vendor\/heroicons\/SOURCE\.md/);
  assert.match(checkerSource, /vendor\/heroicons\/LICENSE/);
});

test("uses one local Heroicons solid SVG contract", () => {
  assert.match(iconsSource, /viewBox", "0 0 20 20"/);
  assert.match(iconsSource, /fill", "currentColor"/);
  assert.doesNotMatch(iconsSource, /stroke", "currentColor"|stroke-width|stroke-linecap|stroke-linejoin/);
  assert.match(iconsSource, /['"]globe-alt['"]/);
  assert.match(iconsSource, /['"]window['"]/);
  assert.doesNotMatch(iconsSource, /fontawesome|ka-f\.fontawesome|fonts\.bunny/i);
});
