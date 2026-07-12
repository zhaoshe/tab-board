import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const popupCss = readFileSync(new URL("../src/popup.css", import.meta.url), "utf8");
const optionsCss = readFileSync(new URL("../src/options.css", import.meta.url), "utf8");
const popupHtml = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const optionsHtml = readFileSync(new URL("../options.html", import.meta.url), "utf8");

test("aligns Popup surfaces and primary actions with Nord semantic tokens", () => {
  assert.match(popupCss, /\.popup-body[\s\S]*background: var\(--zt-canvas\)/);
  assert.match(popupCss, /\.popup-quick-action\.primary[\s\S]*background: var\(--zt-accent-solid\)/);
  assert.match(popupCss, /\.popup-quick-action\.primary[\s\S]*color: var\(--zt-on-accent\)/);
  assert.match(popupCss, /\.popup-row[\s\S]*background: var\(--zt-surface-raised\)/);
  assert.match(popupCss, /\.popup-preview[\s\S]*background: var\(--zt-surface-raised\)/);
  assert.match(popupCss, /border-radius: var\(--radius-control\)/);
  assert.doesNotMatch(popupCss, /color:\s*white|#fff(?:fff)?/i);
});

test("aligns Options cards and segmented controls with the 40px Nord contract", () => {
  assert.match(optionsCss, /\.options-section-advanced[\s\S]*border-top: 1px solid var\(--zt-border-subtle\)/);
  assert.match(optionsCss, /\.settings-card[\s\S]*border: 1px solid var\(--zt-border-subtle\)/);
  assert.match(optionsCss, /\.settings-card[\s\S]*background: var\(--zt-surface-raised\)/);
  assert.match(optionsCss, /\.check-row[\s\S]*min-height: var\(--manager-control-height\)/);
  assert.match(optionsCss, /\.segmented label[\s\S]*min-height: var\(--manager-control-height\)/);
  assert.match(optionsCss, /\.segmented label\.active[\s\S]*background: var\(--zt-accent-solid\)/);
  assert.match(optionsCss, /\.segmented label\.active[\s\S]*color: var\(--zt-on-accent\)/);
});

test("shows a visible focus ring around keyboard-focused segmented options", () => {
  assert.match(
    optionsCss,
    /\.segmented label:has\(input:focus-visible\)\s*{[\s\S]*?outline: 3px solid var\(--zt-focus-inner\);[\s\S]*?outline-offset: 2px;/
  );
});

test("preserves Popup and Options information architecture", () => {
  for (const id of ["popupActions", "popupSearch", "popupSessionList"]) {
    assert.match(popupHtml, new RegExp(`id="${id}"`));
  }
  for (const id of ["basicSettingsGrid", "advancedSettingsGrid"]) {
    assert.match(optionsHtml, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(`${popupHtml}\n${optionsHtml}`, /wa-card|https?:\/\//i);
});
