import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const NORD_PRIMITIVES = [
  "--nord0: #2e3440",
  "--nord1: #3b4252",
  "--nord2: #434c5e",
  "--nord3: #4c566a",
  "--nord4: #d8dee9",
  "--nord5: #e5e9f0",
  "--nord6: #eceff4",
  "--nord7: #8fbcbb",
  "--nord8: #88c0d0",
  "--nord9: #81a1c1",
  "--nord10: #5e81ac",
  "--nord11: #bf616a",
  "--nord12: #d08770",
  "--nord13: #ebcb8b",
  "--nord14: #a3be8c",
  "--nord15: #b48ead"
];

const SEMANTIC_TOKENS = [
  "--zt-canvas",
  "--zt-surface",
  "--zt-surface-raised",
  "--zt-surface-subtle",
  "--zt-text",
  "--zt-text-muted",
  "--zt-border-control",
  "--zt-border-subtle",
  "--zt-accent",
  "--zt-accent-text",
  "--zt-accent-solid",
  "--zt-on-accent",
  "--zt-selection",
  "--zt-focus-outer",
  "--zt-focus-inner",
  "--zt-danger",
  "--zt-danger-text",
  "--zt-danger-solid",
  "--zt-on-danger",
  "--zt-warning",
  "--zt-success"
];

function countTopLevelRules(source, selector) {
  let depth = 0;
  let count = 0;

  for (const line of source.split("\n")) {
    if (depth === 0 && line.trim() === `${selector} {`) {
      count += 1;
    }

    depth += (line.match(/{/g) || []).length;
    depth -= (line.match(/}/g) || []).length;
  }

  return count;
}

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f0-9]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

test("defines the complete Nord palette and ZipTab semantic theme tokens", () => {
  const normalizedStyles = styles.toLowerCase();

  for (const primitive of NORD_PRIMITIVES) {
    assert.match(normalizedStyles, new RegExp(primitive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const token of SEMANTIC_TOKENS) {
    assert.match(styles, new RegExp(`${token}:`));
  }

  assert.match(styles, /:root\[data-theme="dark"\][\s\S]*--zt-canvas: var\(--nord0\)/);
  assert.match(styles, /:root:not\(\[data-theme="light"\]\)[\s\S]*--zt-accent-solid: var\(--nord8\)/);
});

test("maps legacy ZipTab and Web Awesome tokens to the semantic theme", () => {
  assert.match(styles, /--bg: var\(--zt-canvas\)/);
  assert.match(styles, /--surface: var\(--zt-surface-raised\)/);
  assert.match(styles, /--ink: var\(--zt-text\)/);
  assert.match(styles, /--accent: var\(--zt-accent\)/);
  assert.match(styles, /--wa-color-surface-default: var\(--zt-surface-raised\)/);
  assert.match(styles, /--wa-color-surface-border: var\(--zt-border-subtle\)/);
  assert.match(styles, /--wa-color-text-normal: var\(--zt-text\)/);
  assert.match(styles, /--wa-color-brand-fill-loud: var\(--zt-accent-solid\)/);
  assert.match(styles, /--wa-color-brand-on-loud: var\(--zt-on-accent\)/);
  assert.match(styles, /--wa-color-focus: var\(--zt-focus-inner\)/);
  assert.match(styles, /--wa-form-control-height: 40px/);
  assert.match(styles, /--wa-form-control-border-radius: 10px/);
});

test("keeps light and dark accent text pairings at WCAG AA contrast", () => {
  assert.ok(contrastRatio("#506a8c", "#e5e9f0") >= 4.5);
  assert.ok(contrastRatio("#506a8c", "#eceff4") >= 4.5);
  assert.ok(contrastRatio("#2e3440", "#88c0d0") >= 4.5);

  assert.match(styles, /--zt-accent-text: #506a8c/);
  assert.match(styles, /--zt-accent-solid: var\(--zt-accent-text\)/);
  assert.match(styles, /button\.primary\s*{[\s\S]*?background: var\(--zt-accent-solid\)/);
  assert.match(styles, /button\.primary\s*{[\s\S]*?color: var\(--zt-on-accent\)/);
  assert.match(styles, /\.eyebrow\s*{[\s\S]*?color: var\(--zt-accent-text\)/);
  assert.match(styles, /\.top-category-list \.folder-button\.active\s*{[\s\S]*?background: var\(--zt-accent-solid\)/);
});

test("keeps danger text and filled feedback at WCAG AA contrast", () => {
  assert.ok(contrastRatio("#a94450", "#e5e9f0") >= 4.5);
  assert.ok(contrastRatio("#edb6bb", "#434c5e") >= 4.5);
  assert.ok(contrastRatio("#eceff4", "#a94450") >= 4.5);

  assert.match(styles, /--zt-danger-text: #a94450/);
  assert.match(styles, /--zt-danger-solid: #a94450/);
  assert.match(styles, /--zt-on-danger: var\(--nord6\)/);
  assert.match(styles, /:root\[data-theme="dark"\][\s\S]*--zt-danger-text: #edb6bb/);
  assert.match(styles, /\.toast\.error\s*{[\s\S]*?background: var\(--zt-danger-solid\);[\s\S]*?color: var\(--zt-on-danger\)/);
});

test("removes legacy manager colors, glass effects, and duplicate base rules", () => {
  assert.doesNotMatch(styles, /#4d9dfc|#0d766d|#65b3a4|#111816|#18231f/i);
  assert.equal(countTopLevelRules(styles, ".manager-board-shell"), 1);
  assert.equal(countTopLevelRules(styles, ".manager-topbar"), 1);
  assert.equal(countTopLevelRules(styles, ".board-workspace"), 1);

  const managerSection = styles.slice(styles.indexOf("/* Manager shell */"));
  assert.notEqual(managerSection.length, styles.length - 1, "Missing consolidated Manager section");
  assert.doesNotMatch(managerSection, /radial-gradient|backdrop-filter/);
  assert.doesNotMatch(styles, /color: var\(--accent\)/);
  assert.doesNotMatch(styles, /rgba\((?:10, 18, 15|33, 51, 45),/);
});
