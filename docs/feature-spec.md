# Feature Spec

本文档描述 TabBoard 当前版本的功能面和交互规则。它是“现在能做什么”的说明，不替代 [Feature Evolution](feature-evolution.md) 中的历史记录。

## 功能总览

TabBoard 当前能力分为七组：

- Capture：保存当前浏览器上下文。
- Restore：恢复 saved tabs。
- Organize：用 workspace、category、session card 管理上下文。
- Search & Filter：搜索和反查历史 sessions。
- Edit：重命名、note、link、lock、delete。
- Move：拖拽 tabs、sessions、categories。
- Import/Export：数据迁移和备份。

## 实现与验证边界

- 生产 Manager 只有 React + Mantine 入口：`manager.html` 加载 `src/manager/main.tsx`，并由 Manifest V3 new-tab override 指向 `manager.html`。
- workspace/category/session、Open Tabs、capture、import/export、Bin、overlay、DnD 与 persistence 行为由 typed React contracts 和现有 core tests 覆盖；状态更新保持 immutable，普通 mutation 经过引用、locked 和 URL 边界校验。
- capture feedback 以后台 commit 与 manager reconciliation 的权威结果为准：成功、已提交但未定位、失败分别产生不同结果，不用乐观 toast 冒充保存完成。
- 自动化 proof（Vitest core contracts）与真实 Chrome 手工验收是两层证据：自动化通过不等于完整 UI parity，DnD 事件时序、Shadow DOM/focus、capture/restore 与 sender 集成仍需 unpacked extension 手工回归。

## 页面和入口

### Toolbar action

默认行为：

- 点击扩展图标打开 compact popup。

可配置行为：

- Options > Toolbar 中可将扩展图标改为直接保存当前窗口。
- 该默认值只影响新安装和 Reset；已有显式 `store` 设置不会迁移。

### New tab page

TabBoard 使用 `chrome_url_overrides.newtab` 替换 Chrome 新标签页。

预期：

- 新开 tab 直接进入 manager。
- Manager 是日常入口，不是隐藏在扩展菜单里的工具页。

### Manager

Manager 是 tabExtend-style visual board 主工作台，分为：

- 左侧 Open Tabs sidebar：desktop pinned 展开时占据 grid column 并推动 board；collapsed 是固定 52px rail。Pinned 展开/收起同时对 shell track 与 sidebar width 使用 `180ms cubic-bezier(.2,.8,.2,1)` 连续过渡；Open Tab copy、context actions、header utilities 和 Filter 在容器展开 75ms 后用 80ms `ease-out` 淡入，收起时立即反向淡出。Fine pointer hover/focus rail 约 350ms 后进入 temporary peek，作为不阻塞 topbar/main 的 overlay，离开即关闭；Peek 只动画 sidebar width + shadow，Board 始终留在 52px offset。显式 Expand 会 pin 并 reflow。Selection 或 Filter 从 peek 开始时自动 pin。900px 及以下显式 Expand 打开阻塞 topbar/main 的 drawer，并由 Close Sidebar 关闭；Drawer 与 Peek 一样覆盖 Board、不改变 52px main offset。所有过渡支持中途反向，并在 `prefers-reduced-motion: reduce` 下关闭；peek/drawer 都不写入持久化偏好。
- 右侧 48px toolbar：Workspace、Categories + Category Options、Search、Bin、More 按固定顺序排列；Import、Export、Options 只在 More 中。桌面 workspace trigger 使用独立 emoji / name / chevron slots，emoji 与名称至少间隔 6px，名称与 chevron 至少间隔 4px；紧凑断点只显示居中的 emoji。Category label 与 count 使用独立间距，compact topbar 保留当前 count 并自动把 active Category 滚入可视区。全部 controls 对齐同一基线。Search 静止态无边框/底色，展开时独占 category 区域但不改变 toolbar 高度。
- 右侧 active category board：只展示当前 category 的 saved sessions；sessions 直接位于 A1/D1 canvas 上，单行横向排列并滚动，不再有 category outer frame。

Window selector 只用 window glyph + 内部 tab count 表示 Chrome normal windows；focused Chrome window 在 glyph 角落显示 accent badge，selected window 使用 quiet `aria-pressed` 状态。可见/accessible 文案不显示 `Window N`、raw Chrome window ID、Current 或 Active。Header 只保留当前 disclosure command，不提供手动 Refresh 或重复的整窗保存动作；唯一 Save All 位于下方 Open Tabs context bar。一次只渲染 selected window 的 Open Tabs。

Open Tabs context bar 在 normal expanded/peek/drawer 状态显示 open-tab count、Enter Selection Mode 和 Save All；Save All 包括 eligible pinned tabs。Selection Mode 在同一位置替换为 Task 6 批量 actions，不插入第二条 toolbar。Collapsed rail 中同一 bar 只显示居中的 Expand Sidebar，Filter、checkbox、Close 等隐藏 controls 不进入 tab order；collapse 同步 exit + clear selection。Sidebar 底部 Filter tabs 只过滤当前 selected window rows。

