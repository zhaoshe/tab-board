# ZipTab Nord UI Redesign

> 本文档是下一轮 ZipTab UI 改造的设计与实施基线。执行过程中必须在每个阶段开始前重新阅读，任何偏离都需要先更新本文档并说明原因。

## 1. 状态与范围

- 文档状态：Approved direction，Phase 0-5 开发和自动测试完成；Phase 6 自动验证、文档和最终 review 修复完成，Chrome 手工验收待执行。
- 视觉参考：tabExtend new-tab manager。
- 组件基础：Web Awesome，本地 self-host。
- 产品布局：ZipTab 自定义 shell、sidebar、category navigation、session board、session card、tab rows 和 DnD。
- 配色基础：Nord。
- 改造模式：Targeted redesign，不重写业务模型和 Chrome API。

## 2. 目标

1. Sidebar 与 main panel 顶部使用同一条单行 header rail，高度和底部分隔线严格对齐。
2. Window context 变成紧凑导航，不展示 `Current window` 或 Chrome 内部 window ID。
3. Workspace、category、search 和 utility controls 使用统一高度、圆角、字体基线和图标尺寸。
4. Session columns 直接位于 board canvas 上，删除 category 外层边框、圆角背景和重复 padding。
5. 使用 Nord 构建稳定 light/dark hierarchy，避免旧 teal、硬编码蓝色和多 accent 混用。
6. 通过 Web Awesome 统一通用 controls 的 keyboard、focus、disabled、tooltip、menu 和 dialog 行为。
7. 保留现有 capture、restore、selection、open-tab filter、horizontal board 和 DnD 语义。

## 3. 非目标

本轮不做：

- React、Vue、Svelte 或其它框架迁移。
- Manager 全量重写。
- 数据 schema 改造。
- Capture/restore 产品规则调整。
- Session DnD 语义重做。
- 新增 inspector、view switcher、onboarding 或 Quick list。
- 把 Web Awesome `wa-card` 用作 session card。
- 使用 CDN、远程字体或远程图标。
- 为每个 category 或状态分配独立 accent 色。

## 4. tabExtend 参考原则

已直接检查：

`chrome-extension://ffikidnnejmibopbgbelephlpigeniph/assets/html/newtab.html`

采用的原则：

1. Sidebar 是浏览器现场，不是第二个 settings panel。
2. Sidebar header 只保留 compact window context 和少量高频动作。
3. Main topbar 单行、紧凑、低视觉重量。
4. Category segmented navigation 左对齐，utilities 右对齐，中间允许留白。
5. Session columns 是独立对象，直接放在 neutral canvas 上。
6. 主要内容比 toolbar 更醒目。
7. 通过 surface、spacing 和有限 shadow 建立层级，不使用 card 套 card。
8. Open Tabs 列表占满 sidebar，Filter tabs 固定在底部。

不机械复制：

- tabExtend 的 emoji session icons。
- tabExtend 的产品功能和 Quicklinks 模型。
- 绝对像素尺寸。
- 浏览器缩放产生的视觉尺寸。

## 5. 设计系统边界

### 5.1 Web Awesome 负责

- Button 和 icon button。
- Dropdown 和 menu。
- Tooltip。
- Dialog。
- Input 和 select。
- Checkbox、radio、switch。
- Badge。
- Alert、toast 和 loading feedback。
- 通用 focus、disabled、keyboard 和 ARIA 行为。

### 5.2 ZipTab 自定义负责

- Manager shell。
- Sidebar 和 collapsed rail。
- Window selector。
- Workspace/category topbar composition。
- Category DnD tabs。
- Session board。
- Session card。
- Open tab row 和 saved tab row。
- Selection visuals。
- DnD placeholder、insert line、target slot 和 drag image。

### 5.3 集成原则

```text
Nord primitives
  -> ZipTab semantic tokens
    -> Web Awesome theme adapter
      -> Web Awesome controls

ZipTab semantic tokens
  -> custom manager shell and product components
```

