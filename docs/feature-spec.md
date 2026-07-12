# Feature Spec

本文档描述 ZipTab 当前版本的功能面和交互规则。它是“现在能做什么”的说明，不替代 [Feature Evolution](feature-evolution.md) 中的历史记录。

## 功能总览

ZipTab 当前能力分为七组：

- Capture：保存当前浏览器上下文。
- Restore：恢复 saved tabs。
- Organize：用 workspace、category、session card 管理上下文。
- Search & Filter：搜索和反查历史 sessions。
- Edit：重命名、note、link、lock、delete。
- Move：拖拽 tabs、sessions、categories。
- Import/Export：数据迁移和备份。

## 页面和入口

### Toolbar action

默认行为：

- 点击扩展图标保存当前窗口。
- 保存成功后根据设置打开 ZipTab manager。

可配置行为：

- Options > Toolbar 中可将扩展图标改为打开 popup。

### New tab page

ZipTab 使用 `chrome_url_overrides.newtab` 替换 Chrome 新标签页。

预期：

- 新开 tab 直接进入 manager。
- Manager 是日常入口，不是隐藏在扩展菜单里的工具页。

### Manager

Manager 是 tabExtend-style visual board 主工作台，分为：

- 左侧可折叠 sidebar：64px header rail 内是带 window icon 的 compact window selector、Save/Select/More 和 sidebar actions，下面是单一 Open Tabs 纵向列表。Sidebar 展开时占满视口高度；折叠后显示当前 window、tab favicon 和 Filter tabs 的窄 rail。hover 或 keyboard focus 会把完整 sidebar 作为覆盖层打开，不推动右侧 board；触控入口仍通过 rail/toggle 可达。
- 右侧 64px toolbar：workspace dropdown、40px category tabs、search、Import、Export、Bin、Options；workspace 控制位于 category tabs 左侧，全部 controls 对齐同一基线。
- 右侧 active category board：只展示当前 category 的 saved sessions；sessions 直接位于 Nord canvas 上，单行横向排列并滚动，不再有 category outer frame。

Window selector 展示 Chrome normal windows 的 ordinal 和原始 tab 总数，不显示 `Current window` 或 raw Chrome window ID；window icon 作为 selector 的 start icon，一次只渲染 selected window 的 Open Tabs。所有有 URL 的非 ZipTab tabs 按 Chrome tab.index 排成一个纵向列表；pinned row 与普通 row 同处列表，只以内联 badge 标记 pinned。Sidebar 底部的 Filter tabs 输入只过滤当前 selected window 的 rows。Selected window 与单一 tab list 共用同一 top edge；Open/saved tab 的完整本地 metadata 通过 hover 或 focus 进入 interactive popover，不显示 eye/preview 按钮，动作执行前关闭 popover，随后将 keyboard focus 归还仍可用的 row、session 或 filter fallback，避免重绘后保留旧 trigger 或隐藏焦点。Session cards 保留 Restore 和 More；Add、Rename、Note、Lock、Copy、Delete 等次级动作进入 More。Card 充满 board 高度，全部 matching tabs 在 card 内部纵向滚动。Manager 使用 Nord semantic tokens；search、window selector 和 workspace dropdown 使用本地 Web Awesome controls，DnD product surfaces 保持自定义 DOM。

### Popup

Popup 是快动作入口：

- 横排 quick actions：Save、Open、Dedupe。
- Settings 按钮进入 Options。
- Search recent sessions。
- Recent sessions 最多展示 5 条，每行提供 Restore 和 Delete。
- Hover 或 keyboard focus recent session 时展示该 session 的全部 tabs 预览。

Save 完成后 popup 关闭，打开或聚焦最近访问的 manager，并在 manager 中定位刚保存的 session。Popup 不承载重命名、分类、编辑等管理流程。

### Options

Options 分为 Basic 和 Advanced：

- Basic：日常 toolbar、capture（包括 tab 去重）、restore、theme 设置。
- Advanced：Chrome shortcuts、reset settings。
- Capture 默认开启 tab 去重；不提供自定义 URL 或 pinned capture 过滤设置。
- Favicons 始终展示，不再是设置项。
- 危险操作始终确认，不再提供关闭确认的设置。
- Session card 外露动作不再可配置。

### Context menu

页面或扩展按钮右键菜单支持：

- Open ZipTab。
- Save this tab。
- Save all tabs in this window。
- Save selected tabs。
- Save tabs to the left。
- Save tabs to the right。
- Save all tabs except this one。
- Save tabs from all windows。

### Omnibox

地址栏输入 `zt` 后可搜索 saved tabs：

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

- 当前 selected window 中有 URL 的非 ZipTab tabs 被创建为一个 session。
- 新 session 插入当前 workspace 的最前面。
- 通过 Select tabs 创建的 session 会切到当前 workspace 的 Inbox，并在 board 中高亮刚创建的 session；若用户已切换 workspace，则不强行改变当前 workspace。
- 如果开启 `closeTabsAfterSave`，保存成功后关闭源 tabs。
- 如果开启 `openManagerAfterSave`，保存后打开 manager。

### 保存选中的 open tabs

入口：

- Manager > Open Tabs > Select tabs。
- 勾选多个 open tabs。
- 点击 create session 按钮，或拖动已选 tabs 到 saved sessions 区域。

结果：

- 选中 tabs 被创建为一个新 session；selection toolbar 以 numeric badge 展示当前 selected 数量，并保留可读的辅助文本。
- 如果拖到已有 session，会追加或插入到该 session。
- 从任一已选 tab 开始拖动，会携带当前选中的所有 open tabs。

### Capture 规则

- Open Tabs 展示所有有 URL 的非 ZipTab tabs，并按 Chrome `tab.index` 排序。
- Capture 会尝试保存这些 tabs，包括 pinned tabs；pinned 只以内联 badge 表示，不改变保存资格。
- ZipTab 自身 extension 页面没有保存资格。
- 没有自定义 URL pattern、pinned capture 或特殊 URL 开关；Chrome 对受限 URL 的实际保存/恢复能力仍是平台边界。

### 去重

Options > Capture 默认开启 capture 时 tab 去重。

开启后：

- 本次保存的源窗口 tabs 按 URL 去重。
- 重复源 tabs 会被关闭。
- 去重不再因为旧 saved sessions 中已有同 URL 而跳过本次 session 内容。

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

- Inbox：没有 category 的 sessions。
- Starred：被标为 starred 的 sessions。

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
- 移动到 Starred 会设置 `starred: true` 并清空 `folderId`。
- 移动到 Inbox 或自定义 category 会取消 Starred。

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
- lock/starred chips。
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

## Search and Filter

### 顶部搜索

Workspace header 右侧搜索框过滤当前 workspace 的 sessions。搜索默认收起为 icon button；已有 query 时仍保留 query，收起状态通过 active indicator 表明筛选仍在生效，再次展开可继续编辑。

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

- ZipTab JSON export。
- ZipTab text export。
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
- Open ZipTab after saving。
- Remove records after restore。
- Restore groups in a new window。
- Restore next to active tab。
- Focus first restored tab。
- Dedupe source tabs during capture。
- Theme：system / light / dark。

Advanced：

- Chrome shortcuts entry。
- Reset settings。

## Legacy / Removed Features

Quick list / Pinned workflow：

- 已下线。
- 旧数据启动时迁移为 `Former Quick list` 普通 session。

Todo：

- 已从当前功能面移除。
- 旧 `itemType: "todo"` normalize 为 note。

All items category：

- 已移除。
- 顶部 category tabs 切换单一 active category；搜索和 open tab filter 在当前 category 内继续筛选。
