# Product Decisions

本文档记录 TabBoard 的关键产品和实现决策。格式保持轻量：

- Context: 当时遇到的问题。
- Decision: 做了什么选择。
- Rationale: 为什么。
- Trade-offs: 代价。
- Status: 当前状态。

## D001: Local-first as the default architecture

Context:
用户的 tabs、标题、URL 和工作流信息都很敏感。如果引入后端，产品还没证明价值就先制造隐私和信任成本。

Decision:
TabBoard 默认 local-first，数据存储在 Chrome extension storage 中，不引入远端账号和后端。

Rationale:

- 安装后即可用。
- 不需要登录。
- 更容易解释隐私边界。
- Chrome extension 的核心能力已经足够覆盖保存、恢复、导入导出。

Trade-offs:

- 多设备同步不是当前能力。
- 数据恢复依赖用户本地环境和导出备份。
- 复杂协作功能暂不适合做。

Status:
Accepted。

## D002: OneTab is the core workflow, tabExtend is inspiration

Context:
OneTab 好用在“快”，tabExtend 好用在“组织”。TabBoard 如果同时照搬两者，容易变成复杂工具。

Decision:
以 OneTab 的保存和恢复作为主干，只吸收 tabExtend 中确实能增强组织效率的部分。

Rationale:

- 保存当前窗口必须一键完成。
- session 恢复、导入导出、命名、删除是核心。
- workspace、category、kanban 可以增强管理，但不能压过保存恢复。

Trade-offs:

- 某些 tabExtend 式功能会被砍掉或简化。
- 产品叙事需要强调“轻量整理”，不是完整工作流系统。

Status:
Accepted。

## D003: Replace Chrome new tab with TabBoard

Context:
如果 TabBoard 只是一个扩展页，用户需要主动想起来打开它。tab 管理工具的价值在于成为日常入口。

Decision:
通过 `chrome_url_overrides.newtab` 将 Chrome 新标签页改为 TabBoard。

Rationale:

- 每次新建 tab 都能看到已保存的 sessions。
- 降低保存后遗忘的概率。
- 新标签页天然是“下一步要做什么”的场景。

Trade-offs:

- 用户会失去默认新标签页。
- TabBoard 首页必须足够快、足够安静。

Status:
Accepted。

## D004: Keep session cards compact

Context:
早期 session 列表占满屏幕，用户需要大量滚动才能看到多个 session。

Decision:
使用 compact card/grid 展示 sessions，限制每个 session 内 tab 预览数量和标题行数。

Rationale:

- Tab manager 首要问题是扫描和找回。
- 多 session 并排比单列详情更适合回忆上下文。
- 完整列表可以通过展开进入，不必默认全展开。

Trade-offs:

- 单个 session 的全部内容默认不可见。
- 对长标题需要做截断和 tooltip。

Status:
Superseded by D021。当前 session card 不限制 preview，全部 matching items 在 card 内滚动。

## D005: Remove Quick list / Pinned workflow

Context:
Quick list 来自 tabExtend 的 Pinned workflow 概念，但用户反馈不好用，并且不清楚一个 saved session 如何进入 pinned workflow。

Decision:
移除 Quick list 功能和右侧面板，将 popup 改为 Recent sessions。

Rationale:

- Quick list 与 saved sessions 的边界不清晰。
- 它占据右侧屏幕，降低主列表空间。
- 当前产品还没有证明需要独立的“临时置顶工作流”。

Trade-offs:

- 少了一个临时暂存入口。
- 未来如果要恢复类似能力，需要重新定义 copy/move/reference 的关系。

Data handling:
`quickList` 仍作为 state schema 字段保留（normalize 补齐为空数组），当前 UI 不再暴露。插件未上线，不再保留历史数据迁移逻辑。

Status:
Accepted。

## D006: Open Tabs panel is for current context, not per-tab saving

Context:
Open Tabs 面板中每个 tab 都有 Save 按钮，视觉噪音大，且单 tab 保存不是核心动作。

Decision:
Open Tabs 面板仅保留 Current window 的 Save；普通 tabs 只展示可保存的 tabs，pinned tabs 即使当前不可保存也保留可见并标记 `storable: false`；每个可保存 tab 变成 checkbox；checkbox 只用于批量创建 session 和批量拖动；筛选 sessions 改由可保存 open tab 的右键菜单触发；底部 Filter tabs 只过滤当前 selected window 的 rows。

Rationale:

- 当前窗口一键保存是最重要的动作。
- 多选 tabs 更符合“整理当前上下文”的真实行为。
- Chrome 内部页、扩展页和 TabBoard 自身页面无法可靠恢复，展示出来只会制造不可选的噪音；pinned tabs 是为了保留浏览器现场而作的明确例外。
- 通过右键 open tab 筛选 saved sessions，可以帮助用户判断“这个页面以前存在哪个 session 里”。
- 选择和筛选分离后，checkbox 语义更单纯；不可保存 pinned row 不提供这些交互。
- 拖入已有 session 解决“补充一个链接到旧上下文”的需求。

Trade-offs:

- 右键筛选的可发现性弱于直接勾选，需要后续观察是否要增加轻量提示；底部 Filter tabs 不替代 saved-session URL filter。
- 拖动 open tab 是 copy，不是 move，需要后续用视觉反馈说明。

Status:
Partially superseded by D022。Window chips、selected-window list、sidebar Filter tabs 和右键 URL 反查保留；settings-dependent storable eligibility 与 pinned strip 已移除。

## D007: Inline rename for session titles

Context:
session 命名是整理信息的高频动作，藏在 More 菜单中太深。

Decision:
支持双击 session 标题 inline rename，同时保留 More > Rename。

Rationale:

- 编辑动作发生在标题本身，符合直接操作直觉。
- 保留菜单入口可以照顾不熟悉双击的用户。

Trade-offs:

- 标题变成可交互元素，需要处理 focus、Enter、Esc 和失焦保存。

Status:
Accepted。

## D008: Use icon-first controls for dense work surfaces

Context:
Kanban/card 视图需要在有限空间里展示 session 标题、URL、状态和操作。文字按钮会造成卡片拥挤，长按钮还会和内容争夺横向空间。

Decision:
高频操作使用统一 SVG icon-only 按钮，并通过延迟 tooltip 解释含义；二级菜单、弹窗和设置页保留 icon + 短标签。

Rationale:

- 固定尺寸 icon button 能让 card 和 tab row 的布局稳定。
- tooltip 和 `aria-label` 可以补足含义，不让视觉层被文字淹没。
- 二级菜单保留短标签，避免低频操作完全依赖记忆。

Trade-offs:

- 新用户需要通过 hover 或 focus 学习图标含义。
- 需要维护一套一致的本地图标，而不是临时写文字。

Status:
Accepted, needs UX observation。

## D009: Category order is workspace-specific

Context:
不同 workspace 的导航重点不同。固定把 Inbox / Starred 和自定义分类按统一顺序放置，会让高频分类无法贴合个人工作流。

Decision:
Categories 支持拖动排序，系统分类和自定义分类共同参与排序；顺序保存到 `categoryOrderByWorkspace[workspaceId]`。

