# TabBoard Crisp Utility UI 重构设计

## 状态

本设计已在 Visual Companion 中逐项确认。尚未开始修改生产 UI。

## 目标

- 把 TabBoard 做成安静、紧凑、适合高频使用的桌面生产力工具。
- 统一 Manager、Options、Popup、弹窗、菜单、按钮、图标和明暗主题。
- 保留已验证的性能优化、持久化流程、DnD 几何、可访问性和存储边界。
- 实施阶段以真实渲染尺寸和浏览器截图为准，不凭 CSS 猜测效果。

## 全局视觉系统

### 视觉方向

- 浅色：A1 Balanced Crisp。
- 深色：D1 Neutral Graphite。
- 强调色：克制的 cobalt。
- Surface 使用 6-8px 圆角、轻边框和轻微层次。
- 不使用装饰性渐变、营销式大标题、嵌套卡片或多余容器。

### 字体层级

- 字体：Inter 和现有系统 fallback，不新增字体依赖。
- 页面标题：24px / 32px，700。
- Section 标题：16px / 22px，700。
- 设置标签和主要行标题：14px / 20px，600-700。
- 正文和帮助文字：13px / 18px。
- 紧凑元数据：12px / 16px。
- Letter spacing 固定为 0。

### 间距和尺寸

- 间距刻度：4、8、12、16、24、32px。
- 标准文本控件：36px 高。
- Compact 文本按钮：32px 高。
- 桌面 Icon Button 点击区：32px。
- 触屏和 coarse pointer 点击区：至少 44px。
- 控件圆角：6px。
- Panel / Card 圆角：7-8px。

### 按钮宽度

- 纯图标按钮：固定 32px。
- Compact 文本按钮：包裹内容，最小宽度 72px。
- Standard 文本按钮：包裹内容，最小宽度 96px。
- Full width 只用于明确的表单提交或弹窗主 CTA。
- 同一操作行、同一层级的按钮统一高度和宽度等级。

## 图标系统

- 最终图标库：`lucide-react`。
- 删除临时加入的 `@phosphor-icons/react`。
- 全局 Lucide `strokeWidth`：1.75。
- Toolbar 和行操作：18px 图标，32px 点击区。
- Menu 和文本按钮左侧图标：16px。
- 空状态大图标：48px，降低透明度。
- 同一层级使用 outline，不混用 filled 和 outline。
- Filled 仅用于 selected 状态或小角标。
- 危险操作只给图标或文字 danger 色，不染整个容器。
- Window 数量和 favicon 属性角标使用 CSS glyph。
- Tab hover tooltip 不放操作图标。

### 已确认映射

| 语义 | Lucide 图标 |
| --- | --- |
| Search | `Search` |
| More | `Menu` |
| Settings | `Settings2` |
| Trash / Bin | `Trash` |
| Import | `Download` |
| Export | `Upload` |
| Save | `Inbox` |
| Restore | `SquareArrowOutUpRight` |
| Pin / Pinned | `Pin` |
| Open Manager | `AppWindow` |
| Collapse sidebar | `PanelLeftClose` |
| Expand sidebar | `PanelLeftOpen` |
| Change folder | `FolderOpen` |
| Keyboard shortcuts | `Keyboard` |
| Selection | `SquareCheckBig` |
| Close | `X` |

## Manager

### 整体布局

- 使用 A1 材质与 M1 Balanced Columns。
- Sidebar、Session 列宽和 Board 留白保持均衡。
- 顶栏与侧栏整体采用 N1 Quiet Hierarchy。
- Session Board 顶栏采用 B3 Priority Commands。

### Sidebar 顶部

- 不显示 `Window N` 文字。
- 每个 Window 使用窗口 glyph，并在内部显示 Tab 数量。
- 当前 focused Chrome Window 在 glyph 右上角显示 accent 角标。
- 删除手动 Refresh。
- 不在 Window 行重复提供整窗保存动作；唯一 Save All 位于下方 Open Tabs 上下文栏。
- 展开态的 Collapse 位于 Window 组末尾。
- 临时展开态同一位置改为 Pin Sidebar。

### Open Tabs 上下文栏

普通展开态：

- 左侧显示 Open Tabs 数量。
- 右侧显示进入选择模式和 Save All。
- Save All 包含 pinned tabs。

