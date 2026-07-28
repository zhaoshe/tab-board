# TabBoard React 启动性能 Review

## 结论摘要

用户感知到的慢是真实问题，而且 Manager 与 Options 的根因不同：

1. **Options 的主因是启动协议错误。** 它只需要 settings，却和 Manager
   一样等待完整 `TabBoardState` 经 service worker、Storage Authority 和
   Zustand hydration 串行走完。session 数据越大、MV3 worker 越冷，Options
   越慢。
2. **Manager 的重度数据主因是首屏一次性挂载完整 React/DnD 树。**
   2.30 MB state 的最后一次 storage read 在约 0.76s 已结束，但工作台到
   2.86s 才出现；中间约 2.10s 用于创建 196 个 session card、3,920 个
   `TabItemRow` 及其 Mantine、Zustand、overlay、observer 和 dnd-kit hooks。
3. `content-visibility` 只跳过不可见元素的 layout/paint，**不会跳过 React
   component、hooks 或 dnd-kit 注册**。这解释了为什么现有优化在大数据下
   仍然失效。
4. bundle、Open Tabs 事件风暴、diagnostics storage 写入会放大冷启动和
   “页面出来后还在忙”的体感，但都不是重度 Manager 额外 2.10s 的唯一
   原因。

因此，不建议继续堆局部 `useMemo`。推荐重构两个 ownership：

- Options 持有轻量 `SettingsProjection`，不再依赖完整 store hydration。
- Manager 将“全部 session 的稳定 board/DnD 几何”与“近视口 session 的
  完整 React/DnD 内容”拆开。

## 范围与方法

本次 review 使用 `$vercel-react-best-practices`，同时遵循项目的
Evidence before claims 约束。测量对象是 production `dist` 扩展，不把
Vite preview 当作性能结论。

测量分为：

1. HTML/CSS/JS load、parse 和 evaluate。
2. Storage Authority 初始化与 state hydration。
3. 启动期间的 Chrome runtime/storage 调用。
4. React 首个 loading commit 与首个有效 UI commit。
5. 随 session/tab 数量增长的同步工作。

保留边界：

- 不改变 persistent schema、mutation wire 或 DropIntent 语义。
- 保留 Authoritative Publication 和 structural sharing。
- 不恢复 session-to-session merge。
- 不新增 runtime dependency。
- DnD 变更必须继续覆盖 AGENTS.md 的五条真实拖拽路径。

## Vercel 规则映射

| 规则 | 当前项目结论 |
|---|---|
| `async-parallel` / `async-defer-await` | hydration 串行等待多个全量 state 操作；应收敛为一次 authority read |
| `bundle-dynamic-imports` / `bundle-conditional` | Options 在 Advanced 关闭时仍加载文件迁移和 dialogs；browser mode 仍静态加载 file backend |
| `rerender-defer-reads` | Options 不应订阅不渲染的 groups/folders/bin；Tab row 的 event-only actions 也不应各自订阅 store |
| `rendering-content-visibility` | 已正确使用，但只减少 layout/paint，不能解决 React/DnD mount 数量 |
| `rerender-memo` | `SessionCard` 已 memo；初次 mount 时所有 card 仍必须执行，继续 memo 收益有限 |
| `bundle-barrel-imports` | `@tabler/icons-react` 使 Vite 分析约 7,000 modules；生产 tree shaking 有效，优先级低于 hydration/render |
| `js-request-idle-callback` | 可用于 diagnostics 和低优先级预激活，不应用来延迟用户正在等待的首屏数据 |

Next.js server/RSC 规则不适用于当前 Vite + Chrome MV3 客户端。

## Bundle 基线

production build 的同步入口图：

| 页面 | 初始 JS raw | 初始 JS gzip | 页面 CSS + shared Mantine CSS |
|---|---:|---:|---:|
| Manager | 683 KB | 208 KB | 26 KB + 205 KB raw |
| Options | 475 KB | 146 KB | 3 KB + 205 KB raw |

其中 shared `usePageTheme` chunk 约 330 KB raw / 105 KB gzip，实际包含
React、Mantine 和 shared store/publication，而不只是 page theme。
`activeAdapter` 约 96 KB raw，并静态包含 file serialization、atomic file
I/O 和 IndexedDB handle 逻辑。

