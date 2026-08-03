# Crisp Utility 预览到生产实现取证式一致性审计

日期：2026-08-02  
状态：进行中  
适用页面：Manager、Popup、Options

## 审计目的

本审计不再用“页面终态截图正常”“axe 无违规”或“E2E 全绿”代替视觉与交互验收。已确认预览和中文设计规范是视觉、状态与交互合同；生产实现必须对每个合同分别提供以下五类证据：

1. **结构**：可见内容、层级、命令归属、状态组合与预览一致。
2. **几何**：真实渲染后的尺寸、间距、对齐、截断、覆盖和滚动归属一致。
3. **时间**：延迟、淡入、位移、反向、取消和 reduced-motion 的中间帧一致。
4. **交互与焦点**：pointer、keyboard、focus return、Escape、右键和状态转换一致。
5. **可访问性**：语义、命名、tab order、inert/hidden、live region 和对比度一致。

任何一列缺少真实证据时，该合同保持“未验收”。源代码断言只能辅助定位 owner，不能单独关闭几何或时间证据。

## 证据标记

- `待取证`：尚未使用真实渲染或实际交互核验。
- `一致`：已有本轮可复现证据。
- `差异`：已确认生产实现偏离合同，等待回归测试和修复。
- `修复待复验`：已修改，但尚未完成同维度复验。
- `手工边界`：浏览器原生能力或真实设备行为不能由当前自动化完整覆盖。
- `不适用`：该合同没有对应维度；必须写明原因。

## 审计环境矩阵

| 维度 | 必测状态 |
|---|---|
| 主题 | A1 Light、D1 Graphite |
| 宽度 | 1440px desktop、900px 边界、760px compact、390px narrow |
| 输入 | fine pointer、keyboard-only、coarse pointer / touch emulation |
| 数据 | empty、single、populated、long title/name/path、emoji、ZWJ emoji |
| Open Tabs | collapsed、peek、pinned、drawer、selection empty/partial/all、filter active、pinned |
| Sessions | unlocked、locked、note、empty、selected empty/partial/all、hover/focus/menu |
| Storage | browser、folder healthy、folder fallback、permission/error、switch confirmation |
| Popup | pinned mixed/only/excluded、duplicates removable/protected/zero、close-after-save on/off |
| DnD | start/between/end、existing/new/empty target、all-source suppression、cancel、auto-scroll |

## 明确允许的覆盖

以下覆盖是产品合同的一部分，但仍须验证位置和尺寸：

- checkbox 覆盖 favicon；
- pinned badge 覆盖 favicon 右下角；
- Peek / Drawer 覆盖 Board；
- drag ghost 覆盖 Gap Anchor / Empty target。

除此之外，icon、emoji、文字、计数、按钮、焦点环、菜单、tooltip、drag target 之间的覆盖均按缺陷处理。

## 合同矩阵