每个 Open Tab row 的 checkbox 只负责 selection，非交互 row surface 负责 pointer/touch drag，点击/Enter title 区域通过 `Go to <tab title>` 切换到浏览器里已经打开的 tab；没有 row More、visible drag icon 或 Active Tab styling。Fine pointer hover/focus 暴露 32px Close；selection mode 常显 checkbox，但 Close 仍保持 progressive；coarse/drawer 使用 Select、Go to、Close 三个 44px targets 和 8px 间距。Session card 不显示可见或隐藏 drag handle；title、metadata、只读 note 和 card 空白使用 `grab` / `grabbing` 表达 surface drag，Restore、More、编辑输入与 tab list 不启动 Session drag。Card 在 board 内保留 3px/5px 垂直 breathing inset 和极轻 elevation，全部 matching tabs 在 card 内部纵向滚动；saved link row 使用保存时的 favicon，加载失败退化为 link icon。整个 Category tab 在正常导航中同时是 pointer/touch drag activator：5px 以内仍按点击切换分类，超过全局阈值后开始排序；不显示 drag handle，也不存在显式 reorder mode。`category-column` 和 before/after reorder droppable 始终挂载，session 仍可跨分类拖拽；keyboard 排序在 Manage Categories 中使用 Move Up / Move Down。

所有同一行的 compound controls 都要保留明确的可见槽位和间距：emoji/icon/favicon、label/count、chevron 与 trailing action 不能依赖文本字形 advance 或错误层级的 parent gap。Checkbox 覆盖 favicon、pinned badge 叠在 favicon 右下角属于明确的 selection/status 叠放例外。Session metadata 的 icon 与 copy 使用 4px gap；Open/Saved rows 继续由显式 grid columns 隔离 owner、copy 与 X。

Open Tabs 自动刷新期间保留上一份 window/tab rows，不插入 loading 文案或空白占位；请求成功后再原子替换列表，失败时保留旧 rows 并显示错误。

大分类中的每个 session 都保留稳定的横向 slot、pointer/touch surface listeners 和 insertion geometry。初次只激活前 6 个以及 viewport + 720px overscan 附近的完整 card/tab 交互树；远端 slot 显示包含 title、link/note count 和 lock 状态的轻量 shell，整个 shell 的非交互表面仍可拖拽，接近视口、被搜索/高亮或点击 title 后升级为完整 card。TabBoard 自身搜索仍扫描全部 canonical state；浏览器 Ctrl+F 只能命中已经激活的完整 card 和远端 shell 的 session summary，不能命中尚未激活的 tab row。

Manager 页面上下文同步到 URL：

- `workspace=<workspaceId>` 表示当前 workspace。
- `category=inbox|saved|archive|folder:<id>` 表示当前 category。
- `view=board|bin` 表示 board 或 Bin。
- `q=<query>` 表示 saved-session 搜索。
- 用户导航会进入浏览器历史；Back/Forward 恢复 workspace、category、view 和 query。
- URL 中无效或跨 workspace 的 category 自动回退到 Inbox。
- URL 明确包含 Manager 参数时始终尊重 URL。裸 `manager.html` 按 workspace 恢复 page-local 最近分类；没有有效偏好且 Inbox 为空时，按 category order 打开第一个非空分类。该偏好不进入 canonical state。

窄屏下 Search 独占 topbar 的内容区；Bin 保持 direct action，Import、Export、Options 位于 More。Sidebar 收起后键盘 tab order 只保留 selected window glyph 与 Expand Sidebar；favicon rows 是无 role、无 tab stop、无 accessible Focus label 的 pointer-only focus/drag surface。键盘 Focus command 只在 peek、pinned 或 drawer 中渲染。只有 compact drawer 打开时，被覆盖的 topbar/main surface 使用 `inert`；desktop peek 和 pinned state 不阻塞 board。

### Popup

Popup 是快动作入口：

- 顶栏使用 TabBoard extension icon 标识产品，并提供 Manager 和 Settings 入口。
- 主行显示当前 capture scope 的 tab 数量和固定 `Save` 动作；不显示 selected/total 比例，也不提供 Chrome tab group 过滤。
- Save helper 只跟随全局 `closeTabsAfterSave`：`Save and close tabs` 或 `Save and keep tabs open`。
- 只有存在 pinned tabs 时才显示一次性 checkbox。可见 label 使用紧凑的 `N pinned`，accessible name 使用 `Include N pinned tab(s)`；checked 时说明 pinned tabs 会保存但保持打开，unchecked 时说明不保存且保持打开。可见 checkbox、native input 和 check glyph 以 16px / 4px radius 的 P2 visual 对齐；没有 pinned 时不保留空区域。
- Chrome tab group metadata 仍由 capture 保存，但 Popup 不提供 Group control。
- 可关闭的非 pinned duplicates 才进入 `N duplicate tabs` maintenance row；副文案在存在 pinned duplicate 时显示 `Pinned duplicates stay open`，否则显示 `Keep one copy in this window`。Save 与 Remove 都是中性 80×32 纯文本 compact actions；loading/success 不增加或替换 leading glyph。
- Save 创建新的 session 后自动关闭 popup；Remove 确认后只关闭当前窗口中可移除的非 pinned duplicates 并关闭 popup。

