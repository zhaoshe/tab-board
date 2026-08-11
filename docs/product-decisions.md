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

新增 `confirmBeforeDestructive` 设置项，默认开启。用户可在 Options > Advanced
中通过 `Confirm before dangerous operations` 统一控制危险操作确认。覆盖范围包括：

- Session、Saved Tab、Saved Note、Saved Item note 和批量 Saved Item 删除；
- 浏览器 Tab 关闭；
- Workspace 和 Category 删除；
- Trash 单项永久删除和 Empty Trash；
- Reset Settings。

关闭后直接执行同一个 mutation/runtime command，不改变数据去向、错误反馈或重试
语义。

Rationale:

- 默认开启保证了新用户和普通用户的安全，避免误删、误关浏览器 Tab 或误重置设置。
- 高级用户可以关闭，减少整理和管理过程中的弹窗中断。可恢复删除仍由 Bin 兜底；
  永久删除等不可恢复操作则由用户显式选择承担风险。
- 一个开关覆盖所有危险操作，避免出现“有些删除可关闭确认，有些永远确认”的规则
  分裂。

Trade-offs:

- 关闭确认后，用户更容易误关浏览器 Tab、永久删除 Trash 或重置设置；这些操作没有
  Bin 兜底。
- Storage migration 的 Use/Overwrite/Merge 和 Stop Using File Storage 仍保留
  对话框，因为它们用于选择迁移策略，不属于可跳过的危险操作确认。

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

Partially superseded by D050 for session interaction DOM。Open Tabs 仍保留完整
rows；session board 只保留完整 slots/geometry，远端 card 内容改为 shell。

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
- Typed Application Feedback 由 Zustand adapter 映射，publication 只决定 success/error outcome 与 `notify` policy；具体channel与toast presentation见D045。

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

## D045: Application feedback is a typed outcome stream, not window events or Zustand state

Context:

Authoritative Publication负责mutation commit、partial commit、retry、reconciliation和error notification policy，但outcome仍由Zustand adapter通过四个未类型化window event names传给Manager toast。Producer/consumer分别手写payload shape，Store tests依赖`window.dispatchEvent`，旧event module还保留一套从未注册subscriber的dead listener map。

可选方案包括：

1. UI action传入success/error callbacks；
2. 把feedback queue/last feedback放进Zustand；
3. 建立typed page-local external channel。

Decision:

采用 `ApplicationFeedback` discriminated union和同步 `ApplicationFeedbackChannel`。Channel只拥有fanout；`stateMutationFeedback.ts`纯映射committed mutation；`useTabBoardStore`只在publication outcome ports调用channel；Manager `useToastNotifications()`把typed feedback映射为toast copy。

Rationale:

- UI callbacks在optimistic action返回时无法判断authoritative commit、retry、partial commit或reconciliation，不能拥有feedback时机。
- Feedback是一次性event stream；放入Zustand snapshot需要ack/clear协议，并可能被hydration/reconciliation重放或覆盖。
- Typed channel让producer/consumer contract进入import graph，direct tests不依赖DOM global。
- 当前window events本就只在同一page生效；page-local module singleton保持行为，不需要跨context transport。
- Subscriber异常必须隔离，避免toast failure把已经成功的persistence调用变成失败。

Trade-offs:

- Late subscriber不会收到历史feedback；这是notification的预期语义。
- Options/Popup bundle会创建自己的channel instance但没有subscriber，publish为no-op。
- Component-local copy/validation toast继续直接使用`useToast()`；channel只承载authoritative store outcomes。
- Channel不记录history；需要诊断时依赖现有diagnostics breadcrumbs和persistence evidence。

Status:

Accepted。

Implementation note（2026-07-26）：

- Save/import/restore只在committed mutation后publish；partial response只publishcommitted indexes。
- Transient retry、waiter-owned drop error和`notify: false` hydration failure不产生generic feedback。
- `shared/utils/events.ts`、`AppEvents`与legacy feedback event names已删除。
- `npm run check:architecture`与import graph gate共同禁止feedback owner/consumer退回global DOM bus或framework/store dependency。

## Decision template

## D046: Manager context is URL-backed page state

Context:

Workspace、category、Bin 和 search 原来分散在 local React state、Zustand active workspace、SearchQueryStore 与临时 URL 参数中，刷新或 Back/Forward 无法稳定恢复完整页面上下文。

Decision:

使用 framework-neutral `ManagerPageState` owner 管理 `workspace/category/view/q`。Workspace/category/Bin 导航写 `pushState`，search 写 `replaceState`，`popstate` 恢复同一上下文。该 owner 不进入 persistent schema。

Rationale:

- 页面导航需要 deep link 和浏览器历史语义。
- Search 仍由既有 `SearchQueryStore` 提供同步 imperative snapshot；page-state adapter 只协调 URL。
- Validation 使用 shared category ownership，避免 orphan/cross-workspace folder URL 产生不可渲染状态。

Trade-offs:

- URL 更长，但可复制、刷新和回退。
- `activeWorkspaceId` 仍持久化；page adapter 在 URL 和 store 不一致时同步 store。

Status:

Accepted。

## D047: Compact header preserves commands through overflow

Context:

原 760px breakpoint 直接隐藏 Import、Export、Trash；展开 280px Search 又与 category 和 Options 重叠。

Decision:

Desktop 与 compact 使用同一 global command model。Compact 收入 More actions；Search 展开时独占 header 内容区。Category reorder targets 绝对定位，不参与 topbar flow。

Rationale:

- Responsive layout 可以改变呈现，但不能删除能力。
- 单一 command model 避免 desktop/compact 行为漂移。
- 绝对定位保持 DnD target 语义，同时固定 topbar 几何。

Trade-offs:

- Compact 多一次菜单点击。
- Header 增加明确的 responsive composition contract。

Status:

Accepted。

## D048: Page-local disclosures and floating UI use geometry-safe ownership

Context:

最终 Web Interface Guidelines 复审发现两类恢复性问题：Options 的 Advanced 展开状态刷新后丢失；Mantine Tooltip/Menu 默认 portal 到 `body`，关闭 fade 期间会留下 landmark 外或半透明的 accessibility nodes。后续 Chromium 测量又确认 fixed Modal portal 到 flex/grid `#manager-main` 时，portal root 宽度变为 0，dialog 被整体偏移到视口外；改回 `body` 后，Mantine 原生 modal `<header>` 又形成第二个 banner landmark。