| ID | 已确认合同 | 生产 owner | 关键边界状态 | 结构 | 几何 | 时间 | 交互与焦点 | 可访问性 | 当前结论 |
|---|---|---|---|---|---|---|---|---|---|
| P1 | Open Tabs 显式 selection mode；Select/Unselect All 仅作用于可见结果；Filter 独立；整窗 capture 只有 context-bar Save All | `OpenTabsPanel.tsx`, `OpenTabsSelectionBar.tsx`, `OpenTabsFilterFooter.tsx`, `useOpenTabsRuntime.ts` | 0/部分/全部选中、过滤后全选、退出选择、peek promote、唯一 Save All | 修复一致：四动作、empty mode、visible select、移除顶栏重复 Save Window | 一致：同槽 toolbar；filter dot 见 P5 | 不适用：bar 原位替换 | 一致：0/select all/exit、hidden selection 保留、collapse 清理、query 保留 | 一致：names/disabled/count/live | 已取证 |
| P2 | Sidebar 四态：52px collapsed、overlay peek、reflow pinned、inert drawer | `Sidebar.tsx`, `OpenTabsPanel.tsx`, `useSidebarDisclosure.ts`, `header.css`, `sidebar.css` | dwell、keyboard peek、rapid reversal、selection/filter promote、900px、reduced motion | 一致：四态 owner | 修复一致：52/expanded/overlay/drawer；展开 Open copy 34px offset 且 icon center 稳定 | 一致：180ms、75/80ms、反向、reduce | 一致：promote/inert/focus return | 一致：collapsed tab order/inert；覆盖态 contrast 为手工判定边界 | 已取证，含覆盖态边界 |
| P3 | 无可见 drag icon；正常表面支持 pointer drag；键盘结果使用 Hybrid Commands | `SessionCard.tsx`, `OpenTabRow.tsx`, Workspace/Category manage UI, `SessionTargetPicker.tsx` | interactive descendant、touch、Escape、focus return | 一致：surface pointer + named commands | 一致：无 resting handles | 一致：activation/cancel | 一致：picker preview/cancel/focus | 部分一致：touch long-press 手工边界 | 基本取证 |
| P4 | 只读 Tab tooltip 与交互菜单分离 | `useManagerOverlays.ts`, `OpenTabRow.tsx`, `TabItemRow.tsx`, `overlays.css` | hover 180ms、focus immediate、edge flip、title 2/link 4、pointer transparent | 一致：共享只读实例、无交互内容 | 一致：Open/Saved 整行 6px、top/bottom flip、390px clamp | 一致：120ms 未出现、190ms 已出现、focus immediate | 一致：纵向切换、Escape、无交互内容 | 一致：tooltip role、aria-describedby、dark/compact | 已取证 |
| P5 | Window 语义、当前窗口角标、collapsed filter quiet indicator | `OpenTabsWindowBar.tsx`, `OpenTabsFilterFooter.tsx`, `OpenTabsPanel.tsx` | multiple windows、selected vs Chrome-focused、filter active collapsed | 修复一致：window row 只含 glyph + disclosure；filter count semantics | 修复一致：7px dot/3px inset；Window glyph 已量 | 不适用 | 一致：query collapse/reopen retained | 一致：Expand announces result/total | 已取证 |
| P6 | P2 Popup；等宽 Save/Remove；setting-aware helper；pinned 与 duplicate 语义 | `PopupApp.tsx`, `popup.css`, shared window dedupe owner | mixed/only/excluded/no pinned、protected duplicate、save-and-close on/off | 修复一致：六场景、capture/Remove scope 分离、最终 pinned copy、纯文本 Save/Remove | 修复一致：P2 52/16、80x32、按钮内 0 SVG、no-pinned 无空轨道 | 不适用：无连续 motion 合同 | 一致：Include Pinned、Save disabled、confirm/focus、实际 closure 结果 | 一致：main/H1/status/names；light/dark axe 待全量复跑 | 已取证 |
| P7 | Options configured-target-first storage 状态与 fallback/recovery | `DataStorageCard.tsx`, `DisconnectDialog.tsx`, `FolderPickerDialog.tsx`, `options.css` | browser、long folder、folder healthy/fallback、permission、switch/reset | 修复一致：Browser primary Choose Folder + detail explanation；ready/fallback configured context | 修复一致：two-layer 24px、long name ellipsis + updated、1024/390 无 overflow | 不适用：无连续 motion 合同 | 一致：projection subscription、reset/switch confirmations；native picker 手工边界 | 一致：names/status/focus；native permission 手工边界 | 已取证，含手工边界 |
| P8 | 全局 Lucide 映射、1.75 stroke、32px desktop / 44px coarse、A1/D1 状态 | `TabBoardIcon.tsx`, `AccessibleIconAction.tsx`, shared theme/CSS | resting/hover/focus/disabled/danger、light/dark、coarse | 修复一致：逐 action glyph class 锁定 Save/Restore/Settings/Trash/Menu/X | 修复一致：18px toolbar / 16px menu、32px desktop / 44px coarse | 不适用 | 一致：hover/focus/disabled/danger samples | 一致：native theme-color + focus | 已取证 |
| P10 | B2 菜单 + C3 item tips；row hover 快捷 X；右键菜单；checkbox 覆盖 favicon | menu policy, Workspace/Category/Session/Open/Saved row owners, `overlays.css` | hover/focus/right-click、menu wrap、Escape、long copy、open vs saved | 修复一致：全 menu inventory、Open none、Open/Saved title/meta 两层 | 修复一致：29px/16px menu；Workspace 18px/14px Edit；Open 24px leading column / Saved 20px owner；14/20 + 12/16、至少 44px | 一致：keyboard immediate / pointer 550ms | 一致：first focus、wrap owner、Escape return | 一致：names/roles；coarse menu 44px | 已取证 |
| P11 | Create Workspace 共用 editor；Inline Favorites emoji picker | `WorkspaceEditorModal.tsx`, schema/mutations | empty/duplicate/long name、16 emoji、ZWJ、arrow/Home/End/Escape | 一致：16 favorite + Custom + preview | 一致：8 columns、square options、无 overflow | 不适用 | 一致：arrows/Home/End/ZWJ/Escape focus | 一致：pressed/labels；coarse 6列/44px | 已取证 |
| P12 | Dense Manage Workspaces；manager 内 Create；edit 复用 P11 modal；row reorder + keyboard commands | `WorkspaceManagerModal.tsx`, `WorkspaceEditorModal.tsx`, `TabBoardModal.tsx` | current/non-current、last workspace、long name、emoji、create/reorder/delete | 修复一致：统一列表、四项行命令、header New、footer Done、动态单复数 subtitle | 修复一致：普通 row 显式 surface、current、49px、5px、header/footer 分层、390 无碰撞 | 不适用 | 修复一致：Create/Edit nested inert、Escape exact focus、Done close、reorder | 修复一致：sortable row 使用 named `group`；header/New/Done/Close 与行 actions 44px | 已取证；meta contrast 自动判定边界已人工证伪遮挡 |
| P13 | Dense Manage Categories；内建/自定义权限；共用 editor；直接 reorder | `CategoryManager.tsx`, `CategoryNav.tsx`, `TabBoardModal.tsx` | built-in/custom、locked delete、validation/color、long name、reorder | 修复一致：name/meta 两层、header Add + count subtitle、footer Done | 修复一致：48px、1px、32px、5px、active、header/footer 分层 | 不适用 | 一致：nested focus、direct/manager reorder | 修复一致：sortable row 使用 named `group`；coarse 44px；unpacked axe 0/0 | 已取证 |
| P14 | Session-local Saved Tab selection toolbar | `SessionSelectionToolbar.tsx`, `SessionCard.tsx`, `TabItemRow.tsx` | empty mode、partial/all、filtered、Save target、Delete、Exit | 一致：header 原位替换与六动作 | 一致：340px production 内 314/314 无溢出 | 不适用：无连续 motion 合同 | 一致：empty/link/note/mixed/locked/filtered/async | 一致：focus/names/disabled/live | 已取证 |
| V1 | A1/M1/N1/B3 Manager composition + S1/T1 Session material | Manager shell/header/sidebar/session CSS and components | long title 2 lines、note、metadata、hover actions、light/dark | 一致：composition/material owners | 一致：340px、2-line title、S1 note、actions | 一致：progressive/Sidebar motion | 一致：hover/focus/menu/selection | 一致：dark/compact/coarse | 已取证 |
| V2 | O2 Basic + A2 flat Advanced Options，层级与控件规范一致 | `OptionsApp.tsx`, Advanced/Restore sections, `options.css` | popup default、exact helper/exclude wording、advanced URL、390px、light/dark | 修复一致：Basic/Advanced final-polished structure 与两句 Exclude guidance | 一致：680/32、96 header、tokens、flat rows | 不适用：disclosure 无连续 motion 合同 | 一致：URL/lazy/storage subscription、save error/Retry | 一致：390 dark/coarse no overflow | 已取证 |
| D1 | 固定 340px Session track；20px start/between/end Gap Anchor；加号在 ghost 下 | DnD coordinator/geometry, `NewSessionGapTarget.tsx`, shell/session CSS | saved/open one/many、all-source suppression、existing/new、track edges | 一致：explicit new target / existing intents | 一致：340/16/20px、start-between-end、layers | 一致：300ms tip/no hysteresis | 一致：release commit/leave clear/suppression | 一致：SR announce + Hybrid alternative | 已取证 |
| D2 | Empty Category first-slot target；线框内命中；copy 替换 empty message | `NewSessionGapTarget.tsx`, category board empty state | inactive/active、ghost stacking、leave/cancel、all-source suppression | 一致：first-slot only | 一致：340px full-height、ghost over plus | 一致：active/leave/create continuity | 一致：copy replacement/release | 一致：single copy/no hidden tip | 已取证 |
| D3 | 48px Progressive Edge auto-scroll；exact plus 命中暂停、离开恢复 | `useBoardDragAutoScroll.ts`, DnD coordinator | left/right、speed tiers、existing hysteresis、reduced motion | 一致：Board-only owner | 一致：48px zones/ghost fixed | 一致：3-12px frame、pause/resume/reduce | 一致：exact plus and idle stop | 不适用：pointer spatial behavior | 已取证 |
| D4 | immutable drag ghost；取消回滚；named keyboard command 等价 | `ManagerDragOverlay.tsx`, DnD coordinator, target picker/manage commands | pickup/target/cancel、source replacement、focus/live announce | 一致：immutable template + Hybrid commands | 一致：bounded geometry/opacity/z-index | 一致：pickup-target-cancel | 一致：Escape/authority/focus/live preview | 一致：named choices | 已取证 |

