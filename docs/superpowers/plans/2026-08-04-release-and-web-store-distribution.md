# GitHub Release 与 Chrome Web Store 分发实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `vX.Y.Z` tag 自动生成可直接安装和提交 Chrome Web Store 的 ZIP/校验文件，并准备首次人工上架所需的 README、隐私说明和商店材料。

**Architecture:** 将发布逻辑拆成两个仓库自有脚本：版本校验脚本只负责解析并比较 tag 与四处版本源；打包脚本只负责验证 `dist/`、生成根目录正确的 ZIP 和 SHA-256 文件。GitHub Actions 复用这两个脚本，在完整 check、unit、串行 Chromium E2E 通过后创建 GitHub Release；Chrome Web Store 首次提交仍由维护者人工完成。

**Tech Stack:** Node.js 20、`node:test`、npm、Vite、GitHub Actions、Playwright Chromium、POSIX shell、`zip`、SHA-256 工具。

## Global Constraints

- 唯一发布入口是格式为 `vX.Y.Z` 的 Git tag。
- `package.json.version`、`package-lock.json.version`、`package-lock.json.packages[""].version` 和 `manifest.json.version` 必须与 tag 完全一致。
- 首个发布 tag 是 `v0.1.0`。
- ZIP 内 `manifest.json` 必须位于根目录，不允许额外的顶层 `dist/`。
- 发布产物命名为 `tabboard-vX.Y.Z.zip` 和 `tabboard-vX.Y.Z.sha256`。
- 发布前必须通过 `npm run check`、`npm test` 和 `npx playwright test --workers=1`。
- GitHub Actions 只声明 `contents: write`，不使用个人访问令牌或第三方 Release Action。
- 首次 Chrome Web Store 提交使用 GitHub Release 的同一份 ZIP，不单独重建或修改。
- 首个商店条目审核通过前不接 Chrome Web Store API。
- 不增加运行时依赖或发布专用 npm 依赖。
- 所有提交的 author/committer 使用 `zhaoshe <zhaoshe@foxmail.com>`，提交末尾保留且仅保留一个 `Co-authored-by: TRAE CLI <noreply@bytedance.com>`。

---

### Task 1: Tag 与版本源校验

**Files:**
- Create: `scripts/release-version.mjs`
- Create: `scripts/release-version.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `package.json`、`package-lock.json`、`manifest.json` 和 CLI 参数 `--tag vX.Y.Z`。
- Produces: `readReleaseVersions(rootDir): ReleaseVersions`、`validateReleaseVersion(input): string`，以及命令 `npm run release:validate -- --tag v0.1.0`。
- `ReleaseVersions` 固定为：

```js
{
  packageVersion: string,
  lockVersion: string,
  lockRootVersion: string,
  manifestVersion: string,
}
```

- `validateReleaseVersion({ tag, versions })` 成功时返回去掉 `v` 的版本字符串；失败时抛出包含 tag 和四处实际版本的 `Error`。

- [ ] **Step 1: 添加版本读取与合法 tag 的失败测试**

在 `scripts/release-version.test.mjs` 使用 `node:test` 和临时目录写入四个最小 JSON 文件：

```js
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readReleaseVersions,
  validateReleaseVersion,
} from './release-version.mjs';

async function fixture(versions = {}) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'tabboard-release-'));
  const version = versions.packageVersion ?? '0.1.0';
  await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({
    version,
  }));
  await writeFile(path.join(rootDir, 'package-lock.json'), JSON.stringify({
    version: versions.lockVersion ?? version,
    packages: { '': { version: versions.lockRootVersion ?? version } },
  }));
  await writeFile(path.join(rootDir, 'manifest.json'), JSON.stringify({
    version: versions.manifestVersion ?? version,
  }));
  return rootDir;
}

test('reads all release version sources', async () => {
  const rootDir = await fixture();
  assert.deepEqual(await readReleaseVersions(rootDir), {
    packageVersion: '0.1.0',
    lockVersion: '0.1.0',
    lockRootVersion: '0.1.0',
    manifestVersion: '0.1.0',
  });
});