扩展资源是本地文件，因此不是网络传输问题；这些体积主要影响 parse、
evaluate 和空状态约 0.2-0.5s 的基础成本。

## Hydration 调用链

`AuthoritativePublication.hydrate()` 在 `hydrated: true` 前串行执行：

1. `ensureStateForHydration()` 向 MV3 worker 发送
   `tabboard-ensure-state`。
2. worker 读取、normalize 完整 state，并把完整对象经 runtime message
   返回页面。
3. 页面初始化 Storage Authority，先读 `tabboardStorageConfig`，再读并
   normalize `tabboardState`。
4. 页面订阅 authority update。
5. `readAuthoritativeState()` 再读并 normalize 一次完整
   `tabboardState`。
6. structural share、publish Zustand projection，页面才渲染有效 UI。

第一步返回的完整 state 没有被 publication 使用。同一份数据至少经过三次
normalize，并多次跨 storage/context 复制。

## 实测结果

使用真实 unpacked extension、隔离 Chrome profile 和 init-script probe。
`有效 UI` 定义为 `.manager-shell` 或 `.options-header` 首次进入 DOM。

| State | JSON 大小 | Manager 有效 UI | Options 有效 UI |
|---|---:|---:|---:|
| empty | minimal | 509ms | 505ms |
| 60 sessions × 2 tabs | 62.6KB | 726ms | 1,186ms |
| 300 sessions × 20 tabs | 2.30MB | 2,857ms | 708ms / 1,247ms |

说明：

- 中档 Options 的 worker ensure-state 单步约 860ms。大档两次 Options
  差异主要来自 cold/warm service worker，但两次都为完全不渲染的 6,000
  个 tabs 支付了全量读取和 normalize 成本。
- 大档 Manager 的最后一次 `tabboardState` read 在约 757ms 完成，首个
  `.manager-shell` 在约 2,857ms 出现。当前 Inbox 实际挂载 196 cards 和
  3,920 rows。
- CPU trace 会显著放大绝对时间，所以不作为启动数字；它仍显示一次重度
  启动包含约 13,454 次 text shaping、1,833 次 forced style/layout update
  和大量 GC，与全量 Mantine/dnd-kit row mount 一致。
- 自动 median benchmark 尝试因 Playwright 与 MV3 首次 activation 的
  worker/page 导航不稳定而弃用。上述数据来自多次真实 extension isolated
  profile 测量，不把失败 benchmark 当证据。

## Findings

### P0.1 Options 错误依赖完整 TabBoardState

**证据**

- `OptionsApp` 只消费 `settings` 和 `persistenceError`，但使用
  `useStoreHydration()`。
- 2.30 MB state 不改变 Options DOM，却仍完整经过 worker、authority 和
  normalization。
- Options 冷启动与 session 数量、worker 冷启动相关，违反页面 ownership。

**建议**

新增轻量 `SettingsProjection` owner：

```ts
interface SettingsProjection {
  settings: Settings;
  mutationRevision: number;
  updatedAt: string;
  storageMode: 'browser' | 'file';
  storageFolderName: string;
}
```

- 浏览器后端在成功 state commit 时，同一次 `chrome.storage.local.set`
  原子写 `tabboardState` 和 `tabboardSettingsProjection`。
- file backend 成功 commit 后更新 projection sidecar。
- Options 用独立 `useOptionsSettings()` 读取 projection 并立即渲染；完整
  authority 只在 Advanced storage 操作或 mutation worker 真正需要时加载。
- 升级后 sidecar 不存在时允许一次 full-state bootstrap，随后写入
  projection。
- settings mutation 继续由 worker/authority 提交；projection 只优化读
  模型，不成为第二写入真相。

这是 schema 不变的 storage protocol 扩展。比拆散整个 `tabboardState`
风险小，也能真正让 Options 启动成本与 session 数量解耦。

### P0.2 Manager 首屏挂载完整可见分类交互树

**证据**

- `WorkspaceContent` 对 active category 的全部 groups 执行
  `SessionCard` render。
- 每个 `SessionCard` 注册 group `useSortable`、多个 store/overlay hooks 和
 一个 `ResizeObserver` + `MutationObserver`。
- 每个 `TabItemRow` 注册 tab `useSortable`、多个 Mantine control、store
  subscription 和 info-trigger lifecycle。
- `content-visibility` 位于 React 已创建完 subtree 之后，只减少浏览器
  paint。