Decision:

Options Advanced 使用 `?advanced=1` 并通过 `replaceState` 同步。Manager 使用专属 Mantine theme，把 Tooltip/Menu portal 到 `#manager-main`；fixed Modal/Confirm 统一通过 shared compound `TabBoardModal` portal 到 `body`。该 owner 给 `Modal.Header` 设置 `role="presentation"`，保留 `Modal.Title` 的 H2/id 与 dialog `aria-labelledby`。Tooltip/Menu/Modal transition duration 统一为 0ms。页面 theme 在首个 client render 读取 system preference，并让 `theme-color` 匹配实际 body 背景。

Rationale:

- Stateful disclosure 可 deep-link，刷新与 Back/Forward 后可恢复。
- Tooltip/Menu 属于 Manager 主工作台并留在 main；fixed dialog 的 portal owner 必须优先满足 viewport geometry。
- Presentational modal header 可消除重复 banner，不移除 heading 或 dialog title association。
- 透明度过渡不应制造短暂的错误对比度或 stale accessibility tree。
- 首帧 theme 与 system preference 一致可以避免 light→dark 对比度闪烁。

Trade-offs:

- Floating overlays 不再淡入淡出，视觉更直接但状态更确定。
- Fixed dialog DOM 位于 `body`，不再由 main 包裹；测试需分别守护 body geometry 与单一 banner/title association。
- Options URL 增加一个低频 query param，不影响 persistent schema。

Status:

Accepted。

## D049: Dense workbench actions use explicit ownership and adaptive density

Context:

`ui-ux-pro-max`复审发现当前Manager仍有几类交互冲突：collapsed sidebar hover会推动board；category label同时是导航和DnD activator；Open Tab把selection、drag、single/double click、preview和close堆在同一行；compact rail虽视觉裁剪，离屏按钮仍可进入焦点序列。与此同时，OpenTabsPanel、SessionCard和ManagerDndCoordinator仍混合多个交互owner，增加视觉迭代的回归范围。

Decision:

- 保留dense、flat、low-motion productivity workbench，不采用生成的portfolio/exaggerated-minimalism/orange设计系统。
- Navigation、selection、drag和secondary actions使用独立control。Category label只导航，Open Tab title单击/Enter Focus，drag handle只拖拽，checkbox只选择，More只打开详情动作。
- Fine pointer使用32px compact action并允许直接Close；coarse pointer和760px以下使用44px target、8px spacing，Close收进More。
- Collapsed rail只保留当前window、row Focus和Expand Sidebar；完整window/selection/drag/filter动作只在overlay drawer可达。Drawer覆盖期间topbar和main surface使用`inert`。
- Open Tabs、Session Card和Manager DnD分别拆为composition owner加window/list/filter、header/meta/editor/list、geometry/sensors/overlay模块。
- Full DOM + `content-visibility`继续保留；没有性能证据时不引入virtualization runtime dependency。

Rationale:

- 独立control让accessible name、键盘动作和pointer行为一致，避免Enter启动错误DnD或double-click-only主流程。
- Compact模式不能只靠`overflow:hidden`隐藏可聚焦入口；焦点序列必须与视觉可见性一致。
- Touch target尺寸与间距是interaction contract，不应由共享CSS和后加载owner CSS偶然竞争。
- 明确owner让source contract绑定真实责任模块，避免为了通过测试把rendering重新塞回coordinator。

Trade-offs:

- Compact用户需要先Expand Sidebar或打开More执行部分低频动作。
- Open Tabs row在coarse pointer下显示的直接动作更少，但每个动作更稳定、可发现。
- 模块数量增加，但public coordinator保持不变，schema、storage protocol、mutation wire和DropIntent不变。

Status:

Accepted。

## D050: Keep stable session geometry and activate interaction trees near the viewport

Context:

D033 保留了 session board 的完整 card/tab interaction DOM，并使用
`content-visibility` 跳过 off-screen layout/paint。生产测量证明，当 state
达到 300 sessions × 20 tabs 时，Manager 仍需在首次有效 commit 前创建
196 个完整 cards 和 3,920 个 `TabItemRow`；最后一次 state read 结束后仍有
约 2.10s React/dnd-kit mount 工作。Options 同时为完全不渲染的 session
collections 支付完整 hydration 成本。

Decision:

- 保留每个 session 的固定 `SessionSlot`、group `useSortable` owner 和全部
  insertion targets，维持 horizontal board geometry 与 DnD measurement。
- 初始只激活前 6 个 session；IntersectionObserver 以 board 为 root，在
  左右 720px overscan 内单调激活完整 `SessionCard`。搜索/高亮/显式 shell
  title activation 同样强制激活。
- 未激活 slot 渲染 `SessionCardShell`：保留 title、link/note count、lock
  状态和 session drag handle，但不挂载 tab rows、tab sortables、row
  subscriptions、overlay registry 或 overflow observers。
- Options Basic 使用 disposable SettingsProjection；Authoritative
  Publication hydration 只执行一次 Storage Authority read。
- 不新增 virtualization runtime dependency，不改变 persistent schema、
  mutation wire 或 DropIntent semantics。

Rationale:

- `content-visibility` 不能减少 React component、hook 或 dnd-kit
  registration；限制完整 interaction tree 数量才使 startup work 与 viewport
  有界。
- slot geometry 与 card content activation 分层，可以保留 session reorder、
  cross-category move 和 new-session insertion 的既有坐标模型。
- structural sharing 让 groups/filtered tabs 引用本身成为可靠的生命周期
  token，不需要每次 render 拼接全部 ID/timestamp。
- Options projection 是 canonical state 的可修复 read model；写入真相仍由
  Storage Authority 和 worker mutation path 拥有。

Trade-offs:

- 浏览器 Ctrl+F 只看得到已激活 card 的 tab rows，以及远端 shell 的 session
  summary；TabBoard 自身 search 仍扫描全量 canonical state并激活匹配 session。
- 激活在同一 workspace/category/search context 内单调增长，长时间横向浏览
  最终可能挂载较多 cards；切换 context 会重置到新的 bounded initial set。
- 缺少 IntersectionObserver 的环境退化为全部激活，以正确性优先。

Status:

Accepted。Partially supersedes D033 for session interaction DOM；Open Tabs
rows 仍使用 D033 的完整列表 + `content-visibility` 策略。

## D051: Bare-entry context and explicit category reorder mode

