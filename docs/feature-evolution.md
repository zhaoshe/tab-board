# Feature Evolution

本文档记录 ZipTab 的功能变迁。目标是回答两个问题：

- 我们为什么从 A 变成 B？
- 以后看到某个功能时，能不能知道它服务过什么目标？

## 当前产品形态

ZipTab 是一个 local-first Chrome tab manager。它以 OneTab 的“快速收起和恢复 tabs”为基础，吸收 tabExtend 的 workspace、分类和工作台思路，但保持主流程更轻：

- 当前窗口一键保存为 session。
- 从当前窗口勾选多个 open tabs 创建 session。
- 通过 open tab 右键菜单筛选包含该 URL 的 saved sessions。
- 勾选 open tabs 只用于批量创建 session 或批量拖入已有 session。
- 拖动 open tab 到已有 session 中追加链接。
- saved sessions 支持分类、搜索、恢复、拖拽排序、inline rename、笔记、导入导出、回收站。

## 变迁时间线

### 2026-07-08: Board-first UI rework 和 capture cleanup

用户手动验收发现上一轮 manager-first 设计仍有明显问题：context strip 语义不清、inspector 价值低、Open Tabs 只显示 current window、select mode 跳动、DnD 落点不清、popup 缺少 dedupe/settings/delete/preview，Options 中特殊 URL 设置和界面设置也不清晰。

变化：

- Manager 改为 Board-first：顶部 toolbar + 左侧 Open Tabs/Categories + 右侧 session board。
- 移除 context strip 和常驻 inspector。
- Open Tabs 展示所有 windows，一次只展开一个 window。
- Select mode 只覆盖 window title 行，不改变 tab 列表布局。
- Session DnD 使用竖线插入反馈；拖回原位置不显示插入线；拖起 session 不消失。
- Popup 改为横排 Save/Open/Dedupe quick actions，并增加 Settings、recent session Delete、hover/focus tabs preview。
- Save 完成后 popup 关闭，manager 打开/聚焦、定位刚保存 session，并用浮层 toast 提示。
- Capture 默认按源 tabs URL 去重，清理 about:blank 和重复源 tabs。
- Options 用 exclude URL patterns 取代 chrome/file 单独开关，默认 `chrome://*`、`file://*`。
- Favicons 始终展示；危险操作始终确认；session toolbar 外露动作不再可配置。
- Popup、Manager、Options 统一使用 `src/icons.js` 图标和共享 control sizing tokens。

判断：

- Popup 只做 trigger surface，不做小 manager。
- Manager 的核心是 session board，不应该把解释性 UI 和低价值 inspector 放在主路径。
- Drag and drop 反馈必须降低误操作，优先清楚落点而不是提前重排。


### 2026-07-04: OneTab 复刻起点

初始目标是完整复刻 OneTab 的核心体验，让插件能直接安装到 Chrome 使用。

完成方向：

- 保存当前窗口、当前 tab、多种右键保存模式。
- session 列表、恢复、删除、锁定、导入导出、分享页。
- OneTab 文本导入。
- local-first 存储，不依赖后端。

保留的判断：

- OneTab 的价值在于“瞬间把混乱 tabs 收起来”，所以保存和恢复必须是第一优先级。
- 数据必须本地化，避免 tab 历史变成隐私风险。

### 2026-07-04: 左侧操作区收敛

早期 sidebar 中平铺了 Save window、Restore all、Import、Export、Options 等按钮，占用空间过大。

变化：

- 常用操作保留在外层。
- 低频操作收进二级 More 菜单。
- More 菜单在底部时改为向上弹出，避免用户还要继续滚动。

结果：

- 左侧导航更像工具台，不像设置页。
- 低频功能仍可达，但不压迫主工作流。

### 2026-07-05: tabExtend 方向探索

用户提出更喜欢 tabExtend 的 tab 管理方式，因此引入了更偏工作台的能力。

引入方向：

- Workspaces。
- Categories。
- Kanban/session grid。
- Open tabs sidebar。
- Notes / starred。