Rationale:

- Starred、Inbox 或某个自定义分类的优先级取决于当前 workspace。
- 拖动排序比设置页里的排序选项更直接。
- 新分类追加到当前排序末尾，旧的无效分类 id 在渲染时自然忽略。

Trade-offs:

- 需要在 state 中维护一个额外的 workspace 级 UI 顺序字段。
- 拖拽排序对键盘用户还不够友好，后续可补 move up/down 操作。

Status:
Accepted。

## D010: Special URL capture is opt-in

Context:
`chrome://`、`file://` 等 URL 与普通网页不同。它们可能依赖浏览器内部状态、本机文件路径或扩展权限，保存后不一定能可靠恢复。

Decision:
新增 `includeChromeUrls` 和 `includeFileUrls` 两个独立设置，并默认关闭。

Rationale:

- 默认 saved sessions 应该以可恢复的普通网页为主。
- `chrome://` 与 `file://` 的风险不同，需要分开控制。
- Open Tabs 列表和 capture 入口共享同一套判断，避免出现“能勾选但保存时跳过”的不一致。

Trade-offs:

- 有些用户想保存本机文件或浏览器内部页时，需要先去 Options 打开开关。
- 即使允许保存，恢复是否成功仍取决于 Chrome 和本机权限。

Status:
Superseded by D022 and the current React shared `capture-policy`; `includeChromeUrls` and `includeFileUrls` remain separate opt-in settings, while Chrome permission limits still govern actual save/restore behavior.

## D011: Categories are navigation sections, not exclusive filters

Context:
Saved sessions 数量变多后，点击左侧 category 直接硬切内容，会打断用户对右侧 grid 位置的记忆。用户希望右侧按照左侧排序展示所有 category，并在滚动时通过吸顶标题识别当前位置。

Decision:
左侧 Categories 改为目录导航：点击 category 只更新 active 状态并平滑滚动到对应右侧 section；右侧始终按当前 workspace 的 category order 渲染所有 section。Search 和 open tab filter 继续作为全局过滤条件。

Rationale:

- Category 排序本质上是用户的工作流顺序，右侧应该复用这套顺序。
- 滚动定位保留上下文，比重绘成单一列表更适合大屏 grid。
- Sticky section title 可以在长列表滚动时提供低干扰的位置反馈。

Trade-offs:

- 右侧 DOM 数量会随 category section 增加，session 数量继续增长后可能需要虚拟列表。
- category 不再作为硬切筛选器后，需要依赖 sticky title 和左侧 active 状态表达当前位置。

Status:
Superseded by D018。Categories 当前放在顶部 segmented tabs，点击后切换单一 active category board。

## D012: A session belongs to one category

Context:
同时展示所有 category 后，如果 `All items`、Starred 和自定义分类都能包含同一个 session，右侧会出现重复卡片。用户希望 category 成为 session 的单一归属，并去掉 `All items`。

Decision:
每个 session 最多属于一个 category。`Inbox` 表示没有 category；Starred 是内置 category，由 session Star 按钮设置；自定义 category 仍由用户创建和排序。Starred 与自定义 category 互斥，模型规范化时会清掉 Starred session 的 `folderId`。

Rationale:

- 单一归属让右侧目录视图更像真实看板，不再重复同一个 session。
- `Inbox` 比 `Unfiled` 更适合表达“默认收纳/待整理”，语气更轻。
- Starred 作为内置 category 比叠加状态更符合左侧 Categories 的结构。

Trade-offs:

- 用户给 session 加 Star 时会把它从原自定义 category 移到 Starred。
- Tab 级 star 仍是 item 标记，不再决定 session 是否进入 Starred category。

Status:
Accepted。

## D013: Collapse controls expose the next action at each level

Context:
Saved sessions 顶部原来同时放置 Collapse all 和 Expand all 两个按钮，占空间且需要用户先判断当前状态。Category 和单个 session 也需要同样的快速折叠入口。

Decision:
使用三层动态折叠按钮：Saved sessions、category、session。按钮图标和 tooltip 表示下一次点击动作；全部折叠时显示 Expand，否则显示 Collapse。

Rationale:

- 单按钮减少顶部操作噪音，同时保留完整功能。
- Category 级控制适合大列表快速收拢一个区域。
- Session 级控制放在 header 一级入口，比藏在 More 中更直接。

Trade-offs:

- 用户需要理解按钮表达的是“下一步动作”，不是当前状态标签。
- 部分展开时 category/global 按钮会统一执行 Collapse，而不是进入混合状态选择。

Status:
Superseded by D021。当前 manager 不提供 category/session/global collapse controls。

## D014: Session card quick actions are user-configurable

Context:
Session card 的外露按钮会直接影响扫描密度。固定外露 Collapse / Restore / Add / More 无法适配不同用户的高频动作，而且按钮换行后会和 title 形成上下断层。

Decision:
Session header 使用 title + quick actions 的同层布局。外露 action 集合和顺序由 `sessionExternalActions` 和 `sessionActionOrder` 控制；未外露动作继续进入 More 菜单。

Rationale:

- 用户可以把 Star、Rename、Category 等高频动作提升到外部。
- 同一 action order 同时驱动外露区域和 More 菜单，减少认知跳跃。
- More 作为兜底，保证隐藏外露按钮不会删除功能。

Trade-offs:

- 设置页需要一个小型排序控件，复杂度高于简单开关。
- 外露动作过多时仍可能换行，后续可考虑按 card 宽度自动收纳。

Status:
Superseded by D016 and D021。Session card 当前只外露 Restore，其余动作进入 More；Options 不再提供 session toolbar 外露动作配置，Collapse 已从 manager 移除。

## D015: Manager-first extension UI redesign

Context:
Popup 和 manager 都暴露 session 操作时，popup 容易变成缩小版 manager；session card 表面动作太多也会降低扫描效率。Chrome popup 尺寸和 auto-close 行为不适合承载复杂整理任务。

Decision:
保留 popup 作为 trigger surface，只放 Save window、Open workspace、recent sessions restore；把深层 session 管理集中到 manager/new tab，并用 command bar、context strip、session board、inspector 组成主工作台。Options 拆成 Basic 和 Advanced。

Rationale:

- Popup 打开后应快速完成单一动作。
- Manager/new tab 是稳定页面，更适合搜索、编辑、拖拽和批量整理。
- Inspector 可以把 Rename、Note、Lock 等次级动作从 card 表面移走，减少视觉噪音。
- Options 分层能把日常设置和低频/高风险设置分开。

Trade-offs:

- Popup 变得不如以前“全能”，部分管理动作需要进入 manager。
- Inspector 增加一块 UI 区域，需要继续观察窄屏和键盘路径。
- Session card 外露动作减少后，新用户需要学习 More 和 inspector 的分工。

Status:
Superseded by D016。Context strip 和常驻 inspector 已移除，popup quick actions 改为 Save/Open/Dedupe。


## D016: Board-first manager and source-tab cleanup

Context:
上一轮 manager-first redesign 引入 context strip 和 inspector，但用户手动验收认为语义不清、价值低，并且 Open Tabs、Popup、Options、DnD 仍有关键体验缺口。