选择态原位替换同一栏：

- 已选数量。
- Select All / Unselect All。
- Save Selected；未选择时 disabled。Pointer/touch 默认保存为 New Session。
- `Save to` 打开 C Hybrid target picker，可选择 Existing Session 或 eligible New Session position。
- Exit Selection Mode。
- 不新增第二条 selection toolbar。

折叠态：

- 同一栏变为居中的 Expand Sidebar。
- 箭头必须严格居中在 52px rail。
- 收起时清空选择并退出选择模式。

### Open Tab 行

- 采用 L1 Progressive Actions。
- 永远不显示拖拽图标。
- 行的非交互表面使用 `grab` / `grabbing` 光标表达拖拽。
- Hover 或 selection 时，Checkbox 覆盖 favicon 槽位。
- Hover / focus-within 时，尾部固定槽位只显示 X，作用是关闭 Chrome Tab。
- Open Tab 不提供应用内右键菜单或 More 菜单。
- 点击 / Enter title 区域聚焦对应 Chrome Tab。
- Pinned 使用 favicon 右下角小角标。
- Pinned 支持选择、拖拽、Save Selected 和 Save All。
- 不显示 Normal、Hover、Selected 等文字分组。
- 不在视觉上表达 Chrome Active Tab。

### Saved Tab 行

- Hover / focus-within 时，Checkbox 覆盖 favicon；尾部固定槽位显示 X，作用是删除 Saved Tab。
- Saved Tab 右键、ContextMenu 键和 Shift+F10 打开同一 B2 菜单。
- 菜单只包含 Add/Edit Note、Copy URL/Text、Delete，不包含 Select。
- 点击 Checkbox 选择该项并进入当前 Session 的 Selection Mode。
- 点击 Saved Link title 打开链接；Note 保持其编辑语义。
- Open/Saved 行的 title 和 metadata 始终分两行，不在同一行挤压。

### Sidebar 折叠和展开

- Rail 宽度：52px。
- 点击 Expand：推动 Board，并固定展开。
- Hover rail 约 350ms：临时 Overlay 展开，Board 不移动。
- 鼠标移出临时 Overlay：自动收回。
- 临时展开时进入 Selection 或聚焦 Filter：自动固定展开并重排 Board。
- 临时展开时，顶部 Collapse 槽位改为 Pin Sidebar。
- 遵守 `prefers-reduced-motion`。

### Session Board 顶栏

- Workspace 保持有边界的上下文控件。
- Category 使用轻底色 active 状态。
- Category Options 紧跟 Category 列表。
- 右侧常驻 Search、Bin、More。
- Search resting 状态无边框、无底色、无高亮。
- Import、Export、Options 收入 More。
- Search 展开时占用 Category 区域，不改变顶栏高度。

### Session Card

- 采用 S1 Balanced Sections。
- Session note 上移到 title summary 内，紧跟 metadata。
- Note 保留 S1 的浅底、左侧强调线和紧凑样式。
- Title 采用 T1 Clean Two-line。
- 删除 Session 拖拽图标。
- Title、metadata、note 和空白非交互区域共同作为拖拽激活区。
- Restore、More 和编辑输入框不触发拖拽。

### Session Saved Tabs 选择态

- `selectionMode` 是独立状态，不由 `selectedIds.size > 0` 派生。
- Session More 中的 `Select Tabs` 进入该 Session 的选择态，初始为 `0 selected`。
- Header 原位替换为单行 Icon Toolbar：
  - Selected count。
  - Select / Unselect All Visible。
  - Restore Selected Links。
  - Copy Selected URLs。
  - Move Selected Tabs。
  - Delete Selected Items。
  - Exit Selection Mode。
- Restore / Copy 只作用于 selected Links；Notes 可选、可移动、可删除，但不可 Restore/Copy URL。
- Locked Session 禁用 Restore、Move、Delete，Copy 保持可用。
- Restore / Delete 成功后清空 selection，但保留 `0 selected` 选择态。
- Copy 保留 selection；Exit 清空 selection 并恢复普通 Header。
- Select All 只作用于 visible rows；隐藏 selection 保留。
- Manager 全局同时只允许一个 Selection Scope。进入另一个 Session 或 Open Tabs selection 时，退出并清空旧 scope。

### Workspace 创建与管理

