import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const managerHtml = readFileSync(new URL("../manager.html", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../src/manager.js", import.meta.url), "utf8");
const controlsSourceUrl = new URL("../src/webawesome-controls.js", import.meta.url);

const COMPONENT_IMPORTS = [
  "../vendor/webawesome/dist/components/input/input.js",
  "../vendor/webawesome/dist/components/select/select.js",
  "../vendor/webawesome/dist/components/option/option.js",
  "../vendor/webawesome/dist/components/dropdown/dropdown.js",
  "../vendor/webawesome/dist/components/dropdown-item/dropdown-item.js",
  "../vendor/webawesome/dist/components/tooltip/tooltip.js",
  "../vendor/webawesome/dist/components/popover/popover.js"
];

test("loads Web Awesome production controls only from local extension resources", () => {
  assert.match(
    managerHtml,
    /vendor\/webawesome\/dist\/styles\/webawesome\.css[\s\S]*src\/styles\.css/
  );
  assert.equal(existsSync(controlsSourceUrl), true);

  const controlsSource = readFileSync(controlsSourceUrl, "utf8");
  assert.match(controlsSource, /setBasePath\(new URL\("\.\.\/vendor\/webawesome\/dist\/", import\.meta\.url\)\.href\)/);
  for (const componentImport of COMPONENT_IMPORTS) {
    assert.match(controlsSource, new RegExp(componentImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(controlsSource, /https?:\/\//);
  assert.doesNotMatch(managerSource, /import ["']\.\/webawesome-controls\.js["']/);
  assert.match(
    managerHtml,
    /<script type="module" src="src\/webawesome-controls\.js"><\/script>\s*<script type="module" src="src\/manager\.js"><\/script>/
  );
});

test("migrates stable Manager shell controls without wrapping DnD product surfaces", () => {
  assert.match(managerHtml, /<wa-input[^>]*id="openTabsFilterInput"/s);
  assert.match(managerHtml, /<wa-input[^>]*id="searchInput"/s);
  assert.match(managerHtml, /<wa-select[^>]*id="windowSelect"/s);
  assert.match(managerHtml, /<wa-dropdown[^>]*id="workspaceMenu"/s);
  assert.match(managerSource, /h\(\s*"wa-option"/);
  assert.match(managerSource, /h\(\s*"wa-dropdown-item"/);
  assert.match(managerSource, /addEventListener\("wa-select", handleWebAwesomeSelect\)/);
  assert.doesNotMatch(`${managerHtml}\n${managerSource}`, /<wa-card|h\("wa-card"/);

  for (const dragContract of ["data-drag-kind", "data-drop", "group-insert-marker", "tab-drop-before", "tab-drop-after"]) {
    assert.match(managerSource, new RegExp(dragContract));
  }
});