- Web Awesome 不能成为第二套视觉语言。
- 所有 Web Awesome brand/neutral/status tokens 必须从 `--zt-*` semantic tokens 映射。
- 加载顺序：Web Awesome base styles、Nord adapter、ZipTab component CSS。
- Manifest V3 页面只加载 extension 内资源。
- Web Awesome 使用静态 component imports；不运行 loader/autoloader。
- `wa-icon` 仅允许 `library="system"` 或预先配置的本地 `setIconPath()`，禁止默认远程 Font Awesome resolver。
- 不采用 `wa-include`，不允许将用户输入 URL 交给可加载 HTML/script 的组件。
- Vendored runtime 必须保留来源、上游 integrity、最终文件 checksums 和本地 patch 说明；`SHA256SUMS` 只检测 checkout drift，联网 provenance verification 使用 `npm run verify:vendor` 将 executable pins、npm registry metadata、tarball 和 patched tree 交叉校验。
- 实施前确认固定版本、license、dist 体积和 self-host 路径。

## 6. Nord 基础色

### Polar Night

| Name | Hex |
|---|---|
| Nord0 | `#2E3440` |
| Nord1 | `#3B4252` |
| Nord2 | `#434C5E` |
| Nord3 | `#4C566A` |

### Snow Storm

| Name | Hex |
|---|---|
| Nord4 | `#D8DEE9` |
| Nord5 | `#E5E9F0` |
| Nord6 | `#ECEFF4` |

### Frost

| Name | Hex |
|---|---|
| Nord7 | `#8FBCBB` |
| Nord8 | `#88C0D0` |
| Nord9 | `#81A1C1` |
| Nord10 | `#5E81AC` |

### Aurora

| Name | Hex | Semantic role |
|---|---|---|
| Nord11 | `#BF616A` | Danger/error |
| Nord12 | `#D08770` | Secondary warning only |
| Nord13 | `#EBCB8B` | Warning/starred indicator |
| Nord14 | `#A3BE8C` | Success/restore feedback |
| Nord15 | `#B48EAD` | Default unused |

## 7. Semantic Tokens

原始 Nord 只有有限 surface 层级。允许通过 `color-mix()` 或预计算 hex 生成 derived colors，但所有 derived colors 必须可追溯到 Nord primitives。

### 7.1 Light Theme

| Token | Value | Use |
|---|---|---|
| `--zt-canvas` | `#E8EBF2` | Main board canvas |
| `--zt-surface` | `#ECEFF4` | Sidebar/topbar |
| `--zt-surface-raised` | `#EEF1F5` | Session cards/controls |
| `--zt-surface-subtle` | `#E9ECF2` | Hover rows/quiet grouping |
| `--zt-text` | `#2E3440` | Primary text |
| `--zt-text-muted` | `#4C566A` | Metadata and URLs |
| `--zt-border-control` | `#6B7385` | Interactive control boundary |
| `--zt-border-subtle` | Nord3/Snow Storm derived mix | Decorative divider |
| `--zt-accent` | `#5E81AC` | DnD edge, links, structural accent |
| `--zt-accent-text` | `#506A8C` | Normal-size accent text |
| `--zt-accent-solid` | `#506A8C` | Filled active controls |
| `--zt-on-accent` | `#ECEFF4` | Text on filled accent |
| `--zt-selection` | `#DCE7EE` | Selected rows/cards |
| `--zt-focus-outer` | `#2E3440` | High-contrast outer focus ring |
| `--zt-focus-inner` | `#5E81AC` | Frost inner focus ring |
| `--zt-danger-text` | `#A94450` | Delete/error text |
| `--zt-danger-solid` | `#A94450` | Filled error feedback |
| `--zt-on-danger` | `#ECEFF4` | Text on filled error feedback |
| `--zt-warning` | `#EBCB8B` | Warning |
| `--zt-success` | `#A3BE8C` | Success |

### 7.2 Dark Theme

| Token | Value | Use |
|---|---|---|
| `--zt-canvas` | `#2E3440` | Main board canvas |
| `--zt-surface` | `#3B4252` | Sidebar/topbar |
| `--zt-surface-raised` | `#434C5E` | Session cards/controls |
| `--zt-surface-subtle` | `#3F4758` | Hover rows/quiet grouping |
| `--zt-text` | `#ECEFF4` | Primary text |
| `--zt-text-muted` | `#BAC1CD` | Metadata and URLs |
| `--zt-border-control` | `#A9AFBC` | Interactive control boundary |
| `--zt-border-subtle` | Polar Night/Snow Storm derived mix | Decorative divider |
| `--zt-accent` | `#88C0D0` | Active edge, links, DnD |
| `--zt-accent-text` | Nord8/Nord6 derived mix | Accent text |
| `--zt-accent-solid` | `#88C0D0` | Filled active controls |
| `--zt-on-accent` | `#2E3440` | Text on filled accent |
| `--zt-selection` | `#4C5F79` | Selected rows/cards |
| `--zt-focus-outer` | `#ECEFF4` | High-contrast outer focus ring |
| `--zt-focus-inner` | `#88C0D0` | Frost inner focus ring |
| `--zt-danger-text` | `#EDB6BB` | Delete/error text |
| `--zt-danger-solid` | `#A94450` | Filled error feedback |
| `--zt-on-danger` | `#ECEFF4` | Text on filled error feedback |
| `--zt-warning` | `#EBCB8B` | Warning |
| `--zt-success` | `#A3BE8C` | Success |