经验：

- tabExtend 的优点是“按工作流组织”，但如果照搬过多，会让 ZipTab 变重。
- ZipTab 后续要保持 OneTab 的轻量保存恢复，同时选择性吸收 tabExtend 的组织能力。

### 2026-07-06: 新标签页改为 ZipTab

增加 Chrome `chrome_url_overrides.newtab`，让新标签页直接进入 ZipTab。

目的：

- tab manager 不只是一个偶尔打开的扩展页，而是每次开新 tab 时的工作入口。
- 降低“保存以后找不到”的概率。

### 2026-07-06: Session UI 从列表改为更紧凑的工作台

原 session 列表基本占满屏幕，信息密度低。之后改为更接近 kanban/grid 的展示。

调整：

- 多列 session card。
- 每个 card 内限制 tab 预览数量。
- 标题和 URL 使用行数限制，减少高度失控。
- 支持展开和折叠全部。

结果：

- 大量 session 可以横向浏览。
- 牺牲了一部分完整内容可见性，换取扫描效率。

### 2026-07-06: Inline rename

原来只能从 session 的 More 菜单里 Rename，路径太深。

变化：

- 双击 session 标题可直接 inline rename。
- `Enter` 保存，`Esc` 取消，失焦保存。
- More > Rename 继续保留，复用同一套保存逻辑。

判断：

- 命名是整理 tabs 的高频动作，应该贴近标题本身。

### 2026-07-06: Quick list / Pinned workflow 下线

Quick list 来自 tabExtend 的 Pinned workflow 思路，但在 ZipTab 当前体验中不够清晰。

下线原因：

- 它和 saved sessions 的关系不直观。
- 用户很难理解“把 session 放进 pinned workflow”到底是复制、移动还是引用。
- 它占用了右侧屏幕空间，但收益不稳定。

处理方式：

- 移除右侧 Quick list 面板。
- 移除选择工具条里的 Quick list 操作。
- Popup 改成 Recent sessions。
- 旧 quickList 数据自动迁移成 `Former Quick list` 普通 session，避免数据丢失。

结论：

- 当前阶段不做独立 pinned workflow。
- 工作流组织先回到 sessions、categories、workspace 上。

### 2026-07-06: Open Tabs 面板重构

用户希望 Open Tabs 面板减少噪音，成为创建和筛选 session 的入口。

变化：

- 仅保留 Current window 的 Save 按钮。
- 移除每个 open tab 后面的单独 Save。
- Current window 右上角增加 select mode 按钮，默认不进入 select mode。
- 进入 select mode 后，每个 open tab 前才展示 checkbox。
- 选中多个 open tabs 后可以创建新 session。
- 选中多个 open tabs 后，从任一已选 tab 开始拖动会携带全部已选 tabs，可拖入已有 session 或拖到目标位置创建新 session。
- 右键 open tab 可以筛选右侧包含对应 URL 的 sessions。
- 支持拖动单个或已勾选的多个 open tabs 到已有 session。
- 批量工具条固定在 open tab 列表上方，滚动列表时仍可见。
- Chrome 内部页、扩展页、ZipTab 自身页面等不可可靠保存的 tabs 不在列表中展示。

判断：

- 单 tab 保存是低价值高噪音操作。
- 用户更常见的动作是“把一组当前上下文保存下来”或“找之前是否保存过这个 tab”。

当前状态：

- Open tab 多选创建 session 会走后台 `tab-ids` capture 模式。
- 拖动 open tab 到 session 是追加记录，不关闭浏览器里的 tab。

### 2026-07-06: Icon-first 操作按钮

随着 card/grid 视图变紧凑，文字按钮开始挤占标题和 URL 空间，尤其是 Restore、Open、More、Import from OneTab 等较长文本。

变化：

- 增加统一的 SVG icon set。
- 高频工具按钮改为固定尺寸 icon-only。
- Hover 或 keyboard focus 一段时间后显示 tooltip。
- 二级菜单和弹窗操作保留 icon + 短标签，避免纯图标降低可发现性。
- icon-only 按钮都保留 `aria-label`，用于键盘和读屏。

