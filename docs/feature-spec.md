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

- 点击扩展图标保存当前窗口。
- 保存成功后根据设置打开 TabBoard manager。

可配置行为：

- Options > Toolbar 中可将扩展图标改为打开 popup。

### New tab page

TabBoard 使用 `chrome_url_overrides.newtab` 替换 Chrome 新标签页。

预期：

- 新开 tab 直接进入 manager。
- Manager 是日常入口，不是隐藏在扩展菜单里的工具页。

### Manager

Manager 是 tabExtend-style visual board 主工作台，分为：

- 左侧可折叠 sidebar：48px header rail 内是 compact window selector、Save Window、Refresh 和 collapse actions，下面是单一 Open Tabs 纵向列表。Sidebar 展开时占满视口高度；折叠 rail 只保留当前 window、每行的 Focus favicon 和 Expand Sidebar，其他 window、selection、drag、More、Close 与 Filter 在 overlay drawer 中恢复。hover 或显式 Expand 会把完整 sidebar 作为覆盖层打开，不推动右侧 board。
- 右侧 48px toolbar：workspace dropdown、category tabs、search、Import、Export、Trash、Options；workspace 控制位于 category tabs 左侧，全部 controls 对齐同一基线。
- 右侧 active category board：只展示当前 category 的 saved sessions；sessions 直接位于 Nord canvas 上，单行横向排列并滚动，不再有 category outer frame。

Window selector 展示 Chrome normal windows 的 ordinal 和原始 tab 总数，不显示 `Current window` 或 raw Chrome window ID；一次只渲染 selected window 的 Open Tabs。每个 row 的 checkbox 只负责 selection，独立 drag handle 负责 DnD，点击/Enter title 区域直接 Focus 浏览器 tab，More 打开带名称的 Pin/Close 详情动作。Fine pointer 可保留直接 Close；coarse pointer 和 760px 以下只保留 Select/Drag/Focus/More 四个 44px 目标，并保持 8px 间距。Sidebar 底部的 Filter tabs 输入只过滤当前 selected window 的 rows。Session cards 保留独立 drag handle、Restore 和 More；Add、Rename、Note、Lock、Copy、Delete 等次级动作进入 More。Card 充满 board 高度，全部 matching tabs 在 card 内部纵向滚动。Category label 只负责导航，独立 reorder handle 负责键盘/指针 DnD；category label 同时显示 session count。

Open Tabs 刷新期间保留上一份 window/tab rows，不插入 loading 文案或空白占位；sidebar 顶部 Refresh icon 持续旋转并通过 `aria-busy` 暴露刷新状态，请求成功后再原子替换列表。

大分类中的每个 session 都保留稳定的横向 slot、session drag handle 和 insertion geometry。初次只激活前 6 个以及 viewport + 720px overscan 附近的完整 card/tab 交互树；远端 slot 显示包含 title、link/note count 和 lock 状态的轻量 shell，接近视口、被搜索/高亮或点击 title 后升级为完整 card。TabBoard 自身搜索仍扫描全部 canonical state；浏览器 Ctrl+F 只能命中已经激活的完整 card 和远端 shell 的 session summary，不能命中尚未激活的 tab row。

Manager 页面上下文同步到 URL：

- `workspace=<workspaceId>` 表示当前 workspace。
- `category=inbox|saved|archive|folder:<id>` 表示当前 category。
- `view=board|bin` 表示 board 或 Bin。
- `q=<query>` 表示 saved-session 搜索。
- 用户导航会进入浏览器历史；Back/Forward 恢复 workspace、category、view 和 query。
- URL 中无效或跨 workspace 的 category 自动回退到 Inbox。

窄屏下 Search 独占 topbar 的内容区；Import、Export、Trash、Options 收入 More actions，不隐藏能力。Sidebar 收起后只保留当前 window、Open Tab Focus 与可聚焦的 Expand Sidebar，避免裁剪但仍可聚焦的隐藏动作。Drawer 打开时被覆盖的 topbar/main surface 使用 `inert`。

