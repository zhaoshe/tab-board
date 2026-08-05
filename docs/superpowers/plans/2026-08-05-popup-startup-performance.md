# Popup 启动性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 点击 Chrome 工具栏图标后立即绘制稳定的 Popup 加载界面，并让正常启动只读取轻量设置投影，与当前窗口 Tab 查询并行执行。

**架构：** `popup.html` 直接提供不可交互的静态首帧。`usePopupSettings()` 读取并订阅现有 `tabboardSettingsProjection`，仅在投影缺失或损坏时动态加载 canonical fallback。`PopupApp` 同时启动设置和 Tab 加载，两个输入都结束后才渲染完整 P2 Popup。生产检查和 startup benchmark 固化零 canonical 读取、单次 Tab 查询、并行时序和 Bundle 边界。

**技术栈：** React 18、TypeScript、Vite、Mantine v7、Chrome MV3 API、Vitest、Node test、Playwright。

## 全局约束

- 保持现有 `TabBoardState` schema、`tabboardSettingsProjection` 格式和 worker mutation 协议不变。
- 保持 Popup 的 capture、pinned、duplicate、Save、Remove、主题、Manager 和 Settings 行为不变。
- 正常且设置投影有效时，不得读取 `tabboardState`，不得加载 `useTabBoardStore` 或 `activeAdapter`。
- 投影缺失或损坏时，继续使用现有 canonical repair；读取失败时使用 `DEFAULT_SETTINGS`，不能永久停在 loading。
- 当前窗口 Tab 只查询一次；React Strict Mode 不能制造重复请求。
- 不增加 Service Worker 缓存、Tab 事件同步、运行时依赖或新的持久化状态。
- 所有生产改动遵循 RED、确认 RED、最小 GREEN、确认 GREEN。
- Vite/Vitest 与 Playwright 串行运行；仓库的 HMR 端口固定为 5173。
- 每个提交作者和提交者均为 `zhaoshe <zhaoshe@foxmail.com>`，提交消息末尾只保留一个规定的 co-author trailer。

---

### 任务 1：静态首帧

**文件：**
- 新建：`src/popup/popupStartup.test.ts`
- 修改：`popup.html`

**接口：**
- 生成标记：`data-popup-boot-shell`
- 生成静态状态：`role="status"`、`aria-live="polite"`
- 固定几何：宽度 `320px`、最小高度 `180px`
- React 仍挂载到现有 `#root`

- [ ] **步骤 1：写失败的静态 HTML 合同**

`src/popup/popupStartup.test.ts` 读取 `popup.html`，验证：

```ts
expect(html).toContain('data-popup-boot-shell');
expect(html).toContain('role="status"');
expect(html).toContain('aria-live="polite"');
expect(html).toMatch(/width:\s*320px/);
expect(html).toMatch(/min-height:\s*180px/);
expect(html).toContain('Loading current window…');
expect(html).toContain('prefers-color-scheme: dark');
expect(bootShell).not.toMatch(/<(?:button|input|a)\b/i);
```

同时验证静态壳位于 `#root` 内，继续使用 `/icons/icon-32.png`，不新增外部字体、脚本或样式引用。

- [ ] **步骤 2：运行测试并确认 RED**

```sh
npx vitest run src/popup/popupStartup.test.ts
```

预期：FAIL，提示缺少 `data-popup-boot-shell` 或固定高度。

- [ ] **步骤 3：实现最小静态首帧**

在 `popup.html` 中保留现有 module script，并把空 `#root` 改为：

```html
<div id="root">
  <main class="popup-boot-shell" data-popup-boot-shell>
    <div class="popup-boot-shell__brand">
      <img src="/icons/icon-32.png" alt="" width="22" height="22" />
      <strong><span translate="no">TabBoard</span></strong>
    </div>
    <div class="popup-boot-shell__status" role="status" aria-live="polite">
      <span class="popup-boot-shell__spinner" aria-hidden="true"></span>
      <span>Loading current window…</span>
    </div>
  </main>
</div>
```

在 `<head>` 增加少量内联 CSS：

- `html/body/#root` 为 `320px`；
- `.popup-boot-shell` 为 `min-height: 180px`；
- 使用系统字体和现有浅色背景；
- `@media (prefers-color-scheme: dark)` 切换到当前深色 surface；
- spinner 仅使用 CSS border，并遵守 `prefers-reduced-motion: reduce`。

- [ ] **步骤 4：运行测试并确认 GREEN**

```sh
npx vitest run src/popup/popupStartup.test.ts
npm run build
```

确认生产 `dist/popup.html` 保留静态壳，React 加载后现有 Popup 仍能替换它。

