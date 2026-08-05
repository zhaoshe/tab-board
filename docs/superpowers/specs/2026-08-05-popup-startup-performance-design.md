# Popup 启动性能优化设计

## 状态

已确认采用方案 A：静态首帧、轻量设置投影、并行加载。

## 问题

当当前 Chrome 窗口中打开了较多 Tab 时，点击 TabBoard 工具栏图标后，
Popup 要过一段时间才出现。等待期间页面没有任何可见反馈，看起来像是按钮没有响应。

生产构建的调用链显示，应用侧有两个主要问题：

1. React 执行前，`popup.html` 没有可见内容和稳定高度。Chrome 无法立即绘制一个
   有效的原生 Popup。
2. `PopupApp` 只需要读取少量设置，却先水合完整的 TabBoard canonical state。
   水合完成后才调用 `chrome.tabs.query()`，因此完整 Zustand、Storage Authority
   和 mutation 模块都会进入启动路径，设置读取与 Tab 查询之间还形成了串行瀑布。

当前窗口的 Tab 查询并不是主要耗时。在生产构建中，当前窗口包含 150 个已加载
Tab 时，`chrome.tabs.query({ currentWindow: true })` 约耗时 5–7ms。
读取 2.30MB canonical state 则会在 Tab 查询开始前额外增加约 59ms。

## 目标

- Chrome 打开 `popup.html` 后立即绘制宽度为 320px、尺寸稳定的加载界面，
  不等待 React 和 Mantine 执行。
- Popup 的正常启动时间不再随 saved session 数据量增长。
- 设置投影和当前窗口 Tab 同时开始加载。
- 加载完成后的功能、交互和文案保持不变。
- 增加可重复执行的自动化约束，防止完整 Store 再次进入 Popup 启动路径。

## 不在本次范围内

- 不在 Service Worker 中缓存 Open Tab 快照。
- 不为 Popup 启动增加后台 Tab 事件同步。
- 不改变 capture、pinned tab、重复项清理、保存、关闭、主题和页面跳转语义。
- 不修改持久化 schema 和存储协议。
- 不替换 Mantine，也不重新设计已经确认的 P2 Popup。
- 不增加运行时依赖。

## 方案

### 1. 静态首帧

在 `popup.html` 的 `#root` 内直接放置一个最小静态加载壳：

- 固定 320px 宽度，最小高度与现有加载态一致；
- 展示 TabBoard 产品图标和名称；
- 使用简短加载文案：`Loading current window…`；
- 通过 `prefers-color-scheme` 适配明暗主题；
- 不放置按钮、虚假数量或其他可交互元素。

加载壳只使用少量内联 HTML 和 CSS，不加载字体、图标库、脚本或额外样式表。
React 首次提交时会直接替换这段内容。它只负责提供启动反馈，不成为第二套应用状态。

这样即使模块仍在加载，Chrome 也能立即获得非零尺寸并绘制可见内容。

### 2. Popup 设置投影

Popup 不再导入：

- `useStoreHydration`；
- `useTabBoardStore`；
- `useColorScheme`。

新增一个只读的轻量 Popup 设置 Hook，复用现有 `tabboardSettingsProjection`
协议：

```ts
interface PopupSettingsSnapshot {
  hydrated: boolean;
  error: string | null;
  settings: Settings;
}
```

Hook 的行为：

1. 先通过 `subscribeSettingsProjection()` 订阅更新，再开始读取；
2. 调用 `readSettingsProjection()`；
3. 仅当投影缺失或损坏时，才动态加载现有 canonical state fallback；
4. 获得有效投影前使用 `DEFAULT_SETTINGS`；
5. Popup 卸载时取消订阅。

该 Hook 只读取设置。Popup 不修改设置，因此不复用或导入 Options 的 mutation
队列。

### 3. 并行启动

Popup 挂载后立即并行启动两个互不依赖的任务：

- 水合 settings projection；
- 执行 `chrome.tabs.query({ currentWindow: true })`。

两个任务都结束前，继续显示 React 加载态。结束后的处理规则如下：

- 两者都成功：渲染现有 Popup；
- 设置 fallback 或读取失败：使用默认设置和已读取的 Tab 快照渲染，同时展示错误；
- Tab 查询失败：按零个可操作 Tab 渲染，并展示现有加载错误；
- 任一任务仍在执行：保持加载态。