Decision:
Manager 改为 Board-first：顶部 toolbar 放 workspace/search/import/export/bin/options；左侧放 Open Tabs all windows 和 Categories；右侧保留 session board。移除 context strip 和常驻 inspector。Popup 保持 trigger surface，使用 Save/Open/Dedupe 三个横排 quick actions。Capture 默认按源 tabs URL 去重；当前有 URL 的非 TabBoard tabs 都进入 capture 尝试。

Rationale:

- 用户核心任务是保存、找回、整理 sessions，board 应该是视觉和交互中心。
- Open Tabs 是源浏览器状态，展示所有 windows 比只展示 current window 更符合真实使用。
- Popup 尺寸和 auto-close 适合 quick actions，不适合复杂编辑。
- 统一 icon 和 control 尺寸能减少按钮大小不一、风格不统一的问题。

Trade-offs:

- 移除 inspector 后，部分编辑入口回到 More 菜单。
- Capture 不再提供自定义过滤器，受限 URL 的保存结果交给 Chrome；Options 因此更短。
- Manager all-windows Open Tabs 增加了 sidebar 信息量，所以一次只展开一个 window。

Status:
Partially superseded by D018-D022。Open Tabs 仍在左侧；Categories 已移到顶部，workspace switcher 最终回到 main topbar，sidebar header 改为 browser window navigation；capture filter settings 已由 D022 移除。

## D017: Session drag uses target-slot live reorder

Context:
Session drag 的简单 before/after placeholder 在 card grid 中体验不稳定：轻微横移就让位、同一目标上下移动会回弹，用户很难判断最终 drop slot。

Decision:
Session drag 保留源位置 placeholder，但目标 card 使用 25/50/25 规则：左右 25% 表示插入到目标前/后，中间 50% 表示被拖拽 session 占据目标 slot，目标 card 回填源空位。进入目标 slot 后使用 target lock 和 hysteresis margin 降低 Chrome 原生 DnD 与 grid 重排造成的边界回闪。

Rationale:

- 用户拖拽排序时关心“这个 session 最终会占哪个位置”，不是抽象的插入线。
- 中间 50% 作为 target slot 比全卡触发更稳定，也保留了边缘 before/after 的精细控制。
- Target lock 用原始目标 rect 判断，避免目标 card 移动后下一帧把自己释放掉。

Trade-offs:

- 原生 HTML DnD 仍可能在边界附近有轻微瑕疵。
- 代码需要维护 source rect、target rect 和 release margin，复杂度高于简单 nearest-card 算法。

Status:
Accepted, needs UX observation。

## D018: Clone tabExtend visual board before deeper workspace changes

Context:
用户明确选择方案 A：先参考 tabExtend 复刻 visual workspace board，再根据使用体验慢慢调整。之前的 Board-first manager 已经把 popup/options/source-tab cleanup 收敛好，但右侧 saved sessions 仍更像纵向 section 列表，缺少 tabExtend 那种 lane/card 的视觉组织感。

Decision:
Manager 顶部最左侧放 workspace switcher，categories 从左侧 sidebar 移到顶部 segmented tabs。点击 category tab 只展示该 category 的 active board。Session card 增加 favicon stack、link/note meta、locked/starred chips 和 note preview。Popup、Options、数据模型、restore/capture 行为和现有 DnD target-slot 语义保持不变。

Rationale:

- 用户当前要的是更接近 tabExtend 的现代视觉组织，而不是继续做极简版微调。
- 顶部 category tabs 比左侧 category 列表更贴近 tabExtend，并把 workspace 与 category 切换都放在用户视线顶部。
- Active category board 避免同时展示所有 categories，降低右侧内容噪音。
- Session card 首屏展示 favicon 和状态 chips，可以更快唤起上下文记忆。
- 先保留现有数据模型和 DnD 语义，避免一次性引入 inspector、workspace rail、view toggle 等额外复杂度。

Trade-offs:

- 大量 categories 会依赖顶部横向滚动。
- Active category board 降低跨 category 同屏总览能力。
- 视觉复刻优先，后续仍需要人工观察是否要加入 compact/all-categories view toggle。

Status:
Extended by D019 and D020, partially superseded by D022。Top category tabs 和 active category model 保持，workspace switcher 最终回到 main topbar 的 category tabs 左侧；Options/capture eligibility 已由 D022 收敛。

## D019: Full-height sidebar and horizontal session board

Context:
第一轮 tabExtend-style visual board 已把 categories 移到顶部，但 Open Tabs 仍只占 sidebar 上方小区域，sessions 仍是自动换行 grid。用户要求 manager 明确切成左右两栏，并进一步复刻 tabExtend 的全高 sidebar 与横向 session columns。

Decision:
Manager 使用固定视口两栏 shell。左侧是可折叠 sidebar，包含 workspace switcher、stats 和全高 Open Tabs；折叠后保留窄 rail。右侧保留顶部 category/search/actions，并把 active category 的 sessions 改为单行 horizontal track。每张 session card 充满可用高度，tab list 在 card 内纵向滚动。Action menu 使用 fixed positioning，避免被 horizontal overflow 裁切。

Rationale:

- Open Tabs 是持续存在的浏览器上下文，应使用 sidebar 的完整高度，而不是临时小面板。
- Session 作为工作上下文列，横向排列比自动换行 grid 更接近 tabExtend，也更利于逐列扫描。
- Card 内部滚动让 header、状态和动作保持稳定，同时容纳大量 tabs。
- Sidebar collapse 给 board 更多空间，但不需要修改业务 state 或新增 Options 设置。

Trade-offs:

- 多 session 依赖 horizontal scrolling，触控板和鼠标滚轮体验需要继续观察。
- Full-height cards 降低了同屏纵向堆叠密度。
- Native HTML DnD 在 horizontal overflow 容器中的边缘自动滚动仍可能不稳定。
- Fixed action menu 需要在 scroll/resize 时关闭，避免锚点位置过期。

Status:
Extended by D020。Full-height two-column shell、horizontal session board 和 fixed action menu 保持；workspace/window/sidebar Open Tabs 信息架构由 D020 收敛。

## D020: Separate saved-workspace context from browser-window context

Context:
D019 把 workspace 和 Open Tabs 都放进左侧 sidebar header，但用户希望更接近 tabExtend：sidebar 应直接表达 Chrome windows 和当前浏览器现场，workspace/category 则属于右侧 saved sessions 工作台。Pinned tabs 还需要在不可保存时保持可见，且 sidebar 内的文本过滤不能和历史 session URL filter 混用。

Decision:
Workspace switcher、stats、新建/重命名 workspace 放回 main topbar，并位于 category tabs 左侧。Sidebar header 改为 window chips、collapse 和新建 Chrome window；chips 显示原始 window tab 总数，一次只渲染 selected window。所有 pinned browser tabs 固定显示在 regular tabs 上方，并通过单行横向滚动保持可达；`storable` 决定 checkbox、拖拽和 URL session filter 能否使用。Regular tabs 是唯一纵向滚动区域。Sidebar footer 增加临时 Filter tabs query，只过滤当前 selected window，独立于 saved-session search 和 `openTabFilter`。相关 capture settings 变化时重新加载 Open Tabs eligibility。该 UI 状态不进入 TabBoard state schema。