Save 完成后 popup 关闭，打开或聚焦最近访问的 manager，并在 manager 中定位刚保存的 session。Popup 不承载重命名、分类、编辑等管理流程。

Popup hydration 时展示轻量 loading 状态，不显示空白页。Remove duplicate tabs 直接执行当前窗口的非 pinned duplicate cleanup，不再打开二次确认。
Popup 的 `aria-label` 使用当前 capture scope 数量；scope 为 0 时 Save disabled。
Save scope 遵守 Exclude URL rules；Remove 是独立的当前窗口维护动作，不受 capture filter 影响。两者必须分别展示各自真实可操作数量。

### Options

Options 分为 Basic 和 Advanced：

- Basic：日常 toolbar、capture（包括 tab 去重）、restore、theme；使用无框 section 和 divider，而不是 card-per-section。
- Advanced：Storage location、删除确认、Keyboard shortcuts、Reset settings 四个直接 setting rows。
- Capture 默认开启 tab 去重；Options 提供自定义 URL 过滤规则，命中的 open tabs 不展示、不可保存也不可拖拽。
- Favicons 始终展示，不再是设置项。
- `Confirm before dangerous operations` 默认开启，可关闭 Session/Saved Item
  删除、浏览器 Tab 关闭、Workspace/Category 删除、Trash 永久删除/清空和
  Reset Settings 的二次确认。关闭后操作直接执行；既有 mutation/runtime 错误反馈
  和重试路径保持不变。
- Switch/radio/theme 立即保存；自定义过滤文本在停止输入 500ms 或 blur 后提交。标题旁状态由 authoritative mutation queue 驱动：commit 前保持 `Saving…`，成功后显示 `Saved`，失败时显示 `Could not save` 并提供 Retry。Reset confirmation 关闭后显式回到 Reset to Defaults。
- Session card 外露动作不再可配置。
- Options 跟随 system / light / dark 主题。
- Toolbar、Capture、Restore、Appearance 保持在 Basic 区；Restore 以 Destination 和 Placement 策略呈现，New window 下禁用只适用于 Current window 的 Placement，但不清除既有偏好。
- Advanced 使用 A2 flat list，不增加只有一个选项的 Safety、Keyboard Shortcuts 或 Recovery 二级 section。Storage location 本身也是普通并列 row。
- Browser storage 状态把 `Choose folder` 放在 `Storage location` primary row；detail row 只显示 `Browser storage` 和 Chrome profile 说明。Folder ready/fallback 继续使用 configured-target-first 两层结构。
- `Exclude URL rules` 明确说明命中的 tabs 不进入 Open Tabs selection/drag/save，并说明规则用逗号或换行分隔。
- Advanced Settings 展开状态同步到 `?advanced=1`；刷新和浏览器 Back/Forward 保持同一 disclosure context。
- Basic 从轻量 settings projection 启动，不读取与页面无关的 sessions/folders/bin。Advanced 关闭时不挂载 storage UI、migration dialogs 或 file backend；首次展开时再异步加载，并在 chunk 加载失败时提供 Reload。
- Options header、Open Manager 和 Basic shell 不等待 projection I/O；hydration 完成前 Basic fieldset 保持 disabled + `aria-busy`，save status 显示 `Loading settings…`，Advanced 暂不显示。真实 settings 到达后原地启用 controls。
- Reset to Defaults 在危险操作确认开启时显示确认；关闭时直接恢复默认设置。Saved
  data 和本地文件始终保留不变。
- Popup、Options 和 Manager 的动态计数统一使用当前 locale 的 `Intl.NumberFormat`；异步按钮在执行期间暴露以 `…` 结尾的进行中名称。

### Context menu

页面或扩展按钮右键菜单支持：

- Open TabBoard。
- Save this tab。
- Save all tabs in this window。
- Save selected tabs。
- Save tabs to the left。
- Save tabs to the right。
- Save all tabs except this one。
- Save tabs from all windows。

### Omnibox

地址栏输入 `tb` 后可搜索 saved tabs：

- 输入 query 时返回最多 6 条可恢复 tab 建议。
- 选择建议会直接 restore 该 tab。
- 输入普通文本会打开 manager 并带入搜索 query。

## Capture

### 保存当前窗口

入口：

- Toolbar action 设为 `Save current window` 时点击。
- Manager > Open Tabs > selected window > Save。
- Popup > Save window。
- Context menu > Save all tabs in this window。
- Command `capture-current-window`。

结果：

- 当前 selected window 中符合 shared capture policy 的非 TabBoard tabs 被创建为一个 session；不符合 policy 的 rows 仍保留在 Open Tabs 中并显示原因。
- 如果没有任何 policy-eligible tab，capture reports `No capturable tabs were found`，不会提交空 session。
- 新 session 插入当前 workspace 的最前面。
- 通过 Select tabs 创建的 session 会切到当前 workspace 的 Inbox，并在 board 中高亮刚创建的 session；若用户已切换 workspace，则不强行改变当前 workspace。
- 如果开启 `closeTabsAfterSave`，保存成功后关闭已提交的非 pinned 源 tabs；pinned 源 tabs 无论设置如何都保持打开。
- 如果开启 `openManagerAfterSave`，保存后打开 manager。