React Strict Mode 下不能重复请求。设置 Hook 在同一 Popup generation 内共享一次
在途读取；Tab 加载使用 effect generation guard，避免 Popup 已卸载后继续写入状态。

### 4. Tab 派生计算

现有 capture、pinned 和 duplicate 派生逻辑继续留在 Popup 内，复杂度为 O(n)。
150 个 Tab 下这部分不是实测瓶颈，没有必要增加缓存或新的 Worker 协议。

如果不改变语义且代码仍然清晰，可以用一次 memoized 派生同时得到：

- 可保存 Tab；
- 当前选中的 Tab；
- pinned Tab 数量；
- duplicate 分类。

这只是可选的局部整理。本次性能修复不依赖它。

### 5. Bundle 边界

生产环境的 `popup.html` 不得同步预加载或导入完整应用 Store 和 Storage Authority。

正常且投影有效的路径可以包含：

- React、Mantine 和现有 Popup 组件；
- capture policy 和 window dedupe 纯函数；
- settings projection 的解析和订阅；
- preferred color scheme 与 page theme Hook。

`activeAdapter` 只能出现在动态 fallback chunk 中，并且只在设置投影缺失或损坏时
加载。

## 错误处理

- 设置投影缺失或损坏时，通过现有 canonical fallback 修复，然后继续启动。
- 设置投影读取失败时不能一直显示空白或 loading。Popup 使用默认设置渲染，
  并展示可操作的错误信息。
- Tab 查询失败时，Popup 以零个可选 Tab 渲染，并展示现有重试提示。
- 两个异步任务执行期间关闭 Popup，不得在卸载后继续发布状态。
- 即使初始化失败，React 也必须替换静态 HTML 加载内容。

## 测试

### 单元测试和 DOM 约束

- 静态 HTML 中存在尺寸稳定、可见且不可交互的加载壳。
- Popup 源码不再同步导入 Zustand Store、Store hydration 或依赖 Store 的主题 Hook。
- settings projection 与 Tab 查询在同一挂载周期内启动，前者不能阻塞后者。
- 两项数据都未完成前，不渲染加载完成态。
- 覆盖 projection fallback、设置错误、Tab 查询错误、卸载和 Strict Mode。
- 现有 pinned、duplicate、Save、Remove、主题、无障碍和文案测试保持有效；
  只允许根据新的设置 Hook 边界调整测试装配。

### 生产性能门禁

扩展现有 startup benchmark，增加 Popup 场景：

- 使用生产 `popup.html`，不使用 Vite preview；
- 覆盖小型 canonical state 和约 2.3MB 的大型 state；
- 使用有代表性的当前窗口大 Tab 数场景；
- 记录首次 root 内容、首次完整 Popup UI、settings projection 读取、
  canonical state 读取次数、Tab 查询次数和最长任务。

验收条件：

- 设置投影有效时，Popup 启动过程中
  `storage:get:tabboardState` 读取次数为 0；
- settings projection 与 Tab 查询并行执行，不形成瀑布；
- 当前窗口 Tab 只查询一次；
- 生产 Popup 不再同步预加载 `useTabBoardStore` 或 `activeAdapter`；
- 应用 JavaScript 执行前，静态加载壳已经存在；
- 现有 Popup E2E parity 测试没有回归。

Chrome 进程、用户配置和机器冷启动状态会导致绝对耗时波动，因此 wall-clock
数据只作为辅助证据。稳定的发布门禁是 API 调用次数和模块依赖边界。

## 手工验收

在 Chrome 中加载生产构建 `dist/`：

1. 在一个窗口中打开至少 100 个 Tab。
2. 关闭 Popup 后，点击 TabBoard 工具栏图标。
3. 确认尺寸正确的加载 Popup 会立即出现，不再有不可见或无响应的等待阶段。
4. 确认加载完成后的 Tab 数量、pinned 区域、duplicate 操作行、Save、Remove、
   Manager 和 Settings 操作与当前行为一致。
5. 重启 Chrome 后再测一次，并使用包含大量 saved session 的数据重复验证。

## 文档影响

实现完成后：

- 在 `docs/technical-architecture.md` 记录 Popup 的设置投影和并行启动路径；
- 在 `docs/feature-evolution.md` 记录本次启动性能优化；
- 只有当只读 Popup 投影形成新的长期 ownership 决策时，才更新
  `docs/product-decisions.md`。