Rationale:

- Browser window 是 Open Tabs 的导航上下文，workspace 是 saved sessions 的组织上下文，分开放置降低层级混淆。
- Pinned tab 可见性保留当前浏览器现场；`storable` gate 明确 capture 限制，不让 tab 静默消失。
- Pinned 横向 strip 避免大量 pinned rows 占满 sidebar 高度，regular list 仍保持稳定滚动空间。
- Sidebar query 与历史 URL filter 分离，避免同一个“filter”同时改变两类内容。
- 使用 manager 内存状态和已有 localStorage collapse preference 即可，不需要新增持久化 schema 或 Options。

Trade-offs:

- 大量 pinned tabs 依赖横向滚动，仍需观察鼠标和触控板可发现性。
- Window chips 空间有限，需要紧凑展示并依赖 tab count 帮助识别。
- 不可保存 pinned tabs 会占用 sidebar 空间，但换来更完整的浏览器现场表达。
- 这不是 Quick list / Pinned workflow 回归；Pinned 仅表示 Chrome tab 状态，不提供独立 saved workflow。

Status:
Partially superseded by D021 and D022。Window chips、sidebar actions、selected-window list 和 Filter tabs 保留；pinned strip、regular-only scroll 与 settings-dependent storable eligibility 已移除。

## D021: Keep the board open and scrollable instead of collapsible

Context:
Category/session/global collapse controls and preview limits added stateful controls and hid matching tabs behind Show more / Show fewer.

Decision:
保留顶部 category tabs、category/grid drop targets 和 DnD；移除 board category header、category/session/global collapse actions，以及 session tab preview 截断。全部 matching tabs 直接渲染，由 card 内 tab list 负责纵向滚动。`group.collapsed` 等 legacy 数据字段继续保留但不参与 manager render。

Rationale:

- Open board 让 category 和 session 的内容结构一眼可见。
- Card 内滚动保留大量 tabs 的可达性，不需要额外展开状态。
- 保留数据字段避免 legacy state migration。

Trade-offs:

- 大量 tabs 需要在 card 内滚动。
- 不再能通过全局折叠快速收起多个 session；如果未来需要，应重新评估真实使用频率。

Status:
Accepted。

## D022: Remove configurable capture filters and keep Options task-focused

Context:

Open Tabs、capture 和 Options 曾通过 Include pinned tabs、Exclude URL patterns 以及 Capture edge cases card 表达一套可变 eligibility。用户验收后确认这些设置让浏览器现场和保存结果产生不必要的距离，也让 Options 与已删除的 settings schema 容易漂移。

Decision:

删除 Include pinned tabs、Exclude URL patterns、Capture edge cases card、URL editor 及其增删改路径。Advanced 只保留 Chrome shortcuts 和 Reset settings。Capture 对所有有 URL 的非 TabBoard tabs 进行保存尝试，pinned tabs 与普通 tabs 共用单一 Open Tabs 列表并以内联 badge 标记；不再按自定义 settings 改变 storable eligibility。

Rationale:

- “有 URL 就尝试保存”比多个例外开关更容易理解，也更接近浏览器现场。
- Pinned 是 Chrome tab 的状态，不应再被 Options 变成另一套保存模式。
- Options 只保留仍有明确收益的 capture、restore、appearance、shortcut 和 reset 入口，减少设置页与 schema 漂移。
- Chrome 对受限 URL 的保存和恢复能力由平台决定，产品不再伪装成可完全控制的过滤器。

Trade-offs:

- 用户不能在 TabBoard 中配置自定义 capture 排除规则。
- 某些 Chrome 受限 URL 可能仍然无法保存或恢复，反馈需要依赖实际 Chrome 结果。
- Open Tabs 可能展示更多当前浏览器现场，sidebar Filter tabs 继续承担临时定位。

Status:
Superseded for capture eligibility by current React shared `capture-policy`; board simplification remains Accepted。

Current implementation note:

- Open Tabs uses one user-facing custom URL filter; older special-URL toggles are ignored for compatibility.
- One policy drives Open Tabs storable reason, selection, DnD and background capture; ineligible rows remain visible for browser-context awareness, while Chrome permission limits remain platform behavior.

## D023: Use Nord semantic tokens with a bounded local Web Awesome layer

Context:

Manager 已经形成稳定的原生 DOM、Chrome API 和 HTML DnD 结构，但旧 teal、硬编码蓝色、重复 CSS 和高度不一致的 controls 让视觉层级持续漂移。用户允许引入设计系统，同时要求参考 tabExtend 的紧凑工作台并使用 Nord 色系。MV3 又要求 runtime、fonts 和 icons 全部本地化。

Decision:

以 Nord0-Nord15 为 primitives，建立 light/dark `--zt-*` semantic tokens，并让 TabBoard 自定义 shell、session cards、rows、DnD feedback 与 Web Awesome controls 共享同一 token source。固定并完整 vendoring Web Awesome `3.10.0`；生产 Manager 只迁移稳定 shell controls：search inputs、compact window select 和 workspace dropdown。Session/category/tab DnD surfaces、native context menu、本地 SVG icons、shared tooltip、buttons、dialog 和 Popup/Options behavior 保持现有实现。Popup/Options 只做 Nord CSS alignment。

Rationale:

- 本地 self-host 和静态 imports 满足 MV3 CSP，不引入 CDN、远程字体或默认远程 icon resolver。
- 限定设计系统边界可以获得 input/select/dropdown 的 keyboard 和 focus 基础能力，又不改动 DnD object hierarchy。
- Semantic tokens 让 light/dark、custom components 和 Web Components 使用同一视觉语言。
- 完整 provenance、integrity 和 checksums 避免 vendored runtime 在打包时静默缺失或漂移。

Trade-offs:

- Native buttons、tooltip、dialog、session/window action menus 和 settings controls 暂时没有全部迁移到 Web Awesome。
- Source-contract tests 不能替代浏览器中的 Shadow DOM、keyboard、focus 和 DnD 人工回归。
- 完整 vendored tree 增加仓库文件数量，但避免 bundler 和 runtime network dependencies。

Status:
Retired。生产 Manager controls 已由 React + Mantine 重写取代；本地 vendored Web Awesome 层与 vendor 目录已整体删除，当前使用 Mantine 组件与 `@tabler/icons-react`。Nord 视觉方向与不变的 DnD 语义仍保留，无远程 runtime asset。

## D024: Use progressive disclosure without hiding core tab workflows

Context:

用户参考 tabExtend 的 hover preview、category edit、session More 和 tab metadata surfaces，希望 TabBoard 的高密度 manager 默认更安静。但 TabBoard 需要继续支持 keyboard、touch、screen reader 与脆弱的浏览器 DnD 时序。

Decision:

将 hover 作为渐进披露增强，不作为唯一入口。Open/saved tab 的 rich metadata 使用本地 interactive popover；category/session/tab 的次级操作同时由 hover、focus-within 与 coarse-pointer 常驻路径访问。collapsed sidebar 以 selected-window icon rail 投影为默认状态，完整 sidebar 通过 absolute hover/focus overlay 打开，永不推动 board。rail 只聚焦既有 rows/filter，不参与 selection 或 DnD。图标使用 `@tabler/icons-react`。