### 保存选中的 open tabs

入口：

- Manager > Open Tabs 中勾选任意一个可保存 tab，先进入该 browser window 的 selection scope，再切换当前 tab。
- 继续勾选多个 open tabs。
- 点击底部 create-session 图标，或拖动已选 tabs 到 saved sessions 区域。

结果：

- 选中 tabs 可通过 Create Session 直接创建新 session；同一原位 context bar 还提供 selected count、Select/Unselect All Visible、Save to、批量关闭、批量 pin 和 Exit，不插入第二条工具栏。
- Save to 打开 body-portaled Session target picker；Existing Session 追加到目标末尾，New Session 可选择 canonical category/session 顺序中的 before/between/after 位置。目标使用 Session title、Category 名称和位置语义，不显示 raw IDs。
- picker 只展示当前 workspace 中可提交的目标：排除 locked/cross-workspace Existing Session 和 semantic no-op；Open Tabs 始终保留合法 New Session 位置。
- 如果拖到已有 session，会追加或插入到该 session。
- 从任一已选 tab 开始拖动，会携带当前选中的所有 open tabs。
- `selectionMode` 与 selected count 独立；capture、drop、批量关闭/Pin 或 refresh 清空最后一个 ID 后，source window 未改变时仍保留 `0 selected` mode。
- Select/Unselect All 只切换当前 filtered visible IDs，保留 hidden selection。
- Save to 成功后清除 IDs但保留当前 Open Tabs scope；commit reject、Escape 或 Cancel 保留 selection 以便重试。Create Session 保持原直接 New action。
- 显式 Exit、sidebar collapse、source browser window 改变/失效，或进入另一个 saved/open selection scope 时，退出当前 mode 并清空当前 Open Tabs IDs。
- Open Tabs selection 只保持 collapsed sidebar 的完整内容可见，不会把 saved-session main surface 设为 `inert`；只有实际 drawer/overlay 覆盖 main 时才阻塞其交互。

### Capture 规则

- Open Tabs 展示 selected normal window 的 tab rows，并按 Chrome `tab.index` 排序；TabBoard 自身页面和其他扩展页面，以及命中自定义 URL 过滤规则的 rows 不展示。
- pinned、`chrome://` 和 `file://` tabs 与普通 tabs 一样可以多选、拖拽和保存；同一 custom filter policy 同时用于列表、checkbox、DnD 和 capture。
- Extension pages 不会进入 Open Tabs 列表或 capture；没有 usable URL 的 rows 不具备保存资格。
- 即使 policy 允许特殊 URL，Chrome 对受限 URL 的实际保存/恢复能力仍是平台边界。

### 去重

Options > Capture 默认开启 capture 时 tab 去重。

开启后：

- 本次保存的源窗口 tabs 按 URL 去重。
- 重复的非 pinned 源 tabs 会被关闭；pinned duplicates 永远保持打开。
- 去重不再因为旧 saved sessions 中已有同 URL 而跳过本次 session 内容。
- Popup 的 Dedupe 仅处理当前 browser window 的非 pinned duplicates。若同 URL 存在 pinned copy，则保留所有 pinned copies并移除 regular copies；否则优先保留 active tab，没有 active tab 时保留 `lastAccessed` 最新的 tab。

## Restore

### 单个 tab restore

入口：

- 点击 saved tab item 的标题链接。
- Omnibox 建议。
- Session selection toolbar 中 restore selected。
- 右键菜单中的 restore 类动作如存在。

规则：

- 只有 `itemType: "link"` 且有 URL 的条目可恢复。
- Note 不可恢复。

### Session restore

入口：

- Session card 的 Restore。
- Popup recent sessions 的 restore。

规则：

- 恢复 session 中所有 restorable links。
- 可配置是否在新窗口恢复。
- 可配置是否恢复到当前 tab 旁边。
- 可配置是否 focus 第一个恢复 tab。

### Restore 后删除

默认 `deleteRestoredTabs` 为 true。

规则：

- 恢复后从 saved session 中移除已恢复 link。
- 如果 session 被 lock，则恢复后保留记录。
- 如果 session 恢复后没有 tabs、没有 note、也没有 lock，会被清掉。

## Workspaces

Workspace 是最高层上下文。

能力：

- 切换 workspace。
- 新建 workspace。
- 编辑 workspace name + emoji。
- 在 Manage Workspaces 中创建、排序、编辑和删除 workspace。
- 每个 workspace 维护自己的 sessions 和 categories。

UI：

- Workspace switcher 位于右侧 topbar 的单一 dropdown，处于 category tabs 左侧。Emoji 作为独立 icon column，不是 title 字符串的一部分；当前 workspace 只用背景表达。
- Create/Edit 复用同一个 name + emoji dialog；Manage Workspaces 使用无 drag handle 的 dense rows、整行 pointer drag、Move Up/Down、Edit 和 Delete。
- Manage Workspaces header 显示动态 Workspace 数量、`drag to reorder` 和 `New Workspace`；底部独立 `Done` footer。header action、Done、Close 在 coarse pointer 下至少 44px。
- Sidebar header 展示 compact window selector；折叠状态保存在 manager 页面的 localStorage，不进入业务 state。