- [ ] **步骤 5：提交**

```sh
git add popup.html src/popup/popupStartup.test.ts
git commit -m "perf(popup): paint a static startup shell"
```

提交消息末尾追加规定的 co-author trailer。

---

### 任务 2：只读 Popup 设置投影

**文件：**
- 新建：`src/popup/usePopupSettings.ts`
- 新建：`src/popup/usePopupSettings.test.ts`

**接口：**
- 生成：

```ts
export interface PopupSettingsSnapshot {
  hydrated: boolean;
  error: string | null;
  settings: Settings;
}

export function usePopupSettings(): PopupSettingsSnapshot;
```

- 消费：`readSettingsProjection()`、`subscribeSettingsProjection()`
- fallback：`import('../shared/store/activeAdapter').then(({ getActiveState }) => getActiveState())`

- [ ] **步骤 1：写失败的 Hook 测试**

覆盖以下行为：

1. 投影有效时只执行一次 `chrome.storage.local.get(SETTINGS_PROJECTION_KEY)`，不调用 `getActiveState()`，也不唤醒 worker。
2. 订阅先于读取建立；读取期间到达的更新按 `mutationRevision`、`updatedAt` 选择较新值。
3. React Strict Mode 的 effect replay 共享一个在途读取。
4. 投影缺失或损坏时调用一次动态 canonical fallback，并由现有 `readSettingsProjection()` 修复 projection。
5. projection 读取和 fallback 都失败时返回：

```ts
{
  hydrated: true,
  error: 'storage unavailable',
  settings: { ...DEFAULT_SETTINGS },
}
```

6. 卸载后到达的 Promise 或 storage change 不再更新 Hook。

- [ ] **步骤 2：运行测试并确认 RED**

```sh
npx vitest run src/popup/usePopupSettings.test.ts
```

预期：FAIL，提示 `usePopupSettings` 模块不存在。

- [ ] **步骤 3：实现只读 Hook**

采用最小的 Hook-local snapshot，加一个 module-level 在途 Promise 去重：

```ts
let inFlightRead: Promise<SettingsProjection> | null = null;

function readProjectionOnce(): Promise<SettingsProjection> {
  if (inFlightRead) return inFlightRead;
  const request = readSettingsProjection({
    readCanonicalState: async () => (
      await import('../shared/store/activeAdapter')
    ).getActiveState(),
  });
  const shared = request.finally(() => {
    if (inFlightRead === shared) inFlightRead = null;
  });
  inFlightRead = shared;
  return shared;
}
```

Hook effect：

1. 设置 `active = true`；
2. 先订阅 projection；
3. 调用 `readProjectionOnce()`；
4. 用 functional state update 选择较新 projection；
5. catch 时以默认设置发布 `hydrated: true` 和错误；
6. cleanup 时设 `active = false` 并取消订阅。

不要导入 Zustand、Options Hook 或 mutation 模块。

- [ ] **步骤 4：运行测试并确认 GREEN**

```sh
npx vitest run \
  src/popup/usePopupSettings.test.ts \
  src/shared/store/settingsProjection.test.ts
```

- [ ] **步骤 5：提交**

```sh
git add src/popup/usePopupSettings.ts src/popup/usePopupSettings.test.ts
git commit -m "perf(popup): read a lightweight settings projection"
```

提交消息末尾追加规定的 co-author trailer。

---

### 任务 3：并行 Popup 启动

**文件：**
- 修改：`src/popup/PopupApp.tsx`
- 修改：`src/popup/PopupApp.dom.test.ts`

**接口：**
- `PopupApp` 消费 `usePopupSettings()`
- `PopupApp` 使用 `usePreferredColorScheme(settings.theme)`，不再使用 Store-backed `useColorScheme()`
- 内部状态增加 `tabsLoaded: boolean`
- 内部一次性查询函数：

```ts
function queryCurrentWindowTabsOnce(): Promise<TabInfo[]>;
```

- [ ] **步骤 1：迁移测试装配并写失败的并行时序测试**

删除测试中的 `useStoreHydration` / `useTabBoardStore` mock，改为 mock `usePopupSettings` 或使用真实 projection Chrome stub。保留所有现有 P2 行为测试。

新增 deferred Promise 测试：

```ts
expect(readProjection).toHaveBeenCalledTimes(1);
expect(queryTabs).toHaveBeenCalledTimes(1);
```

这两个断言必须在任一 Promise resolve 前成立。

继续验证：

- Tab 已返回、settings 未返回时仍显示 `Loading current window…`；
- settings 已返回、Tab 未返回时仍显示 loading；
- 两者都返回后才出现 Save；
- settings 失败时用默认设置渲染并显示错误；
- Tab 查询失败时以 0 tabs 渲染并显示错误；
- Strict Mode 挂载只触发一次 `chrome.tabs.query()`；
- 卸载后 resolve 不产生 React state update。