Rationale:

- 默认行只保留身份信息，降低重复整理时的视觉竞争。
- 本地 anchored surfaces 使操作与对象保持邻近，不引入全局 inspector。
- focus/touch parity 保持 accessibility；stable overlay geometry 不破坏 drag target、placeholder 或 horizontal board。
- 复用 React/Mantine component tree、typed overlay contracts 和本地 icon assets，避免引入远程 runtime asset。

Trade-offs:

- hover/focus overlay 仍需要 Chrome 手工验收，特别是 200% zoom、coarse pointer、screen reader 和 DnD。
- rail 是 projection 而非完整第二份 tab list；低频操作仍通过展开 sidebar 或 context menu 完成。

Status:
Accepted，Chrome manual gate pending。

## D025: Prevent new duplicate category names within a workspace

Context:

同一 workspace 内出现多个相同 category 名称会降低顶部导航的可辨识性；trim、大小写或 Unicode canonical form 不同但语义相同的名称也不应绕过规则。但历史数据可能已经存在重复 category，不能在 normalize 时静默改变用户的 folder id 或 session 归属。

Decision:

新建和重命名 category 时，在同一 workspace 内按 trim、NFC 规范化后再做大小写不敏感比较；冲突拒绝并显示可读 toast。不同 workspace 可使用同名 category，重命名自身当前名称通过排除自身 folder id 放行。已有重复 category 保留，不做自动合并、删除或迁移。

Rationale:

- 共享纯 model helper 让 create/rename 使用同一套 trim/NFC/case-fold 比较规则。
- 在 manager 边界拒绝可以保留现有 prompt、取消和持久化流程。
- 不触碰 normalize 避免升级时发生不可逆的数据重写，保护已有重复 category 的 folder id、session 归属和排序。

Trade-offs:

- 历史重复 category 需要用户后续手动整理。
- 校验是本地状态快照上的线性扫描；当前规模下简单且足够，若未来支持并发写入再考虑存储层约束。

Status:
Accepted。

## D026: Keep React Manager as the only production Manager

Context:

React + Mantine Manager 是唯一 Manager 实现。曾经存在的旧 native Manager 双栈会让 bug 修复和行为归属含糊，因此需要收敛为单一实现。

Decision:

`manager.html` loads only `src/manager/main.tsx`, and Manifest V3 maps new-tab to `manager.html`. 旧 native `src/manager.js` 及其相关代码已删除，不再作为 shipped entry 或行为 oracle。

Rationale:

- One production entry gives release checks and Chrome behavior one source of truth.
- Existing pure core tests can be reused without recreating legacy behavior.
- 删除旧栈避免长期维护两套实现的成本与歧义。

Trade-offs:

- Browser-level gaps 仍是显式的手工验收工作，不再有旧实现可作参照基线。

Status:

Accepted。

## D027: Automated coverage does not replace Chrome acceptance

Context:

Typed DnD, immutable mutations, persistence/replay, sender verification and capture feedback can be proven without Chrome, but custom-element lifecycle, native DnD timing and real focus behavior still depend on an unpacked extension.

Decision:

自动化 proof 收敛到 Vitest core contracts（`npm test`）加 `build` / `check`，覆盖 selectors、state mutations、persistence queue、replay、capture ownership/feedback、typed DnD、Open Tabs policy、overlays、layout 和 hydration。历史 parity manifest / native oracle 测试机制已删除。带 Chrome 依赖的行为（DnD 事件时序、Shadow DOM/focus、capture/restore 与 sender 集成）仍需在 unpacked extension 上手工回归。

Rationale:

- Existing tests remain source of behavior proof; 不再维护额外的映射层。
- 明确区分自动化 proof 与 Chrome 手工验收，避免把自动化通过误报为完整 UI 验收。
- Sender and ordinary mutation boundaries stay visible in their dedicated executable suites.

Trade-offs:

- 部分视觉与浏览器集成回归只能靠手工验证发现。

Status:

Accepted。React 自动化 proof、build、check 已通过；旧 native/Web Awesome 栈与相关测试全部退役。Chrome 手工回归仍建议在 unpacked extension 上执行。

## D028: Checkbox starts the Open Tabs multi-selection workflow

Context:

Open Tabs 已有 selected IDs 和 multi-tab drag payload，但进入选择模式需要额外入口，导致 checkbox 的意图不直观。

Decision:

点击任一可保存 tab 的 checkbox 即进入多选态。footer 在该状态下替换 Filter tabs，提供创建 session、批量删除、批量 pin 与退出选择的 icon-only actions。

Rationale:

- checkbox 是用户预期的多选起点。
- 复用现有 selected IDs、capture 与 typed DnD payload，避免两套 selection state。
- 批量 Chrome 操作通过单一后台消息并只刷新一次列表。

Trade-offs:

- 多选态暂不显示文字按钮；可访问名称承担图标动作的语义。
- 不自动在取消最后一个勾选时退出，用户可继续选择或显式退出。

Status:

Accepted。

## D030: Popup controls only transient capture scope

Context:

当前窗口保存常会需要跳过 pinned 或 grouped tabs；为一次性保存修改全局 Options 会造成状态泄漏。

Decision:

Popup 在提交前提供 pinned 与 grouped tabs 的本次勾选范围，不写入全局 settings。Dedupe 对当前窗口按 URL 清理，保留 active tab，或在没有 active tab 时保留最后访问的 tab。

Rationale:

- Popup 保持短流程，同时让保存范围可见。
- 保留 active tab 避免打断用户当前工作；最近访问规则为其它重复集合提供稳定默认值。

Trade-offs:

- Popup 不支持逐个 Chrome tab group 选择；需要该粒度时应在 Manager 中提供。

Status:

Accepted。

## D031: Three built-in categories (Inbox / Saved / Archive)

Context:

原有的 Inbox + Starred 两档内置分类不足以覆盖"收集 → 整理 → 归档"的完整工作流。Starred 作为"收藏/重要"的语义不够准确，用户也缺少一个地方来存放不常用但需要保留的工作上下文。自定义 folder 虽然灵活，但大量低频内容会和活跃内容混在一起，降低整理效率。

Decision:

内置分类从 Inbox + Starred 扩展为 Inbox + Saved + Archive 三档。Starred 改名为 Saved，更准确地表达"已整理/重要"的语义；新增 Archive 用于归档不常用但需要保留的 session。`archived` 与 `starred` 互斥，两者任一为 true 时 `folderId` 自动清空为 null。自定义 folder 继续存在，与三档内置分类共同参与排序和拖拽。

Rationale:

- 三档分类符合 GTD 式的工作流演进：Inbox 是待处理的收集区，Saved 是当前活跃/重要的整理区，Archive 是已完成但需要留存的归档区。
- Saved 比 Starred 更贴近 tab manager 的使用场景——用户保存的是"工作上下文"，不是给内容"加星标"。
- 内置 Archive 避免了用户为了"归档"而去创建一个叫 Archive 的自定义 folder，同时让归档有明确的系统语义（如未来可支持批量清理老归档）。
- 三档内置 + 自定义 folder 的结构保持了灵活性，同时给用户提供清晰的默认组织框架。