### Popup

Popup 是快动作入口：

- 顶栏提供 Manager 和 Settings 入口。
- 当前窗口概览显示 tab 总数、pinned 数量、重复 URL 数量与 Chrome tab group 数量。
- Pinned tabs 与所有属于 Chrome tab group 的 tabs 可分别勾选是否纳入本次保存；取消 Group 会排除该窗口的全部 grouped tabs。
- Save 创建新的 session 后自动关闭 popup；有重复 URL 时同时显示 Dedupe，关闭当前窗口中的重复 tabs 后自动关闭 popup。

Save 完成后 popup 关闭，打开或聚焦最近访问的 manager，并在 manager 中定位刚保存的 session。Popup 不承载重命名、分类、编辑等管理流程。

Popup hydration 时展示轻量 loading 状态，不显示空白页。Dedupe 会先确认将关闭的重复 tab 数量，再执行关闭。
Popup 的 Save 文案与 aria-label 同源显示实际结果，例如 `Save 4 Tabs` 与 `4 of 7 tabs selected`；筛选为 0 时解释恢复路径。Dedupe confirmation 默认聚焦 Cancel，关闭后显式回到 Dedupe。

### Options

Options 分为 Basic 和 Advanced：

- Basic：日常 toolbar、capture（包括 tab 去重）、restore、theme；使用无框 section 和 divider，而不是 card-per-section。
- Advanced：Data Storage、删除确认、Chrome shortcuts、reset settings。
- Capture 默认开启 tab 去重；Options 提供自定义 URL 过滤规则，命中的 open tabs 不展示、不可保存也不可拖拽。
- Favicons 始终展示，不再是设置项。
- 危险操作默认识别，可在设置中关闭二次确认。
- Switch/radio/theme 立即保存；自定义过滤文本在停止输入 500ms 或 blur 后提交。标题旁稳定显示 `Saving…`、`Saved` 或 `Could not save`。Reset confirmation 关闭后显式回到 Reset to Defaults。
- Session card 外露动作不再可配置。
- Options 跟随 system / light / dark 主题。
- Toolbar、Capture、Restore、Appearance 保持在 Basic 区；Data Storage、Safety、Chrome shortcuts 和 Reset 放在 Advanced Settings。
- Advanced Settings 展开状态同步到 `?advanced=1`；刷新和浏览器 Back/Forward 保持同一 disclosure context。
- Basic 从轻量 settings projection 启动，不读取与页面无关的 sessions/folders/bin。Advanced 关闭时不挂载 storage UI、migration dialogs 或 file backend；首次展开时再异步加载，并在 chunk 加载失败时提供 Reload。
- Options header、Open Manager 和 Basic shell 不等待 projection I/O；hydration 完成前 Basic fieldset 保持 disabled + `aria-busy`，save status 显示 `Loading settings…`，Advanced 暂不显示。真实 settings 到达后原地启用 controls。
- Reset to Defaults 需要确认；确认文案明确 saved data 保留不变。
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

- Toolbar action 默认点击。
- Manager > Open Tabs > selected window > Save。
- Popup > Save window。
- Context menu > Save all tabs in this window。
- Command `capture-current-window`。

结果：

- 当前 selected window 中符合 shared capture policy 的非 TabBoard tabs 被创建为一个 session；不符合 policy 的 rows 仍保留在 Open Tabs 中并显示原因。
- 如果没有任何 policy-eligible tab，capture reports `No capturable tabs were found`，不会提交空 session。
- 新 session 插入当前 workspace 的最前面。
- 通过 Select tabs 创建的 session 会切到当前 workspace 的 Inbox，并在 board 中高亮刚创建的 session；若用户已切换 workspace，则不强行改变当前 workspace。
- 如果开启 `closeTabsAfterSave`，保存成功后关闭源 tabs。
- 如果开启 `openManagerAfterSave`，保存后打开 manager。