## 8. Contrast Rules

必须满足：

- Normal text：WCAG AA `4.5:1`。
- Large text：`3:1`。
- Focus indicators 和 interactive boundaries：`3:1`。

禁止组合：

- Nord8 背景加白字。
- Nord10 在 Nord6 上作为普通正文文字。
- Raw Aurora colors 作为 light mode 正文文字。
- 仅靠 opacity 创建 muted text。
- Nord4/Nord5 在 Nord6 上作为唯一 control boundary。
- Nord1/Nord2/Nord3 互相作为 dark mode 唯一 control boundary。

规定：

- Light filled active control 使用 `#506A8C` + Nord6。
- Dark filled active control 使用 Nord8 + Nord0。
- Light accent text 使用 `#506A8C`，不直接使用 Nord10。
- Disabled 状态同时使用 disabled attribute、cursor、surface 和文字变化，不只降低 opacity。
- Focus 使用双层 ring 或等价的高对比结构。
- 所有 `color-mix()` 最终值必须在 light/dark 下分别验证。

## 9. Layout Contract

### 9.1 Global Shell

| Property | Value |
|---|---|
| Expanded sidebar width | 272-300px |
| Collapsed sidebar width | 62px |
| Header rail height | 64px |
| Main toolbar control height | 40px |
| Sidebar compact control height | 32px |
| Main content minimum height | `100dvh` based |
| Session column width | 320-360px |
| Session gap | 14px |
| Board top/left gutter | 12px |

- Expanded sidebar header 与 main topbar 使用同一 height token。
- 两侧 bottom border 必须处于同一 y 坐标。
- Selection mode 不能改变 sidebar header 高度。
- Main topbar 不换行；窄屏进入明确 responsive layout。

### 9.2 Sidebar Header

目标：单行。

```text
[Window selector] [Save] [Select] [More] [Collapse] [New window]
```

规则：

- 不展示 `Current window`。
- 不展示 Chrome raw window ID。
- Window selector 使用 icon、display ordinal 和 tab count。
- 完整 window 信息放在 tooltip/dropdown。
- Save 保留直接入口。
- Dedupe 放入 More。
- Select 可直接外露；空间不足时可与 Dedupe 一起进入 More，但需要保留 keyboard path。
- 多窗口通过 dropdown 或 compact scrollable controls 切换。
- Collapsed rail 显示当前 window、tab favicon 和 Filter tabs 入口；window switch、collapse、new-window 与 Filter tabs 在 hover 或 `:focus-within` overlay 中可达，且 overlay 不推动 board reflow。触控场景不能依赖 hover。

推荐展示：

```text
[window icon 21 ▾]
```

Dropdown：

```text
Current window    21 tabs
Window 2           8 tabs
Window 3          14 tabs
```

### 9.3 Main Topbar

目标：单行。

```text
[Workspace ▾] [Starred | Inbox | Saved]      [Search] [Import] [Export] [Bin] [Settings]
```

Workspace：

- 收敛成一个 dropdown trigger。
- Switch/New/Rename 放入 dropdown。
- 移除 topbar 第二行 stats。
- Stats 可放 workspace menu footer，不能压缩成无语义数字。

Category navigation：

- 高度 40px。
- Active category 可使用 filled state，但不能使用 glow 或大 shadow。
- Light active：`#506A8C` + Nord6。
- Dark active：Nord8 + Nord0。
- Count 使用 `font-variant-numeric: tabular-nums`。
- Category DnD 和 keyboard behavior 保持。

Search/utilities：

- Search、icon buttons、workspace trigger、category container 共享 40px control line。
- Icon size 18px。
- 区域内 gap 8px，区域间 gap 12px。
- Desktop button label 不换行。

### 9.4 Session Board

目标结构：

```text
Board canvas
  Session card
  Session card
  Session card
```