- Workspace 新增持久化 `emoji` 字段；旧数据 normalize 到稳定 fallback。
- Workspace 菜单中的 emoji 和 title 分栏渲染，emoji 使用 16px icon 槽位，不拼入 title 文本。
- Current Workspace 只用背景高亮，不显示 check。
- Current row 尾部 Pencil 为 Edit Workspace；图形 14px，操作槽位 18px。
- New Workspace 使用 A Inline Favorites：
  - 16 个常用 emoji，8 列。
  - Custom 接受一个 emoji grapheme，支持 ZWJ / skin tone。
  - Name 使用 trim + NFC + case-insensitive duplicate 校验。
- Edit Workspace 完整复用创建弹窗，预填 name + emoji，一次原子保存；不存在独立 Rename、Change Emoji 或 inline editor。
- Manage Workspaces 使用 A Dense Rows：
  - 一个统一紧凑列表。
  - 整行 pointer drag，无可见 handle。
  - Keyboard 使用 Move Up / Move Down。
  - 行操作只有 Edit 和 Delete。
  - Delete 显示 Session / Category 数量；唯一 Workspace 不可删；包含 locked Session 时禁止删除。
- Workspace reorder 必须由新的 typed mutation 持久化，UI 不直接重写 canonical array。

### Category 管理

- Manage Categories 使用 A Unified Dense List，Built-in 与 Custom 共用一个 canonical order。
- Inbox、Saved、Archive 可排序，但不可改名、改色或删除。
- Custom Category 可 Edit / Delete。
- 顶部 Category tab 支持整块直接 pointer drag，5px 内仍是 navigation click；不显示 drag handle。
- Keyboard reorder 在 Manage Categories 中使用 Move Up / Move Down。
- 不再存在显式 Reorder Categories Mode。
- New / Edit Category 共用 name + color modal。
- 删除 Custom Category 时显示受影响 Session 数量并移动到 Inbox；包含 locked Session 时禁止删除。

### 菜单系统与命令归属

- 应用内菜单统一使用 B2 Dense Native：
  - Fine pointer 行高 29px。
  - Leading Lucide icon 16px。
  - Coarse pointer 至少 44px。
- C3 说明文案改成 item tooltip：pointer hover 约 550ms 后显示；keyboard focus 立即显示；tooltip 不接管 pointer。
- Global More：Import、Export、Options；Bin 保持直接入口。
- Workspace：Workspace 列表、New Workspace、Manage Workspaces；当前行 Pencil 打开 Edit。
- Category Options：Manage Categories、Add Category；不含 Reorder。
- Session：Add Link、Add Note、Edit Session Note、Move、Lock/Unlock、Copy Links、Select Tabs、Delete。
- Saved Tab：Add/Edit Note、Copy URL/Text、Delete。
- Open Tab：无应用内菜单。
- Danger 命令位于最后的独立组；Escape 关闭并恢复触发器焦点。

### Tab Hover Tooltip

- 使用深色原生 Tooltip 形态。
- Tooltip 显示在当前行上方，间距 6px。
- 上方空间不足时翻到下方。
- `pointer-events: none`，不能阻挡鼠标纵向移动切换行。
- 复用一个 Tooltip 实例，只更新内容和位置。
- 无 favicon、按钮、点击、双击或键盘交互。
- 只展示 title、domain、link、saved timestamp。
- Open Tab 不显示 saved timestamp。
- Title：12px / 16px，700，最多 2 行。
- Domain：10px / 14px，500；前方使用 CSS 绘制的 2px x 10px 竖线。
- Link：10px / 14px，400，最多 4 行。
- Saved timestamp：9px / 12px，500。

## Options

### Basic

- 使用 O2 Compact Stack。
- 内容宽度：680px。
- 删除 `Configure how TabBoard works`。
- 保留 authoritative save status；`Saved` 使用低权重文字，不使用绿色徽章。
- `Saving...`、错误状态和 Retry 保持真实、可访问。
- 新安装和 Reset to Defaults 的 toolbar 默认行为改为 Open Popup。
- 不迁移已有用户配置。

### Capture