## Categories

Categories 是 session 的导航目录。

内置 categories：

- Inbox：没有 category 且未归档的 sessions。
- Saved：被标为 starred 的 sessions。
- Archive：被归档的 sessions。

自定义 categories：

- 由用户创建。
- 存储在 `folders`。
- 每个自定义 category 属于一个 workspace。

关键规则：

- 每个 session 最多只有一个 category。
- 同一 workspace 内新建或重命名 category 时，名称经 trim、NFC 规范化并按大小写不敏感比较后，不得与其他 category 重复；不同 workspace 可以同名。
- 重命名自身当前名称允许；已有重复 category 保留，不由 normalize 自动合并或删除。
- 冲突会被拒绝并显示 toast。
- Starred 是内置 category，不是额外叠加的视觉状态。
- 移动到 Saved 会设置 `starred: true`、`archived: false` 并清空 `folderId`。
- 移动到 Archive 会设置 `archived: true`、`starred: false` 并清空 `folderId`。
- 移动到 Inbox 或自定义 category 会取消 Starred 和 Archive。

排序：

- 顶部整个 Category tab 支持直接 pointer drag；5px 以内保留 navigation click，不显示或隐藏独立 drag handle。
- Keyboard 排序只在 Manage Categories 中通过 Move Up / Move Down 提供；Manage Categories 同时支持整行 pointer drag。
- Manage Categories 与 Manage Workspaces 使用同一管理弹窗语法：动态数量 + `drag to reorder` 副标题、header 内 `Add Category`、分隔 footer 内 `Done`。
- 排序保存在 `categoryOrderByWorkspace[workspaceId]`；Manage Categories 的 Move/row drop 从当前 rendered list 捕获完整 expected order，topbar resolver 从当前 DnD state snapshot 捕获并随 typed intent 传递 expected order。Store 只复制这些 UI 操作起点快照，不在提交时重读最新 state；authority 冲突时保留更新的 order。
- Edit Category 在打开 modal 时固定 `{name, color}` expected snapshot。Folder/order 只有 target 与 mutation timestamp witness 同时匹配才视为 response-loss exact replay；target 相同但 witness 不同仍拒绝为冲突，避免 ABA 或独立写入被误认成 replay。
- 顶部 category tabs、Manage Categories 和右侧 active category board 使用同一 canonical 顺序。

导航：

- 点击顶部 category tab 会切换右侧 active category board。
- 右侧只展示当前 category，search 和 open tab filter 继续在当前 workspace 内叠加过滤。
- Category tabs 位于 topbar；active category board 不再依赖 section title 吸顶。

## Saved Sessions

Session card 展示：

- Title。
- Favicon stack 和剩余 link 数量。
- Links/notes 数量。
- lock/starred/archived chips。
- Restore 直接动作和 More 菜单。
- Session note。
- 全部 matching tab items。

默认展示：

- Active category 的 sessions 在单行 horizontal track 中排列。
- Empty Category 的创建 target 仍覆盖第一条完整 340px slot；创建后的 session card 在同一列内保留顶部 3px、底部 5px 的轻 elevation 空间。
- Session 使用 1px/3px 极轻阴影、语义边框和 8px 圆角，不使用厚重悬浮或装饰性高光。
- Session title 最多 2 行；group-level note 紧跟 metadata，使用 quiet accent-soft fill 和 2px 左侧 accent rule。
- 全部 matching tab items 在 card 内的 tab list 中渲染，内容过长时纵向滚动。

支持动作：

- Restore。
- Add link/note。
- Copy session links。
- Lock / unlock。
- Star / unstar（移入/移出 Saved）。
- Archive / unarchive（移入/移出 Archive）。
- Rename。
- Edit session note。
- Delete。

动作布局：

- Restore 和 More 使用统一 32px neutral icon action；fine pointer 下 resting 隐藏，header hover/focus 或 menu open 时显示，coarse pointer 下直接可见。
- Add、Rename、Note、Lock、Copy、Delete 等次级动作保留在 More 菜单中。
- Options 不再提供 session toolbar 外露动作配置。

### Inline rename

入口：

- 双击 session title。
- 键盘 focus 后按 Enter 或 F2。
- More > Rename。

规则：

- Enter 保存。
- Escape 取消。
- Blur 保存。

### Lock

Lock 表示该 session 是固定模板或常用工作流。

效果：

- Restore 后不会因为 `deleteRestoredTabs` 被删除。
- 删除动作仍然可用，但会走确认逻辑。

## Saved Tab Items

当前 item 类型：

- Link。
- Note。

Link：

- 点击 title 直接打开 URL。
- Saved title 保持单行，过长时省略；URL 显示在副标题行。
- 支持复制 URL、编辑 note、删除、进入 select mode。

Note：

- 用于保存非 URL 文本。
- 不参与 restore。

右键菜单：

- Saved tab item 表面不显示 Open/More 按钮。
- 低频动作通过右键菜单触发。

Selection mode：