删除：

- Category section outer border。
- Category section background。
- Category section radius。
- Category section 12px inner padding。
- Grid 左侧重复 padding。
- Board radial gradient 和 glass effect。

保留：

- 一层 board top/left gutter 12px。
- Card gap 14px。
- Bottom scrollbar reserve 8px。
- Horizontal scrolling。
- Full-height session cards。
- Card-internal vertical tab scrolling。
- Category/grid drop target DOM 和 data attributes。

### 9.5 Session Cards

- Light surface：`--zt-surface-raised`。
- Dark surface：Nord2。
- Radius：10-12px。
- Border：1px semantic border。
- Shadow：Nord0 tinted，低 opacity，低扩散。
- 不使用纯黑 shadow。
- Header compact，actions 统一为 Web Awesome icon controls。
- Tab rows mostly borderless，通过 surface tint 和 spacing 分组。
- Restore 和 More 保持当前产品语义。

### 9.6 Tab Rows and Status

- Row height：38-44px。
- Title 使用 primary text。
- URL/meta 使用 muted text。
- Hover 使用 subtle surface。
- Selected 使用 selection tint + persistent accent edge。
- Pinned 使用 Frost outline/badge，不使用 warning yellow。
- Locked 可使用 Nord9 small indicator。
- Starred 可使用 Nord13 small indicator。
- Note 可使用 Nord7-derived tint。
- 状态不能只靠颜色表达。

### 9.7 DnD

- Insert line：2px Frost。
- Target slot：selection tint + structural edge。
- Source placeholder：stable neutral placeholder。
- Invalid drop：Nord11 indicator。
- 禁止 glow 和大面积闪烁。
- 不修改 current target-slot、release margin、drag image 和 original-slot semantics，除非发现明确 regression。

## 10. Shape and Typography Contract

### Radius

| Component | Radius |
|---|---|
| Inputs/buttons/window controls | 10px |
| Segmented container | 10-12px |
| Session cards | 10-12px |
| Dialogs | 14-16px |
| Board/category wrapper | None |

### Typography

| Role | Size/line-height | Weight |
|---|---|---|
| Workspace name | 16/20px | 700-750 |
| Category label | 14/20px | 650-700 |
| Category count | 13/20px | 700, tabular |
| Search/input | 14/20px | 500 |
| Session title | 15-16/20px | 700 |
| Tab title | 13-14/18px | 600 |
| URL/meta | 11-12/16px | 450-500 |

- 不使用每处都 700/800 的粗体。
- 数量和 tab count 使用 tabular figures。
- 不引入远程 font。
- 初始阶段继续使用 system UI stack，后续若换字体需单独决策。

## 11. CSS Cleanup Rules

当前 `src/styles.css` 存在重复 manager definitions。实施时必须：

1. 合并 `.manager-board-shell` 的重复定义。
2. 合并 `.manager-topbar` 的重复定义。
3. 合并 `.board-workspace` 的重复定义。
4. 建立一个连续的 manager section：tokens、shell、sidebar、topbar、open tabs、categories、board、cards、responsive、dark theme。
5. 不允许在文件末尾继续增加第三套 override。
6. 删除不再生效的 legacy declarations。
7. 保留 popup/options 当前独立样式，直到对应迁移阶段。

## 12. Implementation Phases

### Phase 0: Dependency and Delivery Spike

Status：Development complete；Web Awesome 3.10.0 local MV3 smoke and automated delivery checks passed。

Files likely involved：

- `package.json`
- `manifest.json`
- `manager.html`
- new vendor/build scripts as needed

Tasks：

1. 固定 Web Awesome 版本。
2. 确认 license、包体积和浏览器支持。
3. 选择 self-host 方式：vendor dist 或 build copy。
4. 验证 MV3 CSP 下无远程请求。
5. 只加载一个 Web Awesome button/tooltip smoke test。
6. 验证最终 vendored tree checksums、Git 可交付性和 symlink/path containment。
7. 验证 `npm run check` 和 unpacked extension 加载。

Gate：未通过 Phase 0，不开始组件迁移。

### Phase 1: Nord Tokens and CSS Consolidation

Status：Development complete；Nord token and CSS source tests passed。

Files：

- `src/styles.css`
- optional new theme adapter CSS
- theme-related tests/docs

Tasks：