判断：

- Session card 的主要内容应该是标题、URL 和上下文，不应该被按钮文字抢占。
- 高频动作可以用图标表达，低频动作仍需要短文本帮助识别。
- tooltip 是补充说明，不承担主要点击路径。

### 2026-07-06: Categories 支持拖动排序

Categories 最初按固定顺序展示：All items、Unfiled、Starred，然后是自定义分类。用户希望把 Starred 等更常用的分类放到顶部。

变化：

- 系统分类和自定义分类都可以拖动排序。
- 分类顺序按 workspace 保存到 `categoryOrderByWorkspace`。
- 删除自定义分类后，旧排序 id 会在渲染时被忽略；新增分类会追加到当前排序末尾。
- 自定义分类的 Rename/Delete 移入右键菜单，列表表面只保留分类入口，减少拖动排序时的干扰。

判断：

- Categories 是个人工作流入口，顺序应该由用户决定。
- 排序是 workspace 级偏好，不应该影响其它 workspace。

### 2026-07-06: 特殊 URL 保存开关

用户希望避免把 `chrome://`、`file://` 这类链接混入普通 saved sessions。

变化：

- Options > Capture 增加 `Include chrome:// links`。
- Options > Capture 增加 `Include file:// links`。
- 两个开关默认关闭。
- Open Tabs 列表、保存当前窗口、右键保存等入口统一走同一套 capture 判断。

判断：

- `chrome://` 和 `file://` 不像普通网页，跨机器、跨权限、恢复成功率都不稳定。
- 如果用户确实需要保存这些链接，应该显式打开对应开关。

### 2026-07-06: Categories 从筛选器改为目录导航

用户希望右侧 saved sessions 区域按照左侧 Categories 的顺序展示所有分类，并且点击左侧分类时滚动到对应区域，而不是硬切成单一分类。

变化：

- 右侧内容按 `categoryOrderByWorkspace` 渲染所有 category section。
- 每个 category section 有独立标题和 session/link 计数。
- category title 在滚动经过该分类时吸顶，帮助用户判断当前位置。
- 点击左侧 category 只更新高亮并平滑滚动到对应 section。
- Search 和 open tab 右键筛选仍然作为全局过滤条件生效。

判断：

- Categories 更像信息目录，而不是互斥过滤器。
- 对大量 saved sessions 来说，滚动定位比硬切更利于保持空间记忆。
- 保留全局 Search / tab filter，可以继续处理“只看匹配项”的明确筛选需求。

### 2026-07-06: Saved sessions 顶部标题精简

右侧顶部原来同时显示 `Saved sessions` 和 `Personal / Category` 路径。改成目录导航后，当前位置已经由下面的 category title 承担。

变化：

- 顶部只保留 `Saved sessions` 标题。
- 顶部 header 永远吸顶。
- category title 吸顶位置下移到 Saved sessions header 之下。
- 后续该静态标题被 Workspace 控制区替代，见“Workspace 控制移到顶部”。

判断：

- 顶部路径会和 category section title 重复。
- 固定的 Saved sessions 标题提供稳定页面锚点，具体位置由滚动中的 category title 表达。

### 2026-07-06: Category 改为 session 的单一归属

用户明确希望每个 session 最多只有一个 category。`All items` 不再作为独立 category 展示；Starred 是内置 category。

变化：

- 移除 `All items` category。
- `Unfiled` 改名为 `Inbox`，表示没有 category 的 session。
- Starred session 会清空普通 category。
- 将 session 移动到 Inbox 或自定义 category 时，会取消 Starred。
- 将 session 拖动到 Starred category 时，会设置为 Starred。
- 右侧每个 session 只出现在一个 category section 中。

判断：

- `Inbox` 比 `Unfiled` 更像默认收纳入口，减少“未整理”的负面语感。
- Starred 被视为高优先级内置 category，而不是叠加状态。
- 单一归属能避免 All items / Starred / 自定义 category 同屏重复 session。