## 被覆盖的预览

- Preview 9 的菜单视觉比较已被用户确认的 Preview 10 / B2 + C3 合同覆盖。
- 早期 DnD unified slot 与 live-reflow 方案已被最终 Gap Anchor 合同覆盖。
- 任何旧 taste 建议若与 P1-P14、V1-V2、D1-D4 冲突，以本矩阵列出的后续确认合同为准。

## 本轮证据记录

### 2026-08-02 Manager / Popup / Options 默认态

- Manager 1440x900、Popup 320x700、Options 1024x900。
- 截图：
  - `/tmp/tabboard-phase21-manager-default.png`
  - `/tmp/tabboard-phase21-popup-default.png`
  - `/tmp/tabboard-phase21-options-default.png`
  - 同名 `-annotated.png` 文件。
- 默认态无未批准的可见兄弟碰撞或横向 document overflow。
- Popup Save/Remove 均为 80x32；fine pointer 顶栏 action 为 32x32；可见
  checkbox icon 在 24px owner 内居中。

### 2026-08-02 Manager 边界数据与 Tooltip

- Fixture：3 Workspaces、长 Workspace 名、ZWJ emoji、长两行 Session title、
  长 Saved title/link、group note、locked Session、长/locked Category。
- Session 340px x 812px；标题两行共 36px；title/actions、title/meta、
  meta/note 均不重叠；Note 为 2px accent rule + 6px/8px padding。