### 保存选中的 open tabs

入口：

- Manager > Open Tabs 中勾选任意一个可保存 tab，列表立即进入多选态。
- 继续勾选多个 open tabs。
- 点击底部 create-session 图标，或拖动已选 tabs 到 saved sessions 区域。

结果：

- 选中 tabs 被创建为一个新 session；多选态在 tab list 上方显示 selected count，并提供全选、创建 session、批量关闭、批量 pin、退出五个带可访问名称的 icon actions。
- 如果拖到已有 session，会追加或插入到该 session。
- 从任一已选 tab 开始拖动，会携带当前选中的所有 open tabs。

### Capture 规则

- Open Tabs 展示 selected normal window 的 tab rows，并按 Chrome `tab.index` 排序；TabBoard 自身页面和其他扩展页面，以及命中自定义 URL 过滤规则的 rows 不展示。
- pinned、`chrome://` 和 `file://` tabs 与普通 tabs 一样可以多选、拖拽和保存；同一 custom filter policy 同时用于列表、checkbox、DnD 和 capture。
- Extension pages 不会进入 Open Tabs 列表或 capture；没有 usable URL 的 rows 不具备保存资格。
- 即使 policy 允许特殊 URL，Chrome 对受限 URL 的实际保存/恢复能力仍是平台边界。

### 去重

Options > Capture 默认开启 capture 时 tab 去重。

开启后：

- 本次保存的源窗口 tabs 按 URL 去重。
- 重复源 tabs 会被关闭。
- 去重不再因为旧 saved sessions 中已有同 URL 而跳过本次 session 内容。
- Popup 的 Dedupe 仅处理当前 browser window：同 URL 中优先保留 active tab；没有 active tab 时保留 `lastAccessed` 最新的 tab。

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
- Rename workspace。
- 每个 workspace 维护自己的 sessions 和 categories。

UI：

- Workspace switch/create/rename/stats 位于右侧 topbar 的单一 dropdown，处于 category tabs 左侧。
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

- Categories 支持拖拽排序。
- 排序保存在 `categoryOrderByWorkspace[workspaceId]`。
- 顶部 category tabs 和右侧 active category board 使用同一顺序。

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
- 每张 session card 充满 board 的可用高度。
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

- Restore 在 session card 上直接外露。
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

- 从 saved tab 右键菜单进入。
- 仅当前 session 进入选择模式。
- 当前 session header 被选择工具条替代。
- 批量动作包括 restore、copy URL、delete、close selection。

## Drag and Drop

### Open tabs 拖拽

单个 open tab：

- 可拖到已有 session。
- 可拖到 category 中指定位置创建新 session。

多个 open tabs：

- 进入 select mode 后勾选。
- 从任一已选 tab 开始拖动，携带全部已选 tabs。

语义：

- Open tab 拖拽是 copy，不会关闭浏览器中的 tab。

### Saved tab 拖拽

单个 saved tab：

- 可拖到已有 session。
- 可拖到 category 中指定位置创建新 session。
- 在 session 内部通过上/下插入线表达最终位置。

多个 saved tabs：

- 当前 session selection mode 下可批量拖动。
- 顺序按源 session 内原顺序保留。

### Session 拖拽

Session card 可以在 horizontal track 中拖拽排序：

- 拖动开始时，Move here placeholder 出现在源 session 原位置，并占据相同的横向 track 宽度。
- 目标 session 左右 25% 区域表示插入到目标前/后。
- 目标 session 中间 50% 区域表示被拖拽 session 占据目标 slot；目标 session 会移动到之前空出来的位置。
- 目标 slot 会在横向中间区域内保持锁定，减少 Chrome 原生 DnD 在重排时的回闪。
- 拖动到其它 category 时，session 进入对应 category。
- Session 本体不再表示“合并到另一个 session”，只用于计算插入位置和 target slot。

