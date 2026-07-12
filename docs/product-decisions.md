# Product Decisions

本文档记录 ZipTab 的关键产品和实现决策。格式保持轻量：

- Context: 当时遇到的问题。
- Decision: 做了什么选择。
- Rationale: 为什么。
- Trade-offs: 代价。
- Status: 当前状态。

## D001: Local-first as the default architecture

Context:
用户的 tabs、标题、URL 和工作流信息都很敏感。如果引入后端，产品还没证明价值就先制造隐私和信任成本。

Decision:
ZipTab 默认 local-first，数据存储在 Chrome extension storage 中，不引入远端账号和后端。

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
OneTab 好用在“快”，tabExtend 好用在“组织”。ZipTab 如果同时照搬两者，容易变成复杂工具。

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

## D003: Replace Chrome new tab with ZipTab

Context:
如果 ZipTab 只是一个扩展页，用户需要主动想起来打开它。tab 管理工具的价值在于成为日常入口。

Decision:
通过 `chrome_url_overrides.newtab` 将 Chrome 新标签页改为 ZipTab。

Rationale:

- 每次新建 tab 都能看到已保存的 sessions。
- 降低保存后遗忘的概率。
- 新标签页天然是“下一步要做什么”的场景。

Trade-offs:

- 用户会失去默认新标签页。
- ZipTab 首页必须足够快、足够安静。

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
旧 `quickList` 数据在 manager 启动时迁移为 `Former Quick list` 普通 session。

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
- Chrome 内部页、扩展页和 ZipTab 自身页面无法可靠恢复，展示出来只会制造不可选的噪音；pinned tabs 是为了保留浏览器现场而作的明确例外。
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
Superseded by D022。当前不提供特殊 URL 或 pinned capture 设置；有 URL 的非 ZipTab tabs 都进入 capture 尝试，实际限制交给 Chrome。

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
Manager 改为 Board-first：顶部 toolbar 放 workspace/search/import/export/bin/options；左侧放 Open Tabs all windows 和 Categories；右侧保留 session board。移除 context strip 和常驻 inspector。Popup 保持 trigger surface，使用 Save/Open/Dedupe 三个横排 quick actions。Capture 默认按源 tabs URL 去重；当前有 URL 的非 ZipTab tabs 都进入 capture 尝试。

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
Workspace switcher、stats、新建/重命名 workspace 放回 main topbar，并位于 category tabs 左侧。Sidebar header 改为 window chips、collapse 和新建 Chrome window；chips 显示原始 window tab 总数，一次只渲染 selected window。所有 pinned browser tabs 固定显示在 regular tabs 上方，并通过单行横向滚动保持可达；`storable` 决定 checkbox、拖拽和 URL session filter 能否使用。Regular tabs 是唯一纵向滚动区域。Sidebar footer 增加临时 Filter tabs query，只过滤当前 selected window，独立于 saved-session search 和 `openTabFilter`。相关 capture settings 变化时重新加载 Open Tabs eligibility。该 UI 状态不进入 ZipTab state schema。

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

删除 Include pinned tabs、Exclude URL patterns、Capture edge cases card、URL editor 及其增删改路径。Advanced 只保留 Chrome shortcuts 和 Reset settings。Capture 对所有有 URL 的非 ZipTab tabs 进行保存尝试，pinned tabs 与普通 tabs 共用单一 Open Tabs 列表并以内联 badge 标记；不再按自定义 settings 改变 storable eligibility。

Rationale:

- “有 URL 就尝试保存”比多个例外开关更容易理解，也更接近浏览器现场。
- Pinned 是 Chrome tab 的状态，不应再被 Options 变成另一套保存模式。
- Options 只保留仍有明确收益的 capture、restore、appearance、shortcut 和 reset 入口，减少设置页与 schema 漂移。
- Chrome 对受限 URL 的保存和恢复能力由平台决定，产品不再伪装成可完全控制的过滤器。

Trade-offs:

- 用户不能在 ZipTab 中配置自定义 capture 排除规则。
- 某些 Chrome 受限 URL 可能仍然无法保存或恢复，反馈需要依赖实际 Chrome 结果。
- Open Tabs 可能展示更多当前浏览器现场，sidebar Filter tabs 继续承担临时定位。

Status:
Accepted。

## D023: Use Nord semantic tokens with a bounded local Web Awesome layer

Context:

Manager 已经形成稳定的原生 DOM、Chrome API 和 HTML DnD 结构，但旧 teal、硬编码蓝色、重复 CSS 和高度不一致的 controls 让视觉层级持续漂移。用户允许引入设计系统，同时要求参考 tabExtend 的紧凑工作台并使用 Nord 色系。MV3 又要求 runtime、fonts 和 icons 全部本地化。

Decision:

以 Nord0-Nord15 为 primitives，建立 light/dark `--zt-*` semantic tokens，并让 ZipTab 自定义 shell、session cards、rows、DnD feedback 与 Web Awesome controls 共享同一 token source。固定并完整 vendoring Web Awesome `3.10.0`；生产 Manager 只迁移稳定 shell controls：search inputs、compact window select 和 workspace dropdown。Session/category/tab DnD surfaces、native context menu、本地 SVG icons、shared tooltip、buttons、dialog 和 Popup/Options behavior 保持现有实现。Popup/Options 只做 Nord CSS alignment。

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
Accepted。后续组件 family 只能独立迁移，并且不得使用 `wa-card`、远程 `wa-icon` 或改变现有 DnD 语义。

## D024: Use progressive disclosure without hiding core tab workflows

Context:

用户参考 tabExtend 的 hover preview、category edit、session More 和 tab metadata surfaces，希望 ZipTab 的高密度 manager 默认更安静。但 ZipTab 需要继续支持 keyboard、touch、screen reader 与脆弱的原生 HTML DnD。

Decision:

将 hover 作为渐进披露增强，不作为唯一入口。Open/saved tab 的 rich metadata 使用本地 interactive popover；category/session/tab 的次级操作同时由 hover、focus-within 与 coarse-pointer 常驻路径访问。collapsed sidebar 以 selected-window icon rail 投影为默认状态，完整 sidebar 通过 absolute hover/focus overlay 打开，永不推动 board。rail 只聚焦既有 rows/filter，不参与 selection 或 DnD。图标继续使用本地 Heroicons Solid registry。

Rationale:

- 默认行只保留身份信息，降低重复整理时的视觉竞争。
- 本地 anchored surfaces 使操作与对象保持邻近，不引入全局 inspector。
- focus/touch parity 保持 accessibility；stable overlay geometry 不破坏 drag target、placeholder 或 horizontal board。
- 复用现有 native DOM、Web Awesome popover 和 icon registry，避免引入 framework 或远程 asset。

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