- Open Tab tooltip 相对完整行 6px；Saved Tab 初始相对完整行 2px，确认差异。
- RED：`tests/e2e/open-tab-preview.e2e.ts` 收到 2px，期望 6px。
- GREEN：共享 anchor 改为 owning row 后 Open/Saved 均为 6px；focused
  Vitest 3 files / 110 tests 通过。

### 2026-08-02 Manage Workspaces / Categories

- 截图：
  - `/tmp/tabboard-phase21-manage-workspaces-rest.png`
  - `/tmp/tabboard-phase21-manage-categories-rest.png`
  - `/tmp/tabboard-phase21-manage-workspaces-fixed.png`
  - `/tmp/tabboard-phase21-manage-categories-fixed.png`
- Workspace RED：当前行无 state class、背景和边框。GREEN 后 current row
  49.09px，accent-soft 背景和 quiet accent border；最终 unpacked 复查后，
  普通行也按 Preview 12 使用显式 surface。
- Category RED：生产行 29px、0px border、单行 summary、24px actions。
  GREEN 后每行 48px、1px border、name 16px + meta 13px、14px swatch、
  32px actions，无横向 overflow。
- 两列表 gap 均先测得 10px；新增 RED 后统一为最终预览的 5px。
- Focused gate：2/2 rendered E2E，4 files / 70 Vitest。
- Focus interaction initially overwrote both current/active materials. RED
  recorded accent-soft changing to ordinary hover; repaired selectors retain
  state material through hover/focus. Nested Workspace Edit also passed inert,
  aria-hidden, Escape, and exact focus-return checks.

### 2026-08-02 Session selection toolbar

- 截图：
  - `/tmp/tabboard-phase21-session-selection-empty.png`
  - `/tmp/tabboard-phase21-session-selection-one.png`
- 340px Session 的 toolbar 可用宽度 314px；scrollWidth/clientWidth 均为
  314px，六个 32px actions 全部位于 toolbar 内。
- `0 Selected`：Select All 与 Exit enabled，其余 data actions disabled，焦点
  自动进入 Select All。
- `1 Selected` Link：Restore/Copy/Move/Delete 全部 enabled，无横向滚动。

### 2026-08-02 Popup P2 direct comparison

- Approved screenshot: `/tmp/tabboard-phase21-approved-popup.png`。
- RED before repair：header 44px、padding 12px、brand 18px、count 500、
  checkbox owner 24px、pinned helper 强制一行；最终 HTML 分别为
  52px、16px、22px、700、16px、两行。
- GREEN after repair：52px header、16px body、10px row gap、22px brand、
  16px checkbox、4px pinned gap、32px helper、40px duplicate row、80x32
  Save/Remove。
