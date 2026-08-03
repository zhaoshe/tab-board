# TabBoard Design Taste Review

## 状态

初始评审、全部建议实施、4 轮 post-implementation taste review 和最终完成审计已于 2026-07-28 完成。最后一整轮静态 + rendered review 没有产生新的 P0/P1/P2 优化建议。

## 设计判断

这是一个面向高频、多标签页用户的 local-first Chrome 生产力工作台。设计语言应当克制、紧凑、工具化，继续使用现有 Mantine 和 Tabler 体系。

设计参数：

- 设计变化度：3/10。
- 动效强度：2/10。
- 信息密度：8/10。

`design-taste-frontend` 主要面向 landing page 和 portfolio，因此其中 hero、编辑式排版、营销页面结构等规则不适用于本项目。本次只采用与产品重设计相关的原则：先判断产品领域，保持形状与材质系统一致，避免无意义的装饰性阴影，并在不降低工作密度的前提下让状态和层级清晰可见。

## 评审依据

- 阅读了项目概览、功能规范、技术架构、产品决策、上一轮 UI/UX 评审和当前组件/样式 owner。
- 评审基线为 `bfe49eb`。
- 检查了 Manager 默认 Inbox 和有内容的 Saved 分类。
- 检查了 320px Popup，以及 1280x900 下的 Options 布局。
- Fresh axe 结果：Manager、Popup 均为 0 violations / 0 incomplete。
- 现有完整验收已经覆盖亮暗主题、紧凑布局、dialog、focus、DnD 和性能。本轮没有新证据的部分不重复立项。

## 当前优势

- 产品方向正确：是高密度工作台，不是 dashboard 或 landing page。
- Manager 空间模型稳定：左侧 Open Tabs、顶部上下文与命令、右侧横向 saved sessions。
- Basic Options 已使用无框 section + divider，没有把每组设置都做成 card。
- Popup 会展示真实保存数量，并为 destructive dedupe 提供确认。
- 亮暗主题、focus、touch target、reduced motion、URL state 和响应式 overflow 已有较强覆盖。
- Mantine、Tabler 和当前蓝色功能色适合本产品。替换组件库或再引入一套设计系统，无法解决剩余的产品问题。

## 发现与建议

### P0 - Manager 有数据时仍可能以空白分类作为首屏

证据：

- 裸 `manager.html` URL 在 `src/manager/core/managerPageState.ts` 中默认解析为 `category=inbox`。
- 默认真实 fixture 的分类计数为 `Inbox 0`、`Saved 1`、`Preview category 1`，但主区域首屏显示 `No sessions here yet`。
- Manager 是 new-tab override，这不是偶发空状态，而是产品每天的第一印象。

影响：

应用明明有保存内容，却表现得像空应用。顶部计数虽然能提示内容位置，但主表面与用户数据相矛盾，削弱新标签页作为工作入口的价值。

建议：

- URL 明确提供 `workspace`、`category`、`view` 或 search 时，始终尊重 URL。
- 对裸 `manager.html`，从 page-local storage 恢复每个 workspace 最近一次有效分类。
- 如果没有历史偏好且 Inbox 为空，按现有 category order 打开第一个非空分类。
- 所有分类都为空时仍进入 Inbox，保留当前 capture-oriented empty state。
- 无效的显式 category 仍按现有规范回退 Inbox。
- 不把这项偏好写入 canonical TabBoard state 或 persistence schema。

建议 owner：

- 在 `managerPageState.ts` 旁新增 framework-neutral navigation preference helper。
- `useManagerPageState.ts` 只在 URL 没有明确意图时读写该偏好。

### P0 - Options 在持久化完成前就显示 Saved

证据：

- `OptionsApp.handleSettingChange()` 先把 `savePending` 设为 `true`，调用返回 `void` 的 `updateSettings()`，然后立即设回 `false`。
- 真正 mutation 在 `useOptionsSettings.ts` 内异步串行执行。
- 页面因此可能在 worker mutation 尚未完成时显示 `Saved`，只有后续失败才会纠正状态。

影响：

这不是纯视觉问题，而是信任问题。Options 决定 capture/restore 等可能产生 destructive side effect 的行为，状态必须反映 authoritative queue。

建议：