Trade-offs:

- 从两档扩展到三档增加了一点认知成本，但 Inbox/Saved/Archive 的命名足够直觉，大部分用户能快速理解。
- `archived` 和 `starred` 两个字段互斥，增加了 state mutation 的校验复杂度，但通过统一的 normalize 和 category 推导函数保持了一致性。
- 历史 starred 数据自动映射到 Saved category，不需要数据迁移。

Status:

Accepted。

## D032: Destructive action confirmation is configurable (default on)

Context:

之前的设计是"危险操作始终确认，不提供关闭选项"，但高级用户在大量整理 sessions 时会觉得频繁弹窗打断工作流。同时，Bin 的存在已经提供了一层安全网——删除的内容可以恢复，永久删除才是真正的危险操作。

Decision:

新增 `confirmBeforeDestructive` 设置项，默认开启。用户可在 Options > Basic 中关闭该选项，跳过删除、永久删除等危险操作的二次确认弹窗。

Rationale:

- 默认开启保证了新用户和普通用户的安全，避免误删。
- 高级用户可以关闭，提升整理效率——Bin 已经提供了撤销删除的安全网。
- 配置项放在 Basic 设置中，容易找到，同时不影响其他设置的组织结构。

Trade-offs:

- 关闭确认后，用户可能更快操作但也更容易误删；但 Bin 的存在降低了这个风险。
- 增加了一个设置项，让 Options 稍微变长，但这个开关的价值足够高，值得增加。

Status:

Accepted。

## D033: Preserve full DOM while optimizing runtime hot paths

Context:

大量 sessions/open tabs 时，重复 collection 扫描、authoritative normalization 引用重建、overlay context fan-out 和 drag marker 全量传播会增加交互成本。直接使用 JS virtualization 虽能减少挂载数量，但会影响 `@dnd-kit` measurement、focus restoration、preview anchors、find-in-page 和 accessibility。

Decision:

保留 session board 与 Open Tabs 的完整 DOM。运行时通过单次派生、semantic structural sharing、stable listeners、细粒度 overlay state subscription、marker-local props、`useDeferredValue` 和 CSS `content-visibility` 降低成本；不新增 virtualization 或性能依赖。

Rationale:

- 现有热点可以在原有边界内消除，不需要牺牲 DnD/focus 行为。
- Structural sharing 在 authoritative publication 边界统一复用语义未变实体，比组件层不断增加 equality workaround 更可靠。
- `content-visibility` 与 deferred filtering 能降低不可见绘制和输入阻塞，同时所有交互目标仍保留在 DOM。

Trade-offs:

- 完整 DOM 的内存成本仍随列表长度增长；若未来达到数百或上千 rows，需要基于 profiler 重新评估。
- Semantic equality 需要随 state schema 演进维护；新增嵌套字段时必须补 structural-sharing 回归。
- CSS containment 的收益依赖浏览器支持，Chrome extension 目标环境满足当前要求。

Status:

Accepted。

## D034: File System Access API for local file storage (no companion app)

Context:

`chrome.storage.local` 在扩展卸载时丢失，数据也无法跨设备同步。用户希望把数据存在本地文件夹里，以便重装后保留、并通过 iCloud/Dropbox/OneDrive 等同步。可选路径包括 Native Messaging 伴随程序和 File System Access API。

Decision:

使用 File System Access API（`showDirectoryPicker` + `FileSystemFileHandle`），由用户在 Options 中选择一个文件夹；不引入 Native Messaging host 或独立伴随程序。

Rationale:

- 零安装：用户在浏览器内选文件夹即可，不需要下载或运行额外进程。
- 不需要新增 manifest 权限；File System Access API 由浏览器原生提供，权限通过用户手势授予。
- 文件夹句柄可通过 IndexedDB 持久化，扩展重启后仍可恢复读写权限。

Trade-offs:

- File System Access API 需要 Chrome 86+；TabBoard 目标环境已满足。
- 用户必须主动授予文件夹权限；权限在扩展重启后由浏览器决定是否保留（IndexedDB 持久化 handle + `requestPermission` 兜底）。
- 相比 Native Messaging，无法做原生文件 watch 或跨进程协同，但 TabBoard 不需要这些能力。

Status:

Accepted。

## D035: Per-session file layout with a commit-point meta.json

Context:

如果把所有 state 写入一个大 JSON 文件，每次小改动（比如改一个 session 标题或加一个 tab）都要重写整个文件；文件也不便于用户直接检视或用版本控制跟踪。

Decision:

文件夹下采用拆分结构：根目录 `meta.json`、`settings.json`、`workspaces.json`、`folders.json`、`categoryOrder.json`、`bin.json`、`ledger.json`，以及 `sessions/<id>.json`（每个 session 一个独立文件）。`meta.json` 作为提交点记录 `version`、`revision`、`createdAt`、`updatedAt`、`writeInProgress`。

Rationale:

- 写入单个 session 时只改一个 session 文件加 meta，避免重写全量 state。
- 用户可直接打开 `sessions/` 查看、备份或用 git/Dropbox 跟踪单个 session 的变化。
- 顶层文件按业务实体拆分，文件大小和职责都清晰。

Trade-offs:

- 写入涉及多个文件时需要两阶段提交保证原子性，增加了少量实现复杂度。
- 删除 session 时需要清理对应文件；残留文件会在下次加载时忽略。

Status:

Accepted。

## D036: Two-phase commit with tmp-sibling atomic writes

Context:

文件系统写入可能在任意时刻崩溃（断电、扩展崩溃、标签页关闭），必须保证下次启动不会读到半写文件或新旧数据混搭。

Decision:

所有数据文件使用"写 tmp 兄弟文件 + rename"原子替换；批次写入采用两阶段提交：

1. 先写 `meta.json`，置 `writeInProgress: true` 并递增 `pendingRevision`。
2. 依次写所有需要变更的数据文件（tmp + rename）。
3. 最后写 `meta.json`，置 `writeInProgress: false` 并把 `revision` 推进到 `pendingRevision`。

启动时若发现 `writeInProgress: true`，丢弃上次未完成批次（数据文件要么是上次完整提交的版本，要么是 tmp 文件被清理），以上一次完整 revision 为准。

Rationale:

- 在同一文件系统内，tmp-sibling rename 在 POSIX 和 Windows 上都是原子操作。
- 两阶段提交让 `meta.json` 成为唯一的崩溃恢复判定点：要么全有要么全无。

Trade-offs:

- 批次写入需要两次 meta.json 写；对于 TabBoard 的写入频率（用户操作级别）可忽略。
- 不做跨文件系统事务；假设所选文件夹在单一文件系统上。

Status:

Accepted。

## D037: Automatic fallback to browser storage on file errors

Context:

用户选择的文件夹可能被移动、删除、权限被撤销，或同步盘暂时不可用。此时不能让 TabBoard 停止工作或丢失后续写入。

Decision:

任何文件读写失败（权限丢失、IO 错误、配额不足等）都会自动降级回浏览器存储（`chrome.storage.local`），并通过 UI toast/通知用户。降级后后续写入继续走浏览器存储，不会阻塞用户操作；用户可在 Options 中重新选择文件夹或明确切回浏览器存储。

Rationale:

- 可降级保证 TabBoard 始终可用，文件存储是可选增强而非硬依赖。
- 自动降级而非抛错让用户在同步盘临时不可用时不会丢数据。

Trade-offs:

- 降级期间浏览器存储和文件存储会分叉；重新连接文件夹时需要用户选择迁移方向（merge 或覆盖）。
- 需要清晰的 UI 提示当前处于哪种存储模式和降级原因。

Status:

Accepted。

Implementation note（2026-07-26）：

- Storage Authority 以稳定对象持有当前 backend；File runtime read/write/reload 失败时替换内部 backend，不要求 callers 重新获取 adapter。
- 降级只复制最后一次成功 snapshot；触发失败的 mutation 仍 reject，由 persistence retry 在 Chrome backend 上重试，因此不会把未提交数据误报成功。
- `storageEvents.ts` 用 `chrome.storage.local` 的小事件协调存活 context，event id 防止同一 fallback 重复通知；remote context 读取已提交 Chrome state，不用本地旧 snapshot 覆盖它。

## D038: Raw IndexedDB for folder handle persistence (no wrapper library)

Context:

File System Access API 的 `FileSystemDirectoryHandle` 需要持久化才能在扩展重启后继续使用；常见做法是用 IndexedDB 存储 handle。可选择引入 `idb` 或类似轻量封装。

Decision:

直接使用原生 IndexedDB API（一个 database、一个 object store，只做 put/get/delete），不引入新的依赖库。

Rationale:

- 只需要三个操作（存句柄、取句柄、删句柄），原生 API 代码量极小，不值得引入额外依赖。
- 符合项目"不新增运行时依赖除非有明确收益"的原则。

Trade-offs:

- 原生 IndexedDB API 基于事件回调，代码略繁琐，但封装在一个小模块内即可。

Status:

Accepted。

## D039: Substitute storage mode (not dual-write)

Context:

切换存储后端时有两种一致性策略：双写（同时写两份，读时仲裁）和 substitute（切换后只写新后端）。

Decision:

采用 substitute 模式：切换时执行一次性迁移（把当前存储的数据完整写入新后端），切换完成后后续读写只走新后端；不双写。一个 bootstrap key（极小的标记）留在 `chrome.storage.local` 中，记录当前激活的存储模式（`browser` 或 `file`）和文件夹标识，供启动时判定。

Rationale:

- 单写模型的一致性推理简单，不存在双写部分失败后的仲裁难题。
- bootstrap key 体积极小（仅几个字段），留在 `chrome.storage.local` 不违反隐私预期，也能在文件存储完全不可用时回退判定。

Trade-offs:

- 切换是一次性操作；如果迁移中途失败需要回滚到原存储，不能指望双写自动恢复。
- 用户必须通过 Options 显式切换，TabBoard 不会静默改变存储后端。

Status:

Accepted。

Implementation note（2026-07-26）：

- substitute switch 使用 transactional commit order：目标 backend 验证/写入成功后才提交 bootstrap mode 与目录 handle。
- pre-commit failure 保持原 authority backend、bootstrap 和 handle，不产生半切换状态。
- File migration seed 在 commit 前抑制 cross-context ping；bootstrap/handle 提交且 authority 安装完成后才广播 committed revision。

## D040: Three migration modes when connecting a folder

Context:

用户连接本地文件夹时，浏览器存储和文件夹中可能各自有数据，单一覆盖策略可能丢失一边的内容。

Decision:

提供三种迁移模式：

- `use-file`：以文件夹中现有数据为准，切换到文件存储；浏览器存储中的数据保留但不再作为主存储。
- `export-browser`：把当前浏览器存储数据完整写入文件夹，但保持浏览器存储为激活后端（相当于导出/备份）。
- `merge`：读取文件夹数据与浏览器存储数据按 ID 合并（文件夹中已有的 session 以文件夹为准，浏览器中独有的追加），合并完成后切换到文件存储。

Rationale:

- 三种模式覆盖了"我已有数据在文件夹里"、"我只是想备份"、"我想把两边合在一起"三类场景。
- 合并策略保守（同 ID 以文件夹为准），避免误覆盖用户在文件夹侧的改动。

Trade-offs:

- merge 不是 CRDT 级别的合并；同一 session 两边都有修改时以文件夹为准，用户需在合并前自行备份。
- 迁移是一次性同步操作，数据量大时可能短暂阻塞写入。

Status:

Accepted。

## D041: Hide extension pages and treat pinned open tabs as selectable

Context:

Open Tabs 是用户整理当前浏览现场的入口。TabBoard 自身页面和其他扩展页面出现在列表里会混入不可恢复、不可迁移的工具页面；同时 pinned tabs 作为真实浏览现场的一部分，如果不能勾选或拖拽，会让批量整理结果和用户所见列表不一致。

Decision:

Open Tabs 隐藏所有 extension pages（`chrome-extension:`、`moz-extension:` 和当前扩展 base URL）。Pinned tabs 与普通 tabs 共用 selection、drag、batch action 和 selected capture 规则，只要 row 是 `storable` 且有有效 tab ID，就可以勾选和拖拽。

Rationale:

- Extension pages 不是用户要整理的网页内容，隐藏比展示为不可操作 row 更安静。
- Checkbox 的语义应是“我要整理这些当前 tabs”，不应因为 pinned 状态额外分叉。
- 统一到 `storable` + valid tab ID 能让 UI、drag payload 和 background capture 保持同一边界。

Trade-offs:

- 如果用户确实想保存某个扩展页面 URL，需要通过其他方式手动添加；这是为了避免 sidebar 被工具页噪音污染。
- Pinned tabs 被保存后恢复时仍受 Chrome 对 pinned/特殊 URL 的平台能力限制。

Status:

Accepted。

Implementation note（2026-07-26）：

- Open Tabs protocol 由 `src/shared/openTabs.ts` 统一拥有；selection/refresh/filter status 由 pure workflow reducer 统一拥有。
- Panel 消费 grouped model/commands 与单一 selection projection，不再重复派生 records/IDs。
- Capture、drop 和 tab-filter ownership 使用直接返回值/command/model，删除三条全局 DOM event。

## D042: Use an injected Authoritative Publication owner, not a second UI store

Context:

Manager persistence 需要同时处理 optimistic projection、serialized mutation batch、remote publication buffering、drop/category waiter、bounded retry、terminal isolation 和 hydration lifecycle。此前这些状态全部以 module-level globals 位于 `useTabBoardStore.ts`，与领域 actions 和 Zustand projection 共用一个 1227 行模块。可选方案包括只拆 pure helpers、再建一个 Zustand persistence store，或建立不依赖 UI library 的 publication owner。

Decision:

采用 `createAuthoritativePublication(dependencies)` 注入式 owner。每个 instance 独占 publication 状态机，通过窄 projection ports 读取/发布 UI state，通过 transport ports 调用 Storage Authority 和 worker mutation RPC。