Context:

Manager 作为 new-tab override 时，裸 URL 总是进入 Inbox。若 Inbox 为空而
Saved/自定义 category 有内容，主表面会表现成空应用。同时 category navigation
为了支持排序，正常模式中每个 category 永久增加一个 drag handle 和 keyboard
focus stop。

Decision:

- 显式 `workspace/category/view/q` URL state 始终优先，invalid category 仍回退
  Inbox。
- 裸 `manager.html` 使用 versioned page-local preference 恢复每个 workspace
  最近访问 category；没有有效偏好时按 workspace category order 选择第一个非空
  category，全部为空才进入 Inbox。
- preference 不进入 canonical state、SettingsProjection 或 file backend。
- Category 普通模式只显示 label/count，并保留始终挂载的 `category-column`
  droppable。Category Options 显式进入 Reorder Categories 后，才挂载 category
  draggable、activator 和 before/after targets。

Rationale:

- New-tab 首屏应呈现已有工作上下文，不能把“当前分类为空”误表达成“产品无数据”。
- 最近 category 是 page navigation preference，不是需要跨设备、导入导出或参与
  mutation revision 的 domain state。
- Category switch 远比 category reorder 高频；显式管理模式减少视觉噪音与正常
  keyboard traversal，同时不改变 session cross-category drop。

Trade-offs:

- 用户若希望明确进入空 Inbox，应使用 category tab 或显式 URL；裸入口会恢复上次
  category。
- Reorder 多一步进入管理模式，但 pointer 与 keyboard DnD 仍完整保留，Manage
  Categories 中也继续提供 move up/down fallback。
- localStorage 不可用时退化为 first-nonempty/Inbox，不阻断 Manager。

Status:

Accepted。Category reorder 子决策由 D052 取代；bare-entry category preference 保持有效。

## D052: Category tab direct pointer reorder with manager keyboard commands

Context:

显式 Reorder Categories mode 避免了日常导航中的独立 drag handle，但给低频排序增加了模式切换和 Done Reordering 状态。确认后的 Crisp Utility 交互要求整个 Category tab 直接拖动，同时保留点击导航和无隐藏 focus stop。

Decision:

- 正常 topbar 中整个 Category tab 同时是 navigation control 和 pointer drag activator；复用 Manager 全局 5px PointerSensor threshold，不新增局部 DnD context 或 sensor。
- `category-column` 与 before/after reorder targets 持续挂载；不显示 drag handle，也不存在显式 reorder mode。
- Keyboard 排序只在 Manage Categories 中使用 Move Up / Move Down；统一列表的整行 native pointer drag 发布同一完整 category order。
- Folder edit 和 category order 使用 expected/target compare-and-set mutation。Editor open、Manage rendered action/drop 和 topbar resolver 分别拥有 expected snapshot；store 只复制，不在提交时重读最新状态。Exact replay 还要求 mutation timestamp witness 匹配，冲突保留 authoritative 新值。

Rationale:

- 5px threshold 让高频点击保持导航，拖动超过阈值才进入排序。
- 移除独立 handle 和模式状态可减少视觉、keyboard traversal 与 responsive CSS 负担。
- Manage Categories 是明确的低频管理表面，适合承载 keyboard 等价命令、能力差异和删除安全信息。
- UI-start expected snapshot 让延迟提交仍能检测 modal/list/drag 起点之后的远端变化；否则 submit-time store read 会把 stale UI 操作伪装成基于最新状态。
- Timestamp witness 让 response-loss retry 在可证明时幂等，并拒绝 target 恰好相同的 ABA/独立写入，避免旧编辑或旧排序覆盖其它页面刚提交的新状态。

Trade-offs:

- Category tab 同时承担 click 与 pointer drag，阈值行为必须由真实浏览器 E2E 守护。
- Topbar 不提供 keyboard drag；键盘用户需要打开 Manage Categories。
- Native manager-row drag 与 Manager `@dnd-kit` 隔离，浏览器仍需验证 drag/drop 和 focus return。
- 冲突不会自动合并；用户需基于最新状态重试编辑或排序。
- Order replay 使用 top-level timestamp 作为保守 witness；若不相关 mutation 在 response-loss 后推进该 timestamp，retry 可能冲突而非被识别为 replay。

Status:

Accepted。Supersedes D051 的 explicit category reorder mode；D051 的 bare-entry preference 决策继续有效。

## D053: Selection scope and selected IDs have separate owners

Context:

Open Tabs 与每个 saved Session 都有自己的 selected IDs，但原实现从 ID count
推导 `selectionMode`。这无法表达 `0 selected` 仍在选择态，也无法保证从一个
browser window / Session 进入另一个 scope 时同步清理旧 IDs。

Decision:

- `ManagerLayout` 通过 `useManagerSelectionScope()` 只拥有当前 active
  `{kind: 'open-tabs', windowId}` / `{kind: 'saved-tabs', groupId}` scope。
- Open Tab IDs 继续由 Open Tabs workflow 持有；saved item IDs 继续由对应
  `SessionCard` 持有。两者都不进入 Zustand、canonical state 或 persistence。
- Checkbox 先 enter 对应 scope，再 toggle 当前 item。Scope replacement 和
  explicit Exit 通过 owner 注册的 clear callback 同步清旧 IDs。
- 清空最后一个 ID 不退出 mode。Open Tabs 还会在 sidebar collapse 或 source
  window 改变/失效时 exit + clear；same-window refresh 只 prune IDs。
- Drag overlay 不接收 coordinator，不注册 selection owner。
- Selection/preview 只保持 collapsed sidebar visually expanded；只有实际 drawer
  overlay 让 topbar/main `inert`，所以 Open 与 Saved scope replacement 保持可达。
- 当前 active saved scope group 进入 session activation forced set，仍在 board 中时
  context reset 不会卸载其 `SessionCard` 和 owner-local IDs；若 owner 真正离开
  render tree，则 unregister cleanup 显式 exit scope。

Rationale:

- Active scope 是 Manager 级互斥交互上下文，IDs 是各 source 的 transient
  payload；拆开后才能稳定表达 `0 selected`。
- IDs 保留在既有 owner 中，可继续复用 capture/DnD/session-local refs，并避免
  为纯 UI 状态扩大 persistent schema 和 publication 范围。
- 同步 clear 使“进入新 scope 前旧 selection 已清理”成为事件级保证，不依赖
  后续 effect 或 count 派生。