- [ ] **步骤 2：运行测试并确认 RED**

```sh
npx vitest run src/popup/PopupApp.dom.test.ts
```

预期：至少并行时序和单次查询断言失败；当前实现要等完整 hydration 后才开始查询。

- [ ] **步骤 3：实现最小并行启动**

修改 `PopupApp`：

```ts
const {
  hydrated: settingsLoaded,
  error: settingsError,
  settings,
} = usePopupSettings();
const colorScheme = usePreferredColorScheme(settings.theme);
const [tabsLoaded, setTabsLoaded] = useState(false);
```

Tab effect 在首次挂载立即调用 `queryCurrentWindowTabsOnce()`，不依赖
`settingsLoaded`。共享 Promise 只覆盖同一在途查询，settle 后清空；这样 Strict
Mode replay 复用一次请求，下一次真正打开新的 Popup 页面仍会重新查询。

成功和失败都设置 `tabsLoaded = true`；只有 `!settingsLoaded || !tabsLoaded`
时渲染 React loading。错误合并顺序：

```ts
const feedbackError = loadError || settingsError || saveError;
```

删除 `hydrated` 对 capture-policy memo 的条件分支。完整界面只会在 settings
和 tabs 都 settled 后渲染，此时直接使用有效设置或默认设置。

- [ ] **步骤 4：运行测试并确认 GREEN**

```sh
npx vitest run \
  src/popup/usePopupSettings.test.ts \
  src/popup/PopupApp.dom.test.ts \
  src/shared/hooks/usePreferredColorScheme.test.ts
npm run build
```

检查 `dist/popup.html`：不得再出现 `useTabBoardStore-*`、`activeAdapter-*`
modulepreload；`activeAdapter` 只能作为动态 fallback chunk 存在。

- [ ] **步骤 5：运行 Popup 浏览器回归**

```sh
npx playwright test tests/e2e/popup-parity.e2e.ts --workers=1
```

确认 pinned、duplicate、Save/Remove 和无 pinned 布局全部保持现状。

- [ ] **步骤 6：提交**

```sh
git add src/popup/PopupApp.tsx src/popup/PopupApp.dom.test.ts
git commit -m "perf(popup): load settings and tabs in parallel"
```

提交消息末尾追加规定的 co-author trailer。

---

### 任务 4：生产性能门禁、文档与总体验收

**文件：**
- 新建：`scripts/popup-startup-contract.mjs`
- 新建：`scripts/popup-startup-contract.test.mjs`
- 修改：`scripts/check-extension.mjs`
- 修改：`scripts/startup-benchmark-core.mjs`
- 修改：`scripts/startup-benchmark-core.test.mjs`
- 修改：`scripts/benchmark-startup.mjs`
- 修改：`docs/technical-architecture.md`
- 修改：`docs/feature-evolution.md`

**接口：**
- 生成：

```js
assertPopupStartupBuild({ sourceHtml, builtHtml });
assertPopupStartupSample(sample);
```

- 扩展：`benchmarkPagePath('popup') === 'popup.html'`
- CLI 支持：

```sh
npm run benchmark:startup -- --runs 1 --scenario large --page popup
```

- Popup benchmark sample 新增：

```ts
{
  stateReadCount: number;
  projectionReadCount: number;
  tabQueryCount: number;
  projectionReadStartMs: number;
  projectionReadEndMs: number;
  tabQueryStartMs: number;
  tabQueryEndMs: number;
}
```

- [ ] **步骤 1：写失败的生产 Bundle 合同测试**

`scripts/popup-startup-contract.test.mjs` 验证：

- source/built HTML 缺少 `data-popup-boot-shell` 时失败；
- built HTML preload 包含 `useTabBoardStore-*` 时失败；
- built HTML preload 包含 `activeAdapter-*` 时失败；
- 静态壳存在且正常依赖不包含禁用模块时通过。

- [ ] **步骤 2：写失败的 benchmark core 测试**

扩展 `scripts/startup-benchmark-core.test.mjs`：

```js
assert.equal(benchmarkPagePath('popup'), 'popup.html');
```

为 `assertPopupStartupSample()` 增加 RED 用例：

- `stateReadCount !== 0` 时抛错；
- `projectionReadCount !== 1` 时抛错；
- `tabQueryCount !== 1` 时抛错；
- projection 与 Tab query 时间区间不重叠时抛错；
- 全部满足时通过。

- [ ] **步骤 3：运行测试并确认 RED**