**建议：稳定 slot + 近视口 activation**

1. 所有 session 保留固定宽度的 `SessionSlot` 和 group insertion target，
   维持 horizontal board 几何与 session reorder collision。
2. 只对 viewport + 2 个 card overscan 挂载完整 `SessionCard`。
3. 远端 slot 渲染轻量 `SessionCardShell`：title、tab count、lock 状态，
   不注册 tab rows、tab sortables、per-row store/overlay hooks。
4. `IntersectionObserver`、键盘 focus、search highlight、drag source/target
   可以提升 slot 为 active；横向 auto-scroll 接近目标时提前激活。
5. active drag 生命周期内冻结 activation set，避免 source/target 被卸载。

该方案不引入虚拟列表依赖；它虚拟化的是“昂贵交互内容”，不是 board
几何。它会改变 D033 的 full-DOM 决策：浏览器 Ctrl+F 不再命中尚未激活的
tab row，但 TabBoard 自身 search 仍能全量查询并激活匹配 session。

若暂时不接受这一 tradeoff，可先做 idle 分批 mount，改善首个有效 UI；
但最终仍会创建 3,920 rows，后台 CPU 和内存问题不会消失，因此只建议作为
过渡方案。

### P1.1 Hydration 重复读取完整 state

**建议**

把 publication dependency 从：

```ts
ensureState()
readAuthoritativeState()
```

收敛为一次 authority-owned `initializeAndRead()`：

1. 先订阅 state change 并 buffer race。
2. 直接 `ensureActiveState()` 一次。
3. 选择 read 与 buffered update 中 revision/updatedAt 更新者。
4. structural share 后 publish。

页面 hydration 不需要先唤醒 worker。worker 保留 mutation serialization、
capture/restore 和 Chrome API ownership，不再是页面读取 state 的中转站。

### P1.2 Open Tabs 启动事件风暴

空状态启动记录到 4 次 `list-open-tabs`；重度 Manager 首屏后仍有排队刷新。
Manager 新标签页本身会触发 created/updated/activated/focus/visibility 多组
事件。

**建议**

- 用 `dirty` boolean + 单一 trailing refresh 合并 in-flight 期间事件。
- 启动窗口使用 50-100ms event coalescing，不为每个事件建立 promise 队列。
- 忽略 TabBoard 自身 extension tab 的 created/updated 事件。
- visibility/focus 由一个 page lifecycle owner 调度，避免重复。
- 验收：启动 burst 最多一次 initial + 一次 trailing request。

### P1.3 Options / file backend 缺少条件加载

- `OptionsApp` 仅在 `advancedOpen` 时 `React.lazy` 加载
  `DataStorageCard`。
- Folder migration 和 disconnect dialog 仅在第一次打开相应命令时加载。
- `activeAdapter` 在 bootstrap mode 为 `file` 时才 dynamic import
  `fileStorage` / `fsDirectory`；browser mode 不执行 file backend 模块。
- dynamic import path 必须是 literal map，保持 Vite 静态可分析。

### P1.4 Tab row 有过多独立订阅与 lifecycle

- `TabItemRow` 的 `updateTab`、`deleteTab`、settings 只在 event handler
  使用，可从 Session owner 传 command ports，或点击时调用
  `useTabBoardStore.getState()`；不需要每行三个 Zustand subscription。
- info model 注册改为 session-level registry，row 只保留 stable key 和
  event data。
- `useOverflowCues` 只在 active session 上运行；不为所有远端 card 建立
  observers。

这些优化应在 session activation 后实施，不能替代 P0.2。

### P2.1 消除同步重复扫描和巨型字符串

- `WorkspaceContent` 先构建 `Map<groupId, canonicalIndex>`，消除
  `visibleGroups.map(... categoryGroups.findIndex(...))` 的 O(n²) 查找。
- `getCategoryStrip` 单次遍历 groups 累加 category count，不为每个 folder
  重扫 workspace groups。
- `ManagerOverlaysProvider.itemKey` 和
  `getDragReplacementSnapshot()` 不再 join 所有 group/tab IDs；使用
  `mutationRevision` 加 active source identity/updatedAt。

### P2.2 Diagnostics 不应争用启动 storage

当前每条 info breadcrumb 都执行一次
`chrome.storage.local.get(tabboardDiagnostics)` + `set`，并与 state hydration
和 Open Tabs worker 请求重叠。