Trade-offs:

- Manager 需要向 Open Tabs 与 active Session render chain 传递 coordinator，
  owner mount/unmount 时需注册和注销 clear callback。
- Saved Session 的完整 toolbar/More 入口仍由后续任务实现；本决策只建立
  scope ownership 和 checkbox-first 能力。

Status:

Accepted。

## D054: Selection commands reuse typed intents and authority-confirmed batch actions

Context:

D053 把 active selection scope 与 owner-local selected IDs 分开后，Session
仍需要 Restore/Copy/Move/Delete toolbar，Open Tabs也需要 Save to
keyboard command。若这些动作各自直接改groups、循环单项restore/delete，或
复制一套picker persistence path，会破坏现有authority/replay/locked边界，并在
失败时留下无法重试的半完成selection。

Decision:

- Session More > Select Tabs进入`0 selected` scope，header原位替换为一个
  icon toolbar；Open Tabs在原context bar增加Save to并保留Create Session直接
  New action。
- Open/Saved共用一个body-portaled Hybrid Session Target Picker。Choice来自
  active workspace canonical category/session order；Existing只保留unlocked、
  same-workspace、非semantic-no-op目标，New枚举每个合法insertion index。
- Saved All Source Tabs抑制全部New choice但保留Existing merge；Open Tabs不
  使用该规则。显示文案使用Session title、Category name和before/between/after，
  label不写入DropIntent。
- Picker commit只构造并提交既有`move-tabs`、`copy-open-tabs`或
  `create-session` DropIntent；preview不改persistent state或DnD geometry。
- Restore Selected通过一个`restore-refs` runtime batch返回成功数量；Copy
  只写一次clipboard。
- Delete Selected使用一个atomic`delete-tabs` mutation。`commitChecked()`
  不发布optimistic projection，只在authority确认后resolve；reject不清selection，
  不允许跨多个ordinary `delete-tab` mutations产生部分成功。

Rationale:

- 一个typed intent路径让pointer DnD、Open Save to和Saved Move共享相同
  ownership、locked、replay与workspace验证。
- “展示即能提交”比disabled dead choices更适合高密度picker，也避免用户选择后
  无反馈。
- `restore-refs`的一次消息能提供完整batch成功证据；一次clipboard write避免
  部分复制。
- Batch delete的原子validation和authority-confirmed waiter让“成功才清IDs、
  失败保留重试上下文”成为可证明合同。

Trade-offs:

- `delete-tabs`扩大了StateMutation union，但只服务一个明确原子边界，并复用现有
  worker persistence与Bin model。
- Picker需要在ManagerLayout读取canonical state生成choices/labels；它不成为
  第二个store或DnD owner。
- Saved源Session在Move后可能消失；focus和selection依赖现有owner unmount
  contract并提供surviving Session/list fallback。

Status:

Accepted。

## D055: Sidebar disclosure is a four-state transient UI owner

Context:

Manager sidebar 原先同时依赖 persisted collapsed boolean、overlay boolean、selection/preview
visual flags 和 CSS `:hover`。这些状态无法证明 desktop preview 是否 reflow、何时 inert，
也会让 temporary state 被误写入 preference。Header 的 ordinal/Refresh/colored Save 与
第二个 compact toggle 同时增加视觉和 keyboard traversal 噪音。

Decision:

- `useSidebarDisclosure()` 单一拥有 `collapsed / peek / pinned / drawer`。
- Desktop collapsed rail 固定 52px；hover/focus 约 350ms 后进入不阻塞 board 的
  temporary peek，leave 关闭。Explicit Expand、peek 内 selection 或 Filter focus
  转为 pinned 并推动 board。
- Explicit Expand/Pin 通过 `pin()` 更新 desktop preference；selection/Filter 通过
  `promote()` 只在本次页面固定展开，不覆盖用户下次启动时的 collapsed preference。
- Pointer 和 keyboard focus 分别持有 peek intent；只有两者都离开才收回。Focus 转到
  centered Expand 时会取消 pending focus dwell，避免 350ms 后卸载已聚焦按钮。
- 900px 及以下只通过 explicit Expand 打开 drawer；drawer overlay 覆盖并 inert
  topbar/main，Close 关闭。整个 drawer breakpoint 都使用三个 44px Open Tab targets
  和 8px 间距；coarse/narrow 不启用 desktop hover peek。
- localStorage 只保存 desktop pinned/collapsed preference；peek/drawer/timer 不持久化。
- Open Tabs 使用一个 context bar 原位表达 normal、selection、collapsed；collapsed
  只保留 centered Expand，并把不可见 Filter/checkbox/Close 从 tab order 移除。
  Collapsed favicon rows 保留 pointer focus/drag command，但完全不渲染 title Focus
  button、role、tab stop 或 accessible label；sidebar keyboard tab order 只有 selected
  window glyph + Expand。
- Window selector 只显示 count glyph 和 focused badge；不显示 ordinal/raw ID，不提供
  Refresh。Header commands 和 topbar material 保持 neutral，Bin direct，More 仅含
  Import/Export/Options。
- Session 本阶段只收敛 panel/control material；drag handle、sortable activator 和
  collision geometry 由独立 DnD plan 决定。该临时边界随后由 D056 收口。

Rationale:

- 四态 discriminated owner 让 grid reflow、overlay 和 inert 成为可测试状态转换，而不是
  CSS hover 副作用。
- 只持久化用户明确选择的 desktop layout，避免 viewport、hover 和临时 workflow 污染偏好。
- 单一 context bar 保持密度和位置稳定，并让 collapsed rail 没有重复或 hidden focus target。

Trade-offs:

- Temporary peek 需要 timer 与 leave/focus cleanup；fake-timer DOM tests 和 unmount cleanup
  成为必要回归门。
- Compact drawer 必须显式打开，比自动展开多一步，但不会让 coarse pointer 依赖 hover。
- Session handle 暂时与最终 redesign spec 不一致；在 DnD plan 前保留它可避免跨 plan
  改坏 pointer/keyboard geometry。D056 已完成迁移并替代该临时取舍。

Status:

Accepted。Session handle 临时子决策由 D056 取代；sidebar 四态决策继续有效。

## D056: Pointer/touch surfaces and Hybrid Commands replace drag handles

Context:

独立 Session drag handle + KeyboardSensor 为键盘用户提供了 direct drag，但同时
增加 resting icon、额外 focus stop 和复杂的 sortable attributes。它也无法自然表达
跨 Category、New Session insertion、All Source suppression 或“取消并恢复 focus”。
Saved/Open tabs 的 New Session 路径还需要一个必须精确命中的显式目标，不能依赖
整张 persistent card 或普通 target hysteresis。

Decision:

- Manager `DndContext` 只注册 PointerSensor（5px）和 TouchSensor（200ms delay /
  5px tolerance）。Surface 显式分流 pointer/touch，触摸不同时进入 PointerSensor。
- 不显示 visible/resting drag icon，不保留 visually-hidden/focusable drag activator，
  不在非交互 surface spread sortable `role` / `tabIndex` /
  `aria-roledescription`。
- Session title、metadata、只读 note、card/shell 空白作为pointer/touch activator；
  Restore、More、编辑控件、selection toolbar、link和tab list不启动Session drag。
  Open/Saved rows和Category tab同样只在非交互surface起拖。
- Keyboard等价由C Hybrid Commands拥有：
  - Workspace / Category Manage使用Move Up / Move Down。
  - Session使用named Before / After + cross-category picker。
  - Saved Move与Open Save to复用Existing/New Session target picker。
- Saved/Open tabs创建新Session只通过`new-session-insert`：
  - 非空Category提供start / between / end 20x20px Gap Anchors。
  - 只有真实pointer精确命中并在active plus上松手才提交；不使用12px
    hysteresis，不展开临时slot。
  - Empty Category使用完整第一条固定Session slot作为target。
  - Saved All Source Tabs隐藏全部pointer plus与keyboard New choices，但保留
    Existing merge；Open Tabs不使用该抑制。
- Drag preview在start时快照items与bounded geometry，跨所有target保持内容和尺寸；
  item ghost半透明、pointer-transparent且位于plus上层。
- Board是auto-scroll唯一owner：dnd-kit默认auto-scroll关闭；native pointer/touch
  viewport coordinate驱动左右48px zone的3–12px/frame滚动，每帧remeasure；
  exact plus active暂停，离开后恢复。Reduced motion不关闭必要scroll。
- Persistent DropIntent kinds、storage schema、worker authority和replay wire不变。

Rationale:

- Keyboard可达性应保证“结果可命名、可预览、可取消、可恢复focus”，而不是要求
  用户通过隐藏handle模拟鼠标空间操作。Picker还可以明确展示Category与最终位置。
- 精确`+`要求用户明确表达“创建新Session”，避免普通Session body或大范围target
  意外创建；All Source suppression保留“移动整个Session内容”与“拆出新Session”
  的语义差异。
- 一个scroll owner、一个native pointer coordinate authority和每帧remeasure可避免
  dnd-kit scroll compensation、React rerender hot path和Board geometry相互竞争。
- Surface drag与`grab` cursor符合高密度quiet workbench；移除icon和focus stop减少
  视觉与keyboard traversal噪音。

Trade-offs:

- Keyboard用户不再执行Space/Arrow direct drag，需要通过Manage命令或target picker；
  换来更明确的目标文案、跨Category能力与稳定focus lifecycle。
- Fine-pointer Gap Anchor仅20px，要求精确操作；coarse pointer不放大目标，而使用
  target picker完成New Session。
- Session card必须维护明确的interactive exclusion list；新增按钮/input/link/tab
  surface时需要加入回归测试，避免误启动Session drag。
- 真实touch long-press仍需设备或Chrome touch emulation验证；Playwright主要守护
  pointer path、reduced-motion和command结果。

Status:

Accepted。Supersedes D049 中“drag handle只拖拽”的Session/Open子决策、D050 中
`SessionCardShell`保留handle、D055中Session handle暂留，以及2026-07-21
KeyboardSensor direct-drag方案；D049/D050/D055其余owner、density与geometry决策继续有效。

## D057: Persist storage status separately and keep Popup actions compact

Context:

最终 Crisp Utility 验收发现三类信息仍被混在一起：用户正式配置的存储目标与当前
实际 writer、Popup 的本次保存范围与 Chrome tab group metadata、以及全局 action
语义与组件局部 icon/color styling。自动 File fallback 因此会看起来像用户主动切回
Browser；Popup 的 Group/ratio 增加短流程负担；Tabler/Lucide 与 Nord/Mantine blue
并存使明暗主题和 action geometry 漂移。

Decision:

- `tabboardStorageConfig` 持久化完整 `StorageStatusProjection`：
  `configuredTarget`、`activeBackend`、`folderName`、`fallbackReason`、
  `fileUpdatedAt`。旧 `{mode}` 只兼容读取；DirectoryHandle 仍只存 IndexedDB。
- Automatic fallback 只改变 active backend，保留 configured Local Folder、folder
  identity、reason 与最后一次 `meta.json.updatedAt`。只有显式 Use browser storage
  安全提交后 configured target 才变成 Browser。
- Options Basic 继续使用 lightweight SettingsProjection；Storage UI 保持 lazy，
  只读/订阅 StorageStatusProjection。Advanced 使用四个直接 A2 rows，不再增加
  Safety/Keyboard/Recovery 单项包装层。
- 新安装/Reset 默认 toolbar action 为 Open Popup；历史显式 `store` 不迁移。
- Popup 使用 P2 compact action rows：固定 Save、setting-aware helper、conditional
  pinned scope/helper、non-pinned duplicate Remove；不显示 selected/total ratio或
  Group control。Chrome group metadata仍由capture保存。
- Pinned source tabs可保存但永不被capture close或dedupe自动关闭；显式Close不受影响。
- Production icon只使用Lucide；A1 Light/D1 Graphite semantic tokens与
  `TabBoardIcon`/`AccessibleIconAction`统一1.75 stroke、32px desktop和44px coarse
  geometry。Resting Save/Search/Restore保持中性。

Rationale:

- Configured target与active writer是恢复和用户意图的独立事实，必须持久化并在Options
  中同时可见。
- Popup是短时动作面，应该只表达“本次保存哪些tabs”和“实际能关闭哪些duplicates”；
  group metadata属于capture内部信息，不需要额外筛选。
- Pinned本质是用户要求保持在窗口中的浏览器状态；允许保存不意味着允许自动关闭。
- 一个icon family和semantic palette能同时减少视觉漂移、bundle transform与维护成本。

Trade-offs:

- Bootstrap projection字段增加，但仍是极小read model，不包含handle或canonical state。
- Fallback时Browser写入与configured File同时存在，文案必须明确“temporarily”；
  reconnect/switch-back需保持独立动作。
- Popup不再能临时排除Chrome groups；需要更细scope时使用Manager selection。
- Fine-pointer action保持32px，不为每个text/icon组合单独调色；状态差异主要依赖
  semantic foreground、soft fill和tooltip。

Status:

Accepted。Supersedes D030 的 grouped checkbox 子决策、旧 `{mode}` bootstrap status、
Tabler/Nord生产ownership和单项Advanced section层级；D030 的 transient pinned scope
与短流程目标继续有效。

## D058: Approved preview is the visual source of truth for progressive actions and Session material

Context:

Crisp Utility 的 Visual Companion 和双语 spec 已明确选择 neutral icon actions、
S1/T1 Session hierarchy 与轻 elevation，但生产实施仍被更早 taste 阶段的
“Session resting shadow 为 none”测试约束，并让未传 variant 的共享 action 回退到
Mantine filled primary。最终 unpacked extension 因此出现 cobalt 方块按钮、扁平
Session、半显 Header actions，以及 selection/row 状态不一致。

Decision:

- 已确认 preview/spec 在视觉合同上优先于更早、已被后续选择覆盖的 taste 建议。
- `AccessibleIconAction` 默认使用 neutral `subtle`；selected、danger 或 filled 必须由
  caller 显式声明。Fine pointer 为32px，drawer/coarse为44px。
- Session 使用语义 border、8px radius与极轻 theme-specific elevation；普通
  `SessionSlot` 在通高 track 内留3px/5px breathing inset，Empty Category full-slot
  target仍保持100%高度。
- Session Header Restore/More在fine pointer resting隐藏，header hover/focus、
  action focus或menu-open显示；coarse pointer直接显示。隐藏只控制opacity和
  pointer hit，不从keyboard tab order移除。
- Session title使用两行clamp；group note使用accent-soft fill与2px左accent rule。
- Open/Saved selection mode常显checkbox，但trailing X仍只在row hover/focus时显示；
  row X复用同一32/44px action primitive。
- Category active state只使用quiet fill，不叠加underline。

Rationale:

- 共享primitive必须提供安全的quiet默认值，否则任何漏写variant都会变成高权重主操作。
- 轻 elevation用于区分可重复Session object与canvas，不是装饰性重阴影；独立的slot
  inset让视觉层级不污染Empty target和collision geometry。
- Progressive action的目标是降低resting噪音，同时保持keyboard/coarse path，而不是
  让按钮以低opacity永久存在。

Trade-offs:

- Session实际card比full-slot target上下少8px；相关E2E需要分别断言target通高和card
  breathing inset，不能再假设两者bounding box完全相同。
- Keyboard自动化若通过pointer click打开progressive More，必须先hover header；
  Shift+F10/context menu路径不受影响。
- Shared action默认改变会影响所有未显式variant callers，因此必须由全量rendered、
  unit和serial browser matrix共同守护。

Status:

Accepted。Supersedes 2026-07-28 Design Taste 中“Session card无resting shadow”的
材质子决策；D049-D057的ownership、DnD、storage和responsive contract继续有效。

## D059: Compound-control geometry is a separate visual acceptance gate

Context:

Phase 18 的页面/state matrix 通过后，真实 unpacked extension 仍暴露 Workspace
`🗂️` 与 `Personal` 重叠。DOM 中虽然存在独立 spans，但 emoji、name、chevron
同属一个 Mantine label，gap 错加到外层，实际相邻 box 距离为 0px。Category
label/count、Session metadata icon/copy 和 compact active Category 也有同类遗漏。

Decision:

- Page/state screenshot、axe、无 document overflow 与 compound-control geometry
  是不同验收维度；前者通过不能代替后者。
- 同一行的 emoji/icon/favicon、label/count、chevron 和 trailing action 必须由
  明确 layout slots 与 owning gap 分隔。Intentional overlays 只包括 checkbox 覆盖
  favicon 和 pinned badge 叠在 favicon 角落。
- Workspace topbar trigger 使用 independent left/label/right sections。Desktop
  emoji/name 至少 6px，name/chevron 至少 4px；compact 只保留在 44px target 中
  居中的 emoji。
- Category label/count gap 由实际 Button label owner 持有；compact 保留 count，
  selected Category 或 nav 尺寸变化时必须自动恢复 active item 可见。
- Rendered geometry regression 必须包含默认 emoji、ZWJ emoji、长 label、desktop/
  compact、menu/manage/editor，以及关键 Session/Open/Saved/Popup/Options rows。

Rationale:

- 彩色 emoji 的 glyph ink 不保证被同字号 CSS box 完整约束，不能按同尺寸 SVG
  推断安全间距。
- 父容器不 overflow 只证明布局边界，没有证明相邻可见内容不贴合或互相覆盖。
- Active Category 是 compact topbar 的导航状态，允许横向滚动但不能在首帧停留于
  不包含当前项的位置。

Trade-offs:

- CategoryNav 增加一个可清理的 `requestAnimationFrame` 与 `ResizeObserver`，
  仅在 selected item 或 nav 尺寸变化时校正 scrollLeft。
- Compound-control E2E 增加少量真实浏览器时间，但能覆盖 happy-dom 和源码断言
  无法发现的字体、Mantine wrapper 和 responsive geometry 问题。

Status:

Accepted。补充 D058 的视觉验收边界；不改变 persistence、DropIntent、selection
或 storage protocol。

## D060: Sidebar disclosure follows the confirmed C1 motion timeline

Context:

Crisp Utility 已确认 C1 Hybrid Rail：显式 Expand 推动 Board，Hover Peek 只覆盖，
Compact Drawer 覆盖并 inert Board。但生产实现只保留四态 class，CSS transition 的
属性与实际变化不一致，旧测试还禁止 width/grid transition，导致所有开合瞬切。

Decision:

- Pinned 展开/收起同时动画 shell `grid-template-columns` 和 sidebar width：
  `180ms cubic-bezier(.2,.8,.2,1)`。
- Peek/Drawer 不改变 shell track，只动画 overlay width；Peek 使用 150ms shadow，
  Drawer 使用更强的同类 shadow。只有 Drawer 让 topbar/main inert。
- Expanded-only 内容在容器展开 75ms 后用 80ms `ease-out` 淡入；收起时立即反向
  淡出。Expand 与 expanded context bar 同槽常驻并通过 inert/aria-hidden 切换。