```sh
node --test \
  scripts/popup-startup-contract.test.mjs \
  scripts/startup-benchmark-core.test.mjs
```

预期：FAIL，提示合同模块或新导出不存在。

- [ ] **步骤 4：实现生产检查**

`assertPopupStartupBuild()` 只解析 HTML 字符串，不读文件。`check-extension.mjs`
继续拥有文件系统边界，并在 build 后把 source/built `popup.html` 传入合同。

检查的是 modulepreload 文件名，不禁止动态 chunk 存在：

```js
const preloads = [...builtHtml.matchAll(
  /<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g,
)].map((match) => match[1]);
```

- [ ] **步骤 5：扩展生产 startup benchmark**

在现有 runner 中：

1. `empty` 和 `large` 场景加入 `popup` 页面；
2. `--page` 只执行指定页面，避免每次调试都运行 Manager/Options；
3. runner 启动只监听 `127.0.0.1` 随机端口的最小 HTML server；Popup 测量前在当前窗口创建 150 个唯一的本地 URL Tab，等待数量与 `status === 'complete'` 稳定后再开始计时；
4. startup probe 包装 `chrome.tabs.query()`；
5. first useful selector 使用 `.popup-app:not(.popup-app--loading)`；
6. 收集 projection/state/query 调用区间；
7. 每个 Popup sample 立即调用 `assertPopupStartupSample()`，违反架构门禁时 CLI 非零退出；
8. 保留 wall-clock、long task 和 count 作为辅助数据。

- [ ] **步骤 6：运行 GREEN 与方向性 benchmark**

```sh
node --test \
  scripts/popup-startup-contract.test.mjs \
  scripts/startup-benchmark-core.test.mjs
npm run build
node scripts/check-extension.mjs
node scripts/benchmark-startup.mjs --runs 1 --scenario large --page popup
```

必须满足：

- `stateReadCount = 0`；
- `projectionReadCount = 1`；
- `tabQueryCount = 1`；
- projection 与 Tab query 时间区间重叠；
- `dist/popup.html` 保留静态首帧；
- built Popup 不 preload `useTabBoardStore` 或 `activeAdapter`。

- [ ] **步骤 7：更新当前文档**

`docs/technical-architecture.md` 记录：

- 静态首帧由 `popup.html` 拥有；
- Popup 使用 settings projection；
- projection 与 current-window query 并行；
- canonical repair 仅为 fallback；
- Popup 正常路径不进入 Authoritative Publication。

`docs/feature-evolution.md` 新增 2026-08-05 条目，记录问题、变化、判断和当前状态。

不新增 Product Decision：该方案延续 D050/D057 已接受的 disposable projection，
不是新的存储真相或产品语义。

- [ ] **步骤 8：运行完整验证**

```sh
npm run check
npm test
npm run test:e2e -- --workers=1
git diff --check
```

额外检查：

```sh
rg -n "useStoreHydration|useTabBoardStore|useColorScheme" src/popup
rg -n "useTabBoardStore-|activeAdapter-" dist/popup.html
```

两个命令在生产 Popup 路径中都不得命中禁用依赖。

- [ ] **步骤 9：真实 Chrome 手工验收**

使用生产 `dist/`：

1. 当前窗口打开至少 100 个 Tab；
2. 冷启动点击 TabBoard 工具栏图标；
3. 确认静态 loading Popup 立即出现，不再有无响应空窗；
4. 确认加载后的 Tab 数量、pinned、duplicate、Save、Remove、Manager、Settings；
5. 使用大型 saved-session 数据重复；
6. 检查 Popup 和 Service Worker console 无错误。

- [ ] **步骤 10：提交**

```sh
git add \
  scripts/popup-startup-contract.mjs \
  scripts/popup-startup-contract.test.mjs \
  scripts/check-extension.mjs \
  scripts/startup-benchmark-core.mjs \
  scripts/startup-benchmark-core.test.mjs \
  scripts/benchmark-startup.mjs \
  docs/technical-architecture.md \
  docs/feature-evolution.md
git commit -m "test(perf): gate the Popup startup path"
```

提交消息末尾追加规定的 co-author trailer。

---

## 完成条件

- 四个任务均完成 RED/GREEN 循环并独立提交。
- 正常 Popup 启动不读取 canonical state。
- 静态首帧在应用 JavaScript 前可见且尺寸稳定。
- projection 与 Tab query 并行，Tab query 只有一次。
- Popup 生产 Bundle 不再同步依赖完整 Store/Storage Authority。
- 全量 check、Vitest、串行 Playwright、diff 检查通过。
- 真实 Chrome 的 100+ Tab 冷启动验收通过。