Zustand 只保留 UI projection 与领域 facade；Storage Authority 只保留 backend identity/switch/fallback；worker `statePersistence` 只保留 mutation validation 与 normalized atomic transaction。

Rationale:

- queue、retry、waiter、remote buffer 和 hydration generation 是一个并发状态机，应由同一 instance 拥有，而不是散落在 UI store globals。
- 第二个 Zustand store会让基础设施状态继续依赖 UI library，并引入两个 store 的同步顺序问题。
- 注入 ports 后可用真实 reducer + 内存 projection/transport 直接验证并发行为，不需要 DOM、React 或 Chrome global。
- 一次性 production cutover后，`useTabBoardStore.ts` 从 1227 行降到 534 行，并且没有保留双 owner。

Trade-offs:

- publication owner 本身集中了承担 retry、isolation 和 reconciliation 的复杂状态机，文件仍较大；后续是否拆 pure policy 需根据独立 seam、测试局部性与 import graph 再评估，不能为了行数机械拆分。
- context replacement 必须同时处理 pending 与 in-flight continuation；因此 owner维护独立 publication generation 和 hydration generation。
- AppEvents 仍由 Zustand adapter 映射，publication 只决定 success/error outcome 与 `notify` policy。

Status:

Accepted。

Implementation note（2026-07-26）：

- `releaseHydration()` 只释放 UI publication generation，不 teardown Storage Authority backend。
- ordinary/drop/category/restore 四种 commit 语义、partial commit、retry exhaustion、terminal isolation、queued-during-isolation、context replacement 和 dispose 均有 direct tests。
- `npm run check` 的 import graph gate 禁止 publication 依赖 Zustand、React、Manager components、DOM event utilities 或 concrete storage adapters。

## D043: Persistent session/drop semantics live in shared domain, not Manager core

Context:

`CategoryFilter`、`DropIntent`、session move、drop execution/replay、restore/import曾由Manager `selectors.ts` / `dnd.ts` / `commands.ts`拥有；shared mutation validation、background persistence和Zustand store因此反向依赖Manager。Barrel imports又形成六模块SCC。只改direct imports可以消除SCC，但不会修复owner inversion。

Decision:

把persistent domain按职责拆到shared：

- primitive validation → `src/shared/validation.ts`；
- category/session placement → `model/categories.ts`；
- wire contract → `model/drop-intent.ts`；
- raw drop validation → `model/drop-validation.ts`；
- drop execution/replay/digest/stable identity → `model/drop-operations.ts`；
- restore/import → `model/session-operations.ts`。

Manager `dnd.ts`只保留drag geometry、payload/target、hysteresis和intent resolution；删除production `manager/core/commands.ts`。Shared/background production modules不得导入Manager，source graph必须零cycles。

Rationale:

- DropIntent是跨Manager、worker、store和background的持久化协议，不是UI-local type。
- Authoritative validation/replay必须由worker/shared可直接调用，不能经由Manager模块。
- Category derivation只有一套state-aware实现，保证orphan folder在selector、resolver和mutation execution中都归Inbox。
- 严格零cycle gate能防止未来barrel或reverse import重新模糊ownership。

Trade-offs:

- `drop-operations.ts`集中多种intent execution/replay，文件仍较大；后续是否按execution/replay拆分需基于变更局部性与direct tests评估，不能只按行数拆。
- Manager tests部分仍保留历史文件名，但imports直接指向shared owner；生产owner已迁移。
- Shared model承担更多domain logic，但保持无DOM、无React、无Chrome API依赖。

Status:

Accepted。

Implementation note（2026-07-26）：

- DropIntent wire shape、operation ledger、retry policy、DnD geometry、restore/import behavior均未改变。
- Shared/background production imports Manager = 0；`manager/core/commands.ts` 已删除。
- `npm run check:cycles` 对任何source SCC失败，并额外禁止shared/background → Manager edges。

## D044: Saved search uses a standalone external store and canonical board projection

Context:

Saved-session query曾同时存在module global、每个hook instance的React state、`sessionStorage`和`tabboard-search-change` window event。SearchBar另行监听同一event；Open Tabs capture用effect更新的ref判断filter ownership。与此同时，`WorkspaceContent`在filtered groups之外重新扫描全部groups并手写category membership，导致orphan folder在render与DnD index之间语义不一致。

可选方案包括：

1. React Context provider统一query；
2. 把query放入现有Zustand store或建立第二个UI slice；
3. framework-neutral external store，通过React adapter订阅。

Decision:

采用独立 `SearchQueryStore`，只暴露同步 `getSnapshot()` / `subscribe()` / `set()`。Browser adapter拥有URL/sessionStorage初始化和唯一storage key，React通过 `useSyncExternalStore`订阅；Open Tabs imperative command/capture直接读取同一snapshot。

同时建立canonical board projection：`getBoardProjection()`先用shared category semantics产生未过滤 `categoryGroups`，再产生query-filtered `visibleGroups`。`WorkspaceContent`只消费该projection，card insertion index和end target必须使用未过滤category groups。

Rationale:

- Query是Manager page临时状态，不属于TabBoard schema、Storage Authority或Authoritative Publication；放入Zustand会重新混淆persistent domain projection与UI session state。
- Context能统一React consumers，却不能自然满足“setter返回后同一call stack立即读取新值”的Open Tabs capture需求；仍需额外imperative bridge/ref。
- 三方法external store足够小，可用内存ports直接测试，并让React和imperative consumers共享一个snapshot。
- Category membership已有shared owner，board不应再用`starred` / `archived` / `folderId`复制规则。
- DnD index基于未过滤category groups，搜索只改变可见卡片，不改变canonical insertion位置。

Trade-offs:

- Manager page仍有一个module singleton，但它只有一个string snapshot和listener set，且不跨extension pages同步。
- SearchBar保留local input用于150ms debounce，因此刻意存在“正在输入”与“已提交query”两层值；external update必须取消旧timer并同步local value。
- `useFilteredGroups()`作为只返回`visibleGroups`的薄wrapper继续服务只需要可见列表的consumer；它不拥有projection规则。
- `sessionStorage`失败时只保留当前page的in-memory query，刷新后无法恢复，但Manager仍可搜索。

Status:

Accepted。

Implementation note（2026-07-26）：

- `tabboard-search-change`、query module global和effect-updated saved-query ref已删除。
- Orphan/cross-workspace folder references在Inbox render、search、card index和end target中使用同一shared语义。
- `npm run check:architecture`禁止event bus、SearchBar window listener、WorkspaceContent全量group/category scan和core owner的framework/browser dependencies。

## Decision template

```md
## D00X: Title

Context:

Decision:

Rationale:

Trade-offs:

Status:
Proposed / Accepted / Rejected / Revisit
```
- D029（2026-07-19）：Open Tabs 不再提供 pinned、Chrome URL、file URL 三组捕获开关，仅保留自定义 URL 过滤规则。原因：多组“能否选择”的特例造成列表、批量操作与设置的认知负担；过滤应是统一的隐藏规则。取舍：Chrome 对部分 URL 的实际操作限制仍由平台返回错误。