- Collapsed 隐藏内容可以保留在 DOM 以支持 motion，但必须 disabled / inert /
  `aria-hidden` / `tabIndex=-1` / pointer-inactive。
- Desktop identity column在全部 disclosure states保持同一 viewport x；Compact
  Drawer继续使用44px targets和8px gaps。
- `prefers-reduced-motion: reduce` 对 shell/sidebar geometry 使用 `transition:none`。
- Motion acceptance必须验证中间帧、快速反向、Peek Board offset、Drawer inert、
  icon center和focus return；终点 class/offset不再作为充分证据。

Rationale:

- C1 的两种用户意图必须视觉可辨：明确固定展开会让 Board 连续让位，临时查看不会
  改变工作区几何。
- Width/grid transition虽然产生layout work，但时间短、范围局限且是已确认产品行为；
  泛化的compositor-only规则不能覆盖具体设计决策。
- 常驻inert content同时满足动画连续性与keyboard/accessibility安全。

Trade-offs:

- Sidebar开合期间会发生最多180ms的layout；startup benchmark和large-board边界仍需
  继续守护。
- Overlay场景可能让axe无法自动判断被遮挡元素的contrast并报告incomplete；这类状态
  需要结合静态token和截图人工复核，不能误报为0 incomplete。
- Animation-specific rendered E2E增加少量运行时间，但可防止状态机存在而motion消失。

Status:

Accepted。补充D055的四态语义，并替代Phase 17中禁止sidebar width/grid transition的
实现子决策。

## D061: Whole-window capture has one Save All entry in the Open Tabs context bar

Context:

较早的 UI/UX review 在 Window 顶栏增加了 Save Window。后续确认的 Crisp Utility
上下文栏又在 Open Tabs 数量旁提供 Save All。两个按钮最终都调用同一个
`captureWindow` owner，eligible scope、pinned 语义与完成反馈完全一致，导致同一
操作在相邻两行重复出现。

Decision:

- 删除 `OpenTabsWindowBar` 中的 Save Window。
- 唯一整窗保存入口保留在普通 Open Tabs context bar，文案与 accessible name 为
  Save All；该入口继续忽略文本过滤并包含全部 eligible pinned tabs。
- Window 顶栏只承载 window glyph/focused badge 与 disclosure command：
  pinned 为 Collapse、peek 为 Pin、drawer 为 Close。
- selection mode 继续原位替换 context bar，保留 Save Selected 与 Save To，不增加
  第二条操作栏。

Rationale:

- Window row 负责选择浏览器窗口和控制 Sidebar；整窗 capture 属于 Open Tabs 列表
  上下文。一个动作只保留一个 owner，层级更清楚，也与用户确认的预览一致。
- 两个入口没有 scope 或结果差异，重复按钮不能提供额外能力，只增加识别和误触成本。

Trade-offs:

- 较早 review 中的 Save Window 建议被后续确认覆盖；历史 review/计划保留原文作为
  演进记录，current spec 与 production 只描述 Save All。
- Collapsed rail 仍不展示 Save All；用户需 Expand/Peek 后使用 context bar。

Status:

Accepted。

## D062: Standard control tooltips have one owner and require a new pointer cycle after activation

Context:

普通 action 同时存在 Mantine Tooltip、native `title` 和调用方外层 Tooltip 时，
浏览器会在同一控件上显示两层 tip。延迟打开 timer 也可能在 click 完成后继续触发，
使没有移动的 pointer 下出现与已完成动作无关的 stale tip。Manager 旧补丁通过扫描
所有 `aria-describedby` 并伪造 `mouseout` 关闭 tip，但它无法取消 pending timer，
还会错误覆盖表单帮助文本等非 Tooltip 描述。

Decision:

- `TabBoardTooltip` 是普通 control tip 的唯一 owner；业务组件不直接创建 Mantine
  Tooltip，也不给 `button` / `ActionIcon` 设置 native `title`。
- pointerdown 或 click 立即关闭 tip 并取消 pending open；当前 target 只在真实
  pointer movement 或 pointer leave 后允许重新开始 1000ms dwell。
- `AccessibleIconAction` 内建上述 owner，调用方不得再包第二层 Tooltip。
- Tab hover preview 与 C3 menu description 保留独立的 180ms / 550ms owner 和视觉，
  但 tab preview activation 同样抑制到真实 movement。三类 tip 都不能承载点击操作。
- 删除 ManagerFrame 对所有 `aria-describedby` 的全局 mouseout 模拟。

Rationale:

- Tooltip 是补充信息层，不应在 command 已执行后自行复活，也不应改变复合 trigger
  的 click/ref 合同。
- 单 owner 同时消除视觉双层、native/browser 差异和 pending timer 竞态；真实 pointer
  movement 是用户重新请求 hover 信息的明确边界。
- `aria-describedby` 是通用 accessibility 关系，不能被全局当作 Tooltip selector。

Trade-offs:

- 标准 action tip 需要 shared wrapper 的少量受控 state/timer；tab/C3 专用 tooltip
  不强行迁移，以保留已确认的密度、定位和时序。
- Keyboard focus 不自动显示标准 icon tip，accessible name 继续由 `aria-label` 提供；
  tab/C3 的 keyboard-focus description 行为不变。

Status:

Accepted。

## D063: All tip types share lifecycle ownership, not presentation

Context:

TabBoard 有 compact action、menu description、rich tab preview 和 drag-state tip
四种信息层。强行统一外观或延迟会破坏已确认的密度和操作预期，但各自持有 timer/open
state 会产生重复 tip、pointer/keyboard modality 混淆和 stale ownership。

Decision:

- 四种 tip 保留各自内容、样式和 1000/550/180/300ms 延迟。
- 所有 tip 通过同一个 page-realm lifecycle coordinator claim/release。
- 同一页面最多一个可见 tip；新 claim 必须先清旧 owner。
- Pointer-opened menu 不聚焦首项；keyboard-opened menu 聚焦首项但保持安静，
  第一次方向键导航后才显示当前项说明。

Rationale:

统一 lifecycle 可以在不推翻已确认 UI 的前提下，从结构上消除多 tip 并存。

Trade-offs:

Coordinator 是模块级 page owner，不负责渲染；四类模板仍由现有组件维护。

Status:

Accepted。

## D064: Popup duplicate cleanup executes directly