- 点击任意 saved item checkbox 时，先进入该 Session 的 selection scope，再切换当前 item；Session More > Select Tabs 也进入该 scope，初始为 `0 selected`。
- `selectionMode` 是独立状态，不由当前 Session 的 selected ID count 派生；取消最后一个 item 后仍保留该 Session 的 `0 selected` mode。
- Manager 同时只允许一个 Open Tabs 或 saved Session selection scope。进入另一个 scope 会同步清空旧 browser window 或旧 Session 自己持有的 selected IDs。
- 显式 Exit 或 scope replacement 会退出 mode 并清空 IDs；sidebar collapse 还会退出 Open Tabs scope。
- 当前 Session 自己持有 saved item IDs；Manager scope 不进入 Zustand、canonical state 或任何持久化后端。
- Active saved scope 的 Session 在仍属于当前 board 时，activation context reset 会保持 full card 挂载，避免 owner-local IDs 因降级为 shell 而丢失；若 filter/category 让 owner 真正离开 render tree，则同步 exit scope。
- Active Session header 原位替换为一个 icon toolbar：selected count、Select/Unselect All Visible、Restore Selected Links、Copy Selected URLs、Move Selected Items、Delete Selected Items 和 Exit。不会额外增加第二条 toolbar。
- Restore/Copy 只处理 selected restorable Links；Notes 仍可 Move/Delete。Locked Session 禁用 Restore/Move/Delete，但 Copy 保持可用。
- Select/Unselect All Visible 保留 hidden IDs。Restore/Delete 仅在实际成功后清 IDs并保持 `0 selected` scope；Copy 保留 IDs；任何 async reject 保留 IDs/mode。
- Restore Selected 通过一次 background `restore-refs` batch 执行。Copy Selected URLs 只调用一次 clipboard write。Delete Selected Items 使用单一 atomic `delete-tabs` mutation并等待 authoritative commit，不循环 fire-and-forget `deleteTab`。
- Move 打开与 Open Tabs 共用的 Session target picker。Existing target 追加到目标 Session 末尾；New target按 canonical category/session 顺序展示全部合法 insertion index。若 selection 是一个源 Session 的全部 tabs，则隐藏全部 New choices但仍允许 Existing merge；Open Tabs 不应用该抑制。
- Arrow keys 只更新 picker preview；Enter/Space commit；Escape/Cancel 不改数据或 selection。preview/cancel/commit 通过 `aria-live` announce，并在关闭后返回 trigger；trigger 消失时回退到 surviving Session/list。

## Drag and Drop

统一输入与视觉规则：

- Pointer 使用 5px activation distance；touch 使用 200ms delay + 5px tolerance。触摸不会同时进入 PointerSensor。
- Workspace、Category、Session、Saved Tabs 是 move/reorder；Open Tabs 是 copy，不从 Chrome 源列表移除。
- Resting UI 不显示 drag icon，也不保留 visually-hidden/focusable drag activator。键盘结果由命名命令和 target picker 提供。
- Drag ghost 从 pickup 到任意 target 保持同一内容、宽度和高度；item ghost 半透明、`pointer-events: none`，始终位于 New Session `+` 上层。
- Session board 使用固定横向几何：desktop column 340px、gap 16px、slot 占满 Board 高度；compact 在同一 viewport 内保持固定宽度。

### Open tabs 拖拽

单个 open tab：

- 可拖到已有 session。
- 可精确命中当前 category 的 start / between / end Gap Anchor 创建新 session。

多个 open tabs：

- 进入 select mode 后勾选。
- 从任一已选 tab 开始拖动，携带全部已选 tabs。

语义：

- Open tab 拖拽是 copy，不会关闭浏览器中的 tab。

### Saved tab 拖拽

单个 saved tab：

- 可拖到同一或其它已有 session；落在 Session body 时追加到末尾。
- 可精确命中 tab row 上/下 25% 边缘插入 before/after；row 中间 50% 收敛为 Session body。
- 可精确命中当前 category 的 start / between / end Gap Anchor 创建新 session。

多个 saved tabs：

- 当前 session selection mode 下可批量拖动。
- 顺序按源 session 内原顺序保留。
- 若所选项等于一个源 Session 的全部 tabs，则隐藏全部 New Session anchors，但仍允许明确合并到已有 Session。

### Session 拖拽

Session card 可以在 horizontal track 中拖拽排序：

- title、metadata、只读 note 和 card/shell 空白是 pointer/touch activator；Restore、More、输入框、链接、selection toolbar 和 tab list 不是 Session activator。
- Pickup 时源 slot 就是当前 slot；placeholder 保持源 Session 的固定几何，不让 Board 高度或列宽跳变。
- 命中 `group-insert` 后 marker 表示最终 insertion index，周围 Session 实时让位；普通 target 使用 12px hysteresis 减少 remeasure 回闪。
- 拖动到其它 category 时，session 进入对应 category。
- Session body 不是 Session payload 的合法 target，不会把一个 Session 合并进另一个 Session。

### Category 拖拽

顶部 category tab 可拖拽排序。

规则：