- 不把 preview-only 空 feedback / separator 占位计入生产总高度合同。
- Focused gate：1/1 Playwright，2 files / 78 Vitest。

### 2026-08-02 Options final-polished direct comparison

- Approved screenshots:
  - `/tmp/tabboard-phase21-approved-options-basic.png`
  - `/tmp/tabboard-phase21-approved-options-advanced.png`
- Current-before screenshots:
  - `/tmp/tabboard-phase21-options-basic-current.png`
  - `/tmp/tabboard-phase21-options-advanced-current.png`
- RED：生产 container padding 16px（目标 32px）；Advanced 外框 1px
  （目标 0px）。同时确认 Header、H1、Section padding、heading/helper typography
  与最终 polished tokens 偏离。
- GREEN：680px surface / 32px padding、96px Header、24/32 H1、右侧
  Saved + Open Manager、24px Sections、16/22 + 13/18 heading、14/20 label、
  13/18 helper、52px flat Advanced、Storage 24px / ordinary 20px rows。
- 不改变 settings projection、save queue、Advanced URL 或 lazy mount owner。
- Focused gate：2/2 Playwright，3 files / 24 Vitest。
- Storage projection browser states:
  - ready: Local folder name + `updated: HH:mm:ss` + Change folder + Use browser storage；
  - fallback: 保留相同 folder/time，增加临时 browser write warning、reason、
    Reconnect 与 Use browser storage；
  - primary/detail layer gap 24px，无横向 overflow。
- 真实 healthy directory handle 依赖 IndexedDB + 原生授权；unpacked Chrome 手工验收，
  不归入自动化全通过。

### 2026-08-02 Theme / Workspace Menu / Open Tabs states

- 390px D1 screenshots:
  - `/tmp/tabboard-phase21-manager-390-dark-fixed.png`
  - `/tmp/tabboard-phase21-popup-dark-fixed.png`
  - `/tmp/tabboard-phase21-options-390-dark.png`
- 三页无横向 overflow；旧 `theme-color=#242424` 与 D1 canvas `#1a1e24`
  不一致，RED/GREEN 后 A1/D1 分别为 `#f3f5f8/#1a1e24`。
- Workspace menu：29px row、18px Edit、14px Pencil 一致；current row 从普通
  hover 修复为 accent-soft，focus/hover 不覆盖状态。
- Filter collapsed：RED 时 query=`duplicate`、2/7 rows，但无 indicator，label
  仅 `Expand Sidebar`。GREEN 为 7px dot、可见 3px inset、pointer transparent，
  label 包含 `2 of 7`，reopen 保留 query。
- Open selection：RED 时 6 actions；移除未确认 Close/Pin 后为 4 actions。
  行级 X 与 close confirmation 保留。
- Focused gate：3/3 Playwright，3 files / 77 Vitest。

### 2026-08-02 Menus, Editor, Coarse Pointer, DnD, Accessibility

- Session menu 从 8 个 text-only 命令修复为 9 个 16px icon-led 命令；补齐
  `Edit Session Note`，对象化 Rename/Lock/Copy/Delete 文案，Add 与 danger
  分组，`Session Actions` 命名、first focus 与 Escape return。
- Global/Workspace/Category keep-mounted Mantine menus 通过 shared next-frame
  helper 获得首项焦点；Saved Tab Delete 文案对象化。C3 keyboard tip 立即显示，
  pointer 400ms 无 tip、600ms 显示，pointer-events none。
- Workspace editor：380px production dialog、16 favorites、desktop 8列、无溢出、
  Arrow/Home/End、ZWJ Custom、preview、validation、Escape focus return。Preview 11
  HTML 当前 A mode 不渲染 `.emoji-grid`，记录为 reference artifact 边界。
- 390x844 real touch context：Drawer/menus/Workspace Pencil/Options controls
  至少 44px；emoji grid 使用 coarse-only 6列 44px，desktop 保持8列；无 overflow。
- Open Tabs hidden selection：Filter 隐藏已有 selection；Select/Unselect All 只改
  可见 rows；隐藏 ID 继续计数并启用 Save；Collapse 清空 selection/mode 但保留 query。
- Sidebar motion serial 8/8；DnD serial 11/11；Whole-session Hybrid serial 3/3。
  并行 exact-plus 299ms 假失败在独立串行复验中通过。