- Switch 统一右对齐。
- Pinned 可保存、选择和拖拽，但保存和去重后源 Tab 保持打开。
- `Custom filter rules` 改为 `Exclude URL rules`。
- 帮助文案明确：匹配项不出现在 Open Tabs，也不可选择、拖拽或保存。
- Exclude 设置使用普通设置样式，不使用独立卡片。

### Advanced

- 使用 A2 扁平设置列表。
- 不为 Safety、Keyboard Shortcuts、Recovery 增加只有一个选项的二级 Section。
- 直接呈现：
  - Storage location。
  - Confirm before deleting saved items。
  - Keyboard shortcuts。
  - Reset settings。

Storage location 分成两层：

1. `Storage location` 和说明，右侧对应 `Use browser storage`。
2. Folder 信息和更新时间，右侧对应 `Change folder`。

文案：

- `Storage location`
- `Choose where TabBoard saves session data.`
- `Local folder name: <name>`
- `updated: HH:mm:ss`

正常状态：

- 不显示 Connected。
- 不显示 Reconnect。
- `Change folder` 用于重新选择或更换目录。
- `Use browser storage` 进入切回浏览器存储流程。

异常状态：

- Primary context 仍显示 configured Local Folder，不把自动 fallback 误表达成用户已切换配置。
- Inline warning 说明新写入当前临时保存到 browser storage。
- 提供 `Reconnect folder` 和 `Use browser storage`。
- File freshness 读取 `meta.json.updatedAt`；browser fallback 的更新时间不得覆盖最后成功文件更新时间。
- Fallback reason 和 folder identity 必须持久化，不能只依赖页面内 callback。

### 切回 Browser Storage

保留现有安全迁移能力；只有显式 `Use browser storage` 完成迁移后，configured target 才改为 Browser。自动 fallback 只改变 active backend，不改变 configured target。

## Popup

- 使用 P2 Compact Action Row。
- 删除顶部 Header 分隔线。
- Open Manager 和 Settings 只保留 Header 一组。
- 不显示 selected/total 比例。
- 不显示 Group 相关能力。
- Count 行和 Duplicate 行使用同一层级。
- `7 tabs` 和 `2 duplicate tabs` 使用 13px / 18px。
- Save 和 Remove 都是 Compact Action：32px 高、80px 宽。
- Save 按钮文案：`Save`。
- Count 下显示单行短文案：
  - `Save and close tabs`，或
  - `Save and keep tabs open`。
- 只有存在 pinned tabs 时才显示 pinned checkbox。
- Pinned 帮助文案位于 checkbox 下方，12px / 16px：
  - `Pinned tabs will be saved and stay open after capture.`
- 没有 pinned tabs 时，不保留空白区域；Save 行和 Duplicate 行上下并列。

## Drag And Drop

### 统一视觉模型

- Pointer / touch 拖拽不显示任何 resting drag icon。
- Workspace、Category、Session 和 Saved Tabs 是 reorder / move；Open Tabs 是 copy，不从 Chrome 源列表移除。
- Drag ghost 从 Pickup 到任何 target 保持相同内容、宽度和高度；不得在命中加号时缩小或切换模板。
- Drag ghost 使用半透明表面，保留可识别 title / domain，`pointer-events: none`。
- 所有场景 ghost 位于 New Session `+` 之上；加号通过半透明 ghost 保持可见。
- Session 轨道使用固定几何：
  - Desktop Session width：340px。
  - Gap：16px。
  - Session / slot 始终占满 Board 可用高度。
  - Compact 使用 `min(340px, available width)`，但同一 viewport 内保持固定。
- 拖拽开始时 source slot 就是 current target，Pickup 不改变可见顺序。
- 命中新 target 后，dragged object 占据该 slot，其他对象使用 180ms FLIP 实时让位。
- 离开普通 target 时保留最后有效 target 的短 hysteresis；Escape / Cancel 恢复原顺序。

### Existing Session 与 New Session

- Saved/Open Tabs 使用一个 payload；Existing 与 New 由当前命中的 target 决定，不是预选 drag mode。
- Existing Session：
  - 命中 `group-body` 或 `tab-before`。
  - Saved Tabs 产生 `move-tabs`。
  - Open Tabs 产生 `copy-open-tabs`。
- New Session：
  - 新增显式 `new-session-insert` target。
  - 仅 New Session `+` 拥有此 target。
  - 产生 `create-session`。