- 系统 category 和自定义 category 都参与排序。
- 自定义 category 的 rename/delete 在右键菜单中。
- 点击顶部 category tab 会切换当前 board。
- Session 可拖到顶部 category tab 的 `category-column` target，移动到该 category。
- Saved/Open tabs 不直接 drop 到 Category tab；创建新 Session 使用 Gap Anchor 或 target picker，合并使用 Existing Session。

### New Session Gap Anchor

- 非空 Category 在第一张 Session 之前、每两张 Session 之间、最后一张 Session 之后各提供一个 20x20px fine-pointer `+`。
- `+` 必须精确命中；不使用 12px hysteresis。命中只进入 filled active state，不展开临时 Session slot。
- Pointer 停留约 300ms 后显示 `Release to create session`，live region 立即宣布；离开立即失活并清除提示，只有仍在 active `+` 上松手才提交。
- `+` 位于 ghost 下层。Ghost 保持半透明，因此目标仍可识别。
- canonical empty Category 不显示孤立的小卡片；整个第一条 340px 固定 Session slot 是 target，居中 `+` 仅作为提示。激活时原位显示 `Release to create session`。
- Coarse pointer 不放大精确 `+`；通过 Session target picker 的 New choices完成同一结果。

### Board auto-scroll

- 仅 Session Board 水平滚动；页面、Sidebar、Open Tabs list 与 Session tab list 不随 drag 滚动。
- 左右各 48px edge zone 使用 3–12px/frame 渐进速度；每帧滚动后重新测量 droppables。
- 命中精确 `+` 时暂停，离开后恢复；`prefers-reduced-motion` 关闭非必要动画，但不关闭必要的 drag scrolling。

### Keyboard / command 等价

- Workspace 和 Manage Categories 使用 Move Up / Move Down；其整行仍支持 pointer native drag。
- Session More / context menu 的 Move Session 打开 named Before/After + cross-category picker。
- Saved selection toolbar 的 Move 与 Open Tabs 的 Save to 复用 Existing/New Session target picker。
- Picker 使用 Arrow keys preview、Enter/Space commit、Escape/Cancel 保持数据不变，并恢复 trigger 或 surviving fallback focus。
- 不使用 `KeyboardSensor`，不在任何 surface spread sortable `role` / `tabIndex` / `aria-roledescription`。

### DnD 与状态边界

- DnD payload 和 target 使用 discriminated unions；不同 workspace、错误归属、不可保存 open tab、越界 index 和 locked target 会被 resolver 拒绝。
- Session drop 只有排序或 category placement 语义，不会把一个 session 合并进另一个 session body。
- `new-session-insert` 只接受 `tab` / `tabs` / `open-tabs`；`group-insert` / `category-column` 只接受 Session；`category-reorder` 只接受 Category。
- Escape、取消、drop 完成和 overlay 生命周期都会清理 drag payload、marker、source rect 与 target state。
- Workspace/category/view/groups 或 Open Tabs source snapshot 在 drag 中被替换时，立即取消旧 drag，禁止提交到过期布局。
- Drop command 通过 replay ledger 识别重复 operation，生成的 session/tab identity 在 replay 时保持稳定；持久化队列串行化并以 normalized state 原子写入。
- 普通 mutation 的输入先验证引用、locked 约束和 link/note URL 形态；语义错误不写 storage，队列在失败后可继续处理后续 mutation。

## Search and Filter

### 顶部搜索

Workspace header 右侧搜索框过滤当前 workspace 的 sessions。搜索默认收起为 icon button；关闭搜索时清空筛选条件，收起状态不保留上次 query。

匹配范围：

- Session title。
- Tab title。
- URL。
- Note。

快捷键：

- `/` 聚焦搜索框。
- `Cmd/Ctrl+K` 打开搜索 modal。

### Search modal

Command palette 风格搜索：

- 显示匹配的 tab results。
- 可 restore 或 reveal。

### Sidebar Filter tabs

入口：

- Open Tabs sidebar 底部的 Filter tabs 输入。

行为：

- 只过滤当前 selected window 的 pinned/regular browser tab rows。
- 不改变右侧 saved sessions，也不写入 extension state。

### Open tab URL filter

入口：

- Open Tabs 面板中右键有 URL 的 open tab。

行为：

- 右侧只显示包含该 tab URL 的 sessions。
- Open Tabs 工具条显示 filtered 状态；这与 Options 中不存在的自定义 URL capture filter 无关。
- 切换 browser window 或刷新 Open Tabs 不会自动清除该 filter。
- 可一键清除 filter。

## Import / Export

### Import

入口：

- 右侧顶部 toolbar 的 Import。

支持格式：

- TabBoard JSON export。
- TabBoard text export。
- OneTab export text。
- 简单 URL list。

规则：

- 导入结果插入当前 workspace 头部。
- OneTab 文本中由空行分隔的 blocks 会变成多个 sessions。

### Export

入口：

- 右侧顶部 toolbar 的 Export。

支持：

- Copy text。
- Download text。
- Download JSON。

当前 Export 范围：

- 所有 state groups。

## Bin

入口：

- 右侧顶部 toolbar 的 Bin。

能力：

- 恢复 deleted group/tab。
- 永久删除 bin item。
- 清空 bin。