- 让 `useOptionsSettings()` 单一拥有 `idle | saving | saved | error`。
- 在 external store 中跟踪 pending queue depth 或 mutation generation。
- 向 `OptionsApp` 暴露状态和最近一次可操作错误，删除本地 `savePending` 近似值。
- 字段值可以保持 optimistic，但对应 authoritative mutation commit 前不能显示 `Saved`。
- 保留 500ms draft debounce，但让它复用同一个 queue status，不再创建第二套 pending model。
- 保存失败时，在页面状态附近提供稳定的 Retry 或明确修复动作。

建议 owner：

- `src/options/hooks/useOptionsSettings.ts`。
- `src/options/hooks/useSettingsDraft.ts` 只保留文本草稿职责。

### P1 - Restore 设置允许选择实际不会生效的组合

证据：

- Options 把 `Restore groups in new window` 和 `Restore next to current tab` 显示为两个独立 switch。
- `createChromeTabs()` 的 new-window 分支不读取 `restoreNextToCurrent`；它只在 current-window 分支生效。

影响：

用户可以保存一组 runtime 会忽略的 placement 配置，界面也没有说明两项策略的优先级。

建议：

- 将 Restore 改成小型策略表单：
  - Destination：Current window / New window。
  - Placement：Next to current tab / End of window，仅在 Current window 下可用。
  - Focus restored tabs 继续保持独立。
- 保留当前持久化 boolean，在 Options adapter 层映射策略控件，不改 schema。
- 如果暂时保留 switch 布局，New window 开启时禁用 `Restore next to current tab`，并给出简短原因。

建议 owner：

- 从 `OptionsApp.tsx` 提取 `RestoreSettingsSection.tsx`。

### P1 - 顶部栏没有显示当前 workspace

证据：

- Workspace trigger 固定为 48px，只渲染 grid icon 和 chevron。
- `Personal` 只存在于 tooltip 和 accessible name，视觉界面中不可见。

影响：

Workspace 是最高层产品上下文。用户可以看见当前 category，却必须打开菜单才能确认 category 属于哪个 workspace；多个 workspace 复用同名 category 时问题更明显。

建议：

- 桌面宽度下在 trigger 中显示 active workspace 名称，并限制稳定最大宽度、超长截断。
- 紧凑断点下继续使用 icon-only 形式。
- 将 `workspace / category` 视为同一个 context lane，search 与 utility action 作为 command lane。
- 不新增第二行 page title 或 breadcrumb，48px toolbar 继续作为唯一 owner。

建议 owner：

- 保持 `WorkspaceMenu` owner，只调整 trigger；只有在职责明显变化时才重命名。

### P1 - Category 排序永久增加了日常导航成本

证据：

- 正常 topbar 中每个 category 都有两个 keyboard focus stop：`Reorder <category>` 和 category navigation button。
- Category reorder 频率远低于 category switch。
- 上一轮正确拆开了 navigation 和 DnD activator，但 management mechanics 仍永久暴露。

影响：

最常用的导航表面出现额外视觉噪声，键盘遍历成本也翻倍。仅用 opacity 隐藏 handle 不能解决 focus order 问题。

建议：

- 普通模式只保留 label + count 的 category navigation。
- 从 Category Options 进入显式 Reorder mode。
- Reorder mode 中再显示 pointer/keyboard DnD handle 和明确的 Done 动作。
- 普通模式仍保留不可聚焦的 `category-column` droppable，保证 session 跨分类拖拽不受影响；只把 category 自身的 draggable 和 before/after reorder target 移入 Reorder mode。
- 现有 Manage Categories dialog 继续作为 move up/down、rename、create、delete 的 fallback。
- 保持 typed DnD payload、target、collision 和持久化 order 不变。

建议 owner：

- `CategoryNav` 拥有普通导航。
- 新增 `CategoryReorderMode` 拥有 activator 和 reorder target。
- `CategoryManager` 拥有进入/退出管理模式。

### P1 - Saved Tabs 没有使用最强的识别信号

证据：

- Saved `TabItem` 已有 `favIconUrl`。
- Open Tabs 和 info overlay 已渲染固定尺寸 favicon，并具备失败 fallback。
- Saved tab row 对所有 URL 都使用相同 generic link icon。
- Feature Spec 已描述 favicon-oriented session recognition。

影响：