- `group-insert` 只用于 Session reorder；不得再让 Saved/Open Tabs 隐式创建 Session。
- `category-column` 只用于 Session 跨 Category move；不得再让 Saved/Open Tabs 隐式创建 Session。

### Gap Anchor

- 非空 Category 在以下位置显示 20px `+`：
  - 第一个 Session 之前。
  - 每两个 Session 之间。
  - 最后一个 Session 之后。
- `+` 的视觉框就是完整命中区，不扩大、不贯穿 Session 高度。
- 坐标属于固定 Session 轨道：
  - x 位于固定 gap 中心。
  - y 位于全高 Session slot 的 50%。
  - 内容高度、tab 数量和 Session 内滚动不得改变坐标。
- 命中 `+` 只切换 filled accent 激活态，并显示 `Release to create session`。
- Plus Active 不展开 slot、不重排、不创建。
- 在 active `+` 上松手后才提交 `create-session`。
- 离开 `+` 立即失活并隐藏提示；New Session `+` 不使用 12px target hysteresis。
- `Release to create session` 是 pointer-transparent drag-state tip；pointer 约 300ms 停留后显示，screen reader 立即通过 live region 宣布。
- `All Source Tabs`：如果 selected Saved Tabs 全部来自同一 Session，且数量等于该 Session 全部 tabs：
  - 隐藏全部 New Session `+`。
  - 不提供 New Session keyboard target。
  - 仍允许命中 Existing Session 并合并。
- Open Tabs 不使用上述全选抑制规则。

### 空 Category

- 使用 First Slot Center，不使用 Board Center。
- 第一个固定 Session slot 的完整线框是 New Session target；中心 20px `+` 只作为 affordance。
- Ghost 位于加号上方；整槽命中，不要求精确点加号。
- 激活后整槽切换 accent border / soft fill。
- `No sessions here yet` 原位替换为 `Release to create session`，不显示第二个 plus tooltip。
- 松手后 Session 在该 slot 原地展开，保持空间连续性。

### 横向自动滚动

- 使用 A Progressive Edge：
  - Board 左右各 48px edge zone。
  - 速度按 edge depth 从 3px/frame 增加到 12px/frame。
  - Pointer 和 ghost 保持 viewport 坐标不动，只有 Session track 滚动。
  - 每帧 scroll 后重新测量 Session slot 和 anchors。
- 只滚动 Session Board，不滚动页面、Sidebar 或 Session 内 tab list。
- Existing Session target 保留短 hysteresis，减少 remeasure 抖动。
- 精确 `+` target 不锁定；真实命中后立即暂停 auto-scroll，离开后恢复。
- 遵守 `prefers-reduced-motion`；降低位移动画，不关闭必要的 drag scrolling。

### 取消与键盘等价

- 使用 C Hybrid Commands，不依赖可见或隐藏的 drag-handle focus stop。
- Pointer / touch 继续使用对象表面直接拖拽。
- Workspace / Category：
  - Manage 页面使用 Move Up / Move Down。
- Session：
  - Reorder 使用 Before / After named commands。
  - 跨 Category 使用 target picker。
- Saved Tabs：
  - Selection Toolbar 的 Move 打开 target picker。
  - 可选择 Existing Session 或 eligible New Session position。
- Open Tabs：
  - Selection Toolbar 的 Save to 打开 target picker。
  - 可选择 Existing Session 或 New Session position。
- Target picker：
  - Arrow keys 改变 preview。
  - Enter / Space 提交。
  - Escape / Cancel 不改变数据或 selection。
  - Commit / Cancel 恢复焦点到移动对象；对象被移除时回到 surviving Session / list fallback。
  - Preview、Cancel、Commit 通过 `aria-live` 宣布。

## 产品和数据规则

### 删除 OpenTabInfo.active

- 从 TabBoard `OpenTabInfo` 协议中删除 `active`。
- 删除 parser 校验、相等比较、UI 字重、DnD 数据校验和测试 fixture 中的对应字段。
- Chrome 原始 `chrome.tabs.Tab.active` 只作为平台输入，不投影到 `OpenTabInfo`。
- Open Tabs UI 不表达 Active Tab。

### Pinned Tabs