### Category 拖拽

顶部 category tab 可拖拽排序。

规则：

- 系统 category 和自定义 category 都参与排序。
- 自定义 category 的 rename/delete 在右键菜单中。
- 点击顶部 category tab 会切换当前 board。
- Session、saved tabs、open tabs 可拖到顶部 category tab，把内容移入该 category。

### DnD 与状态边界

- DnD payload 和 target 使用 discriminated unions；不同 workspace、错误归属、不可保存 open tab、越界 index 和 locked target 会被 resolver 拒绝。
- Session drop 只有排序或 category placement 语义，不会把一个 session 合并进另一个 session body。
- Escape、取消、drop 完成和 overlay 生命周期都会清理 drag payload、marker、source rect 与 target state。
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

为什么考虑本地文件夹：

- 数据在你自己的文件夹里，卸载扩展或更换浏览器后不会丢，重新选择文件夹即可恢复。
- 可以把文件夹放在 iCloud、Dropbox、OneDrive、Syncthing 等同步目录里，让多台电脑上的 TabBoard 共享同一份数据（同步冲突由同步盘处理，建议在同一时间只在一台电脑上写入）。
- 所有数据都是普通 JSON 文件，可以直接打开查看、备份、纳入版本控制。

启用方式：

1. 打开 Options（右上角 toolbar 的齿轮图标，或 Popup 的 Settings 入口）。
2. 在 Data Storage 分组中点击「Choose folder」。
3. 在系统文件夹选择对话框中，选择一个空文件夹或专门为 TabBoard 新建的文件夹；不要选择受系统保护的目录或其他应用的数据目录。
4. 按提示选择迁移方式：
   - Use this folder：以文件夹中已有的 TabBoard 数据为准，立即切换到文件存储。
   - Export browser data to folder：把当前浏览器里的数据完整写入该文件夹，但仍保持浏览器存储为当前后端（相当于先备份）。
   - Merge folder with browser data：读取文件夹中已有的数据，与浏览器中的数据合并（同一项以文件夹版本为准），合并完成后切换到文件存储。
5. 迁移完成后 Settings 会显示当前存储模式为 File，并展示所选文件夹名称。

切换回浏览器存储：

- 在 Options > Data Storage 中点击「Disconnect folder and use browser storage」。
- 文件夹中的文件不会被删除；断开后浏览器存储中保留当前可见的完整数据，后续写入不再访问该文件夹。
- 之后随时可以再次选择文件夹（同一份或新文件夹）重新启用文件存储。

恢复与降级行为：

- 如果文件夹被移动、删除、权限被撤销，或同步盘暂时不可用，TabBoard 会自动降级回浏览器存储并弹出通知，保证你可以继续使用而不丢最近的写入。
- 降级期间新写入会保存在浏览器存储里；待文件夹恢复可用后，可在 Options 中重新连接并选择 merge 迁移，把降级期间积累的数据合并回文件夹。
- 任何情况下都建议定期使用 Export 做额外备份。

注意：

- TabBoard 不会主动在多个打开的 manager/扩展实例之间做实时同步；如果同时在两台设备上写入同一个同步文件夹，最后一次写入会覆盖之前的改动。
- 不要手动编辑文件夹内的 JSON 文件除非你清楚自己在做什么；写错格式可能导致下次加载时数据被忽略。

## Legacy / Removed Features

Quick list / Pinned workflow：

- 已下线，当前 UI 不再暴露。
- `quickList` 仍作为 state schema 字段保留（normalize 补齐为空数组），但不再有历史数据迁移逻辑。

Todo：

- 已从当前功能面移除。
- 旧 `itemType: "todo"` normalize 为 note。

All items category：

- 已移除。
- 顶部 category tabs 切换单一 active category；搜索和 open tab filter 在当前 category 内继续筛选。
