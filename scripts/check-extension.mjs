import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const requiredFiles = [
  "manager.html",
  "options.html",
  "popup.html",
  "share.html",
  manifest.background.service_worker,
  "src/manager.js",
  "src/options.js",
  "src/popup.js",
  "src/share.js",
  "src/model.js",
  "src/store.js",
  "src/styles.css",
  ...Object.values(manifest.chrome_url_overrides || {}),
  ...Object.values(manifest.icons)
];

for (const file of requiredFiles) {
  statSync(file);
}

for (const file of requiredFiles.filter((file) => file.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const test = spawnSync(process.execPath, ["--test"], { stdio: "inherit" });
if (test.status !== 0) {
  process.exit(test.status || 1);
}

console.log(`ZipTab ${manifest.version} extension check passed`);