Context:

Popup duplicate row 已展示 removable count 和 keep-one/pinned copy；二次确认重复信息，
且在 320px Popup 中产生截断。

Decision:

Remove 直接执行现有 `dedupe-window` action，不显示 confirmation dialog。Worker 的
duplicate classification、pinned protection、loading 和 error handling 保持不变。

Status:

Accepted。

## D065: Release 使用 tag 单入口和同一份跨渠道产物

Context:

公开仓库原先只提供源码构建安装。用户需要安装 Node.js、执行 npm 构建，再从
`dist/` 加载扩展；Chrome Web Store 首个条目也尚未创建。

Decision:

- 仅 `vX.Y.Z` tag 触发正式发布，四处版本源必须与 tag 一致。
- GitHub Release 发布 `tabboard-vX.Y.Z.zip` 和对应 SHA-256；ZIP 内直接以
  `manifest.json` 为根，不额外套 `dist/`。
- Chrome Web Store 首次人工上传使用 GitHub Release 的同一份 ZIP，不重新构建。
- Web Store API 自动上传推迟到首个条目审核通过并获得 item ID 之后。

Rationale:

一个 tag 对应一个不可变产物，用户下载、GitHub Release 和 Web Store 审核看到的是
同一组字节，避免本地重建造成版本和内容漂移。先发布 GitHub ZIP 可以立即降低安装
门槛，不需要等待商店注册与审核。

Trade-offs:

- GitHub 解压安装仍需开启开发者模式，且不会自动更新；一键安装和自动更新只能由
  Chrome Web Store 提供。
- 首次商店提交保留人工步骤，后续才需要维护 item ID 和 OAuth secrets。

Status:

Accepted。

## D066: Saved title refresh uses a minimized temporary browser context

Context:

Capture 可能在最终 document title 可用前完成。直接 `fetch` 不能可靠处理登录态、
SPA、脚本生成 title 和无 host permission 的页面；把普通 background tab 插入现有
窗口又会被用户看到并扰动 tab strip。

Decision:

- 手动 Refresh Title 先复用精确 URL 的已打开 tab。
- 没有匹配时创建 `type: popup`、`focused: false`、`state: minimized` 的临时窗口，
  等待 complete 且非 URL title 稳定后返回，并无条件关闭临时窗口。Open Tabs 只
  投影 normal windows，因此不显示该 helper。
- 失败保留旧 title；Locked Session 不允许刷新。
- 同 URL drag dedupe 保留目标旧 item，只从第一个 incoming item 复制 title。

Rationale:

真实浏览器 context 能执行页面脚本并复用用户会话；minimized/unfocused window 比插入
用户当前窗口更不可见。复用现有 item 与 `update-tab` 避免 schema/mutation 扩展，并
保留用户 note、位置和记录 identity。

Trade-offs:

- 首次刷新未打开的页面可能产生网络请求、短暂 worker 工作和最多 15s 等待。
- Chrome/OS 仍可能在任务栏或窗口管理器中短暂记录该 minimized window；产品保证是
  不抢焦点、不展开可见页面，并在成功或失败后清理，而不是完全无系统级痕迹。
- 自动 capture 不增加后台加载；隐藏加载只在用户显式 Refresh Title 时发生。

Status:

Accepted。

## D067: Restore synchronizes final titles through the worker pipeline

Context:

Saved Tab/Session 打开后，Chrome 创建 API 先返回 URL 或 loading title。若 UI 立即写回，
会把占位值当成正确 title；若每个 UI 入口自行监听，又会造成重复 lifecycle owner。

Decision:

- 所有 persisted Saved restore 入口在 worker 创建 tab 后，按 tab ID 等待 stable final
  title，并一次性回写仍存在、URL 未变的 Saved records。
- `deleteRestoredTabs` 已删除的记录跳过；Locked/保留记录自动更新。
- Locked Session 放行 title-only `update-tab`，其它 mutation lock 不变。
- title 同步是 best-effort：单页或整批同步失败不改变 restore 成功。
- Bookmark runtime projection 不参与 canonical title write。

Rationale:

Worker 已拥有 restore queue、Chrome tab IDs、稳定 title waiter 和 authoritative
persistence，能在一个边界解决所有 UI/Popup/Omnibox 入口，并保持最终 title 规则一致。

Trade-offs:

- 保留 Saved records 的 restore response 最多延后 15s；已删除 records 不等待。
- 自动同步只更新 title，不更新 favicon 或其它 captured metadata。

Status:

Accepted。

## D068: Session title refresh uses a bounded worker queue

Context:

Session 可能包含大量 Link。若批量刷新同时为所有未打开 URL 创建 helper window，会造成
突发窗口、网络和内存压力；串行执行又会让大 Session 过慢。

Decision:

- Session menu 批量刷新复用单 URL resolver，固定最多 3 个并发。
- Note 跳过；成功项一次性写回；失败/竞态只进入结果计数。
- Manager 不持有 URL queue 或 helper IDs，只显示 worker 返回的
  `{refreshed,failed}`。

Rationale:

固定小并发避免新依赖和复杂调度，同时保留 open-tab reuse、popup 隐藏、稳定 title、
cleanup 和 Locked title-only 规则的单一 owner。

Trade-offs:

- 大 Session 的总耗时随 Link 数量增长。
- 结果只报告数量，不逐条列出失败 URL；需要逐条处理时仍可使用 Tab 级 Refresh Title。

Status:

Accepted。

## D069: Title refresh activity is page-local and operation-counted

Context:

Title refresh 可由 Manager、Popup、Omnibox 或 restore worker path 发起。组件本地 loading
无法覆盖非 Manager 入口；持久化 loading 又会污染 canonical state。并发操作还可能
让较早 finish 提前清掉后开始的 spinner。

Decision:

- Worker 为每条实际 resolver 广播带 operation ID 的 start/finish。
- Manager 用 page-local record-key -> operation-ID Set 保存 activity，每行独立订阅。
- loading 原位复用 Delete 的 32px action slot；不 hover 也可见。

Rationale:

该模型覆盖所有入口、支持重叠、保持 row geometry，并把瞬时 UI 状态留在正确边界。

Trade-offs:

- Manager 未打开时 activity 消息无人消费，这是预期行为；下次打开无需恢复历史 spinner。
- Runtime message 增加两条/每次 resolver，但只携带小型 identity payload。

Status:

Accepted。

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