- Axe 4.12.1：
  - Manager selection：0 violations / 0 incomplete；
  - Session menu：0 / 0；
  - Popup mixed：0 / 0；
  - Options Advanced fallback：0 / 0；
  - compact Drawer final frame：0 violations / 1 contrast incomplete（overlay
    overlap 使背景无法自动判定）。动画中间帧曾短暂报告低对比，等待 width +
    content opacity 终态后消失，未驱动错误改色。

### 2026-08-02 Preview 10 v3 Open/Saved row direct comparison

- 直接读取保留的最终 HTML：
  `.superpowers/brainstorm/19390-1785459648/content/crisp-utility-row-menu-selection-revision-v1.html`。
  Preview 中 Open/Saved 共用同一 `row-main` grid，title/meta 均为 block rows。
- RED 1：生产 Open row 只有 title，没有第二个 metadata child；Saved link 有
  title + URL。恢复 Open URL 独立副标题行后，结构与横向 owner/copy/X 分隔通过。
- RED 2：生产 computed style 仍不一致：
  - Open：title 12/16，URL 12/14，row 36px；
  - Saved：title 16/24.8，URL 12/16，row 50.59px。
- 生产尺寸以最终全局 token 而非缩尺 preview 数字为准：主行 title 14/20、
  weight 600，dense metadata 12/16，两类 link row 至少 44px。
- 第一次 GREEN 仍收到 Saved title 16px，定位到共享 `font: inherit` shorthand
  覆盖专用 token；调整层叠 owner 后 computed-style gate 通过。
- 新门禁同时检查：
  - 两类行至少两个 copy child；
  - title bottom 不越过 metadata top；
  - copy 位于 favicon/checkbox owner 与 X action 之间；
  - 两层 copy 完整落在 row 内；
  - 两类行使用相同 14/20 + 12/16 token 和至少 44px 几何。
- Preview 4 的 pointer delay 是 180ms；矩阵先前写入的 550/600ms 属于
  P10 的 C3 menu item description tip，已从 P4 纠正。
- P4 实页 timing/position 复验：
  - hover 120ms 时无 tooltip，累计 190ms 后可见；
  - keyboard focus 不等待；
  - 普通位置 top 6px，移除上方栏后的首行 bottom 6px；
  - 390px D1 下 tooltip 保持 8px viewport inset、title 2行、link 4行、
    `pointer-events:none`。

### 2026-08-02 Session T1 and four disclosure states

- 最终 T1 Preview 源文件指定 Session title 为 14px，生产两行 clamp 虽正确，
  但 `font: inherit` 令 computed size 仍为 16px。
- RED 实页收到 `fontSize=16px, lineHeight=18px, lineClamp=2`；补 14px
  专用 token 后同一门禁通过。
- Session Header 四态：
  - Rest：actions opacity 0 / pointer-events none；
  - Hover：100ms opacity 渐进，终态 1 / auto；
  - Keyboard focus：终态 1 / auto；
  - Menu open：`data-overlay-open=true`，actions 保持 1 / auto。
- Restore/More 在全部四态保持 32x32，不改变 title/action lane 几何。

### 2026-08-02 最新 unpacked extension 复验

- 验收对象：benchmark 后重新构建的 `dist/`，扩展 ID
  `glcboghfdmfiolnfhnpfoemmodpnkpge`；截图集中在
  `/tmp/tabboard-phase21-unpacked/screenshots/`。
- 新确认差异：Phase 20 为保持 rail icon center 引入的 43px identity column
  被错误复用于展开态。最终 Preview 10 的 Open row 是 24px leading column；
  unpacked 生产 copy 原先从 row 左侧 53px 才开始。
- RED/GREEN 后：
  - 展开态为 `24px / flexible / 32px`，copy offset 为 34px；
  - collapsed rail 仍为 43px identity column；
  - favicon 页面中心在所有 pinned 中间帧固定为 25.5px；
  - 1280px pinned 几何为
    `52 → 240.7 → 294.2 → 305.6 → 307.2px`，Board 同步 reflow；
  - copy 75ms 后开始 80ms fade；220ms 终态 opacity 1。
- Peek 实测约 364ms 进入，Sidebar 307.2px 时 Board 始终 x=52；离开回到
  collapsed。selection / Filter 从 Peek promote 到 pinned，但
  `tabboard.sidebarCollapsed` 保持 `true`，刷新恢复显式 collapsed 偏好。
- Compact Drawer 十帧实测 `52 → 133.4 → 195.2 → … → 272px`；Board 始终
  x=52 且 inert，row columns 为 `44px / flexible / 44px`；关闭后 inert
  清除并将焦点恢复到 Expand。