TabBoard 的核心是快速视觉回忆。大量 generic link icon 会让 session card 退化为难以区分的文本列表，而站点 identity 已经存在于数据模型中。

建议：

- 新增一个 shared favicon primitive，统一尺寸、lazy loading、fallback 和加载失败行为。
- Active saved-tab row 使用 16px favicon；note 继续使用 note icon。
- Session header 可选展示最多 3 个 favicon 的 stack，后面跟剩余 link 数；不要再增加装饰性区域。
- 远端 shell 保持轻量：可以只使用前几个已存 URL，也可以在激活前继续保持 count-only summary。
- Open Tabs、saved rows、info overlays 共用 primitive，删除三套 favicon 实现。

建议 owner：

- `src/shared/components/Favicon.tsx`。
- `TabItemRow`、`OpenTabRow` 和 overlay presentation 消费它。

### P1 - Advanced Options 又引入了嵌套 card 结构

证据：

- Basic settings 使用无框 `SettingsSection` + divider。
- Advanced Settings 自身是 framed disclosure，内部又把 Data Storage、Safety、Keyboard & Reset 渲染成 shadow card。
- Safety 与 Reset 是普通 form section，不是独立 dashboard object。

影响：

同一个设置表单中途切换视觉语法。嵌套 frame 增加 padding、border 和 elevation，却没有增加信息层级。

建议：

- Advanced Settings 内复用 `SettingsSection`。
- 只保留 Data Storage 为 framed status tool，因为它确实承载 backend connection、migration state 和 recovery action。
- 把 `Keyboard & Reset` 拆成 `Keyboard Shortcuts` 和 `Recovery`；普通导航动作与 destructive reset 放在同一区块会削弱两者层级。
- 普通 settings section 移除 `shadow="sm"`。
- 保留当前 Advanced lazy chunk 和 URL-backed disclosure。

建议 owner：

- `AdvancedSettingsContent.tsx` 只负责组合 section owner。
- 只有当它不再依赖 Mantine Card 语义时，才把 `DataStorageCard` 改名为 `DataStoragePanel`。

### P2 - Popup 使用了 Chrome 品牌图标

证据：

- Popup header 文案是 `TabBoard`，但渲染的是 `IconBrandChrome`。
- `manifest.json` 已声明 TabBoard extension icon。

影响：

Popup 是最高频品牌表面。Chrome 是宿主平台，不是产品 identity；Chrome logo 也不能表达“当前窗口”的作用域。

建议：

- Header 使用现有 16px 或 32px TabBoard extension icon。
- 保持 header 紧凑，不增加营销 tagline。
- Chrome 特定上下文只保留在 current window、browser tab、keyboard shortcuts 等功能文案中。

### P2 - Popup 给 Dedupe 的视觉权重过高

证据：

- Save 和 Dedupe 都占用 128px action column。
- Duplicate count 使用与总 tab 数相同的粗体 metric 样式。
- Dedupe 是条件性的维护动作，Save 才是核心产品承诺。

建议：

- Save 保持唯一 filled primary action。
- Duplicate cleanup 在 divider 下改成紧凑 warning row：`1 duplicate tab` + secondary `Remove`。
- 保留 confirmation，以及 active / most-recently-visited copy 规则。
- 不把 cleanup 隐藏到 overflow menu；相关时仍应可见。

### P2 - Session card 可以更安静，但不必取消 card

证据：

- 每个 full-height session card 同时使用 border 和 `shadow-sm`。
- 横向 board 已有 16px gap；session 又确实是重复 object，所以 card 本身合理。

建议：

- 保留 session card 和当前 radius。
- 移除 resting shadow，以 border 作为默认边界。
- hover、focus-within、highlight、drag 时增强 border/foreground contrast，不增加 elevation。
- Header 保持固定，tab list 在 card 内独立滚动。
- 不增加 category-colored card accent，因为整个 board 已经代表单一 category。

## 重构路径

### Approach A - 在现有 owner 内做产品级收敛（推荐）

在当前架构中实现：

- Manager page state 旁的 page-local navigation preference。
- Options external store 内的 authoritative save status。
- 独立 settings section owner。
- 显式 category reorder mode。
- 单一 shared favicon primitive。
- 仅 CSS 的材质收敛。

优点：