- Pinned 在 shared capture policy 允许时可保存。
- Pinned 支持选择、拖拽、Save Selected 和 Save All。
- 即使 `closeTabsAfterSave` 开启，保存成功后 pinned 源 Tab 仍保持打开。
- Dedupe 清理也不得关闭 pinned duplicate 源 Tab。
- 用户显式 Close 仍然有效。

## 主题 Token

### Light A1

- Canvas：`#f3f5f8`
- Surface：`#ffffff`
- Sidebar：`#f8f9fb`
- Toolbar：`#fcfcfd`
- Text：`#202a3b`
- Secondary：`#5f6c80`
- Muted：`#7b8799`
- Accent：`#315ec9`
- Accent soft：`#eaf0fc`

### Dark D1

- Canvas：`#1a1e24`
- Sidebar：`#20252c`
- Toolbar：`#242930`
- Surface：`#282e36`
- Surface hover：`#303741`
- Border：`#3a424d`
- Strong border：`#444d59`
- Text：`#eef2f7`
- Secondary：`#c1c9d4`
- Muted：`#919cab`
- Accent：`#5a80dd`
- Accent soft：`#2b3a61`
- Accent text：`#b6c8fa`

## 性能和架构约束

- 保留 structural sharing 和稳定 store reference。
- Options Basic 继续使用轻量 settings projection。
- Advanced 关闭时不挂载 storage UI，首次展开再异步加载。
- 保留 authoritative save status 和 Retry。
- 不新增宽泛 selector，不 eager import file backend。
- 保留 stable slot activation 和 content-visibility；Session 列改为固定 340px 几何。
- 不恢复 Session Card A 拖到 Session Card B 的隐式 Session merge。
- Saved Tabs 明确命中 Existing Session 的 `move-tabs` 仍然允许，包括全选单一源 Session 后的显式合并。
- 持久化 schema 只做已确认的最小扩展：
  - Workspace 新增 `emoji`。
  - Workspace 增加 canonical order。
  - 删除 transient `OpenTabInfo.active` 不属于持久化 schema 变更。
- Workspace order 使用 typed mutation 和 structural sharing；不得由 UI 直接重写数组。
- 保留 DropIntent wire 结果类型；修改 UI-local `DropTarget` contract，新增 `new-session-insert` 并收紧 `group-insert/category-column` compatibility。

## 可访问性

- 所有 icon-only action 有 accessible name 和 tooltip。
- Focus ring 保持可见。
- Selection、disabled 和 danger 状态不只靠颜色表达。
- 折叠 rail 的操作保持键盘可达。
- 临时 preview 不获取焦点。
- Reduced motion 关闭 sidebar 宽度、透明度和位移动画。
- Coarse pointer 控件至少 44px。
- 精确 20px Gap Anchor 是 fine-pointer DnD target，不是普通点击控件；coarse pointer 通过 Hybrid Commands 完成 New Session 创建。
- 所有 pointer DnD 结果均有 named keyboard command 等价路径。

## 响应式行为

- Manager 在窄 viewport 继续保留 52px rail。
- Search 可独占顶部内容区，低频 Manager 操作保留在 More。
- Session column 使用 `min(340px, available board width)`，同一 viewport 内保持固定，不因内容变化。
- Fine pointer 使用 20px Gap Anchor；coarse pointer 不放大该精确 target，改用 Hybrid target picker。
- Options 在窄 viewport 堆叠 header 和 action rows。
- Popup 保持 320px 宽，紧凑操作行文案不换行。

## 验证要求

- 为行为变化补充 focused unit / DOM tests。
- 运行 build、check 和完整 Vitest。
- 在浏览器中检查 Manager、Options、Popup 的 light/dark。
- 测量 52px rail、Tooltip 6px gap、按钮/Icon 尺寸和文本 clamp。
- 手工验证 Session 同类/跨 Category DnD、Saved Tabs DnD、Selected Open Tabs DnD。
- 手工验证 start/between/end Gap Anchor、全选抑制、Empty Category first-slot target。
- 手工验证 48px edge auto-scroll、plus scroll pause、Existing target hysteresis。
- 手工验证 Hybrid target picker、Escape / Cancel、focus restoration 和 live announcements。
- 手工验证 Sidebar hover preview、Pin、Selection、Filter、Collapse 和 reduced motion。
- 验证 Pinned 可保存但保持打开。
- 验证 `OpenTabInfo` 不再包含 `active`。