- 断点：901px pinned/reflow；900px 与 760px collapsed rail；760px topbar
  48px；三个宽度均无 document 横向 overflow。Reduced motion 下 shell 与
  sidebar transition-duration 都为 0s。
- 管理弹窗真实 axe 发现 Workspace/Category sortable row 使用
  `div[tabindex][aria-label]` 但没有 role。两类 row 现统一为
  `role="group"`；Category unpacked axe 为 0 violations / 0 incomplete。
  Workspace meta 仍有 1 个 contrast incomplete；显式 row/text background
  试验不改变结果，`elementsFromPoint()` 与 rect 证明没有遮挡，记录为 axe
  背景推导边界。
- Workspace 普通 row 对照最终 Preview 补回显式 surface，current 继续使用
  accent-soft；header、subtitle、New、Close、rows、Done 无 sibling overlap，
  dialog/document overflow 均为 0。
- Popup mixed：320px、52px header、16px checkbox、32px pinned helper、
  Save/Remove 纯文本 80x32，axe 0/0。No-pinned/no-duplicate 时两块 DOM 均
  不存在，body 仅 66px，没有空轨道，axe 0/0。
- Options Browser：680px surface、32px padding、96px header、Choose Folder
  在 primary row、detail gap 24px，axe 0/0。390px D1 fallback 的 long folder
  name 单行 ellipsis，updated 同行右对齐，两项 recovery action 均 44px，
  无 overflow，theme-color/canvas 为 `#1a1e24`，axe 0/0。
- Open Tooltip：120ms 不存在、累计 200ms 可见，row gap 6px、title 12/16
  最多 2 行、link 10/14 最多 4 行、CSS divider 2x10px、无控件、
  pointer-events none，axe 0/0。Saved Tooltip 同为 6px，timestamp 9/12；
  axe 对长 link 有 1 个背景推导 incomplete，rect/stack 无未批准遮挡。
- Session header 真实 pointer 复验：Rest 为 opacity 0 / pointer none；
  Hover、title focus、Session menu open 为 opacity 1 / pointer auto；Restore/
  More 始终占 32px 稳定槽。此前脚本伪造 mouseover 未形成 `:hover` 的样本已
  丢弃，不作为产品证据。

### 手工边界

- 真实触屏设备上的 long-press DnD、系统手势竞争和触觉反馈。
- 原生 `showDirectoryPicker()`、真实 OS folder permission、persisted
  `FileSystemDirectoryHandle` healthy/reconnect 生命周期。
- Peek/Drawer/Saved Tooltip 与 Workspace meta 的 axe contrast incomplete
  都来自重叠或复杂背景自动推导；已用真实坐标、元素栈和明确 token 人工核对，
  不能写作自动 0/0，也不应为追求工具数字修改已确认的覆盖/材质。

### 最终门禁

- `npm test`：104/104 files，1490/1490 tests。
- `npm run check`：通过；2666 modules；扩展产物校验通过；242 source
  import/cycle scan；138 production architecture scan。
- `npx playwright test --workers=1`：88/88 passed，约 1.3m。
- `npm run benchmark:startup`：通过：
  - empty Manager 345.9ms；Options 453.3ms；
  - medium Manager 346.4ms；Options 370.9ms；
  - large Manager 536.7ms；Options 344.6ms；
  - large-empty-inbox Manager 362.6ms；
  - large Manager 保持 6 cards / 190 shells / 196 slots / 120 rows /
    1 Open Tabs call；max longest task 190ms。
- benchmark 重建后的最终 `dist/` 再次完成三页 unpacked smoke：
  - Manager 1280px：24px leading column、34px copy offset、25.5px icon
    center、零 overflow、axe 0/0；
  - Popup 320px no-pinned/no-duplicate：52px header、80x32 Save、无空轨道、
    axe 0/0；
  - Options 390px D1 fallback：dark scheme / `#1a1e24` theme-color、44px
    recovery actions、零 overflow、axe 0/0。

### 2026-08-03 唯一 Save All 入口

- 用户真实扩展截图发现 Window 顶栏 Save Window 与下方 Save All 相邻重复。
  代码追踪确认两者都调用 `onCaptureSelectedWindow`，最终进入同一个
  `captureWindow` owner；scope、eligible count、pinned 语义和完成反馈没有差异。
- RED：
  - rendered component 收到 2 个 whole-window capture actions，目标为 1；
  - empty scope 仍渲染 disabled `Save Window: No Capturable Tabs`；
  - source contract 在 `OpenTabsWindowBar` 中命中 `onSaveWindow`。