- 保持 persistence schema、mutation wire、DropIntent、stable session slot 和性能优化不变。
- 可以按产品 workflow 拆成可 review 的改动。
- 不新增 runtime dependency。

代价：

- Toolbar 和 Options 是高密度共享表面，需要仔细做 browser regression。

### Approach B - 只做视觉 restyle

只调整 spacing、color、shadow 和 typography，不改变状态或交互 owner。

不推荐的原因：

- 无法修复错误 save feedback、无效 restore 组合、空白首屏或导航成本。
- 只能让界面看起来更新，却保留最高影响的 UX 问题。

### Approach C - 重做 Manager shell 或更换设计系统

替换 Mantine，或从头设计 Manager navigation 和 board。

拒绝原因：

- 现有 accessibility、DnD、responsive 和 performance acceptance 成本很高，且当前已经稳定。
- 剩余问题是局部 ownership 与 hierarchy，不是平台选型失败。

## 实施阶段

### Stage 1 - 信任与正确性

1. 把 Options save status 移入 `useOptionsSettings`。
2. 在独立 section 中表达 Restore 设置依赖。
3. 定义并测试裸 URL 下的 Manager category preference。

验收：

- Authoritative mutation resolve 前保持 `Saving…`。
- 失败时绝不能停留在 `Saved`。
- New-window restore 不再把 next-to-current 表现为 active policy。
- Explicit Manager URL 保持稳定；裸入口在其他分类有内容时不落到空分类。

### Stage 2 - 定位与扫描效率

1. 桌面显示当前 workspace 名称。
2. Category DnD 移入显式 reorder mode。
3. 引入 shared favicon primitive 和 saved-row favicon。

验收：

- Topbar 同时可见 workspace 和 category。
- 普通 category keyboard traversal 每个 category 只有一个 stop。
- Reorder mode 仍支持 keyboard/pointer category reorder。
- Favicon 失败 fallback 不产生 layout shift。
- Large-board startup 的 card/row 数量边界保持不变。

### Stage 3 - 视觉一致性

1. Flatten 普通 Advanced Options section。
2. Popup 使用 TabBoard 品牌图标。
3. Dedupe 降级为 secondary maintenance row。
4. 移除 session card resting shadow，强化 interaction-state border。

验收：

- Advanced disclosure 内不再嵌套普通 card。
- Save 是 Popup 唯一 primary command。
- Light/dark 均保持 WCAG contrast 和 visible focus。
- Session card width、board geometry、overflow cue 和 DnD target 不移动。

## 验证方案

- 为 Manager bare-URL preference、Options queue status、restore dependency mapping、reorder mode 和 favicon fallback 添加 focused unit/DOM tests。
- 运行 `npm run build`、`npm run check`、`npm test`、`npm run test:e2e`。
- 重跑 5 条 persisted-state DnD acceptance。
- 重跑 Manager、Popup、Options 的 light/dark axe audit。
- 检查 390、800、1280、1440px 布局。
- 重跑 large startup benchmark，守住 stable-slot card/shell/row 边界。
- 手工验证 new-tab bare entry、explicit deep link、Back/Forward，以及多 workspace category preference。

## 明确保留

- Mantine v7 和 Tabler icons。
- Horizontal session board 和 full-height card。
- Stable session slot/insertion geometry 与 near-viewport activation。
- Open Tabs sidebar overlay 行为。
- Local-first persistence 和可选 file backend。
- 当前 schema、mutation wire、DropIntent，以及禁止 session merge 的语义。
- 低动效和单一蓝色功能色。

## 实施结果

初始 10 项建议全部完成：