1. 建立 Nord primitives 和 `--zt-*` semantic tokens。
2. 建立 light/dark mappings。
3. 移除 old teal、hard-coded `#4d9dfc`、radial gradients 和 glass surfaces。
4. 合并重复 manager CSS definitions。
5. 映射 Web Awesome neutral/brand/status tokens。
6. 做 contrast audit。

Gate：两种主题均通过 contrast 和 screenshot review。

### Phase 2: Unified Header Rail

Status：Development complete；header view-model, markup and sizing tests passed。

Files：

- `manager.html`
- `src/manager.js`
- `src/manager-view.js`
- `src/styles.css`
- manager view/accessibility tests

Tasks：

1. Sidebar/main header 统一 64px。
2. Sidebar header 改成单行。
3. Compact window selector 删除可见 `Current window` 和 raw ID。
4. Workspace 改成 dropdown trigger。
5. New/Rename workspace 进入 dropdown。
6. Category tabs 收窄到 40px。
7. Search/utilities 统一 40px。
8. 保持 keyboard、ARIA、tooltip、selection focus 和 collapsed rail。

Gate：顶部不换行、两侧底边对齐、selection mode 不改变高度。

### Phase 3: Board and Session Surface

Status：Development complete；board/session surface tests and full automated extension check passed，code review in progress。

Files：

- `src/styles.css`
- minimal `src/manager.js` only if DOM wrapper removal is necessary
- DnD tests if DOM target structure changes

Tasks：

1. 删除 category outer frame。
2. Board 只保留一层 gutter。
3. Session cards 改用 Nord raised surface。
4. 收敛 radius、border 和 shadow。
5. Tab rows 使用 Nord hover/selection states。
6. 保留 all current drop targets and horizontal scrolling。

Gate：所有 session/open-tab/category DnD 路径保持。

### Phase 4: Web Awesome Control Migration

Status：Bounded production tranche complete。Manager search inputs、window select 和 workspace dropdown 已迁移；global button/tooltip/dialog、session/window menus 和 settings controls 延期。

优先顺序：

1. Tooltip。
2. Dialog。
3. Dropdown/menu。
4. Input/select。
5. Button/icon button。
6. Checkbox/radio/switch。
7. Toast/alert/loading。

规则：

- 每次只迁移一种 component family。
- 当前先迁移低 blast-radius 的 input/select/workspace dropdown；原“Tooltip first”顺序因 `src/icons.js` 同时服务 Manager、Popup、Options 而延期，不能通过全局重写提前完成。
- Global button/icon-button、tooltip、dialog、session/window action menu、checkbox/radio/switch 必须作为独立后续 slice，并经过真实浏览器 keyboard/focus regression。
- 每个 family 单独测试、review、manual regression。
- 不同时迁移结构布局和 DnD。
- 不使用 `wa-card` 替代 session card。

### Phase 5: Popup and Options Alignment

Status：Development complete；Nord semantic surface/control source-contract tests passed，IA and behavior unchanged。

Files：

- `popup.html`
- `src/popup.js`
- `src/popup.css`
- `options.html`
- `src/options.js`
- `src/options.css`

Tasks：

1. 复用 Nord tokens。
2. 复用已验证的 Web Awesome primitives。
3. 保留 popup quick-action scope。
4. 保留 Options Basic/Advanced IA。
5. 不扩展功能范围。

### Phase 6: Verification and Documentation

Status：Automated verification、documentation、release provenance gate and final code review complete；Chrome unpacked visual、keyboard、screen-reader and DnD regression remain user-manual gates。

Tasks：

1. 自动测试。
2. MV3 sanity check。
3. Light/dark screenshot comparison。
4. Keyboard and screen-reader smoke test。
5. Chrome unpacked manual regression。
6. 更新 feature spec、technical architecture、feature evolution 和 product decisions。
7. 最终 full diff review。

## 13. Testing Strategy

### Automated

```sh
npm test
npm run check
npm run verify:vendor
npm run check:release
git diff --check
```

需要增加：

- Window display model 不暴露 raw ID 或 `Current` 文案。
- Workspace/category/header view-model tests。
- Web Awesome local asset existence/CSP sanity checks。
- Nord token key completeness tests。
- Removed legacy color/duplicate CSS source checks。
- Accessibility markup tests。

### Manual Chrome Regression

Header/sidebar：

- Expanded sidebar 和 main topbar 同高。
- Collapsed rail controls 可达。
- 多 window switch 正确。
- New window 正确。
- Save、Dedupe、Select 可达。
- Selection mode 不改变 header 高度。

