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
Accepted。

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
Open Tabs 面板仅保留 Current window 的 Save；只展示可保存的 tabs；每个可保存 tab 变成 checkbox；checkbox 只用于批量创建 session 和批量拖动；筛选 sessions 改由 open tab 右键菜单触发。

Rationale:

- 当前窗口一键保存是最重要的动作。
- 多选 tabs 更符合“整理当前上下文”的真实行为。
- Chrome 内部页、扩展页和 ZipTab 自身页面无法可靠恢复，展示出来只会制造不可选的噪音。
- 通过右键 open tab 筛选 saved sessions，可以帮助用户判断“这个页面以前存在哪个 session 里”。
- 选择和筛选分离后，checkbox 语义更单纯。
- 拖入已有 session 解决“补充一个链接到旧上下文”的需求。

Trade-offs:

- 右键筛选的可发现性弱于直接勾选，需要后续观察是否要增加轻量提示。
- 拖动 open tab 是 copy，不是 move，需要后续用视觉反馈说明。

Status:
Accepted, needs UX observation。

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
Superseded by D016。当前使用 `excludeUrlPatterns`，默认包含 `chrome://*` 和 `file://*`，不再使用 `includeChromeUrls` / `includeFileUrls` 两个独立设置。

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
Accepted, needs performance observation。

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
Accepted。

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
Superseded by D016。Session card 当前只外露 Restore，其余动作进入 More；Options 不再提供 session toolbar 外露动作配置。

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
Manager 改为 Board-first：顶部 toolbar 放 workspace/search/import/export/bin/options；左侧放 Open Tabs all windows 和 Categories；右侧保留 session board。移除 context strip 和常驻 inspector。Popup 保持 trigger surface，使用 Save/Open/Dedupe 三个横排 quick actions。Capture 默认清理 about:blank 和重复源 tabs，并使用 exclude URL patterns 控制特殊 URL。

Rationale:

- 用户核心任务是保存、找回、整理 sessions，board 应该是视觉和交互中心。
- Open Tabs 是源浏览器状态，展示所有 windows 比只展示 current window 更符合真实使用。
- Popup 尺寸和 auto-close 适合 quick actions，不适合复杂编辑。
- 统一 icon 和 control 尺寸能减少按钮大小不一、风格不统一的问题。

Trade-offs:

- 移除 inspector 后，部分编辑入口回到 More 菜单。
- Exclude URL patterns 比两个布尔开关更灵活，但需要用户理解简单通配符。
- Manager all-windows Open Tabs 增加了 sidebar 信息量，所以一次只展开一个 window。

Status:
Accepted。

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