| Finding | 实施 owner | 结果 |
|---|---|---|
| Manager 空分类首屏 | `managerNavigationPreference.ts` + `useManagerPageState.ts` | 裸入口按 workspace 恢复有效 category；无偏好时打开第一个非空 category；显式 URL 继续优先 |
| Options 过早显示 Saved | `useOptionsSettings.ts` | authoritative queue 单一拥有 save status、rollback 和 Retry；后续同字段成功写入淘汰 stale failed patch |
| Restore 无效组合 | `RestoreSettingsSection.tsx` | Destination / Placement 策略投影现有 booleans；New window 禁用不适用 placement |
| Workspace 不可见 | `WorkspaceMenu.tsx` + header CSS | 桌面显示名称，compact 保持 icon-only |
| Category reorder 常驻 | `CategoryNav.tsx` + `CategoryReorderMode.tsx` | 普通模式一类一个 navigation stop；显式 mode 才挂载 activator/targets；category-column droppable 常驻 |
| Saved link 缺少 favicon | `Favicon.tsx` | Open Tabs、saved rows、info overlays 共享 fixed-size lazy image/fallback；inactive shell 不挂图 |
| Advanced nested cards | `AdvancedSettingsContent.tsx` | Data Storage 是唯一 framed tool；Safety、Keyboard Shortcuts、Recovery 使用无框 sections |
| Popup Chrome branding | `PopupApp.tsx` | 使用 TabBoard extension icon |
| Popup Dedupe 权重 | `PopupApp.tsx` / `popup.css` | Save 保持唯一 primary；duplicate cleanup 为次级 Remove row |
| Session resting shadow | `session.css` | 静态 shadow 移除；border/focus/highlight 表达状态，geometry 不变 |

## 迭代复审

### Round 1

检查 Manager default/populated/reorder/compact/dark，Popup duplicate/dialog/light/dark，Options strategy/Advanced/save-error/dialog。

新增发现：

- 390px Reorder mode 中 category nav 被压成 0px，154px Done 按钮与 handle/Search 重叠。

优化：

- Compact Reorder mode 独占 toolbar lane；workspace/search/global actions 让位。
- Category nav 使用剩余可滚动宽度；Done 收敛为 44×44 icon action。

证据：

- 新增 `manager-boot.e2e.ts` compact reorder geometry regression。
- 390px：nav 256px，Done 44×44，页面无横向溢出，axe 0/0。
- 800px：workspace/nav/Done/Search 均位于 48px topbar 内，axe 0/0。

### Round 2

重新执行 taste pre-flight 和 shipped-copy scan。

新增发现：

- 3 条 visible UI copy 使用 em-dash separator。
- Popup count row 单独设置 `letter-spacing: 0.02em`，与项目默认字距不一致。

优化：

- 改为句号或冒号；新增 shipped UI copy contract。
- 删除非零 letter spacing，继续使用 tabular numerals 保持动态数字稳定。

证据：

- `uiCopy.test.ts` 和 `PopupApp.dom.test.ts` RED/GREEN。
- shipped Manager/Popup/Options 无 visible em-dash，UI CSS 无非零 letter spacing。

### Round 3

重新审查可见 copy 与错误状态。

新增发现：

- Popup maintenance row 的 `1 Duplicate` 缺少对象名。
- Options Retry 在 390px 仅约 48×22px。
- 较旧 settings patch 失败后，同字段较新 patch 成功仍可能保留 stale error/Retry。

优化：

- 改为 `1 Duplicate Tab / N Duplicate Tabs`。
- Compact Retry 最小 44px 高。
- 失败 patch 按字段合并；被更新 pending patch 覆盖的字段不回滚、不保留 stale Retry。

证据：

- 新增 duplicate singular copy、Retry touch target、same-field queued failure regression。
- 390px dark error state：Retry 约 48×44，axe 0/0；恢复 runtime 后 Retry 成功返回 Saved。

### Round 4 - Zero New Findings

重新加载 `design-taste-frontend`，按 `variance 3 / motion 2 / density 8` 完整检查：

- Manager ordinary/reorder、390/800/1440、light/dark、favicon、card material、overflow。
- Popup duplicate row、brand、light/dark、button wrap、dialog。
- Options Basic/Advanced、Destination/Placement、save error/Retry、Reset dialog、390/1280、light/dark。
- Static pre-flight：copy、font size、letter spacing、motion、shadow ownership、image dimensions、icon semantics、schema/dependency diff。

结果：

- 所有 rendered representative states axe 0 violations / 0 incomplete。
- 没有 horizontal overflow、button wrap、overlap、低于 44px 的 compact action、错误 card nesting 或非语义 shadow。
- Overlay 的 `shadow-sm/md` 保留，因为它表达真正的浮层层级。
- 本轮没有新的 P0/P1/P2 建议，review loop 结束。

## 最终证据