Topbar：

- Workspace switch/create/rename。
- Category click、keyboard、drag reorder。
- Search。
- Import、Export、Bin、Options。
- 1024px、1280px、1440px、超宽屏布局。

Board/DnD：

- Same-category session reorder。
- Cross-category session move。
- Target-slot 中间 50%。
- Saved tab 插入 existing session。
- Saved tabs 创建 new session。
- Selected open tabs 插入 existing/new session。
- Drag image 和 original placeholder。

Theme/a11y：

- Light、dark、system theme。
- Tab/Shift+Tab 顺序。
- ContextMenu/Shift+F10。
- Escape focus restoration。
- Visible focus ring。
- 200% zoom。
- Reduced motion。

## 14. Visual Acceptance Checklist

### Header

- [ ] Sidebar/main header 高度都是 64px。
- [ ] Bottom divider 完全对齐。
- [ ] Expanded sidebar header 只有一行。
- [ ] `Current window` 不可见。
- [ ] Raw Chrome window ID 不可见。
- [ ] Workspace stats 不占第二行。
- [ ] Main controls 高度统一为 40px。
- [ ] Icon size 统一为 18px。
- [ ] Active category 无 glow 和 oversized shadow。

### Board

- [ ] Session list 外层无 border。
- [ ] Session list 外层无 rounded container。
- [ ] Board 到第一张 card 只有一层 12px gutter。
- [ ] Card gap 为 14px。
- [ ] Horizontal scrollbar 不挤压 card。
- [ ] Cards full-height。
- [ ] Tab lists card-internal scroll。

### Color

- [ ] 无旧 teal accent。
- [ ] 无 hard-coded `#4d9dfc`。
- [ ] 交互只使用 Frost family。
- [ ] Aurora 仅用于 danger/warning/success。
- [ ] Light hierarchy：surface、canvas、raised card 清楚。
- [ ] Dark hierarchy：Nord0、Nord1、Nord2 清楚。
- [ ] Nord8 filled control 使用 Nord0 text。
- [ ] Light filled control 使用 `#506A8C` + Nord6，normal text contrast >= 4.5:1。
- [ ] Muted text 不通过 opacity 单独实现。

### Components

- [ ] Web Awesome controls 已映射 Nord tokens。
- [ ] 无 default Web Awesome visual leakage。
- [ ] Session card 未替换为 `wa-card`。
- [ ] DnD targets 仍是 ZipTab custom DOM。
- [ ] Tooltip/menu/dialog/input/select 行为统一。
- [ ] No CDN or remote runtime asset。

### Accessibility

- [ ] Normal text contrast >= 4.5:1。
- [ ] Interactive boundaries >= 3:1。
- [ ] Focus indicators >= 3:1。
- [ ] Active/selected/drop states 不只靠颜色。
- [ ] Keyboard paths 无 regression。
- [ ] Focus restoration 无 regression。

## 15. Drift Prevention Rules

执行时强制：

1. 每个 Phase 开始前重新阅读本文档。
2. 每个 Phase 只完成该 Phase 的 scope。
3. 发现更优方案时先更新本文档，再改代码。
4. 不允许通过临时 CSS override 偏离 token contract。
5. 不允许混入第二个 design system。
6. 不允许组件迁移顺带修改 capture/restore/DnD 语义。
7. 每个 Phase 完成后更新本文档中的 Status。
8. 每个 Phase 在 `progress.md` 记录文件、测试、人工验证和遗留问题。
9. 最终 review 必须逐项检查第 14 节。
10. 未完成 Chrome manual regression 时不能标记 redesign 完成。

## 16. Approved Decisions

- AD-01：允许引入 design system。
- AD-02：使用 Web Awesome，不使用 Material Web。
- AD-03：不迁移 React。
- AD-04：使用 Nord palette。
- AD-05：主 accent 使用 Frost blue，不使用 Aurora green 作为主 accent。
- AD-06：Web Awesome 只负责通用 primitives。
- AD-07：ZipTab 继续拥有 product layout 和 DnD。
- AD-08：Sidebar/main header 使用统一单行 rail。
- AD-09：Workspace 收敛为 dropdown。
- AD-10：Window context 不显示 raw ID 或 `Current window`。
- AD-11：Session board 删除 category outer frame。
- AD-12：保留 horizontal full-height sessions。

任何变更以上决策，需要用户明确批准并更新本节。