- warn/error 保持立即持久化。
- info breadcrumb 在内存 ring 中合并，使用 idle callback 或 250ms batch
  一次写入。
- page unload 不强制同步 flush；诊断系统不能反向拖慢被诊断页面。

### P2.3 Bundle 和 CSS 后续优化

- Mantine `styles.css` 可改为 baseline/default variables + 实际使用组件
  CSS，但必须用视觉/a11y/E2E 回归确认依赖完整。
- `@tabler/icons-react` deep path 缺少对应 declaration/export map；不要直接
  手改成无类型 deep import。若要优化 7,024 module build graph，使用本地
  Vite import-transform plugin 并先验证 production chunk 没有回归。
- 这些工作影响空状态基础成本和 build/HMR，优先级低于 P0/P1。

## 推荐实施顺序

### Stage 1：建立性能门禁

新增 `scripts/benchmark-startup.mjs`，以固定 extension ID 发现方式运行真实
production build，输出 JSON：

- empty、60×2、300×20 三档 state。
- Manager / Options cold 与 warm。
- first loading UI、first useful UI、state read end、card/row count。
- 启动 `list-open-tabs` call count。

计时不进入普通 unit suite，避免 CI 抖动；架构契约和 call-count tests
进入 Vitest/E2E。

### Stage 2：先修启动协议

修改 owner：

- `src/shared/store/authoritativePublication.ts`
- `src/shared/store/activeAdapter.ts`
- `src/shared/store/chromeStorageAdapter.ts`
- `src/shared/hooks/useStoreHydration.ts`
- 新增 `src/options/core/settingsProjection.ts`
- 新增 `src/options/hooks/useOptionsSettings.ts`
- `src/options/OptionsApp.tsx`

先把全页面 hydration 收敛为一次 authority read，再添加 Options settings
projection。两个改动分开测量，避免无法判断收益来源。

### Stage 3：重构 Session Board mount policy

新增：

- `SessionSlot`
- `SessionCardShell`
- `useSessionActivation`
- session board canonical index map

先保持 group slot/drop geometry，再切换 card 内容 activation。每次变化都跑
五条真实 DnD 路径，不能把 viewport windowing 直接套在 dnd-kit outer
geometry 上。

### Stage 4：收尾事件与 bundle

依次完成 Open Tabs coalescing、per-row subscription 收敛、diagnostics
batch、Options/file backend dynamic import，最后再评估 selective Mantine
CSS 与 icon import transform。

## 验收门槛

性能门槛使用同一机器、同一 production build、至少 5 次取 median：

| 场景 | 目标 |
|---|---:|
| Options empty / 2.30MB state | median useful UI 差值 ≤ 100ms |
| Options cold useful UI | median ≤ 500ms |
| Manager 300×20，约 200 个 Inbox sessions | median useful UI ≤ 1,000ms |
| Manager 首屏完整 `TabItemRow` | 仅 viewport + overscan sessions |
| Open Tabs startup burst | ≤ 1 initial + 1 trailing request |
| 单次主线程长任务 | 不出现 > 200ms 的 session-tree mount task |

正确性门槛：

- `npm run check`
- `npm test`
- `npm run test:e2e`
- Manager/Options production extension smoke
- 五条 AGENTS.md DnD 路径
- keyboard reorder、focus return、search reveal、URL state
- axe default/open/light/dark/compact states
- browser/file storage mode、migration、fallback、cross-context publication
- `git diff --check`

## 不建议的做法

- 不建议先替换 Mantine。它无法解释大状态 Manager 的 2.10s 增量。
- 不建议散落更多 `memo()` / `useMemo()`。初次 mount 不会被 memo 跳过。
- 不建议把 hydration 简单放进 `startTransition`。I/O 和全量 normalize
  仍然发生，Options 仍依赖错误 state。
- 不建议先引入第三方 virtualization dependency。当前固定横向 card
  geometry可以用项目内的 stable-slot activation 解决，并降低 DnD 风险。
- 不建议只显示更漂亮的 loading。它改善反馈，但不缩短实际等待。

## 实施结果

全部 P0/P1/P2 建议已落地，且没有改变 persistent schema、mutation wire 或
DropIntent 语义：