- `npm run check`：PASS；209 source files 无 forbidden edge/cycle，124 production files 通过 architecture gate。
- `npm test`：85 files / 1,061 tests PASS。
- `npx playwright test --workers=1`：33/33 PASS；包含 5 条 persisted-state DnD 和 compact reorder regression。
- Production large benchmark（5 runs）：
  - Manager median 560.4ms，6 cards / 190 shells / 196 slots / 120 rows，1 startup Open Tabs request，max longest task 184ms。
  - Options median 367.5ms，0 canonical state reads。
- Benchmark harness 记录 initial/final URL 与 active board，并在 seed 阶段固定 Inbox preference，避免 bare-entry preference 把性能样本切到更轻 category。
- `git diff --check`：PASS。
- 无 package、lockfile、manifest、persistent schema、background protocol 或 runtime dependency 改动。

## Prompt-to-Artifact Completion Audit

目标具体化：

1. 实施初始 taste review 的全部 P0/P1/P2 建议。
2. 实施后重新使用 taste skill 做完整 static + rendered review。
3. 对每轮新发现继续优化，并以 RED/GREEN 测试保护。
4. 重复 review/optimization，直到一整轮没有新建议。
5. 以真实 build、unit、E2E、DnD、browser/axe、performance 证据验收。
6. 保持 schema、mutation wire、DropIntent、stable geometry、cross-category drop 与 dependency 边界。

覆盖清单：

| Requirement | Artifact | Direct evidence | Status |
|---|---|---|---|
| 初始 2 个 P0 | `managerNavigationPreference.ts`, `useOptionsSettings.ts` | pure/hook queue tests，explicit/bare URL tests，error/Retry browser state | Complete |
| 初始 5 个 P1 | `RestoreSettingsSection.tsx`, `WorkspaceMenu.tsx`, `CategoryReorderMode.tsx`, `Favicon.tsx`, `AdvancedSettingsContent.tsx` | component tests、category normal/reorder DOM、saved/open favicon、Options rendered tree | Complete |
| 初始 3 个 P2 | `PopupApp.tsx`, `popup.css`, `session.css` | Popup DOM/axe，session material style contract | Complete |
| Round 1 重新 review | Manager default/populated/reorder/compact/dark；Popup；Options | agent-browser snapshots、bounds、axe；review Round 1 section | Complete |
| Round 1 新问题优化 | Compact reorder exclusive lane | failing 390px Playwright → passing regression；390/800 bounds、axe | Complete |
| Round 2 重新 review | Taste pre-flight + shipped copy/style scan | em-dash/letter-spacing RED/GREEN；review Round 2 | Complete |
| Round 3 重新 review | Copy、error state、queue semantics | Duplicate Tab、Retry 44px、same-field stale error tests | Complete |
| Round 4 零新增 review | 全 static/rendered matrix | Manager/Popup/Options all representative states axe 0/0；pre-flight scans no new finding | Complete |
| Build/static gates | `npm run check` | production build；209 source graph；124 production architecture files | Complete |
| Unit/DOM gates | `npm test` | 85 files / 1,061 tests | Complete |
| Browser/E2E gates | `npx playwright test --workers=1` | 33/33；包含 5 条 persisted-state DnD、compact reorder、large board | Complete |
| Performance gates | `benchmark-startup.mjs` | 5-run large Manager/Options medians，URL + active board coverage | Complete |
| DnD semantics | existing resolver + explicit mode | core 49 tests；5 persisted-state paths；ordinary category-column droppable DOM | Complete |
| Schema/protocol/dependency stability | git diff audit | package/lock/manifest/schema/state mutation/background diff empty | Complete |
| Documentation | Feature Spec、Architecture、Evolution、D051、review、plan、findings、progress | current behavior + tradeoffs + test evidence recorded | Complete |

Coverage caveats reviewed:

- `npm run check` does not prove browser DnD or visual hierarchy, so it is paired with serial full E2E and rendered browser review.
- Axe 0/0 does not prove visual quality, so bounds, focus count, overflow, card hierarchy, button wrapping and state copy were manually inspected.
- The first benchmark run accidentally measured a 12-slot custom category; it was rejected. Final evidence seeds Inbox preference and records final URL/active board, restoring 196-slot coverage.
- A 5-worker E2E run had two pointer/overlay timing failures; both passed independently. Final evidence uses the complete 33-test serial run, not the partial reruns alone.

Audit result: every explicit objective and initial/new finding has direct artifact and verification evidence. No missing, weakly covered or unresolved requirement remains.