test('accepts a matching semantic version tag', () => {
  assert.equal(validateReleaseVersion({
    tag: 'v0.1.0',
    versions: {
      packageVersion: '0.1.0',
      lockVersion: '0.1.0',
      lockRootVersion: '0.1.0',
      manifestVersion: '0.1.0',
    },
  }), '0.1.0');
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run:

```sh
node --test scripts/release-version.test.mjs
```

Expected: FAIL，错误包含 `Cannot find module './release-version.mjs'`。

- [ ] **Step 3: 添加非法 tag 与版本不一致测试**

在同一测试文件补充：

```js
test('rejects a non-release tag', () => {
  assert.throws(() => validateReleaseVersion({
    tag: 'release-0.1.0',
    versions: {
      packageVersion: '0.1.0',
      lockVersion: '0.1.0',
      lockRootVersion: '0.1.0',
      manifestVersion: '0.1.0',
    },
  }), /Expected tag vX\.Y\.Z/);
});

test('reports every observed version when one source differs', () => {
  assert.throws(() => validateReleaseVersion({
    tag: 'v0.1.0',
    versions: {
      packageVersion: '0.1.0',
      lockVersion: '0.1.0',
      lockRootVersion: '0.1.0',
      manifestVersion: '0.1.1',
    },
  }), (error) => {
    assert.match(error.message, /tag=0\.1\.0/);
    assert.match(error.message, /package=0\.1\.0/);
    assert.match(error.message, /lock=0\.1\.0/);
    assert.match(error.message, /lockRoot=0\.1\.0/);
    assert.match(error.message, /manifest=0\.1\.1/);
    return true;
  });
});
```

- [ ] **Step 4: 实现最小版本校验脚本**

创建 `scripts/release-version.mjs`：

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/;

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function readReleaseVersions(rootDir) {
  const [pkg, lock, manifest] = await Promise.all([
    readJson(path.join(rootDir, 'package.json')),
    readJson(path.join(rootDir, 'package-lock.json')),
    readJson(path.join(rootDir, 'manifest.json')),
  ]);
  return {
    packageVersion: String(pkg.version ?? ''),
    lockVersion: String(lock.version ?? ''),
    lockRootVersion: String(lock.packages?.['']?.version ?? ''),
    manifestVersion: String(manifest.version ?? ''),
  };
}

export function validateReleaseVersion({ tag, versions }) {
  const match = TAG_PATTERN.exec(tag);
  if (!match) throw new Error(`Expected tag vX.Y.Z, received ${tag}`);
  const version = match[1];
  const observed = {
    tag: version,
    package: versions.packageVersion,
    lock: versions.lockVersion,
    lockRoot: versions.lockRootVersion,
    manifest: versions.manifestVersion,
  };
  if (new Set(Object.values(observed)).size !== 1) {
    throw new Error(Object.entries(observed)
      .map(([key, value]) => `${key}=${value}`)
      .join(' '));
  }
  return version;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isEntry = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntry) {
  const rootDir = path.resolve(argument('--root') ?? process.cwd());
  const tag = argument('--tag') ?? process.env.GITHUB_REF_NAME ?? '';
  const version = validateReleaseVersion({
    tag,
    versions: await readReleaseVersions(rootDir),
  });
  process.stdout.write(`${version}\n`);
}
```

在 `package.json` 的 scripts 中增加：

```json
"release:validate": "node scripts/release-version.mjs"
```

- [ ] **Step 5: 运行聚焦测试和真实仓库校验**

Run:

```sh
node --test scripts/release-version.test.mjs
npm run release:validate -- --tag v0.1.0
```

Expected: 测试全部 PASS；第二条命令只输出 `0.1.0`。

- [ ] **Step 6: 提交**

```sh
git add package.json scripts/release-version.mjs scripts/release-version.test.mjs
git commit -m "build(release): validate tag and extension versions" \
  -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 2: 可复用的 Release ZIP 与校验文件

**Files:**
- Create: `scripts/package-release.mjs`
- Create: `scripts/package-release.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 已构建的 `dist/`、`--tag vX.Y.Z`、可选 `--output-dir <path>`。
- Uses: Task 1 的 `readReleaseVersions(rootDir)` 和 `validateReleaseVersion({ tag, versions })`。
- Produces: `packageRelease({ rootDir, tag, outputDir }): Promise<{ version, archivePath, checksumPath }>`，以及命令 `npm run release:package -- --tag v0.1.0`。
- 默认输出目录固定为 `release/`；该目录只存本地产物并加入 `.gitignore`。
- ZIP 生成使用 Node.js 调用系统 `zip`；SHA-256 使用 Node.js `crypto`，避免 macOS/Linux 的 `sha256sum` 命令差异。

- [ ] **Step 1: 添加缺少 manifest 和错误 ZIP 结构的失败测试**

在 `scripts/package-release.test.mjs` 使用临时仓库根目录和一个最小 `dist/`：

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { packageRelease } from './package-release.mjs';

async function fixture({ includeManifest = true } = {}) {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'tabboard-package-'));
  const outputDir = path.join(rootDir, 'release');
  const distDir = path.join(rootDir, 'dist');
  await mkdir(distDir);
  for (const file of ['package.json', 'manifest.json']) {
    await writeFile(path.join(rootDir, file), JSON.stringify({
      version: '0.1.0',
    }));
  }
  await writeFile(path.join(rootDir, 'package-lock.json'), JSON.stringify({
    version: '0.1.0',
    packages: { '': { version: '0.1.0' } },
  }));
  if (includeManifest) {
    await writeFile(path.join(distDir, 'manifest.json'), '{"version":"0.1.0"}');
  }
  for (const file of ['manager.html', 'popup.html', 'options.html']) {
    await writeFile(path.join(distDir, file), file);
  }
  return { rootDir, outputDir };
}

test('refuses to package without dist/manifest.json', async () => {
  const { rootDir, outputDir } = await fixture({ includeManifest: false });
  await assert.rejects(
    packageRelease({ rootDir, outputDir, tag: 'v0.1.0' }),
    /dist\/manifest\.json/,
  );
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run:

```sh
node --test scripts/package-release.test.mjs
```

Expected: FAIL，错误包含 `Cannot find module './package-release.mjs'`。

- [ ] **Step 3: 添加完整产物测试**

在测试中通过 `node:child_process.execFile` 调用 `unzip -Z1` 检查文件列表：

```js
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('creates a root-level extension ZIP and matching checksum', async () => {
  const { rootDir, outputDir } = await fixture();
  const result = await packageRelease({
    rootDir,
    outputDir,
    tag: 'v0.1.0',
  });
  assert.equal(path.basename(result.archivePath), 'tabboard-v0.1.0.zip');
  assert.equal(path.basename(result.checksumPath), 'tabboard-v0.1.0.sha256');

  const entries = await zipEntries(result.archivePath);
  assert.ok(entries.includes('manifest.json'));
  assert.ok(entries.includes('manager.html'));
  assert.ok(entries.includes('popup.html'));
  assert.ok(entries.includes('options.html'));
  assert.ok(entries.every((entry) => !entry.startsWith('dist/')));

  const checksumLine = await readFile(result.checksumPath, 'utf8');
  assert.match(checksumLine, /^[a-f0-9]{64}  tabboard-v0\.1\.0\.zip\n$/);
  assert.equal(await sha256(result.archivePath), checksumLine.slice(0, 64));
});
```

测试内定义以下辅助函数，签名不得变化：

```js
async function zipEntries(archivePath) {
  const { stdout } = await execFileAsync('unzip', ['-Z1', archivePath]);
  return stdout.trim().split('\n');
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  hash.update(await readFile(filePath));
  return hash.digest('hex');
}
```

- [ ] **Step 4: 实现打包脚本**

`scripts/package-release.mjs` 需要：

1. 复用 Task 1 的版本校验。
2. 检查 `dist/manifest.json`、`manager.html`、`popup.html`、`options.html`。
3. 清空并重建目标 `release/`。
4. 使用 `readdir(distDir)` 读取并排序根条目，在 `dist/` 目录内将这些条目逐个传给 `zip`，避免归档名带 `./` 或顶层 `dist/`：

```js
const entries = (await readdir(distDir)).sort();
await execFileAsync('zip', [
  '-X',
  '-r',
  archivePath,
  ...entries,
  '-x',
  '*.map',
  '*.pem',
  '*.crx',
]);
```

5. 使用 `createHash('sha256')` 计算归档摘要。
6. 写入 `${digest}  ${archiveName}\n`。
7. CLI 成功时打印两个产物绝对路径，失败时输出错误并以非零状态退出。

在 `package.json` 增加：

```json
"release:package": "node scripts/package-release.mjs"
```

在 `.gitignore` 增加：

```gitignore
release/
```

- [ ] **Step 5: 运行聚焦测试和真实本地打包**

Run:

```sh
node --test scripts/release-version.test.mjs scripts/package-release.test.mjs
npm run build
npm run release:package -- --tag v0.1.0
unzip -Z1 release/tabboard-v0.1.0.zip | sed -n '1,40p'
```

Expected:

- 所有测试 PASS；
- 产物存在；
- 文件列表包含根目录 `manifest.json`、`manager.html`、`popup.html`、`options.html`；
- 文件列表不以 `dist/` 开头。

- [ ] **Step 6: 验证校验文件**

Run:

```sh
node -e "const fs=require('fs'),crypto=require('crypto'); const p='release/tabboard-v0.1.0.zip'; console.log(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'))"
sed -n '1p' release/tabboard-v0.1.0.sha256
```

Expected: 两行的 64 位摘要一致。

- [ ] **Step 7: 提交**

```sh
git add .gitignore package.json scripts/package-release.mjs scripts/package-release.test.mjs
git commit -m "build(release): package extension artifacts" \
  -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 3: Tag 驱动的 GitHub Release 工作流

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `scripts/release-workflow.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 的 `npm run release:validate -- --tag "$GITHUB_REF_NAME"`。
- Consumes: Task 2 的 `npm run release:package -- --tag "$GITHUB_REF_NAME"`。
- Produces: `v*.*.*` tag push 自动创建 GitHub Release，并上传 ZIP 与 SHA-256 文件。
- 工作流名称固定为 `Release`，job ID 固定为 `release`。

- [ ] **Step 1: 添加工作流源契约测试**

创建 `scripts/release-workflow.test.mjs`：

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/release.yml', import.meta.url);

test('release workflow is tag-only and minimally privileged', async () => {
  const source = await readFile(workflowPath, 'utf8');
  assert.match(source, /tags:\s*\n\s*-\s*'v\*\.\*\.\*'/);
  assert.match(
    source,
    /permissions:\s*\n\s{2}contents:\s*write\s*\n\s*\n\s*jobs:/,
  );
  assert.doesNotMatch(source, /pull_request:/);
  assert.doesNotMatch(source, /branches:/);
});

test('release workflow gates publication on validation and tests', async () => {
  const source = await readFile(workflowPath, 'utf8');
  for (const command of [
    'npm ci',
    'npm run release:validate -- --tag \"$GITHUB_REF_NAME\"',
    'npm run check',
    'npm test',
    'npx playwright install --with-deps chromium',
    'npx playwright test --workers=1',
    'npm run release:package -- --tag \"$GITHUB_REF_NAME\"',
    'gh release create \"$GITHUB_REF_NAME\"',
  ]) {
    assert.ok(source.includes(command), `missing command: ${command}`);
  }
  assert.doesNotMatch(source, /uses:\s*[^\\n]*release-action/i);
});
```

- [ ] **Step 2: 运行测试并确认因工作流不存在而失败**

Run:

```sh
node --test scripts/release-workflow.test.mjs
```

Expected: FAIL，错误包含 `.github/workflows/release.yml` 不存在。

- [ ] **Step 3: 创建最小 GitHub Actions 工作流**

创建 `.github/workflows/release.yml`：

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Check out tag
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Validate release version
        run: npm run release:validate -- --tag "$GITHUB_REF_NAME"

      - name: Check production build
        run: npm run check

      - name: Run unit tests
        run: npm test

      - name: Install Chromium
        run: npx playwright install --with-deps chromium

      - name: Run browser tests
        run: npx playwright test --workers=1

      - name: Package release
        run: npm run release:package -- --tag "$GITHUB_REF_NAME"

      - name: Create GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "$GITHUB_REF_NAME" \
            --verify-tag \
            --generate-notes \
            --title "TabBoard $GITHUB_REF_NAME" \
            "release/tabboard-$GITHUB_REF_NAME.zip" \
            "release/tabboard-$GITHUB_REF_NAME.sha256"
```

- [ ] **Step 4: 把工作流测试接入项目验证**

在 `package.json` 增加：

```json
"test:release": "node --test scripts/release-version.test.mjs scripts/package-release.test.mjs scripts/release-workflow.test.mjs"
```

并将 `check` 修改为：

```json
"check": "npm run build && node scripts/check-extension.mjs && npm run check:cycles && npm run check:architecture && npm run test:release"
```

- [ ] **Step 5: 运行工作流契约和项目检查**

Run:

```sh
npm run test:release
npm run check
```

Expected: 全部 PASS；工作流测试证明 tag-only、最小权限、完整门禁和无第三方 release action。

- [ ] **Step 6: 提交**

```sh
git add .github/workflows/release.yml package.json scripts/release-workflow.test.mjs
git commit -m "ci(release): publish tagged extension builds" \
  -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 4: README、隐私政策与 Chrome Web Store 材料

**Files:**
- Modify: `README.md`
- Create: `PRIVACY.md`
- Create: `docs/chrome-web-store-listing.md`
- Create: `docs/images/store/manager-1280x800.png`
- Modify: `docs/README.md`
- Modify: `docs/feature-evolution.md`
- Modify: `docs/product-decisions.md`

**Interfaces:**
- Consumes: GitHub 仓库 `https://github.com/zhaoshe/tab-board` 和 Release 页面 `https://github.com/zhaoshe/tab-board/releases/latest`。
- Produces: 用户可执行的 Release 安装步骤、公开隐私政策、可复制到 Chrome Web Store 后台的英文文案和权限说明。
- README 在商店审核前只展示“Chrome Web Store 准备中”，不得伪造商店链接。

- [ ] **Step 1: 为 README 安装说明添加静态契约测试**

在 `scripts/release-workflow.test.mjs` 增加：

```js
test('README exposes binary installation and update limitations', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /releases\/latest/);
  assert.match(readme, /tabboard-vX\.Y\.Z\.zip/);
  assert.match(readme, /Load unpacked/);
  assert.match(readme, /does not update automatically/i);
  assert.match(readme, /Chrome Web Store.*pending/i);
});

test('privacy policy states local storage and no network transfer', async () => {
  const privacy = await readFile(new URL('../PRIVACY.md', import.meta.url), 'utf8');
  assert.match(privacy, /chrome\.storage\.local/);
  assert.match(privacy, /local folder/i);
  assert.match(privacy, /does not make network requests/i);
  assert.match(privacy, /does not sell/i);
});
```

- [ ] **Step 2: 运行测试并确认 README/PRIVACY 约束失败**

Run:

```sh
node --test scripts/release-workflow.test.mjs
```

Expected: FAIL，至少包含 `PRIVACY.md` 不存在和 README 缺少 Release 安装说明。

- [ ] **Step 3: 更新 README 安装入口**

将现有 `## Build and Install in Chrome` 拆成：

```markdown
## Install

### GitHub Release

Chrome Web Store: pending first public review.

1. Download `tabboard-vX.Y.Z.zip` from the [latest release](https://github.com/zhaoshe/tab-board/releases/latest).
2. Extract the ZIP.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Click **Load unpacked** and select the extracted directory.

This installation method does not update automatically. Download and load the
new extracted directory when a newer release is available.

### Build From Source

1. Run `npm ci`.
2. Run `npm run build`.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Click **Load unpacked**.
6. Select `dist/`.
```

保留现有开发模式说明，但不要再把源码构建放在最主要安装入口。

- [ ] **Step 4: 创建公开隐私政策**

创建 `PRIVACY.md`，至少包含：

```markdown
# TabBoard Privacy Policy

TabBoard stores saved tabs, workspaces, settings, and related metadata locally
in `chrome.storage.local` or in a local folder selected by the user.

TabBoard does not make network requests, sell data, transfer data to third
parties, use data for advertising, or read page contents. It requests no host
permissions.

Uninstalling TabBoard removes browser-managed extension storage according to
Chrome's behavior. Files in a user-selected local folder remain under the
user's control and are not deleted by the extension.

For questions, use the GitHub repository:
https://github.com/zhaoshe/tab-board
```

README 的 License 附近增加 `[Privacy Policy](PRIVACY.md)`。

- [ ] **Step 5: 创建 Chrome Web Store 首次上架清单**

创建 `docs/chrome-web-store-listing.md`，用中文说明提交流程，但商店可复制字段使用英文。必须写出以下实际内容：

- Name: `TabBoard`
- Category: `Productivity`
- Language: `English`
- Support URL: `https://github.com/zhaoshe/tab-board/issues`
- Homepage URL: `https://github.com/zhaoshe/tab-board`
- Privacy URL: `https://github.com/zhaoshe/tab-board/blob/main/PRIVACY.md`
- Single purpose:

```text
TabBoard saves open Chrome tabs into local, searchable sessions and restores
them later.
```

- Short description:

```text
Save open Chrome tabs into private searchable sessions, then restore them one
by one or in groups.
```

- Full description:

```text
TabBoard is a local-first Chrome tab manager for saving busy browser windows
into searchable sessions.

Organize sessions with workspaces and categories, add notes, move tabs with
drag and drop, search from the manager or address bar, and restore individual
tabs or complete sessions when you need them.

TabBoard stores data on your device in Chrome extension storage or in a local
folder you choose. It does not request access to website contents and does not
send your browsing data to a server.
```

- 权限逐项解释，内容必须与 `manifest.json` 一致：

| Permission | Store justification |
| --- | --- |
| `tabs` | Read tab titles, URLs, pinned state, and window membership so the user can save, organize, close, focus, and restore selected tabs. |
| `tabGroups` | Preserve and restore Chrome tab-group titles, colors, and collapsed state when Chrome supports them. |
| `storage` | Store TabBoard sessions, settings, and local storage-mode status on the user's device. |
| `unlimitedStorage` | Prevent larger local tab collections from failing because of the default extension storage quota. |
| `contextMenus` | Add user-invoked right-click commands for saving tabs and opening TabBoard. |
| `clipboardWrite` | Copy exported TabBoard data when the user chooses a copy/export action. |

- 说明首发上传 `release/tabboard-v0.1.0.zip`，并用同目录 `.sha256` 核对。
- 记录人工步骤：注册、支付一次性费用、创建公开条目、上传、填写隐私声明、提交审核、审核通过后补 README 链接。

- [ ] **Step 6: 生成商店截图**

使用现有 `docs/images/manager.png` 生成严格 1280x800 的
`docs/images/store/manager-1280x800.png`。源图是 2880x1800 的 16:10 合成数据截图，不需要裁剪：

```sh
mkdir -p docs/images/store
sips -z 800 1280 docs/images/manager.png \
  --out docs/images/store/manager-1280x800.png
sips -g pixelWidth -g pixelHeight docs/images/store/manager-1280x800.png
```

Expected: `pixelWidth: 1280`，`pixelHeight: 800`。

- [ ] **Step 7: 更新文档索引和产品决策记录**

- `docs/README.md` 核心文档中加入 `PRIVACY.md` 和
  `docs/chrome-web-store-listing.md`。
- `docs/feature-evolution.md` 记录二进制 Release 安装入口和首发商店准备。
- `docs/product-decisions.md` 记录：
  - tag 是唯一发布入口；
  - GitHub Release 与 Web Store 首次上传复用同一产物；
  - Web Store API 推迟到首次审核通过后。

- [ ] **Step 8: 运行文档契约与图片检查**

Run:

```sh
npm run test:release
sips -g pixelWidth -g pixelHeight docs/images/store/manager-1280x800.png
git diff --check
```

Expected: 测试全部 PASS；图片为 1280x800；diff check 无输出。

- [ ] **Step 9: 提交**

```sh
git add README.md PRIVACY.md docs/README.md docs/chrome-web-store-listing.md \
  docs/images/store/manager-1280x800.png docs/feature-evolution.md \
  docs/product-decisions.md scripts/release-workflow.test.mjs
git commit -m "docs(release): add install and Web Store materials" \
  -m "Co-authored-by: TRAE CLI <noreply@bytedance.com>"
```

---

### Task 5: 全量验证、推送与首个 `v0.1.0` Release

**Files:**
- Verify only; no source files should change after the tag is created.

**Interfaces:**
- Consumes: Tasks 1-4 的脚本、工作流和文档。
- Produces: 远端提交、annotated tag `v0.1.0`、GitHub Release、ZIP 和 SHA-256 下载地址。

- [ ] **Step 1: 运行发布前全量验证**

Run:

```sh
npm run check
npm test
npx playwright test --workers=1
git diff --check
```

Expected: 全部 PASS。

- [ ] **Step 2: 本地重建并验证最终产物**

Run:

```sh
rm -rf release dist
npm run check
npm run release:package -- --tag v0.1.0
unzip -Z1 release/tabboard-v0.1.0.zip | sed -n '1,80p'
npm run release:validate -- --tag v0.1.0
```

Expected:

- `release/tabboard-v0.1.0.zip` 和 `.sha256` 存在；
- ZIP 根结构正确；
- 版本校验只输出 `0.1.0`。

- [ ] **Step 3: 检查提交身份、状态和远端**

Run:

```sh
git status --short --branch
git log -5 --pretty='%h %an <%ae> %cn <%ce> %s'
git remote -v
```

Expected:

- 工作区干净；
- 新提交 author/committer 均为 `zhaoshe <zhaoshe@foxmail.com>`；
- `origin` 是 `https://github.com/zhaoshe/tab-board.git`。

- [ ] **Step 4: 推送分支**

这是外部副作用。执行前再次确认用户已要求继续发布；本轮已有明确确认时可直接执行：

```sh
git push origin zhaoshe/dev
git push origin HEAD:main
```

Expected: `origin/zhaoshe/dev` 和 `origin/main` 指向同一个提交。

- [ ] **Step 5: 对齐另一个 worktree 的本地 `main`**

先确认 `/Users/zhaoshe/code/ZipTab` 工作区干净，再对齐：

```sh
test -z "$(git -C /Users/zhaoshe/code/ZipTab status --porcelain)"
git -C /Users/zhaoshe/code/ZipTab reset --hard "$(git rev-parse HEAD)"
test "$(git -C /Users/zhaoshe/code/ZipTab rev-parse HEAD)" = "$(git rev-parse HEAD)"
```

Expected: 本地 `main`、本地 `zhaoshe/dev`、`origin/main` 和
`origin/zhaoshe/dev` 指向同一个提交。

- [ ] **Step 6: 创建 annotated tag**

创建前检查远端没有同名 tag 或 Release：

```sh
git ls-remote --tags origin refs/tags/v0.1.0
gh release view v0.1.0 --repo zhaoshe/tab-board
```

Expected: 两者都不存在。然后：

```sh
git tag -a v0.1.0 -m "TabBoard v0.1.0"
git push origin v0.1.0
```

- [ ] **Step 7: 等待 GitHub Actions 完成**

Run:

```sh
RUN_ID="$(gh run list \
  --repo zhaoshe/tab-board \
  --workflow Release \
  --commit "$(git rev-parse 'v0.1.0^{}')" \
  --event push \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')"
test -n "$RUN_ID"
gh run watch "$RUN_ID" --repo zhaoshe/tab-board --exit-status
```

Expected: Release workflow 状态为 `completed/success`。

- [ ] **Step 8: 下载并验证线上产物**

Run:

```sh
rm -rf /tmp/tabboard-v0.1.0-release
mkdir -p /tmp/tabboard-v0.1.0-release
gh release download v0.1.0 \
  --repo zhaoshe/tab-board \
  --dir /tmp/tabboard-v0.1.0-release
cd /tmp/tabboard-v0.1.0-release
node -e "const fs=require('fs'),crypto=require('crypto'); const p='tabboard-v0.1.0.zip'; console.log(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'))"
sed -n '1p' tabboard-v0.1.0.sha256
unzip -Z1 tabboard-v0.1.0.zip | sed -n '1,80p'
```

Expected:

- 下载到两个文件；
- 两个 SHA-256 值一致；
- ZIP 根目录包含扩展入口文件。

- [ ] **Step 9: Chrome 人工加载验收**

将线上下载的 ZIP 解压到独立临时目录，通过 `chrome://extensions` 的“加载已解压的扩展程序”加载一次，检查：

- 扩展成功注册，无 manifest 错误；
- Popup 可打开；
- Manager/new-tab override 可打开；
- Options 可打开；
- service worker 控制台无启动错误。

该步骤通过后，线上 ZIP 才可用于 Chrome Web Store 首次上传。

- [ ] **Step 10: 记录发布结果**

在 `docs/feature-evolution.md` 追加实际 Release URL、tag、产物名、SHA-256 和验证结果。若该记录产生新提交，不修改 `v0.1.0` tag；它属于后续文档提交，并推送到 `main`/`zhaoshe/dev`。