- GREEN：删除 Window bar 的 Save props/count/icon/JSX；唯一 Save All 继续由
  normal Open Tabs context bar 持有。Capture workflow、selection scope、
  feedback 和 pinned-source retention 未改变。
- Focused verification：
  - OpenTabsPanel 26/26；
  - source/layout/accessibility 67/67；
  - serial browser 7/7，覆盖真实 Save All、pinned source、pinned/Peek/Drawer、
    selection actions 和 Window glyph。
- 最新 unpacked `dist`：
  - Pinned window bar：`Browser window` + `Collapse Sidebar`；
  - Peek window bar：`Browser window` + `Pin Sidebar`；
  - Drawer window bar：`Browser window` + `Close Sidebar`；
  - 三态 whole-window action 都只有下方 `Save All 2 Tabs`；
  - pinned Open Tab 仍计入 Save All；Pinned axe 0/0，Drawer 保持既有 intentional
    overlay contrast incomplete。
- Full verification：第二次 `npm test` 为 104/104 files、1490/1490 tests；
  `npm run check` 通过 2666-module build、242-source import/cycle scan 和
  138-production architecture scan。第一次 full Vitest 因本 worktree 一个已运行
  约 3 小时的 Vite 占用 5173，导致 preview-entry 两项环境失败；确认 cwd/port 后
  优雅停止该进程，失败文件 6/6 和第二次全量均通过。

### 2026-08-02 Tooltip 与 File Storage follow-up

- 标准控件 Tooltip 已统一为单一 `TabBoardTooltip` owner；native `title`、嵌套
  Mantine Tooltip 和 ManagerFrame 全局 synthetic mouseout 均已移除。
- pointer activation 会关闭可见 tip、清除 pending dwell，并抑制当前 target
  直到真实 pointer move/leave。Open/Saved tab preview 保留 180ms、C3 item
  description 保留 550ms，但 tab activation 使用同一静止 pointer 边界。
- `document is not defined` 根因是 stale `vite.config.js` 让真实 CLI build 与
  显式 TS-config 测试分叉，service worker 的 file imports 因而收到非空 preload
  dependencies。JS config 现只 re-export TS config，scripts 显式绑定 TS config。
- 页面 entry modulepreload 保留；仅 `activeAdapter -> fileStorage/fsDirectory`
  通过 `resolveDependencies` 变为 `[]`。最终 production HTML 的 preload 数为
  Manager 10、Popup 9、Options 4，三个页面均不是 CRX dev loading page。
- 精确历史 fallback 会在 Authority 与直接打开的 Options 中自愈一次，并通知
  service worker 重置 backend；普通 permission/corruption/offline fallback 不会
  自动重试。
- 最终新鲜门禁：
  - Vitest 104/104 files、1498/1498 tests；
  - `npm run check`：2667 modules、extension sanity、243 source import/cycle、
    139 production architecture；
  - serial Chromium 89/89，约 1.4m；
  - `git diff --check` 与 `tsc --noEmit` 通过；
  - 最终 `dist` 中 file/fs dynamic imports 均为 `import(...), []`。
- 一次 serial Chromium 为 88/89：快速反向动画测试从派发 click 固定等待 45ms，
  偶尔在 React class commit 前采样，仍看到 opening direction；最终宽度始终为
  52px。测试改为等待 collapsed class commit 后逐 animation frame 断言下降，
  未修改产品 CSS。该场景随后连续 5/5，完整套件 89/89。

后续每次浏览器取证继续追加：

- 页面与状态；
- viewport / theme / pointer 模式；
- 截图路径；
- `getBoundingClientRect()` / computed-style / focus / accessibility 结果；
- 对应矩阵单元格；
- 一致、差异或手工边界结论。

## 完成门槛

1. 每个适用单元格必须是“一致”“差异已修复并复验”或有理由的“手工边界”。
2. 不能仅凭源代码测试关闭几何、时间或焦点证据。
3. 所有差异先有 RED 回归，再改 owner，再用同一种证据复验。
4. 完整运行 Vitest、`npm run check`、serial Playwright、`git diff --check`。
5. 重建 `dist/` 后至少复验 Manager、Popup、Options 的核心终态和 Manager 的 Sidebar/DnD 动态状态。
6. 真实 touch long-press、原生 folder picker 等自动化边界必须单独列出，不得归入“全部 UI 已验收”。