### 2026-07-06: 折叠控制改为三层状态按钮

用户希望 Saved sessions、category 和 session 三个层级都能直接折叠/展开，并且按钮状态随当前内容状态变化。

变化：

- Saved sessions 顶部从两个固定按钮改为一个动态按钮。
- 全部 session 都折叠时，顶部按钮点击后展开全部；否则点击后折叠全部。
- 每个 category title 左侧增加同样规则的折叠/展开按钮。
- 每个 session header 增加一级折叠/展开按钮，移除 More 菜单里的重复入口。

判断：

- “按钮表示下一次点击动作”比同时展示折叠/展开两个按钮更省空间。
- category 级按钮让用户能快速整理大块内容，而不用先滚动到每个 session。

### 2026-07-06: Session 外露动作可配置

用户希望 session card 上的动作尽量和 title 在同一层，同时能够自行决定哪些动作外露、外露顺序如何。

变化：

- Session header 改为 title 左侧、quick actions 右侧的同层布局。
- Options > Interface 增加 Session toolbar 设置。
- 用户可以勾选哪些 session actions 外露，并用上下按钮调整顺序。
- 未外露的动作仍按同一顺序放入 More 菜单。
- Saved sessions/category 的批量 collapse/expand 是结构控制，固定放在对应 title 左边；session 自身的 collapse 仍按 session toolbar 设置展示。

判断：

- 不同用户对高频动作的定义不同，不应该把 Restore/Add/More 固定死。
- More 继续作为兜底，避免配置外露动作后丢失低频功能。

### 2026-07-06: 移除 saved tab 级 Star/Todo 动作

用户指出 tab 菜单里的 Star 和 Todo 含义不清。

变化：

- 单个 saved tab 的 More 菜单不再展示 Star/Todo。
- 批量选择栏不再展示 Star selected tabs / Toggle selected tasks。
- 当时仍保留 Add todo 创建文本待办项的能力，后续在 session 级入口里继续收敛。

判断：

- Starred 已经是 session 级内置 category，tab 级 Star 会造成层级混淆。
- Todo 作为 tab 状态不如显式 todo item 清晰，先从主流程移除。

### 2026-07-06: 移除 session 级 Todo item

用户追问 session 上新增 Todo 的含义后，确认当前 Todo 既不是 session 状态，也没有完整待办闭环，容易干扰 tab/session 管理主线。

变化：

- Add 菜单只保留 Link 和 Note。
- 旧数据里的 `itemType: "todo"` 在 normalize 时按 Note 展示，保留文本内容但不继续暴露 Todo 状态。
- 搜索、统计、导出和 README 不再把 Todo 作为当前能力宣传。

判断：

- ZipTab 当前阶段优先做好 tab/session 管理，避免引入半套任务管理模型。
- 需要文本补充时，Note 已经覆盖主要需求；Todo 若未来回归，应该作为完整 workflow 重新设计。

### 2026-07-06: Session More 菜单收敛

用户指出 session More 菜单里的 category 下拉框、Share、Star/Unstar、Export 让菜单过重。

变化：

- Category 下拉框从 session 菜单和外露动作配置中移除，分类只通过拖拽修改。
- Share、Star/Unstar、Export 从单个 session action 中移除。
- Options 的 Session toolbar 配置同步移除这些动作，旧设置会在 normalize 时自动过滤。
- 保留 Lock/Unlock，因为它控制“restore 后是否保留该 session”，用于固定模板和常用工作流。

判断：

- Starred 已经是 category，不应该再通过菜单按钮表达为额外状态。
- 单个 session 的 Share/Export 属于低频分发能力，当前不应占据 session 菜单。
- Lock 有明确数据保护语义，比普通管理动作更值得保留。

### 2026-07-06: Workspace 控制移到顶部

用户希望 workspace 放到原 Saved sessions 顶部标题的位置，不再占用左侧 sidebar 空间。

变化：