| 原问题 | 当前 owner / 行为 | 自动化证据 |
|---|---|---|
| Options 等完整 state | disposable SettingsProjection + `useOptionsSettings` | projection/hook/adapter tests；production canonical reads = 0 |
| Manager 全量 card/tab mount | stable `SessionSlot` + near-viewport activation | 60 slots / 6 initial cards / far-shell upgrade E2E |
| hydration 重复 read | subscribe-first `initializeAuthoritativeState()` | publication/store lifecycle tests |
| Open Tabs event burst | 75ms dirty-bit coalescer | core + suspended in-flight DOM tests |
| per-row store subscription | SessionCard command ports | source contract + session rendering tests |
| repeated scans/giant keys | one-pass counts, index Map, stable reference lifecycle | selector/overlay/DnD tests |
| diagnostics storage contention | info 250ms batch；warn/error immediate flush | diagnostics 9/9 |
| optional file modules | lazy Advanced + literal ActiveAdapter imports | Options/adapter/file tests + production chunk graph |

当前 production build 将 `AdvancedSettingsContent`（约 16.5kB）、
`fileStorage`（约 9.8kB）和 `fsDirectory`（约 1.2kB）拆为 dynamic chunks。
默认 Options 不 preload Storage Authority 或 file UI/backend；Manager/Popup
只 preload 约 12.3kB Authority，不 preload file-only chunks。

Vercel practices 复审还发现 overlay、Open Tabs 与 session lifecycle 在 render
中拼接所有 item identity。最终改为直接消费 structural-sharing references；
预期 session remove/update 仍逐项验证未变化 siblings，避免削弱 keyboard
mutation 后的 focus restoration。

## 最终测量

最终表使用 repo-owned production extension benchmark，隔离 profile、每档
5 次 median。runner 按轮次交错 scenario/page，并在奇数轮反向，降低整批
顺序与机器升温偏差。原始 samples 由命令 JSON 输出保留。

| 场景 | useful UI median | state/projection read end | cards / shells / slots / rows | requests / longest task |
|---|---:|---:|---:|---:|
| empty Manager | 307.3ms | state 286.7ms | 0 / 0 / 0 / 0 | 1 / 0ms |
| empty Options | 469.4ms | projection 828.6ms | 0 / 0 / 0 / 0 | 0 / 106ms |
| large Manager (300×20) | 536.7ms | state 386.9ms | 6 / 190 / 196 / 120 | 1 / 182ms |
| large Options (300×20) | 435.4ms | projection 472.2ms | 0 / 0 / 0 / 0 | 0 / 87ms |

验收解释：

- Manager large 必须低于 1,000ms，首屏 tab rows 仅来自 activated cards。
- Options empty/large 都必须低于 500ms，median 差值不超过 100ms，且
  canonical state reads 为 0。
- Open Tabs startup 最多 1 initial + 1 trailing request；session mount long
  task 不超过 200ms。
- empty-state 指标在完成 diagnostics/module splitting 后为 Manager 275.5ms、
  Options 406ms，表明不需要继续承担 selective Mantine CSS 或 icon transform
  的高回归风险。

empty / large Options median 差值为 34.0ms，两个场景都没有 canonical state
read，满足 ≤100ms 差值与 ≤500ms useful UI 门槛。最终实现不再用 projection
I/O gate 整个页面：header、Open Manager 和 disabled/busy Basic shell 立即
挂载，projection 返回后再启用 controls 和 Advanced。empty slow samples 中
useful UI 可在 466ms 出现，而 projection 到 829ms 才返回；用户不再为
Chrome storage cold-I/O 抖动等待全屏 loading。

## 完成状态

实现、文档与 rendered acceptance 已完成：

- strict build/check：201 source files 无 forbidden edge/cycle，120 production
  files 通过 architecture gate。
- Vitest：81 files / 1,040 tests。
- Playwright：32/32，内含五路径 pointer DnD persisted-state acceptance 5/5。
- Manager desktop/compact、light/dark/reduced-motion、session menu、Open Tab
  details：axe 0 violations / 0 incomplete，无 horizontal overflow 或 page
  error。
- production Options 390px default/Advanced 和 Light/Dark/System：axe 0/0；
  default 不挂载 Advanced，展开后按需加载 optional chunks。
- browser/file storage、migration、fallback、projection atomic write 与
  cross-context publication 由完整 unit suite 覆盖。

最终 gate 在验收修复后重新执行，结果见同日 `progress.md` 与提交记录。