规则：

- Bin 最多保留 80 条。
- Destructive 操作默认确认。

## Settings

Basic：

- Extension button behavior：save current window / open popup。
- Close tabs after saving。
- Open TabBoard after saving。
- Remove records after restore。
- Restore groups in a new window。
- Restore next to active tab。
- Focus first restored tab。
- Dedupe source tabs during capture。
- Exclude pinned tabs during capture。
- Include chrome:// URLs。
- Include file:// URLs。
- Custom URL filter。
- Confirm before destructive actions。
- Theme：system / light / dark。

Advanced：

- Chrome shortcuts entry。
- Reset settings。

### Data Storage

TabBoard 默认把数据保存在浏览器内置的 `chrome.storage.local` 中；数据仅存在本机，卸载扩展会被浏览器清除。TabBoard 也支持把数据保存到你自己选择的本地文件夹，作为可选替代后端。

Options 的 Storage location 读取一个轻量持久化状态投影：

- `configuredTarget`：用户正式选择 Browser 或 Local Folder。
- `activeBackend`：当前实际写入 Browser 或 File。
- `folderName`、`fallbackReason`、`fileUpdatedAt`：本地文件夹身份、自动降级原因和最后一次成功文件提交时间。

自动 fallback 只把 `activeBackend` 改成 Browser，不把 `configuredTarget` 改成 Browser。Options 因此仍以 `Local folder name: <name>` 为主，并显示 `updated: HH:mm:ss`、降级原因，以及同一恢复动作区中的 `Reconnect folder` 和 `Use browser storage`。长 folder name 保持单行省略，不能挤压右侧更新时间。只有显式 switch-back 成功后 configured target 才变成 Browser；fallback 期间的 browser state 时间不得覆盖 `meta.json.updatedAt`。

为什么考虑本地文件夹：

- 数据在你自己的文件夹里，卸载扩展或更换浏览器后不会丢，重新选择文件夹即可恢复。
- 可以把文件夹放在 iCloud、Dropbox、OneDrive、Syncthing 等同步目录里，让多台电脑上的 TabBoard 共享同一份数据（同步冲突由同步盘处理，建议在同一时间只在一台电脑上写入）。
- 所有数据都是普通 JSON 文件，可以直接打开查看、备份、纳入版本控制。

启用方式：

1. 打开 Options（右上角 toolbar 的齿轮图标，或 Popup 的 Settings 入口）。
2. 展开 Advanced Settings，在 Storage location 中点击「Choose folder」。
3. 在系统文件夹选择对话框中，选择一个空文件夹或专门为 TabBoard 新建的文件夹；不要选择受系统保护的目录或其他应用的数据目录。
4. 按提示选择迁移方式：
   - Use this folder：以文件夹中已有的 TabBoard 数据为准，立即切换到文件存储。
   - Export browser data to folder：把当前浏览器里的数据完整写入空文件夹，提交成功后切换到 File backend。
   - Merge folder with browser data：读取文件夹中已有的数据，与浏览器中的数据合并（同一项以文件夹版本为准），合并完成后切换到文件存储。
5. 迁移完成后 Settings 会显示 `Local folder name` 与最后一次成功文件更新时间。

切换回浏览器存储：

- 在 Options > Storage location 中点击「Use browser storage」。
- 文件夹中的文件不会被删除；断开后浏览器存储中保留当前可见的完整数据，后续写入不再访问该文件夹。
- 之后随时可以再次选择文件夹（同一份或新文件夹）重新启用文件存储。

恢复与降级行为：

- 如果文件夹被移动、删除、权限被撤销，或同步盘暂时不可用，TabBoard 会自动把 active backend 降级到浏览器存储，并持久化 configured Local Folder、folder name、reason 和 file freshness。
- 降级期间新写入会暂存在浏览器存储；`Reconnect folder` 重新授权并验证原文件后恢复 File backend。用户也可显式 `Use browser storage`，通过安全迁移正式改变 configured target。
- 历史版本若因 service worker 构建缺陷留下 `File storage error: document is not defined` 或 `File storage error: window is not defined` fallback，更新后打开 Options 会自动尝试恢复一次原 File backend；permission、corruption 和 offline fallback 仍要求用户明确 Reconnect。
- 任何情况下都建议定期使用 Export 做额外备份。

注意：

- TabBoard 不会主动在多个打开的 manager/扩展实例之间做实时同步；如果同时在两台设备上写入同一个同步文件夹，最后一次写入会覆盖之前的改动。
- 不要手动编辑文件夹内的 JSON 文件除非你清楚自己在做什么；写错格式可能导致下次加载时数据被忽略。

## Legacy / Removed Features

Quick list / Pinned workflow：

- 已下线，当前 UI 不再暴露。
- `quickList` 已从当前 schema 移除；读取历史数据时，遗留 items 迁移到一个普通 `Former Quick list` session。

Todo：

- 已从当前功能面移除。
- 旧 `itemType: "todo"` normalize 为 note。

All items category：

- 已移除。
- 顶部 category tabs 切换单一 active category；搜索和 open tab filter 在当前 category 内继续筛选。