- 顶部 sticky header 从 `Saved sessions` 文案改为 Workspace 控制区。
- 保留 workspace title/switch、新建 workspace、rename workspace。
- 保留 Saved sessions 级别的折叠/展开全部 session 按钮，并放在 workspace title 左侧。
- 左侧 sidebar 删除原 workspace 区块，让 Search / Open tabs / Categories 更靠上。

判断：

- Workspace 是当前页面的最高层上下文，比静态的 Saved sessions 标题更适合放在顶部锚点。
- 左侧 sidebar 应优先承载当前窗口 tabs 和 categories，减少重复导航层级。

### 2026-07-06: 移除 starred session 卡片侧边强调

Starred 已经是一个内置 category，用户认为 session card 上的金色侧边重复表达。

变化：

- starred session card 不再显示额外的左侧强调边。
- Starred 状态仍通过 category 归属和 session meta 展示。

判断：

- 同一个状态只保留一个主要视觉载体，减少列表噪音。
- Category 本身已经提供足够的分组语义。

### 2026-07-06: Session 内选择模式

用户希望 saved tab 的选择能力不要常驻在列表左侧，而是从 More 菜单触发，并在当前 session 内完成批量操作。

变化：

- 单个 saved tab 的 More 菜单新增 Select。
- 点击 Select 后，仅当前 session 进入选择模式，所有 tab/link 左侧展示 checkbox，触发项会直接被选中。
- 当前 session header 被批量操作栏覆盖，提供 Restore、Copy URL、Delete、Close selection。
- 批量操作栏只保留 selected 计数和操作按钮，不展示辅助说明文案，避免窄卡片里挤压计数。
- 移除旧的全局 selection bar。
- 删除无 favicon 时的灰色圆角 fallback，占位不再作为视觉元素出现。

判断：

- 选择是低频批量操作，不应默认占用每一行的扫描空间。
- 批量操作栏限定在 session 内，比全局选择栏更符合用户的局部操作心智。

### 2026-07-06: Saved tab 菜单入口收敛

用户希望移除 saved tab 行右侧的独立 Open 和 More 按钮，仅保留右键菜单。

变化：

- saved tab 行不再显示独立 Open icon 和 More icon。
- 保留点击 tab title 打开链接。
- 右键 saved tab/link 会打开上下文菜单。
- 右键菜单提供 tab 级动作：Select、Note/Edit、Copy、Delete。

判断：

- Open 是高频但已经由链接本身承载，独立按钮重复占空间。
- tab 行表面只保留内容和必要状态，低频动作收进右键菜单。

### 2026-07-06: Tab 拖拽生成新 session

用户希望每个 saved tab item 都可以按住拖动，并且多选后也可以批量拖动。

变化：

- saved tab item 允许从标题/link 区域直接拖动。
- 进入 session 选择模式后，拖动任一已选 tab 会携带当前 session 中的全部已选 tab。
- 拖动一个或多个 tab 时，目标位置会插入 New session placeholder，松手后就在该位置新增 session。
- 拖动一个或多个 tab 到已有 session 本体时，默认加入该 session，不显示 New session placeholder。
- 拖动一个或多个 tab 到已有 session 内部 item 时，用上/下插入线表达最终位置，不再高亮整行。
- New session 不再作为每个 category 尾部的常驻卡片展示，只在拖拽时作为占位出现，避免与拖拽 placeholder 同时出现。
- 多选 saved tabs 也可以拖到已有 session 中，按源 session 内顺序追加或插入。
- 拖动 session 时，目标位置会插入 Move here placeholder，松手后 session 就出现在该位置。
- 拖动 session 一开始就在原位置插入 Move here placeholder，未计算出新目标时默认保持起始位置。
- 拖动 session 时使用独立拖拽影像跟随鼠标，Move here placeholder 接管原卡片布局位置；鼠标经过 Move here placeholder 时不重新计算位置，减少拖拽抖动。
- session 本体不再作为“合并到另一个 session”的 drop 结果，只用于计算 Move here placeholder 的前后位置，避免把 A 拖进 B 的误操作。
- session dragstart 会立即把 Move here placeholder 种在源 session 原位置，避免第一次 dragover 命中 category 空白区时把 placeholder 放到列表尾部。
- session 拖拽影像使用源卡片原位置的可见 clone 生成，避免浏览器无法截取视口外 drag image 时出现“一拖就消失”。
- 通过 Current window 或插件图标捕获创建的 session 仍出现在当前 workspace 头部。

判断：

- 拖拽是更高频的创建方式，常驻 New session 会与拖拽 placeholder 同时出现，反而增加判断成本。
- 捕获创建代表“刚刚保存的当前上下文”，放在头部；拖拽整理要尊重用户手势，按占位位置插入。

### 2026-07-07: 搜索框移入 workspace 顶栏

用户希望将左侧 sidebar 的搜索框移动到 workspace 顶部空白区域。

变化：

- 全局搜索输入框从 sidebar 移到 workspace header 右侧。
- 搜索 label 改为视觉隐藏，输入框使用 placeholder，避免撑高顶栏。
- 窄屏下搜索框换行占满 header 宽度，避免挤压 workspace 切换控件。

判断：

- 左侧 sidebar 的核心任务是 open tabs 和 categories，搜索放在主内容顶栏更接近 saved sessions 的过滤结果。
- 搜索框继续复用原 `#searchInput`，保留 `/` 快捷键聚焦和现有过滤逻辑。

### 2026-07-07: Sidebar 底部动作展开

用户希望底部 More 菜单不再折叠，并移除不常用或重复入口。

变化：

- 底部动作区改为常驻展开按钮。
- 仅保留 Bin、Import、Export、Options。
- 移除单独的 Import from OneTab 入口；普通 Import 默认支持 OneTab 导出文本。
- 调换 sidebar 中 Import 和 Export 的图标方向：Import 使用进入/向下图标，Export 使用出去/向上图标。

判断：

- Search 已移入 workspace 顶栏，Restore all 不再适合占用 sidebar 常驻底部动作。
- OneTab 只是导入格式之一，能力应并入 Import，而不是作为独立产品入口。

### 2026-07-07: Manager-first extension UI redesign

使用 `chrome-extension-ui` 规则审查后，确认 ZipTab 的主价值不在 popup 里完成管理，而是在 new tab manager 中稳定整理和恢复 sessions。

变化：

- Popup 收敛为快动作入口：Save window、Open workspace、recent sessions restore。
- Popup recent sessions 最多展示 5 条，不再像缩小版 manager。
- Manager 顶部强化为 command bar，并新增 workspace/category/search/open-tab-filter 的 context strip。
- Manager 增加右侧 inspector，展示 focused session 的 metadata、note 和编辑入口。
- Session card 默认只保留 Restore 作为主要直接动作，其余管理动作进入 More 或 inspector。
- Options 分为 Basic 和 Advanced，日常设置和高风险/低频设置分层展示。
- 反馈文案抽到 `src/feedback-copy.js`，focus-visible 和 empty state 样式统一。

判断：

- Chrome popup 的尺寸和 auto-close 行为不适合承载重管理流程。
- Manager/new tab 才是重复使用的工作台，应承担搜索、编辑、整理和恢复。
- Popup 功能变少是有意取舍，换取更清楚的一眼可用入口。

## 待观察问题

- 右键菜单触发筛选是否足够容易被发现。
- 批量拖动已勾选 open tabs 到已有 session 是否需要更明显的拖拽提示。
- 拖动 open tab 到 session 是否需要视觉提示说明是 copy 而不是 move。
- Quick list 下线后，是否还需要更轻量的“临时工作区”概念。
- Kanban/grid 在 session 数量很大时是否需要虚拟列表或分页。
- icon-only 动作在新用户第一次使用时是否足够清晰。
- `Inbox` 是否比 `Unfiled` 更符合用户对“没有 category”的直觉。
- Session toolbar 如果外露动作过多，是否需要按 card 宽度自动收纳。
