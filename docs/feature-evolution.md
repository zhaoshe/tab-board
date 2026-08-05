# Feature Evolution

本文档记录 TabBoard 的功能变迁。目标是回答两个问题：

- 我们为什么从 A 变成 B？
- 以后看到某个功能时，能不能知道它服务过什么目标？

## 当前产品形态

TabBoard 是一个 local-first Chrome tab manager。它以 OneTab 的"快速收起和恢复 tabs"为基础，吸收 tabExtend 的 workspace、分类和工作台思路，但保持主流程更轻：

- 当前选中的 browser window 一键保存为 session。
- 从单一 Open Tabs 列表勾选多个有 URL 的 tabs 创建 session。
- 通过有 URL open tab 的右键菜单筛选包含该 URL 的 saved sessions。
- 用 sidebar footer Filter tabs 只过滤当前 selected browser window 的单一 Open Tabs 列表。
- Open Tabs 保留 selected normal window 的非 extension tab rows；pinned、Chrome 和 file URLs 可正常多选和保存，自定义 URL 过滤规则与 extension pages 直接隐藏。
- Open/saved selection scope 与 selected IDs 分离；提交成功后可保留 `0 selected` mode，显式 Exit 或 scope replacement 才退出。
- 拖动 open tab 到已有 session 中追加链接，或精确命中 Gap Anchor 创建新 Session。
- saved sessions 支持三档内置分类（Inbox/Saved/Archive）+ 自定义分类、搜索、恢复、拖拽排序、inline rename、笔记、导入导出、回收站。
- Session card 展示 note；tab hover 使用不可交互 tooltip，编辑与次级动作由独立菜单/弹窗承载。

## 变迁时间线

### 2026-08-05: Popup 静态首帧与并行轻量启动

问题：

- Chrome 窗口中 Tab 较多时，点击工具栏图标后 Popup 长时间没有可见反馈。
- `popup.html` 在 React 执行前没有内容和稳定高度；Popup 为读取少量设置却先加载完整 Zustand/Storage Authority 并读取 canonical state，随后才查询当前窗口 Tab。
- 生产对照中，150 个稳定 Tab 的 `chrome.tabs.query()` 只需约 5–7ms；2.30MB canonical state 会在查询开始前额外增加约 59ms。

变化：

- `popup.html` 增加 320×180、明暗主题兼容且不可交互的静态 loading shell，应用 JavaScript 执行前即可绘制。
- 新增只读 `usePopupSettings()`，正常路径只读 `tabboardSettingsProjection`；缺失或损坏时才动态加载 canonical repair。
- settings projection 与 current-window Tab query 并行启动，并在 Strict Mode replay 中复用同一在途请求。
- 设置或 Tab 查询失败后不再永久停在 loading：分别使用默认设置或 0 tabs 渲染并展示错误。
- 生产 `check` 和 startup benchmark 固化静态首帧、禁止完整 Store/Authority preload、零 canonical read、单次 projection/Tab query 和并行时序。

判断：

- 当前窗口 Tab 数不是应用侧主要瓶颈，不引入 Service Worker 快照缓存或 Tab 事件同步。
- 绝对启动耗时受 Chrome 冷启动和机器状态影响；稳定门禁使用调用次数、依赖边界和并行区间。

当前状态：Current。

### 2026-08-03: Open Tab 拖拽命中与 Popup P2 Checkbox 修复

问题：

- Open Tab title/link 由一个可点击 Focus button 承载，但 row 的 drag exclusion 把所有 button 和 `data-no-drag` 都排除，导致用户只能从狭窄空白处起拖。
- Popup parity 测试只测量 Mantine Checkbox wrapper 为 16px；真正绘制背景的 native input 仍是 20px，因此实页出现比已确认 P2 更大的实心蓝色 checkbox。可见 label 也从预览的 `N pinned` 漂移为较长的 `Include N pinned tabs`。

变化：

- Open Tab drag exclusion 只屏蔽 checkbox、X、link/input 等真实操作控件；`.manager-open-tab-content` title/link button 继续支持 click `Go to <tab title>`，同时整块 copy 可起 pointer/touch drag。
- Popup Checkbox 通过 Mantine `--checkbox-size` 和 input owner 固定为 16px / 4px radius，check glyph 保持居中。
- Popup 可见 label 恢复 `N pinned`；完整 `Include N pinned tab(s)` 保留为 checkbox accessible name。

当前状态：Current。

### 2026-08-03: Manager 根视口移除纵向回弹

Manager shell 虽已固定为 `100dvh` 并隐藏自身溢出，但 `html / body / #root` 仍使用浏览器默认滚动行为。页面底部的无障碍 live region 会让 document 多出 1px 高度，因此 macOS 上即使没有可用滚动内容，仍能触发最外层纵向 overscroll 回弹。

变化：

- Manager 的 `html / body / #root` 固定为满高并隐藏文档级溢出。
- `html / body` 使用 `overscroll-behavior: none`，阻断根滚动链和回弹。
- Board 横向滚动、Open Tabs 与 Session tabs 纵向滚动继续由原有内部容器承担。

当前状态：Current。

### 2026-08-03: 本地文件模式固定 Session 顺序

本地文件模式原先只把每个 Session 拆成 `sessions/<id>.json`，重新加载时直接采用文件系统目录枚举顺序。原子替换任一 Session 文件会改变部分文件系统中的枚举位置，因此新增 Session 或增删 Session 内 Tab 后，Manager 中的 Session 可能突然换位。

变化：

- `meta.json` 新增 `sessionOrder`，保存 canonical `groups` ID 顺序。
- 读取独立 Session 文件后按 `sessionOrder` 组装 state，目录枚举顺序不再影响 UI。
- 旧 `meta.json` 缺少该字段时继续兼容读取，并在下一次成功 File commit 时自动回填。

当前状态：Current。

### 2026-08-02: Sidebar C1 motion parity repair

问题：

- Sidebar 的 `collapsed / peek / pinned / drawer` 状态机已实现，但生产 CSS 只声明
  `opacity / transform` transition；实际变化的是 sidebar width 与 shell
  `grid-template-columns`，所以展开/收起仍是一帧瞬切。
- 旧 layout test 还明确禁止 width/grid transition，覆盖了后来用户已经确认的 C1
  Hybrid Rail preview。
- Open Tab copy、context bar 和 Filter 使用条件卸载或 `display:none`，无法执行预览中
  75ms 延迟后的 80ms 淡入/淡出。

变化：

- Pinned 展开/收起恢复 `180ms cubic-bezier(.2,.8,.2,1)` shell track + sidebar
  width transition；Peek/Drawer 只动画 overlay width 与 shadow，Board 保持 52px
  offset。
- Expanded-only 内容改为常驻但 collapsed 时 disabled / inert / `aria-hidden` /
  `tabIndex=-1`，由共享 owner 延迟 75ms 后淡入；Expand 与 expanded context bar
  在同一稳定 36px slot 交接。
- Desktop Open Tab identity 使用稳定 43px slot，展开/收起过程中 favicon 和当前
  Window glyph 的中心漂移不超过 1px。Drawer 使用独立 44px owner 与 8px gaps。
- Sidebar overlay 改用 `overflow:clip`，不再被 `scrollIntoView()` 当成横向 scroll
  owner；真正的 Window switcher 继续独立滚动。
- 新增真实浏览器中间帧、Peek、快速反向、Drawer、focus restore 与 reduced-motion
  回归，不再只检查最终 class/offset。

判断：

- 本产品明确选择 C1 Hybrid Rail，width/grid transition 是经过预览确认的必要布局
  动画，不能被“所有动画只用 compositor 属性”的通用建议覆盖。
- Motion 验收必须包含时间轴与可中断性；只看终点截图无法证明动画存在。

### 2026-08-02: Compound-control geometry repair

问题：

- 真实 unpacked extension 中，Workspace 默认 `🗂️` emoji 与 `Personal` 名称发生
  视觉重叠。源码虽然把它们拆成 span，但 Mantine 实际把 emoji、name 和 chevron
  包在同一个 label 中；4px gap 错加在 label 外层，三个子元素实测均为 0px 间距。
- 同类检查发现 Category label/count 和 Session metadata icon/copy 也缺少实际
  owning gap。390px topbar 还把 selected `Saved` Category 裁到视区外。
- 之前的页面截图、axe 和父容器 overflow 检查没有验证相邻可见槽位，因此
  “页面 fixture 通过”被错误扩张成“所有 UI 组合通过”。

变化：

- Workspace trigger 改为独立 left emoji / label / right chevron slots；desktop
  间距为 6px / 4px，compact 隐藏整个 label/right section 并让 emoji 在 44px
  target 内居中。Workspace menu、Manage row 和 Editor preview 使用 20px/24px
  emoji slot 与明确 gap。
- Category label/count 的 gap 移到真实 `.mantine-Button-label` owner；Session
  metadata item 使用 `inline-flex` + 4px gap。
- Compact Category strip 收回 Category Options 的桌面 margin，压缩内部 padding/gap
  但保留 count；`CategoryNav` 在 active Category 或容器尺寸变化时自动恢复
  active item 的可见位置。
- 新增真实浏览器几何回归，覆盖 `👩🏽‍💻` ZWJ emoji、超长 Workspace 名称、
  desktop/390px、Category count 与 Session metadata。

判断：

- Emoji 不是与同尺寸 Lucide SVG 等价的固定墨迹；颜色字体可能越过 advance box，
  必须分配独立 slot 和保守 gap。
- UI 验收分为 page/state matrix 与 compound-control geometry matrix。只有前者
  通过时，不能再声称所有图标、文本、计数和 trailing action 组合都已验收。

### 2026-08-02: Preview-to-production UI parity repair

问题：

- Unpacked extension 的最终实现虽然通过自动化，但 Open Tabs context actions
  继承 Mantine filled primary，Session card 被旧 taste test 强制为无阴影，
  Restore/More 在 resting 态以 0.45 半显；这些都与已经确认的 Crisp Utility
  preview 不一致。
- 同类偏差还出现在 collapsed Expand、Session/Open selection toolbar、Session
  title/note、Category active underline 与 Open/Saved trailing X。

变化：

- `AccessibleIconAction` 默认改为 neutral `subtle`，调用方只有显式需要时才使用
  selected/danger/filled。Collapsed Expand、Open/Session selection toolbar
  因此不再显示 cobalt 实心方块。
- Session Header 的 Restore/More 从 raw 22px Mantine ActionIcon 迁移到共享
  32px Lucide action。Fine pointer resting 为隐藏且不接管 pointer，
  header hover/focus 与 menu-open 显示；coarse pointer 保持直接可见。
- Session 恢复 preview 的轻 elevation：A1 使用 `0 1px 3px / 7%`，
  D1 使用 `0 1px 3px / 28%`。普通 group slot 在 full-height target 内保留
  3px/5px breathing inset；Empty Category 创建 target 继续通高。
- T1 title 最多 2 行；S1 group note 使用 accent-soft fill、2px 左侧 accent
  rule 和紧凑 padding。Category active 移除多余 underline，只保留 quiet fill。
- Open/Saved trailing X 统一为 32px neutral/danger action；selection mode
  常显 checkbox，但 fine-pointer X 仍只在 row hover/focus 时出现。Drawer/narrow
  继续使用 44px target 与 8px gap。

判断：

- 已确认的 Visual Companion preview 与双语 Crisp Utility spec 是视觉 source of
  truth；更早 taste 阶段的“完全无 elevation”不能覆盖后续明确选择。
- Progressive disclosure 不能依赖半透明常显，也不能通过 `visibility:hidden`
  破坏 keyboard path；pointer 与 focus/menu-open 状态分别受 owner 控制。
- Empty full-slot 是 DnD target geometry，普通 card inset 是 visual geometry；
  两者必须分开建模和测试。

当前状态：Current。Supersedes 2026-07-28 “Session card 移除 resting shadow”
的材质子决策；其 border/highlight、stable slot 与 DnD ownership 继续有效。

### 2026-08-03: Crisp Utility Options、Popup、Icon 与主题系统收口

问题：

- Options 的 configured Local Folder 与实际 active backend 混为一个“当前模式”，自动 fallback 看起来像用户主动切回 Browser；folder identity、reason 和最后一次 File freshness 只存在运行时或被 Browser timestamp 覆盖。
- Popup 仍显示 selected/total 比例和 Chrome Group control，Save/Remove 几何与最终 P2 预览不一致；capture/dedupe 自动关闭也可能影响 pinned source tabs。
- 生产同时保留 Tabler 与 Lucide，Nord/Mantine blue 仍分散在各 surface，无法保证 A1 Light / D1 Graphite、1.75 stroke、32/44px action geometry 一致。
- Advanced 中 Safety/Keyboard/Recovery 每层只有一个选项，层级多于信息。

变化：

- `tabboardStorageConfig` 升级为持久化 `StorageStatusProjection`，分离
  `configuredTarget` 与 `activeBackend`，并保存 `folderName`、
  `fallbackReason`、`fileUpdatedAt`。File commit 从 `meta.json.updatedAt`
  发布 freshness；Options 只读/订阅该轻量投影，DirectoryHandle 继续只存
  IndexedDB。
- Fallback 保留 configured Local Folder 主语义，显示 folder name、最后 File
  更新时间、原因、Reconnect 和显式 Use browser storage；只有安全 switch-back
  完成后 configured target 才变为 Browser。
- 新安装/Reset 的 toolbar action 默认 Open Popup；显式历史 `store` 不迁移。
  Advanced 改为 Storage location、删除确认、Keyboard shortcuts、Reset settings
  四个直接 A2 rows，保持 lazy chunk 与 lightweight Basic projection。
- Popup 改为 P2 compact action rows：固定 Save、setting-aware helper、仅在存在
  pinned 时显示一次性 scope/helper，不再显示 Group 或 selected/total。
  Save/Remove 均为中性80×32 actions；duplicate count只包含实际可关闭的
  non-pinned tabs。
- Service worker在capture close与window dedupe两条路径都过滤pinned。
  Pinned tab可保存但永不自动关闭；同URL有pinned copy时只移除regular copies。
- 19个production icon owners全部迁移到`lucide-react`，移除
  `@tabler/icons-react`。Restore使用`SquareArrowOutUpRight`，Save使用`Inbox`；
  `TabBoardIcon`/`AccessibleIconAction`统一1.75 stroke和32/44px geometry。
- Shared CSS bridge精确落地A1 Light与D1 Graphite semantic tokens。Manager
  Canvas/Sidebar/Toolbar/Surface分层，resting Search/Save/Restore保持中性；
  selected、highlight和DnD target使用semantic cobalt。

判断：

- 配置目标与当前writer是两个独立事实；可靠恢复必须让UI展示两者，而不是从
  authority是否为File临时推断。
- Popup是短时动作面，只需要表达本次capture scope和可关闭结果；Chrome Group
  metadata可继续保存，不需要暴露额外筛选层。
- 一个icon family和一套semantic tokens比逐组件指定颜色/尺寸更能守住全局一致性，
  也减少bundle解析成本。

当前状态：Current。Supersedes 2026-07-20 Popup grouped scope、旧
`{mode}` bootstrap展示、Tabler/Nord生产icon/theme ownership和单项Advanced
section层级。

### 2026-08-02: Crisp Utility DnD 与 Hybrid Commands 收口

问题：

- Session 的独立 drag handle 与 KeyboardSensor 虽提供 direct keyboard drag，
  但增加 resting icon、额外 focus stop，并让 title/metadata/note/空白的
  pointer/touch surface 语义不一致。
- Saved/Open tabs 创建新 Session 曾缺少明确、稳定的 start / between / end
  目标；空 Category、All Source Tabs、drag ghost、auto-scroll 与 source
  replacement 也没有一套完整验收矩阵。
- dnd-kit 默认 auto-scroll、scroll-compensated delta 与 Board 横向滚动会形成
  多 owner；精确 `+` 与普通 target hysteresis 混用时容易产生黏滞或误创建。

变化：

- `useManagerDndSensors()` 只保留 Pointer 5px 与 Touch 200ms/5px。各 surface
  明确拆分 pointer/touch event path，避免触摸被 PointerSensor 抢先；不再注册
  KeyboardSensor，不保留可见或隐藏 drag activator。
- Session title、metadata、只读 note、card/shell 空白成为 pointer/touch
  activator；Restore、More、编辑控件、selection toolbar 与 tab list不启动
  Session drag。Open/Saved rows 与 Category tab同样只在非交互 surface起拖。
- Session keyboard结果改由C Hybrid Commands提供：Manage Workspace/Category
  使用Move Up/Down，Session使用named Before/After + cross-category picker，
  Saved Move与Open Save to共用Existing/New Session picker。
- Saved/Open tabs拖动时按当前Category稳定渲染start / between / end 20x20px
  Gap Anchors；只有精确命中并松手才创建。Plus active不展开slot，离开立即失活，
  300ms pointer tip与live announcement分开处理。
- Empty Category使用完整第一条340px Session slot作为target；All Source Saved
  Tabs同时抑制pointer anchors和keyboard New choices，但仍允许Existing merge。
- Drag start快照item preview与bounded geometry；pickup、Existing、plus、empty
  target间不更换模板或尺寸。Ghost半透明、pointer-transparent并位于所有plus上层。
- Board-owned RAF auto-scroll取代dnd-kit默认owner：左右48px edge、3–12px/frame，
  每帧remeasure；精确plus active暂停，离开后imperative wake恢复。Reduced motion
  关闭非必要动画但保留必要滚动。
- Serial Chromium验收补齐Workspace row、topbar/Manage Category、Session
  same/cross-category、Saved same/existing/new/all-source、Open existing/new、
  start/between/end、empty Category、source replacement与reduced-motion paths。

判断：

- Keyboard可达性的目标是“每个pointer结果都有清楚的named command”，不是保留一个
  visually-hidden drag handle。命令式picker更容易宣布目的地、取消并恢复focus。
- New Session必须通过精确、显式的Gap Anchor或picker choice触发；不使用持久
  New Session card，也不把全选一个源Session误解释为拆出新Session。
- Board scroll、collision remeasure与native pointer coordinate必须各有单一owner。

当前状态：Current。Supersedes 2026-07-21 Session keyboard drag handle /
KeyboardSensor方案；persistent `DropIntent` wire kinds与storage schema未改变。

### 2026-08-01: Manager Sidebar 四态与 Crisp Utility Material 收口

问题：

- 旧 sidebar 由 `collapsed + overlayOpen + CSS :hover` 混合驱动，desktop preview、pinned layout 与 compact drawer 无法清楚区分，selection/preview 还会形成额外视觉旁路。
- 54/62px rail、`Window N`、Refresh、colored Save、Trash copy 与第二个 compact toggle 偏离 Crisp Utility spec；collapsed controls 还有视觉隐藏但可聚焦的风险。

变化：

- `useSidebarDisclosure()` 成为 `collapsed / peek / pinned / drawer` 单一状态 owner。Desktop rail 固定 52px；pointer/focus intent 共享约 350ms dwell，任一 intent 保持时 peek 不收回且 board 不移动。Focus 转到 centered Expand 会取消 pending dwell。
- Explicit Expand/Pin 持久化 desktop preference；peek 内 selection/Filter 使用不写 preference 的 `promote()` 触发本次页面 pinned + reflow。900px 及以下 explicit drawer overlay 让 topbar/main inert，并在 fine/coarse pointer 下统一使用三个 44px Open Tab targets 和 8px 间距；Close 关闭。
- Window header 改为 count glyph + focused badge，不显示 ordinal/raw ID，不提供 Refresh；Save/Collapse/Pin/Close 使用 neutral actions。
- 同一 Open Tabs context bar 在 normal 状态显示 count、Selection、Save All，在 selection 状态原位替换为 Task 6 actions，在 collapsed 状态只显示 centered Expand。Filter、checkbox、Close 等 hidden controls 不进入 tab order。
- Controller browser acceptance 发现 collapsed rail 仍暴露 visually hidden Focus x7；collapsed row 随后改为完全不渲染 title button/accessibility node，仅保留 centered favicon 的 pointer focus/drag surface。Sidebar keyboard tab order 收敛为 selected window glyph + Expand，Frame 同时移除重复 collapsed class。
- Topbar 固定为 Workspace、Categories + Options、Search、Bin、More；More 仅含 Import/Export/Options。Search 静止态透明无边框；Session panel 使用 8px、dense controls 使用 6px quiet material。Coarse Workspace manager actions 常驻可见、可点击且为 44px。
- Session drag handle、sortable bindings、collision 与 board geometry 在本阶段保持不变，随后由 2026-08-02 DnD plan 收口。

当前状态：Current；其中 Session drag-handle 临时决策已由 2026-08-02 DnD 收口替代。Fake-timer hook、ManagerFrame DOM、Open Tabs DOM、header/material、selection scope 与 browser acceptance spec 共同守护。

### 2026-08-01: Manager Workspace 导航与嵌套管理焦点收口

问题：

- Workspace create/delete 曾分别拆成 Workspace 和 Category 两次 navigation，导致单个动作产生重复 history entry；active Workspace 的 optimistic delete 还可能让 stale page Workspace 反向写回 store。
- Manage Workspaces / Manage Categories 的 nested editor 关闭后，恢复中的 parent FocusTrap 会把焦点移到 parent Close，而不是触发 Edit action。

变化：

- Workspace create/select 使用一次 atomic `{ workspaceId, category, view }` push；active delete replacement 使用一次 atomic replace，且 ManagerLayout 只把仍存在的 page Workspace 同步到 store。
- `useManagerPageState` 将 history 写入移出 React state updater，以免 StrictMode 重放 updater 时重复 `pushState`。
- Nested editor 在完整 exit 期间保持 parent manager inert/trap paused；exit 完成后先恢复 exact row action 的可见/tabbable 状态并标记 `data-autofocus`，再启用 parent trap。Workspace 与 Category 使用同一 handoff 语义。
- Coarse Workspace actions 继续在无需 row focus 时保持 44px、visible 和 pointer-interactive。

当前状态：Current。Focused 组件/页面状态测试和真实 Chromium create Back/Forward、active delete、nested Escape、coarse action 四场景共同守护。

### 2026-08-01: Session Selection Toolbar 与 Hybrid Target Picker

问题：

- Task 5 已建立全局互斥 selection scope，但 saved Session 仍缺少 More > Select Tabs、完整批量动作和 keyboard move/save target。
- Open Tabs 只有直接 Create Session，无法明确保存到已有 Session 或指定的新 Session 位置。
- 批量 restore 若循环单项 runtime command，会丢失一次性成功证据；批量 delete 若循环普通 `deleteTab`，terminal isolation 可能造成部分成功。

变化：

- Session More > Select Tabs 以 `0 selected` 进入当前 Session scope；Session header 原位替换为一个 icon toolbar，覆盖 visible select toggle、Restore、Copy、Move、Delete 和 Exit。
- Restore/Copy 只处理 selected Links，Notes仍可Move/Delete；Locked禁Restore/Move/Delete但保留Copy。Restore/Delete成功清IDs并保留mode，Copy保留IDs，reject保留全部上下文。
- Restore Selected 复用一次 `restore-refs` background batch；Copy只做一次clipboard write；Delete新增atomic `delete-tabs` mutation和无optimistic、authority-confirmed `commitChecked()` waiter。
- Open Tabs保留Create Session直接New action，并新增Save to；Open和Saved共用body-portaled target picker。Arrow keys preview，Enter/Space commit，Escape/Cancel不改数据/selection，关闭后返回trigger或surviving fallback。
- Picker choices按active workspace canonical category/session order生成。Existing排除locked、cross-workspace和semantic no-op；New展开每个合法before/between/after index。Saved All Source Tabs隐藏全部New choice但保留Existing merge，Open Tabs不抑制。
- Picker显示Session title、Category人类名称和位置语义；raw IDs只留在typed choice/DropIntent，不进入visible/accessible label。Commit继续复用已有`move-tabs`、`copy-open-tabs`和`create-session` DropIntent。

判断：

- Selection toolbar只负责transient action lifecycle，persistent move/save仍由既有typed DropIntent authority单路径执行。
- Batch delete需要一个原子mutation，而不是依赖ordinary mutation queue对多个独立删除“碰巧同批”；只有authority确认后清selection才满足可重试合同。
- Picker preview是keyboard command UI，不应提前实现DnD `new-session-insert`或改变任何collision/Gap Anchor几何。

当前状态：Current。Focused toolbar/picker DOM、runtime/preview、store/publication、DropIntent、Task 5 selection和真实Manager typed-intent tests共同守护。

### 2026-08-01: Manager 显式 Selection Scope Ownership

问题：

- Open Tabs 和 saved Session 都从 selected ID 数量推导 `selectionMode`，无法表达清空最后一个 ID 后仍停留在 `0 selected` mode。
- 不同 browser window / Session 各自持有 IDs，但缺少 Manager 级互斥 owner，跨 scope 进入时旧 IDs 不能被同步清理。

变化：

- 新增 pure `SelectionScope` transition 与 `useManagerSelectionScope()` coordinator；Manager 只保存当前 `{kind, windowId|groupId}` scope。
- Open Tab IDs 继续留在 Open Tabs workflow，saved item IDs 继续留在各 `SessionCard`，不写入 Zustand 或 persistence。
- 任意 Open/saved checkbox 都先 enter 对应 scope，再 toggle 当前 item；进入另一个 scope 时同步清旧 owner IDs。
- 清空最后一个 ID、capture、drop、批量关闭/Pin 或 same-window refresh 只产生 `0 selected`，不自动退出 mode。
- 显式 Exit、sidebar collapse、Open Tabs source window 改变/失效或 scope replacement 才 exit + clear。
- Drag overlay `SessionCard` 不接收 coordinator，不注册或干扰 selection scope。
- Selection/preview 只保持 collapsed sidebar 展开，不再复用 blocking overlay 的 `inert` 状态；实际 drawer 仍阻塞被覆盖的 topbar/main。
- Active saved scope group 加入 session activation forced set，仍在 board 中时不会因 search 等 activation context reset 降级为 shell；若 filter/category 让 owner 真正卸载，则 coordinator 显式 exit。

判断：

- Active mode 是 Manager 级互斥交互上下文，selected IDs 是 source-local transient data；分开 ownership 能表达空选择态，又不污染 canonical state。
- Task 5 只提供 saved scope 进入能力和 checkbox-first wiring；Session More > Select Tabs 与完整 toolbar 内容由后续任务交付。

当前状态：Current。Focused selection scope、真实 Manager DOM scope replacement/owner lifecycle、Open Tabs panel、session rendering，以及 workflow/runtime/layout 邻接 tests 共同守护。

### 2026-08-01: Category 直接拖拽与并发安全管理

变化：

- 移除 Reorder Categories / Done Reordering mode；整个顶部 Category tab 复用全局 5px threshold，点击导航、超过阈值直接 pointer reorder，无可见或隐藏 drag handle。
- Manage Categories 改为 Built-in/Custom 共用 canonical order 的单一 dense list，整行 drag 与 Move Up/Down 发布同一完整 order；New/Edit 共享 name + color modal。
- Category edit/order mutation 增加 UI 操作起点捕获的 expected/target CAS：Editor open 固定 folder snapshot，Manage action/drop 固定 rendered order，topbar resolver 通过 typed intent 固定 canonical order；store 不在 submit 时重读 expected。
- Exact replay 增加 mutation timestamp witness，并在 replay 前验证 semantic completeness；response-loss retry 只在 target 与 witness 都匹配时成功，ABA/独立 target equality 以及 stale edit/order 以稳定 conflict 拒绝。Legacy named color 在用户主动改色前保持可见并原样保存。
- 删除 custom Category 显示 workspace 内受影响 Session 数量；包含 locked Session 时预先禁用并继续由 mutation authority 兜底。

判断：

- 直接操作减少模式切换，但 keyboard 排序仍需稳定的 Manage Categories 命令。
- Category 管理跨页面并发时宁可提示冲突，也不能用旧快照覆盖新状态。

当前状态：Current。Vitest 覆盖 UI-start snapshot、CAS/replay timestamp witness、ABA/conflict、pre-replay completeness、manager no-op drag、legacy color、workspace ownership 和 focus/inert contracts；真实 3px/7px pointer gate 由 serial Playwright 验证。

### 2026-07-28: Design Taste 收敛与可信状态

在可访问性、DnD 与启动性能已经稳定后，rendered taste review 仍发现首屏上下文、设置状态可信度、低频管理动作常驻和视觉层级不一致。

变化：

- Manager 裸入口按 workspace 恢复 page-local 最近分类；没有有效偏好且 Inbox 为空时，按 category order 打开第一个非空分类。显式 URL 与无效 category 的既有语义不变。
- Desktop workspace trigger 直接显示当前 workspace 名称，compact breakpoint 仍为 icon-only。
- Category 当时通过 Category Options 进入显式 Reorder Categories mode；该交互后来由 2026-08-01 的 whole-tab direct pointer reorder 取代。`category-column` droppable 常驻约束保留。
- 新增 shared `Favicon` primitive；Open Tabs、saved link rows 和 info overlays 共享 fixed-size lazy image/fallback，inactive session shell 仍保持 count-only。
- Options save status 移入 SettingsProjection external store 的 authoritative mutation queue；commit 前显示 `Saving…`，失败回滚并可 Retry。Debounced text draft 与 persistence status 分开。
- Restore 以 Destination / Placement 呈现；New window 下禁用只适用于 Current window 的 Placement，但不改变持久化 booleans。
- Advanced Settings 的 Safety、Keyboard Shortcuts、Recovery 改为无框 section；Data Storage 保持唯一 framed tool。
- Popup 使用 TabBoard extension icon；duplicate cleanup 降为次级 Remove row，Save 保持唯一 primary action。
- Session card 当时移除 resting shadow，使用 border、focus/highlight state
  表达层级；该材质子决策后来被 Preview-to-production parity repair 取代，
  stable slot、interaction border 和 DnD target ownership 保留。

判断：

- New-tab manager 应优先呈现已有工作上下文，而不是在其他分类有数据时表现为空应用。
- 设置页状态必须来自 authoritative queue，而不是同步切换的 component-local flag。
- Category reorder 是低频管理动作；该阶段用显式 mode 去掉永久 handle，后续进一步收敛为 whole-tab pointer drag + Manage Categories keyboard commands。
- 收敛应发生在现有 owner 内，不需要更换 Mantine、增加依赖或改变 schema/DropIntent。

当前状态：Current。Focused TypeScript/Vitest、真实 persisted-state DnD 和后续完整 browser/taste review 共同守护。

### 2026-07-26: Typed Application Feedback Ownership 深化

Authoritative Publication已经拥有commit/error时序，但Zustand adapter仍把save/import/restore/error outcome包装成未类型化 `window.CustomEvent`，Manager再按event name订阅并断言payload shape。旧 `events.ts` 同时维护一个从未被subscriber注册的dead listener map。

变化：

- 新增 `ApplicationFeedback` discriminated union与page-local typed channel；channel同步、non-replay，listener异常不会反向影响persistence。
- 新增pure `feedbackForCommittedMutation()`，统一add-group/import/restore mutation到feedback的payload mapping。
- `useTabBoardStore` 只在publication确认commit或决定surface error后publish；partial commit、retry、waiter-owned error与`notify: false`时序保持原规则。
- `useToastNotifications()` 从四个window listeners收敛为一个typed subscription，并把toast copy提取为pure presenter。
- 删除 `shared/utils/events.ts`、`AppEvents`、四个legacy event names和dead listener map。
- Store timing tests不再stub `window.dispatchEvent`，直接断言typed payload与顺序。
- architecture gate禁止feedback owner依赖React/Zustand/store/Manager/browser globals，也禁止toast consumer回退到window listener或raw payload assertion。

判断：

- Feedback是一次性outcome stream，不应进入Zustand snapshot并引入ack/clear队列。
- UI action callback无法判断retry、partial commit与reconciliation，authoritative timing必须继续由publication ports拥有。
- 当前window event只在同页生效；typed module channel保持同样page-local语义，不需要BroadcastChannel或storage transport。

当前状态：Current。Direct channel/mapper/presentation tests与74个store timing regressions共同守护。

### 2026-07-26: Saved Search Query 与 Board Projection Ownership 深化

Saved-session query原本同时由 `useFilteredGroups.ts` 中的module global、每个hook instance的React state、`sessionStorage`和`tabboard-search-change` window event同步；`SearchBar`又单独监听同一event。`WorkspaceContent`在拿到filtered groups后，还会重新扫描全部groups并手写category membership，导致orphan folder虽然能被selector渲染到Inbox，却在DnD insertion index中被排除。

变化：

- 新增framework-neutral `SearchQueryStore`，以 `getSnapshot()` / `subscribe()` / `set()` 单一拥有saved-session query；URL/session storage由ports注入，可直接用内存测试。
- `useSearchQuery.ts`成为唯一browser/React adapter，持有 `tabboardSearch` storage key并通过 `useSyncExternalStore`订阅；删除module global、per-hook state和`tabboard-search-change` event。
- SearchBar保留150ms local input debounce和immediate match count；external query变化同步local input，旧timer不能覆盖较新的external value。
- Open Tabs URL filter/capture不再依赖effect-updated ref，imperative path直接读取同一个query snapshot；同一call stack中“设置filter → capture”不会误判filter ownership。
- `getBoardProjection()` 同时返回canonical unfiltered `categoryGroups`、query-filtered `visibleGroups`和`searchQuery`；空query保留category groups引用。
- `WorkspaceContent`只消费board projection；render、card index和end target共享shared category语义，orphan/cross-workspace folder references在Inbox中保持一致。
- 删除旧 `useFilteredGroups.ts` owner；`useFilteredGroups()`仅作为 `useBoardProjection()` 的薄wrapper保留在新hook中。
- `npm run check`新增search architecture gate，禁止window event bus、SearchBar query listener、WorkspaceContent全量group/category scan，以及core owner对React/Zustand/browser globals/TabBoard store的依赖。

判断：

- saved-session query是Manager page临时状态，不属于TabBoard持久化schema或Authoritative Publication；塞入Zustand会混淆domain projection和UI session state。
- Context能统一React consumer，但不能自然提供Open Tabs async command需要的同步snapshot；三方法external store同时服务React与imperative consumers。
- DnD index必须基于未过滤canonical category groups，而不是visible results；否则搜索会改变drop insertion语义。

当前状态：Current。Direct owner/hook/component tests、Open Tabs race regression、strict graph gate和search architecture CLI共同守护。

### 2026-07-26: Session Domain Ownership 深化

Persistent session/category/drop语义原本位于 Manager `commands.ts` / `dnd.ts`，shared mutation validation、background persistence 和 Zustand store反向导入 Manager。即使只把 barrel import改为direct import可以让当时的六模块SCC消失，layering inversion仍会保留。

变化：

- `src/shared/validation.ts` 成为ID/timestamp/byte/dense-array/canonical-JSON primitive owner，切断 `model/schema → store/mutationValidation` 反向依赖。
- `categories.ts` 统一 `CategoryFilter`、category derivation/ownership/order、session move与category insertion；orphan folder IDs继续归Inbox。
- `drop-intent.ts` 拥有五类persistent wire contract；Manager DnD只使用contract，不再定义它。
- `drop-validation.ts` 拥有raw DropIntent/OpenTabInfo/payload-limit validation；store validation不再导入Manager DnD。
- `drop-operations.ts` 拥有五类intent execution、operation digest、stable generated IDs、ledger/replay semantics；background/store直接依赖shared owner。
- `session-operations.ts` 拥有restore-from-bin与import parsing/application。
- Manager `dnd.ts` 收敛为drag payload/target/marker、geometry/hysteresis与intent resolution；production `manager/core/commands.ts` 删除。
- shared/background production modules对Manager imports降为零；source import graph从六模块SCC收敛为零cycles。
- `npm run check`升级为strict zero-cycle gate，并继续执行publication与reverse-edge policies。

判断：

- Import graph变绿不是充分条件；真正目标是shared/background不再依赖UI layer。
- Persistent wire/validation/execution/replay属于shared domain，pointer/keyboard geometry和target resolution属于Manager interaction adapter。
- 迁移保留成熟算法、wire shape、错误文案、replay identity、import formats和restore placement，不改变产品行为。

当前状态：Current。Shared direct-owner tests与原Manager/store/background regressions共同守护行为。

### 2026-07-26: Authoritative Publication 深化

Manager 的 optimistic mutation、retry、drop/category waiter、terminal isolation、remote reconciliation 和 hydration 原本与领域 actions 一起堆在 `useTabBoardStore.ts`，由 Zustand 文件中的 module-level globals 隐式共同拥有。文件达到 1227 行后，任何 persistence 时序改动都必须通过完整 singleton store 和 Chrome global mock 验证。

变化：

- 新增 `createAuthoritativePublication(dependencies)`，以普通 TypeScript instance 独占 pending/in-flight mutation、remote buffer、last authoritative state、serialized queue、bounded retry、waiter、hydration Promise/subscription/generation 和 context generation。
- publication 通过 projection ports 读写 Zustand，通过 transport ports 访问 Storage Authority 与 worker mutation RPC；模块本身不依赖 Zustand、React、DOM event 或 concrete storage adapter。
- ordinary mutation 保持 fire-and-forget optimistic commit；drop/category Promise 只在 authoritative outcome 后 settle；restore 同步 collision 仍由 UI adapter 报错而不抛回 action。
- concurrent authority publication 在有 pending/in-flight work 时缓冲；RPC settle 后按 revision/timestamp 选择最新 remote base，安全重放 committed ordinary mutation，并用 drop ledger 防止 committed drop 重放。
- terminal ordinary mixed batch 保留逐项隔离；transient failure 继续按 250ms / 1s / 4s 有界重试；isolation 期间新入队 mutation 不丢失。
- hydration lifecycle 移入 publication：initial read 前订阅、缓冲 read/subscribe gap、共享同 generation Promise、release 使 stale callback 失效、失败后允许 retry。
- context replacement 会拒绝旧 waiter、取消旧 timer并隔离旧 RPC continuation；只有旧 context 真有 outstanding work 时才回滚 optimistic projection，空闲 context 切换不会覆盖 caller 已设置的新 projection。
- `useTabBoardStore.ts` 收敛为 534 行领域 facade/React projection/ports/event mapping，不再拥有 queue、retry、waiter、reconciliation 或 hydration globals。
- import graph gate 禁止 publication 依赖 Zustand、React、Manager components、DOM event utilities、`chromeStorage` 或 `activeAdapter` concrete modules。

判断：

- 只拆 pure helpers 会降低文件长度，却不会改变状态机 ownership；另建第二个 Zustand store会把非 UI 基础设施状态继续绑定到 UI library。
- 注入式 owner 既能直接用内存 projection/transport 测试，又能让 Zustand、Storage Authority 和 worker transaction 保持各自单一职责。
- 本轮不机械拆分 publication 内部 policy；先完成 owner cutover并保留成熟算法，下一次架构分析再根据 seam 和变更局部性判断是否继续拆分。

当前状态：Current。Direct publication tests、完整 store regressions、hydration hook、build/check/test 均纳入验证。

### 2026-07-26: Open Tabs Workflow 深化

Open Tabs 的 runtime contract、selection、refresh、capture feedback、tab filter 和 drag completion 原本分散在 worker、hook、Panel、ManagerLayout 与多个全局 DOM events 中；小规则改动往往需要同步修改 4–5 个模块。

变化：

- `src/shared/openTabs.ts` 成为 Open Tabs runtime protocol owner，统一 `OpenTabInfo`、window/list/capture/result contracts；background、preview、Manager 和 persistence 不再各自定义类型。
- `openTabsWorkflow.ts` 用纯 reducer 统一 windows、selected window、selection、query、tab-filter 和 operation status，并一次投影 selected records/IDs。
- `useOpenTabsRuntime()` 只负责 Chrome listeners、runtime messages 与 persisted-state reconciliation，对外暴露 grouped `model/commands`。
- `OpenTabsPanel` 直接消费 workflow projection，不再重新扫描 selected window 派生 drag records。
- `ManagerLayout` 持有 workflow；capture completion 通过返回值处理，drop completion 直接调用 command，tab filter 直接读 model。
- 删除 `tabboard-open-tabs-dropped`、`tabboard-capture-completed`、`tabboard-tab-filter-change` 三条全局 DOM event seam。

当前状态：Current。

### 2026-07-26: Storage Authority 深化与运行时自动降级

本地文件存储已经有 Chrome/File 两个真实 adapters，但 backend 选择、订阅、ping、迁移和 fallback 分散在多个 callers；其中运行时文件读写失败只会抛错，未兑现 D037 的自动降级承诺。

变化：

- `activeAdapter` 深化为稳定的 Storage Authority：页面、service worker 和 Options 持有同一 authority interface，内部 backend 可从 File 切到 Chrome，不会让 caller 缓存失效。
- File runtime 写失败会先把最后一次有效 snapshot 保存到 Chrome，再切换 authority 并通知所有 context；本次未提交 mutation 仍返回失败，由既有 retry 机制在 Chrome backend 上重试。
- File read、permission、ping reload 或 remote fallback 失败会切到 Chrome，并保持原有 authority subscription 连续；remote context 读取对方已提交 state，不会用旧 File snapshot 覆盖 Chrome。
- File ping 与 fallback transport 独立到 `storageEvents.ts`，消除 `activeAdapter ↔ chromeStorage` import cycle。
- Browser/File/reconnect 切换改为 transactional commit order：先验证并写目标 backend，最后才提交 bootstrap mode 与目录 handle；File seed 的 cross-context ping 也延后到 commit 完成。
- 新增 targeted import-cycle gate，禁止 storage authority 与 legacy `chromeStorage` 再次形成 cycle。

当前状态：Current；D037 的初始化与运行时 fallback 均已覆盖。

### 2026-07-24: Open Tabs 隐藏所有扩展页并允许 pinned 参与多选

用户希望侧边栏只展示真实浏览内容，不展示 TabBoard 自身页面或其他扩展页面；同时 pinned tabs 不再作为特殊限制项，和普通 tabs 一样可以勾选、批量创建 session、批量拖拽到已有 session。

变化：

- `capture-policy` 新增统一的 extension page URL 判断，覆盖 `chrome-extension:`、`moz-extension:` 和当前扩展 base URL。
- `list-open-tabs` 在 background 数据入口隐藏所有 extension pages；preview harness 保持同一规则，避免开发预览和真实扩展行为漂移。
- Open Tabs selection、drag payload、批量 pin/delete、selected capture 全部按 `storable` + valid tab ID 判断，不再排除 pinned tabs。
- 文档同步当前边界：pinned、Chrome URL、file URL rows 可像普通 rows 一样选择和保存；extension pages 直接隐藏，不进入列表或 capture。

判断：

- 扩展页面通常不可恢复，也不代表用户正在整理的网页上下文，显示出来会制造不可操作噪音。
- pinned 是浏览器现场的一部分，用户明确选择时应能一起保存或拖入 session；是否 pinned 不应影响 checkbox 语义。

当前状态：Current。

### 2026-07-23: 本地文件夹存储（可选替代 chrome.storage.local）

新增可选本地文件存储：用户可在 Options 中选择一个本地文件夹，TabBoard 将数据以纯 JSON 文件形式写入该文件夹，而非仅保存在 `chrome.storage.local`。

变化：

- 存储层抽象为 `StorageAdapter` 接口，`ChromeStorageAdapter`（既有行为）与 `FileStorageAdapter`（新）实现同一契约；启动时由 bootstrap key 决定激活哪个 adapter。
- 文件夹下按拆分结构写入：`meta.json`（提交点版本/修订号/时间戳/`writeInProgress` 标记）+ 顶层文件 `settings.json`、`workspaces.json`、`folders.json`、`categoryOrder.json`、`bin.json`、`ledger.json`，以及 `sessions/<id>.json`（每个 session 独立文件）。
- 写入采用两阶段提交：先写 `meta.json` 置 `writeInProgress: true`，再原子写各数据文件（tmp 兄弟文件 + rename），最后写 `meta.json` 提交并递增 `revision`，实现崩溃安全。
- 文件夹句柄持久化在 IndexedDB 单一 object store，扩展重启后仍可恢复写权限；无需新增 manifest 权限（复用 File System Access API）。
- 启用时提供三种迁移模式：`use-file`（立即切换并把当前浏览器存储数据写入文件夹）、`export-browser`（写出文件夹但保持浏览器存储为当前存储）、`merge`（读文件夹数据合并到浏览器存储后再切换）。
- 任何文件写入失败自动降级回浏览器存储，并通过 UI 通知用户；降级期间写入仍可继续，不会丢数据。
- Options 新增 Data Storage 分组：当前存储模式、文件夹名、选择文件夹、断开并切回浏览器存储入口。

判断：

- `chrome.storage.local` 在扩展被卸载时会被清除，且不便于用户查看或在设备间同步；本地文件存储让数据在重装后可直接重新接入，也可放入 iCloud/Dropbox/OneDrive 等同步文件夹实现跨设备同步。
- 采用 File System Access API 而非 Native Messaging/伴随程序，零安装，用户只需选择文件夹，无需后台主机进程。
- 按 session 拆文件而不是单一大文件，避免每次写入都重写全量 state，也方便用户直接检视/备份单个 session。
- 两阶段提交保证崩溃后下一次启动可通过 `meta.json` 的 `writeInProgress` 标记发现未完成写入并恢复；substitute 模式（切换即切换，不双写）简化了一致性模型，代价是切换时一次性迁移。

当前状态：Experimental 但功能完整，`npm run build`、`npm run check`、`npm test` 通过；仍建议在真实 Chrome 中手工验证迁移、断开、强制降级和同步文件夹场景。

### 2026-07-22: React 运行时性能优化收尾

性能审查识别出 DnD、Open Tabs、authoritative state 和 overlay 的重复工作。本轮在不改变产品行为、不新增依赖、不引入 JS virtualization 的前提下完成全部 11 项优化。

变化：

- DnD collision detection 改为单次扫描，visible groups 与 drag replacement snapshot 保持稳定；drag marker 在 `WorkspaceContent` 中先缩窄到目标 card/insert target，memoized card 不再因无关 marker 更新重渲染。
- Open Tabs browser-group 查询按请求复用 Promise 并并行转换；selection records/IDs 使用面板级 memo + `Set`；query 使用 `useDeferredValue`，off-screen rows 使用 CSS `content-visibility`。
- `SessionCard` 以一次线性 `useMemo` 派生 visible tabs、counts、selected refs 和 canonical index。
- Authoritative state 发布前执行语义 structural sharing，复用未变化的 workspace/folder/group/tab 等实体引用，跨 workspace 写入不再扰动当前 board。
- Chrome action 只在 `settings.actionClick` 变化时更新。
- Overlay 全局 listeners 只绑定一次；commands 与 observable state 分离，menu/preview key 通过细粒度外部存储订阅，避免全 board context fan-out。

判断：

- 优先消除已验证的重复扫描、API 调用和 render fan-out，比替换 Mantine、拆 bundle 或引入 virtualization 风险更低、收益更直接。
- Structural sharing 放在 authoritative publication 边界，而不是继续堆局部 selector，能统一解决 normalization 重建引用的问题。
- Open Tabs 与 session board 都保留完整 DOM，以维持 `@dnd-kit` measurement、focus restore、preview anchors、find-in-page 和 accessibility。

当前状态：Current。`npm run build`、`npm run check`、664 项 Vitest 与 14 项 Playwright 通过；production `dist/` 在隔离 Chromium extension profile 中完成同分类/跨分类/saved tab/Open Tabs existing+new session DnD、browser group refresh 和 overlay focus lifecycle 验收。

### 2026-07-21: 修复 saved link 返回后的 preview 定位循环

用户从 saved session 打开链接后切回 TabBoard 时出现 React error #185。最终生产堆栈直接命中 `ManagerOverlayPortal → setPreviewPosition`：preview 定位的 layout effect 在每次 commit 都派发 position state，而 controller 又包含 preview state；同时 saved-link click 在组件 handler 中关闭浮层后继续冒泡到 document preview handler，将本应关闭的 preview 重新打开。两者叠加后形成同步定位更新闭环。

变化：

- preview layout effect 在 `preview.position` 已存在时立即退出，不再重复派发定位 state；仍保留每次 commit 检查 detached trigger 的生命周期保护。
- saved link click 停止冒泡，先关闭 overlay，再打开 Chrome tab，避免 document preview handler 在同一 click 末尾重新打开它。
- window blur 或 document hidden 时立即关闭 overlays、取消 pending preview/focus restore，并在根节点设置临时 hover suppression。Chrome 回前台产生的合成 hover/focus 不能解除 suppression；只有用户真实移动指针、点击或键盘交互后才恢复 progressive disclosure。
- hover suppression 同时压回 saved/open tab 的 checkbox、delete、row highlight 和 session 次级 actions；selection mode 的显式勾选控件仍保持可见。
- 新增 80 个 open tabs 的 StrictMode DOM 回归：点击 saved link、连续触发 focus refresh、再打开 Open Tab preview，验证列表更新、preview 可见且不进入 ErrorBoundary。
- 增加 Chromium e2e 场景覆盖同一 saved-link / focus / preview 序列。
- 移除排查期的全局 render counter。该 counter 会把一次父 render 中的每个 tab row 都累计为“render 次数”，60 个以上 tabs 时会自行抛错，属于诊断误报而非真实循环。

判断：

- 重复 focus/tab refresh 是暴露问题的触发器，不是同步循环根因；现有 in-flight + queued refresh 已限制请求并发，无需用防抖掩盖。
- 早期堆栈中的 Mantine `ScrollArea` 是循环重渲染时经过的组件链，不是根因；已撤回替换它的 workaround。
- 最终修复只收敛 overlay click 与定位 state 语义，不改变 open-tab 数据、选择、DnD、滚动或 refresh 行为。

当前状态：Current，623 个自动化测试通过，`npm run build` 与 `npm run check` 通过，Chromium e2e（saved-link / blur / hover suppression 场景）通过；用户在 unpacked Chrome 中按原复现路径复测：React #185 白屏已消失，切回 TabBoard 后 checkbox/delete/preview 不再残留，Chrome 从后台 app 返回前台时 preview 不自动恢复，真实指针移动后才恢复 hover。

### 2026-07-21: 修复 manager 白屏（hydration 与 MV3 worker 解耦）

用户反馈 manager 页面运行中经常白屏。定位到根因:manager 是可长时间开着的新标签页,而 MV3 service worker 空闲约 30s 就会被 Chrome 挂起。此前 `hydrate()` 用**单次 `sendMessage({type:'tabboard-ensure-state'})`** 读初始 state,worker 处于挂起/冷启动竞态/通道断开时该调用 reject,导致 `hydrated` 永远为 false、页面卡在空的 `LoadingOverlay` 上——即白屏,且不会自愈。

变化:

- 新增 `ensureStateForHydration()`:优先走 worker(唤醒它、给空存储播种默认值),worker/messaging 失败时 catch 并降级为本地 `ensureState()` 直接读 `chrome.storage.local`。`store.hydrate()` 改用它。
- 结论层面:manager 页面的**显示不再依赖 service worker**;worker 只在**写入**时用于跨页面串行化。只有 worker 与本地存储读取同时失败,`hydrate()` 才 reject 并允许重试。
- 新增 `src/shared/store/chromeStorage.test.ts`(worker 成功 / worker 失败降级读存储 / 失败且空存储本地播种)、拆分并改写 store 的 hydration-failure 用例、新增 `tests/e2e/hydration-resilience.e2e.ts`(worker 不可达时 manager 仍渲染 seeded board)。

判断:

- MV3 service worker 被挂起是平台刻意设计,无法也不应"保活";正确做法是让客户端对冷 worker 有韧性,而不是与之硬刚。
- 采用"读绕过、写留 worker"方案:精准解耦"页面能否显示"与"worker 活没活",同时保留 worker 作为多页面写入的唯一权威,改动面最小、风险最低。

当前状态:Current,`npm run check`、`npm test`(614 通过)通过;Playwright e2e(含 worker 不可达场景,10 通过)本地按需运行通过。

### 2026-07-21: 增加 crash-surviving diagnostics + ErrorBoundary + hydration 看门狗

用户反馈白屏仍然偶发,且白屏后页面 console 也跟着没了,无法事后排查。截图显示是 React minified error #185(max update depth / infinite loop)出现在 `useStoreHydration` 中,说明除了 worker 挂起外还有渲染级崩溃的可能。

变化:

- 新增 `src/shared/utils/diagnostics.ts`:独立于 `tabboardState` 的 ring buffer(`tabboardDiagnostics`,上限 100 条),写入 `chrome.storage.local`,白屏/刷新后仍可读取。含 `logBreadcrumb` / `logWarning` / `logError` / `readDiagnostics` / `clearDiagnostics` / `installGlobalErrorCapture`。所有 storage 访问 fire-and-forget 且 try/catch,diagnostics 自身永不成为第二故障源。
- 新增 `src/manager/components/shell/ErrorBoundary.tsx`:class 组件包裹整个 ManagerApp,捕获 React 渲染级错误,展示错误信息、刷新按钮、「Copy diagnostics」按钮,以及可展开的完整诊断日志。
- `ManagerApp` 增加 hydration 看门狗(8 秒):水合超时不再显示空白 LoadingOverlay,而是展示停滞面板 + 刷新按钮 + 诊断信息,避免用户看到纯白板。
- `main.tsx` 入口增加 `installGlobalErrorCapture('manager')` + boot breadcrumb + initial render try/catch,捕获脚本加载阶段的错误。
- `ensureStateForHydration` 在 worker 成功 / worker 失败降级 / 本地降级三个分支都埋了 breadcrumb。
- 新增 `src/shared/utils/diagnostics.test.ts`(7 单元测试)和 `tests/e2e/diagnostics.e2e.ts`(3 E2E:启动轨迹、worker-fallback 记录、刷新后存活)。

判断:

- 白屏的根因可能有多种(worker 冷启动、React 无限重渲染、状态损坏、网络资源加载失败),只修一个已知原因不足以覆盖全部场景。
- 与其继续猜下一个原因,不如先给页面装上"黑匣子":任何崩溃都留下可追溯的轨迹,下一次白屏时用户可以直接把日志贴过来,我们再从证据出发定位。
- ErrorBoundary + 看门狗 + 全局错误捕获 是三层防御:渲染崩溃有恢复页、水合卡住有停滞页、脚本级错误有持久化轨迹。

当前状态:Current,`npm run check` 通过,`npm test`(621 通过)通过,Playwright e2e diagnostics(3 通过)本地按需运行通过。

### 2026-07-21: Session 键盘拖拽无障碍修复

上一轮新增的 Playwright e2e 暴露出一个无障碍缺口：session card 的拖拽 activator 是不可聚焦的 `<header>`，只 spread 了 `@dnd-kit` listeners、没有 attributes，因此键盘用户无法拿起并重排 session。

变化：

- 在 session card header 内新增独立的 `.session-card__drag-handle` 按钮，承载 `setActivatorNodeRef` + `@dnd-kit` `attributes` + `listeners`；handle 提供 `role="button"`、`tabindex=0`、`aria-roledescription="sortable"` 和描述性 `aria-label`。
- `KeyboardSensor` 配置 `coordinateGetter: sortableKeyboardCoordinates`，让方向键按 sortable 位置跨越整列 session，从而命中自定义 collision detection 的 `group-insert` 目标。
- header 仍保留 pointer listeners，鼠标拖整块 header 的体验不变；handle 默认低调，hover/focus 时才显现，保持"dense but calm"。
- 新增键盘拖拽 e2e（`reorders sessions using only the keyboard`）与 handle a11y 断言，`session-rendering.test.ts` 增补 handle/activator 结构契约。

判断：

- 采用独立 handle 而不是把 attributes spread 到 `<header>`，避免在包含 title/Restore/More 的容器上产生非法 `role="button"` 与重复 tab stop。
- 键盘拖拽是 direct-manipulation 的可达性底线，值得作为独立修复而非顺带改动。

当前状态：Superseded by 2026-08-02 Crisp Utility DnD。该条仍记录旧 direct
keyboard drag 方案的来源；现行实现使用 pointer/touch surface + Hybrid Commands。

### 2026-07-21: 架构文档校正与死字段清理

在一次全项目审查中发现文档与实现漂移，并清理了 React 重写后遗留的死 schema 字段。

变化：

- 校正 `technical-architecture.md` 的 Drag and Drop 章节：DnD 已从原生 HTML5（`setDragImage`/`dataTransfer`）迁移到 `@dnd-kit`。当时使用 `PointerSensor` / `TouchSensor` / `KeyboardSensor`；2026-08-02 后 KeyboardSensor 被 Hybrid Commands 取代。
- 移除 schema 中的死字段 `quickList`（Quick list workflow 于 2026-07-06 下线，React 重写后 UI 已完全不读写）。`normalizeState()` 遇到历史 `quickList` 数据时迁移成 `Former Quick list` session，保证不丢数据。
- 新增 `src/shared/model/schema.test.ts` 覆盖迁移与字段移除。
- 新增 `tests/e2e/`（Playwright）浏览器级冒烟骨架，最初覆盖 manager 加载与 `@dnd-kit` 键盘拖拽；2026-08-02 后扩展为 pointer DnD + Hybrid Commands矩阵。纯 resolver 回归仍以 `src/manager/core/dnd.test.ts` 为主。
- 大数据量 board 性能：`WorkspaceContent` 的横向 session track 引入按需渲染，减少 session 数量很大时的一次性 DOM 成本。

判断：

- `collapsed` 字段刻意保留：`browserGroup.collapsed` 是真实 Chrome tab group 元数据，`group.collapsed` / `folder.collapsed` 仍嵌在 mutation 校验与 replay identity 契约中，移除属于高风险低收益。
- 文档漂移会误导后续维护"改哪里、注意什么"，因此把 DnD 章节校正视为与代码同等重要的修复。

当前状态：Current，`tsc`、`npm test`、`npm run check` 通过；Playwright e2e 为按需本地运行。

### 2026-07-21: Category 系统改造与体验优化

用户反馈当前分类体系不够清晰，同时 Open Tabs 和 session 管理有多处体验缺口。本轮将 category 从 Inbox/Starred 两档内置扩展为 Inbox/Saved/Archive 三档内置 + 自定义 folder，并补齐 note、搜索、确认设置等体验细节。

变化：

- Category 系统：从 `Inbox + Starred + folders` 改为 `Inbox + Saved + Archive + folders` 三档内置分类。Starred 改名为 Saved，新增 Archive 用于归档不常用的工作上下文。
- Group 新增 `archived: boolean` 字段，与 `starred` 互斥；两者任一为 true 时 `folderId` 自动 normalize 为 null。
- Session card 展示 note 区域，预览弹窗支持添加和修改 note；点击打开链接后自动关闭预览浮层。
- Open Tabs 优化：多选模式提供全选按钮，拖拽完成后自动退出多选；tab URL 最多显示 3 行；favicon 加载失败时有兜底 icon；全局去重避免同 URL 重复展示。
- 搜索优化：关闭搜索栏时清空筛选条件，不再保留上次 query。
- 设置新增 `confirmBeforeDestructive` 选项，默认开启危险操作前二次确认，用户可在 Options 中关闭。
- 侧边栏分隔线与右侧 topbar border-bottom 视觉对齐，消除左右割裂感。
- 修复侧边栏收起状态下 icon 初始不居中问题（`sidebarHoverSuppressed` 初始值与 `sidebarCollapsed` 保持一致）。
- 修复拖动 session 到同一 category 时的 "Invalid state mutation" 验证错误。

判断：

- 三档内置分类比两档更符合"收集 → 整理 → 归档"的工作流演进，Saved 比 Starred 更准确地表达"已整理/重要"的语义。
- Note 是 session 上下文的重要补充，在 card 上直接可见降低了查找成本。
- 搜索关闭即清空符合"用完即走"的轻量交互，避免用户误以为筛选仍在生效。
- 二次确认默认为安全兜底，同时给高级用户关闭选项，平衡安全与效率。

当前状态：Current，全部 603 个测试通过。

### 2026-07-20: Open Tabs extension 页面过滤与无闪烁刷新

Open Tabs 的用途是呈现用户正在处理的浏览现场，TabBoard 自身 manager/settings 等页面和其他扩展页面不应占据列表；后台刷新也不应让旧列表短暂消失。

变化：

- `list-open-tabs` 在 background 数据入口排除所有 extension pages，preview harness 保持同一规则。
- 刷新期间保留已显示的 windows/tabs，不展示 loading row；顶部 Refresh icon 旋转并标记 `aria-busy`，成功后一次替换数据，失败时旧列表仍可见。

当前状态：Current。

### 2026-07-18: React Manager 收敛为唯一实现

本轮把 React + Mantine Manager 从“已迁移”收敛为唯一生产实现，移除旧 native 双栈与其行为基线机制。

变化：

- 生产入口链固定为 `manifest.json -> manager.html -> /src/manager/main.tsx`；旧 native `src/manager.js` 及其相关代码已删除，不再作为行为 oracle。
- 移除历史 parity manifest / native oracle 测试机制；自动化 proof 收敛到 Vitest core contracts（`npm test`）。
- 自动化 proof 执行 typed DnD、immutable state mutation、serialized persistence、replay status、Open Tabs selection、capture ownership 和 authoritative feedback contracts。
- 普通 mutation 增加引用、locked 和 link/note URL 边界；drop replay 使用 ledger 与稳定 identity；runtime message 在 storage/Chrome side effect 前验证 sender。

边界：

- 自动化 proof 不等于完整 UI 验收。custom-element lifecycle、原生 DnD 时序、Chrome capture/restore 和真实 keyboard/focus 仍需手工 Chrome 回归。
- 本轮不改变产品 schema、storage key 或能力范围。

当前状态：React 自动化 proof、build、check 已通过；旧 native/Web Awesome 栈与相关测试全部退役。Chrome 手工覆盖仍建议在 unpacked extension 上回归。

### 2026-07-12: Manager interaction cleanup（Phase 1–6 收尾）

本轮把 Manager 的高密度交互收敛为更稳定的可见层级：window selector 使用本地 window icon 与 ordinal/count，selected tabs 用 numeric badge，selected window 与单一 tab list 顶部对齐；collapsed sidebar 保留 rail，并通过 hover/focus overlay 展开而不推动 board；tab metadata 通过 hover/focus preview 提供，不增加 eye 按钮；saved title 保持单行；selected capture 在同一 workspace 切到 Inbox 并高亮新 session；search 默认收起但保留 query。

判断：

- 这些调整只清理 interaction hierarchy 和 progressive disclosure，保留既有保存、恢复、selection 与 DnD 语义。
- 本轮没有 state schema、Chrome API 或 DnD semantic 变化。

当前状态：自动实现与测试完成；Chrome unpacked、keyboard、screen-reader、rail overlay 和 DnD 人工验收仍待用户执行。

### 2026-07-12: 同一 workspace 的 category 名称唯一性

用户可以保留历史重复 category，但后续新建或重命名时需要避免同一 workspace 内产生更多同名导航项。

变化：

- 新建和重命名 category 统一使用 trim 后、大小写不敏感的纯 model 校验。
- 同一 workspace 的冲突会被拒绝并通过 toast 提示；不同 workspace 可以使用相同名称。
- 重命名自身当前名称允许通过 folder id 排除；normalize 不合并、不删除、不迁移已有重复 category。

判断：

- 将规则放在 model helper 并由 manager 两个边界调用，避免创建和重命名行为漂移。
- 保留历史数据，避免用户升级时 category id、session 归属或排序发生隐式变化。

当前状态：Current。

### 2026-07-11: 移除 board 折叠与 tab preview 截断

用户验收后确认 category/session/global collapse controls 和 Show more / Show fewer 会增加 board 操作噪音；session card 应直接展示匹配 tabs，并由 card 内 tab list 负责纵向滚动。

变化：

- 保留顶部 category tabs 和 category/grid 的 drop 与 DnD 语义，但移除 category section title/count/collapse header。
- 移除 manager 内 category、session、global collapse handlers/actions；`group.collapsed` 等模型字段保持兼容。
- Session More 不再显示 Collapse；全部 matching tabs 直接渲染，不再使用 preview limit 或 Show more / Show fewer。

判断：

- Board 结构和拖拽目标继续表达组织关系，折叠控制交给 card 内滚动，减少状态和入口数量。
- 保留数据字段避免 legacy state migration，后续若需要折叠应重新评估交互收益。

### 2026-07-11: Options 与 capture surface 简化

这一阶段曾尝试把 capture eligibility 从 Options 中移除，以简化浏览器现场表达；后续 React parity work 恢复并统一了现有 settings-aware capture policy。

变化：

- 当前 Options 只保留自定义 URL 过滤规则，并由 shared capture policy 统一用于 Open Tabs、capture 和 DnD eligibility。
- 非 storable rows 仍留在 selected-window Open Tabs 中，显示原因，不进入选择或拖拽。
- Category board 不恢复 header/collapse/Show more 等结构控制；session card 直接渲染全部 matching items，由 card 内列表滚动。

判断：

- Open Tabs 应表达完整浏览器现场，同时明确指出当前 settings 为什么阻止保存。
- 统一 policy 避免 checkbox、DnD 和 background capture 出现“看得到但保存结果不同”的漂移。
- 结构导航和内容滚动分别由 category tabs 与 session card 内部列表承担，减少重复控制。

当前状态：Capture-policy simplification superseded；board simplification remains Current。

### 2026-07-10: Pinned tabs 分区与底部 Filter tabs

Open Tabs 需要同时说明“当前存在”与“当前可保存”的边界，并让窗口内 tab 较多时仍能快速定位。

变化：

- Background 保持 capture 过滤语义不变：所有 pinned tabs 都保留可见；普通 pinned tab 可由 Include pinned tabs 开启保存，特殊/排除 URL 仍标记为不可保存。
- Selected window 的 Open Tabs 固定显示 Pinned 区；大量 pinned tabs 通过单行横向滚动保持可达，regular tabs 作为唯一纵向滚动区域。
- Sidebar 底部增加独立的 Filter tabs 输入，只过滤当前 selected window 的 pinned/regular rows。
- 不可保存 pinned row 不提供 checkbox、拖拽或按 URL 筛选 sessions，并显示 `Not saved by current settings`。
- open-tab URL 筛选 saved sessions 的 `openTabFilter` 与底部 query 分离；切换 window 或刷新 tabs 不会自动清除 saved-session filter。
- Options 修改 Include pinned tabs 或 exclude URL patterns 后，manager 会重新加载 Open Tabs eligibility，避免旧 `storable` 状态残留。

判断：

- Pinned tab 的可见性帮助用户理解浏览器现场，storable 标记避免把 capture 约束隐藏成“tab 消失”。
- 两种 filter 服务不同对象：底部 query 负责当前窗口内定位，右键 URL filter 负责反查历史 sessions。

当前状态：Superseded by 2026-07-11 Options 与 capture surface 简化；window chips 和底部 Filter tabs 保留，pinned strip、regular-only scroll 和 settings eligibility 已移除。

### 2026-07-10: Window sidebar 收敛为 tabExtend 风格 chips

用户希望 Open Tabs 更接近 tabExtend 的 window sidebar：workspace 信息不应占据 sidebar header，多个 Chrome window 也不应同时展开。

变化：

- Workspace switcher、stats、新建/重命名 workspace 移到右侧 topbar 的 category tabs 左侧。
- Sidebar header 改为 window chips、collapse 和新建 Chrome window。
- Open Tabs 通过 chip 切换 selected window，一次只渲染一个 window；保留当前 window 的 save、dedupe、select 和拖拽流程。
- 新建 Chrome window 后自动选中该 window 并刷新 Open Tabs。

判断：

- Window 是 Open Tabs 的导航上下文，适合放在 sidebar header；workspace 是 saved sessions 的上下文，适合放在 main topbar。
- Pinned/regular 分区和底部 Filter tabs 留给后续任务，不在本次引入。

当前状态：Partially superseded by 2026-07-11；window chips、sidebar actions 和单一 selected-window list 保留，pinned 分区方案不再采用。

### 2026-07-08: Board-first UI rework 和 capture cleanup

用户手动验收发现上一轮 manager-first 设计仍有明显问题：context strip 语义不清、inspector 价值低、Open Tabs 只显示 current window、select mode 跳动、DnD 落点不清、popup 缺少 dedupe/settings/delete/preview，Options 中特殊 URL 设置和界面设置也不清晰。

变化：

- Manager 改为 Board-first：顶部 toolbar + 左侧 Open Tabs/Categories + 右侧 session board。
- 移除 context strip 和常驻 inspector。
- Open Tabs 展示所有 windows，一次只展开一个 window。
- Select mode 只覆盖 window title 行，不改变 tab 列表布局。
- Session DnD 改为源位置 placeholder + target slot 预览：左右 25% 插入前/后，中间 50% 让被拖拽 session 占目标位置，目标卡回填源空位。
- Popup 改为横排 Save/Open/Dedupe quick actions，并增加 Settings、recent session Delete、hover/focus tabs preview。
- Save 完成后 popup 关闭，manager 打开/聚焦、定位刚保存 session，并用浮层 toast 提示。
- Capture 默认按源 tabs URL 去重，清理 about:blank 和重复源 tabs。
- Options 用 exclude URL patterns 取代 chrome/file 单独开关，默认 `chrome://*`、`file://*`。
- Favicons 始终展示；危险操作始终确认；session toolbar 外露动作不再可配置。
- Popup、Manager、Options 统一使用 `src/icons.js` 图标和共享 control sizing tokens。

判断：

- Popup 只做 trigger surface，不做小 manager。
- Manager 的核心是 session board，不应该把解释性 UI 和低价值 inspector 放在主路径。
- Drag and drop 反馈必须清楚表达最终 slot；session 排序允许轻量 live reorder，但不能重新引入 session 合并语义。

当前状态：Partially superseded by 2026-07-11 Options 与 capture surface 简化；popup、board-first 主线和 DnD 语义保留，`about:blank` cleanup 与 exclude URL patterns 已移除。

### 2026-07-09: Session drag target-slot hardening

用户继续手动验证 session 拖拽，发现跨多个 session 排序时 target card 会在边界附近回闪，尤其是拖第 2 个 session 到第 1/4 个 session 附近时。

变化：

- 目标 card 左右 25% 保留 before/after 插入语义。
- 目标 card 中间 50% 改为 target slot 语义：被拖拽 session 占据目标位置，目标 card 回填源空位。
- drag start 记录源卡片 rect，避免隐藏后的源卡片实时 rect 抢回 placeholder。
- 进入 target slot 后记录目标卡片原始 rect，并用 release margin 保持 target lock，降低 grid 重排造成的回闪。

判断：

- 当前体验仍可能有原生 DnD 瑕疵，但已经达到可用线，先停止继续打磨。
- 后续如果继续优化，应考虑替换原生 HTML DnD 为 pointer-driven drag，而不是继续叠加边界补丁。

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

- tabExtend 的优点是“按工作流组织”，但如果照搬过多，会让 TabBoard 变重。
- TabBoard 后续要保持 OneTab 的轻量保存恢复，同时选择性吸收 tabExtend 的组织能力。

### 2026-07-06: 新标签页改为 TabBoard

增加 Chrome `chrome_url_overrides.newtab`，让新标签页直接进入 TabBoard。

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

当前状态：Superseded by 2026-07-11 移除 board 折叠与 tab preview 截断；session card 现在渲染全部 matching items，并由 card 内列表滚动。

### 2026-07-06: Inline rename

原来只能从 session 的 More 菜单里 Rename，路径太深。

变化：

- 双击 session 标题可直接 inline rename。
- `Enter` 保存，`Esc` 取消，失焦保存。
- More > Rename 继续保留，复用同一套保存逻辑。

判断：

- 命名是整理 tabs 的高频动作，应该贴近标题本身。

### 2026-07-06: Quick list / Pinned workflow 下线

Quick list 来自 tabExtend 的 Pinned workflow 思路，但在 TabBoard 当前体验中不够清晰。

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
- Chrome 内部页、扩展页、TabBoard 自身页面等不可可靠保存的 tabs 不在列表中展示。

判断：

- 单 tab 保存是低价值高噪音操作。
- 用户更常见的动作是“把一组当前上下文保存下来”或“找之前是否保存过这个 tab”。

当前状态：Partially superseded by 2026-07-11 Options 与 capture surface 简化。

- Open tab 多选创建 session 会走后台 `tab-ids` capture 模式。
- 拖动 open tab 到 session 是追加记录，不关闭浏览器里的 tab。
- Open Tabs 现在展示所有 browser tabs；符合 shared capture policy 的非 TabBoard tabs 可保存，TabBoard 自身页、无 usable URL 或被 policy 排除的 rows 保留可见并显示原因。

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

当前状态：Superseded by 2026-07-11 Options 与 capture surface 简化；特殊 URL 开关已删除，除 TabBoard 自身页和无 usable URL 外均尝试保存，恢复失败时保留 saved record。

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

当前状态：Superseded by 2026-07-09 tabExtend-style visual board clone；顶部 category tabs 现在切换单一 active category board，不再滚动全部 category sections。

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

当前状态：Superseded by 2026-07-11 移除 board 折叠与 tab preview 截断；manager 不再提供 global、category 或 session 内容折叠。

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

当前状态：Superseded by 2026-07-08 Board-first UI rework 和 2026-07-11 移除 board 折叠与 tab preview 截断；session toolbar 配置已删除，Restore 固定外露，其余动作进入 More，Collapse 已从 manager 移除。

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

- TabBoard 当前阶段优先做好 tab/session 管理，避免引入半套任务管理模型。
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

当前状态：Partially superseded by 2026-07-10 Window sidebar 收敛和 2026-07-11 移除 board 折叠与 tab preview 截断；workspace 仍在主 topbar，sidebar 现在承载 window chips 和 Open Tabs，全局折叠入口由后续 board 简化移除。

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

使用 `chrome-extension-ui` 规则审查后，确认 TabBoard 的主价值不在 popup 里完成管理，而是在 new tab manager 中稳定整理和恢复 sessions。

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

当前状态：Partially superseded by 2026-07-08 Board-first UI rework；manager-first 定位、popup 和 Options 分层保留，context strip 与常驻 inspector 已移除。

### 2026-07-09: tabExtend-style visual board clone

用户选择先复刻 tabExtend 的 visual board 思路，再基于实际使用慢慢微调。随后根据截图反馈，category 改为顶部 segmented tabs，workspace 切换入口放在顶部最左侧。

变化：

- 顶部 toolbar 最左侧展示 workspace switcher。
- Categories 从左侧 sidebar 移到顶部，使用 tabExtend 风格 segmented tabs。
- 点击 category tab 会切换右侧 active category board，而不是展示所有 category sections。
- Session card 增加 favicon stack、link/note meta、locked/starred chips 和 note preview。
- 当时 Session、saved tabs、open tabs 都可拖到顶部 category tab。现行规则由
  2026-08-02 DnD 收口替代：顶部 `category-column` 只接收 Session；
  Saved/Open 使用 Existing Session 或 New Session Gap Anchor / target picker。
- Popup、Options、数据模型和现有 DnD target-slot 语义保持不变。

判断：

- 这次优先复制 tabExtend 的顶部 category 切换和 visual card 组织方式，而不是继续做极简调整。
- 先用原生 DOM/CSS 实现现代 board，不引入 React、bundler 或新依赖。
- 后续再基于手动验证决定是否加入 inspector、view toggle、onboarding 或更完整的 workspace rail。

当前状态：Partially superseded by 2026-07-11 Options 与 capture surface 简化；top category tabs、active board 和 session card 视觉保留，Options/capture eligibility 已改变。

### 2026-07-10: Full-height collapsible sidebar and horizontal sessions

用户继续要求整体布局向 tabExtend 靠齐：manager 明确切成左右两栏，Open Tabs 使用全高 sidebar，右侧 sessions 变成全高横向列表。

变化：

- Workspace switcher 移入左侧 sidebar header。
- Sidebar 可折叠成窄 rail，折叠状态保存在 manager localStorage。
- Open Tabs 占满 sidebar 剩余高度，并使用单一内部纵向滚动容器。
- 右侧 active category board 改为单行 horizontal track。
- 每张 session card 充满 board 高度，tab list 在 card 内独立滚动。
- Session action menu 使用 fixed positioning，避免被横向 board 裁切。
- Popup、Options、数据模型、capture/restore 和 target-slot DnD 语义保持不变。

判断：

- Sidebar、category strip、session columns 形成更接近 tabExtend 的稳定桌面工作台。
- 横向 board 优先服务大屏和重复整理场景，不再让 sessions 自动换成多行 grid。
- 后续继续观察横向拖拽边缘滚动、窄屏表现和 sidebar 折叠入口的可发现性。

当前状态：Partially superseded by 2026-07-10 Window sidebar 收敛和 2026-07-11 Options 与 capture surface 简化；全高双栏和横向 session board 保留，workspace 已移回主 topbar，sidebar 顶部改为 window chips，Options/capture eligibility 已改变。

### 2026-07-12: Nord visual system and local Web Awesome shell controls

用户确认继续参考 tabExtend 的紧凑工作台思路，但将视觉语言统一到 Nord，并允许引入适合原生 DOM/MV3 的设计系统。

变化：

- 建立 Nord0-Nord15 primitives 和 light/dark `--zt-*` semantic tokens，删除旧 teal、硬编码蓝色、Manager radial gradient 和 glass surface。
- Sidebar 与 main topbar 使用 64px shared header rail；main controls 统一 40px，sidebar controls 统一 32px。
- Window chips 收敛为只显示 ordinal/tab count 的 compact selector，不再显示 `Current window` 或 raw Chrome window ID；Dedupe 进入 window More。
- Workspace switch/create/rename/stats 收进单一 dropdown；顶部 category tabs、search 和 utilities 对齐同一 control line。
- 删除 category outer frame 和多余 board padding；session cards 直接位于 Nord canvas 上，并使用 card 内纵向滚动。
- 本地 vendoring Web Awesome `3.10.0`，保留 license、来源、integrity、1,066 个 checksums 和 remote-font patch；Manager 的 search、window selector、workspace dropdown 使用静态本地 Web Components。
- Session/category/tab rows、DnD hierarchy、context menu、本地图标 registry 和 shared tooltip service 继续保持 TabBoard 自定义实现。
- Popup 与 Options 复用 Nord tokens 和统一 control sizing，不改变 quick actions 或 Basic/Advanced 信息架构。

判断：

- Web Awesome 只接管稳定通用 controls，避免 Shadow DOM 或 shared button migration 扩大到脆弱 DnD surface。
- Nord semantic tokens 同时约束自定义产品组件和 Web Awesome，避免出现两套视觉语言。
- Global button/tooltip/dialog、session/window action menu 和 settings checkbox/radio migration 延期；需要浏览器级 keyboard/focus/DnD 验证后再逐 family 推进。

当前状态：Superseded。该阶段的 Nord native shell 与本地 Web Awesome 组件已随 React + Mantine 重写整体退役；当前 Manager 使用 Mantine 组件与 `@tabler/icons-react`，vendor 目录已删除。

### 2026-07-12: Progressive disclosure rail and popover lifecycle

用户继续以 tabExtend 的 hover 模式优化高密度 Manager：默认界面应保持内容优先，完整 sidebar 和对象级操作只在用户表现出意图时出现。

变化：

- collapsed sidebar 现在显示 selected-window icon rail、tab favicon projection 和 Filter tabs 入口；hover 或 keyboard focus 以 absolute overlay 展开完整 sidebar，不改变 board 宽度或 selection payload。active drag 暂时禁用 overlay pointer events，防止它遮挡 board drop target。
- rail 只复用当前 Open Tabs 的 model 并聚焦现有 row/filter；不创建第二份 tabs state，也不参与 drag/drop。
- info popover 内的 Filter、Close、Edit、Copy、Delete、Select 等动作在业务 mutation 前统一关闭浮层，并在下一帧恢复仍可用的 row/session/filter focus fallback，避免页面重绘后保留旧内容或隐藏 keyboard focus。
- hover/focus/coarse-pointer 渐进披露、右置 selection checkbox、stable favicon fallback 与本地图标均保持为 Manager 自定义 DOM contract。

判断：

- hover 是增强层，不替代 keyboard、touch 或 context-menu 路径。
- absolute overlay 比扩张 grid 更安全，因为不会移动 session card、target slot 或 insert marker。

当前状态：`npm test` 与 `npm run check` 自动验证通过；Chrome manual gate 仍包括 rail hover/focus、coarse pointer、200% zoom、screen reader 与全部 DnD 路径。

### 2026-07-12: Manager empty-shell resilience 与 wa-select event repair

Manager 启动阶段出现依赖或异步顺序问题时，页面不应停在空白页，也不能让旧 storage 快照覆盖刚到达的新 state。

变化：

- 先同步准备 normalized 默认 state、渲染 Manager shell，并发起 Open Tabs request；storage state 改为异步 apply。
- 将本地 Web Awesome module 放在独立 failure boundary；修复 `wa-select` window event 接收路径，保持 window 切换可用。
- 增加 startup revision guard，并按 popover、storage、migration、shell 等阶段分别降级和提示。

判断：

- 这是启动可靠性修复，不改变 state schema、DnD 语义或 Chrome API contract。
- 空 shell 比等待所有依赖后再首屏更可恢复，也让单个 control/module 故障不会拖垮 Manager 主路径。

当前状态：开发、spec review、quality review 与自动验证已完成；Chrome manual regression 仍待用户执行。

### 2026-07-19: Open Tabs checkbox-first multi-selection

变化：

- 首次勾选可保存 tab 直接进入多选态；同一组选中 IDs 同时用于 multi-tab DnD 与创建 session。
- 多选态替换 sidebar footer 的 Filter tabs，提供 icon-only 的创建 session、批量删除、批量 pin 与退出操作。
- 批量 Chrome 操作完成后只刷新一次 Open Tabs 列表；操作失败保留 selection 供重试。

判断：

- checkbox 只表达“准备处理这一组 tabs”，不再要求用户先发现独立的选择模式入口。
- DnD 继续复用现有 typed `open-tabs` payload，不新增平行数据模型。

当前状态：已实现并由 runtime/preview tests 覆盖；Chrome 手工 DnD 回归仍待执行。

### 2026-07-20: Popup capture scope and safe window dedupe

变化：

- Popup 改为当前窗口概览：展示总 tab、pinned、重复 URL 和 Chrome tab group 数量；pinned 与 grouped tabs 可以独立排除出本次 Save。
- Popup Dedupe 直接关闭当前窗口的重复 tabs 并关闭 popup；同 URL 优先保留 active tab，否则保留最近访问的 tab。

判断：

- 保存范围在提交前可见且可控，避免为短暂保存临时修改全局 capture settings。
- 去重保留正在使用的 tab，其他重复集合遵循最近访问的可预测规则。

当前状态：已实现，自动测试与 Popup preview 验证通过。

### 2026-07-27: UI accessibility, responsive command model, and URL navigation

变化：

- Manager 增加 skip link、页面 heading、键盘 session rename、语义化 note edit、可进入动作的 detail popover 和稳定 sidebar focus。
- Category reorder hit areas 改为绝对定位，不再撑高 48px topbar。
- 390px compact header 使用 More actions 保留 Import、Export、Trash、Options；展开 Search 时独占 header 内容区。
- Workspace/category/Bin/search 写入 URL 并支持 Back/Forward；无效 ownership 自动回退。
- Workspace create/rename 改为 validated modal，移除 native prompt。
- Popup 增加 hydration 状态、landmark 和 Dedupe confirmation。
- Options 跟随主题，移除 usage dashboard cards，Basic/Advanced 分层，`?advanced=1` 恢复展开状态，Reset 增加确认。
- shared UI 增加首帧 system theme、匹配页面背景的 theme-color、Intl 日期/数字格式、focus/touch/modal/reduced-motion foundation。
- Manager floating Tooltip/Menu 留在 main landmark；fixed Modal/Confirm 改由 shared compound owner portal 到 `body`，避免 flex/grid main 将 dialog 偏移出视口。Modal header 使用 `role="presentation"`，仍保留 H2 title 与 dialog `aria-labelledby`，页面只暴露一个 banner。全部 floating transitions 取消关闭 fade；Open Tabs favicon lazy-load，session/Open Tabs/Trash 使用 `content-visibility` 跳过 off-screen paint。
- 动作、标题与 accessible names 统一 Title Case；异步按钮使用明确且以 `…` 结尾的进行中 copy，generic errors 提供下一步。

判断：

- 高密度工作台继续保留，但 hover 不再是键盘和触控路径的前提。
- Compact 模式不应通过隐藏功能解决空间不足。
- Page-local navigation state 属于 URL，不属于持久化业务 schema。

当前状态：已完成。Manager、Popup、Options 的 light/dark、窄屏、reduced-motion、菜单与对话框开放态均完成浏览器复审；最后一轮 Web Interface Guidelines 静态扫描无 unresolved finding，axe open/default states 为 0 violations / 0 incomplete；全量 build/check/Vitest/E2E 与 DnD 回归通过。

### 2026-07-27: UI / UX Pro Max interaction and ownership refactor

问题：

- 折叠 sidebar hover 推动 board，category navigation 与 keyboard DnD 共用 activator，Manager 缺少 Save Window。
- Open Tab 主动作依赖 double click，coarse-pointer 动作既过密又可能被 rail 裁剪。
- Popup 不显示实际保存数量，Options 文本设置逐键保存且 Basic card 过重。
- Open Tabs、Session Card、Manager DnD 仍混合渲染、状态和 geometry ownership。

变化：

- Sidebar disclosure 改为 absolute overlay，不再改变 main track。Category label 与 reorder handle 分离；Manager Open Tabs 恢复 Save Window，并让单击/Enter Focus tab，More 承载详情动作。
- `AccessibleIconAction` 增加 compact/touch density；compact drawer使用 44px targets与8px间距，collapsed rail只保留当前 window、row Focus和Expand Sidebar。被覆盖的 topbar/main surface使用`inert`。
- Popup 的 Save 文案显示实际 selected result；Dedupe confirmation关闭后显式回焦。Options Basic改为无框 sections，自定义过滤规则500ms/blur提交，标题区稳定显示保存状态，Reset confirmation显式回焦。
- Category/window/session metadata增加orientation data；功能 metadata底线为12px/16px。Board、session tabs、Open Tabs通过`useOverflowCues`只在存在更多内容时显示edge cue。
- Open Tabs拆为window/selection/list/filter owners；Session Card拆为header/meta/editor/tab-list owners；Manager DnD拆为geometry/sensors/overlay owners。

迭代复审：

- `ui-ux-pro-max`的portfolio/exaggerated-minimalism/orange生成结果与产品不匹配，明确拒绝；采用Productivity Tool/File Manager的dense、flat、low-motion规则。
- Rendered review额外发现并关闭collapsed rail中的裁剪/离屏focus targets、compact row 2px action spacing、Popup/Options confirmation focus return，以及Open Tab info actions的错误menuitem语义与缺失名称。
- 保留horizontal session board、完整DOM + `content-visibility`、schema/storage/mutation wire和现有DropIntent语义；没有恢复session merge，也没有新增runtime dependency。

当前状态：已完成。`npm run check`、76 files / 1,006 Vitest、26/26
Playwright、三轮15/15 DnD与三轮compact gate通过；最终静态/渲染复审无
unresolved finding，完整证据见
`docs/reviews/2026-07-27-ui-ux-pro-max-review.md`。

### 2026-07-28: Manager / Options 启动性能重构

问题：

- Options Basic 只显示 settings，却等待完整 state 经 MV3 worker、Storage
  Authority 和 Zustand 重复读取/normalize。
- 300 sessions × 20 tabs 的生产 fixture 会在 Manager 首次 commit 前挂载
  196 个完整 session cards 和 3,920 个 tab rows；CSS
  `content-visibility` 无法跳过 React hooks 和 dnd-kit registration。
- Open Tabs 启动事件、diagnostics storage 写入和 file-only modules 继续
  争用首屏。

变化：

- Authoritative Publication 改为订阅优先并只执行一次 Storage Authority
  initializer；页面 hydration 不再通过 worker 往返完整 state。
- 新增 disposable SettingsProjection。Options Basic 只读取该 projection，
  缺失/损坏时才执行一次 canonical repair；mutation 仍由既有 worker wire
  提交。
- 每个 session 保留稳定 `SessionSlot` 和 insertion geometry，但仅初始 6
  个、近视口 overscan、搜索/高亮或显式点击目标挂载完整 card/tab tree；
  远端使用可拖拽的 `SessionCardShell`。
- Open Tabs lifecycle event 使用单 active + 单 trailing coalescer；tab row
  不再各自订阅 event-only store commands，category/index derivation 改为
  单次遍历和 Map。
- info diagnostics 250ms batch；warn/error 立即 flush。Options Advanced 与
  file backend 改为 literal dynamic import；browser mode 不加载 file-only
  modules。
- production benchmark 纳入 repo，并按轮次交错场景/页面，避免整批顺序
  偏差。

判断：

- 不引入第三方 virtualization；虚拟化的是昂贵交互内容，不是 DnD
  geometry。
- D033 的完整 session interaction DOM 决策被部分取代。TabBoard search
  仍覆盖全部 canonical state；浏览器 Ctrl+F 不再命中未激活 tab row。
- structural sharing 继续是 authoritative owner；稳定引用同时用于 DnD、
  overlay lifecycle 和 activation，未散落局部深比较。

当前状态：实现完成，最终 production benchmark、全量测试和 Chrome
acceptance 证据记录在
`docs/reviews/2026-07-28-react-startup-performance-review.md`。

### 2026-08-02: Crisp Utility 取证式一致性修复

问题：

- 页面终态截图和 axe 全绿未覆盖 Open/Saved 行的 metadata 缺失、字体 token
  漂移、hover/selected material、Session title 字号和离屏 intrinsic geometry。
- Popup 可见 duplicate count、preview harness 与 worker 各自维护规则，Exclude
  URL 和 pinned duplicate 场景可能导致 UI 结果与实际关闭集合分叉。
- Options 长 folder name 会换成多行；fallback 的两个恢复动作分散在不同层级，
  部分 polished helper copy 也回退成泛化文案。

变化：

- Open/Saved 行统一为 14/20 title、12/16 metadata 和至少 44px；Link/Note
  都保留两层 copy，checkbox/favicons 视觉盒继续精确重合，hover/selected
  material 与 44px intrinsic placeholder 同步。
- Session T1 title 明确为 14/18、最多两行；Rest/Hover/Focus/Menu Open 四态和
  32px actions 建立 computed-style E2E。
- 新增 shared `classifyWindowDuplicates()`。Worker、Popup 和 preview harness
  共用 removable/protected-pinned 分类；Popup Save 仍遵守 Exclude URL rules，
  独立 Remove scope 仍展示整个 eligible window 的真实可关闭数量。
- Popup 补齐 duplicate result helper，并对 mixed、pinned-only、excluded、
  keep-all、regular-only、all-pinned 六场景验证实际关闭结果。
- Options 恢复 pinned-safe Capture、Toolbar、Keyboard、Reset copy；长 folder
  name 使用 14/20 单行省略；fallback 将 Reconnect 与 Use Browser Storage
  归入同一恢复动作区。
- Manage Workspaces 补回 manager 内部 `New Workspace`，并与 Manage Categories
  统一为 title + 动态数量/drag subtitle、header New/Add、分隔 footer Done。
  Create/Edit 继续复用同一个 editor；nested inert 与 exact focus return 不变。
- 具体 Lucide glyph 也纳入合同，不再只检查 icon library/stroke：Save=`Inbox`、
  Restore=`SquareArrowOutUpRight`、Settings=`Settings2`、Trash/Bin/Delete=`Trash`；
  Manager toolbar glyph 统一 18px。Reset/Reconnect/Archive 等辅助语义保留各自图标。
- Popup Save/Remove 恢复为固定 80x32 纯文本动作；Options Browser storage 将
  Choose Folder 放回 primary row，并在 detail row 说明 Chrome profile storage。
- Options Basic 恢复 polished capture/restore/focus helper 和 Exclude URL 的
  comma/new-line 输入说明。
- 最后一次 unpacked 交叉复查纠正了 Phase 20 的过度约束：Open Tab 展开态
  恢复 Preview 10 的 24px leading column，同时通过 9.5px row inset 保持
  collapsed / pinned / Peek 全程 favicon center 不跳；collapsed rail 继续使用
  43px identity column。
- Manage Workspace / Category 的可排序行补充 `role="group"`，使可聚焦整行的
  accessible name 合法；Workspace 普通行与 Category 一致使用显式 surface，
  current/active 状态材料不变。
- 删除 Window 顶栏遗留的 Save Window。它与下方 Save All 共用同一个
  `captureWindow` owner，没有 scope 或结果差异；整窗保存现在只由 Open Tabs
  context bar 提供，Window 顶栏只保留 disclosure command。

判断：

- Preview/spec 是视觉与交互 source of truth，但最终生产 token 使用非缩尺的
  14/20、12/16 和 32/44px 体系。
- 结构、computed geometry、时间、交互焦点和 accessibility 必须分别取证；
  缺少任一维度时不能用“页面看起来正常”替代验收。
- 动画稳定性不能反向覆盖静态密度合同；列宽、页面坐标和状态内边距需要分开
  建模并同时验收。
- Popup 的 Save scope 与 Remove scope 是两个不同业务集合，不能共享 capture
  filter；重复分类必须由 shared domain owner 统一。

当前状态：实现完成，自动边界与手工边界记录在
`docs/reviews/2026-08-02-crisp-utility-forensic-parity-audit.md`。

### 2026-08-02: Tooltip 单一 owner 与 File Storage worker 修复

问题：

- 普通 icon action 同时渲染 Mantine Tooltip 和原生 `title`，部分调用方又在
  `AccessibleIconAction` 外包第二层 Tooltip，导致同一位置出现两个 tips。
- Mantine 的延迟打开 timer 在按钮点击后仍可触发；pointer 不移动时，已执行的
  动作上会重新出现 stale tip。Tab hover 的自定义 180ms tooltip 也缺少相同的
  activation suppression。
- 仓库同时存在独立的 `vite.config.js` / `vite.config.ts`。测试显式加载新 TS
  配置，但 `npm run build` 默认加载旧 JS 配置，导致真实 CRX 产物仍向 service
  worker 共享 chunk 注入访问 `document` 的 module-preload helper。该异常又会以
  `File storage error: document is not defined` 持久化为 Browser fallback。

变化：

- 新增 `TabBoardTooltip` 作为普通控件唯一 owner；移除 native `title`、嵌套
  Tooltip 和 ManagerFrame 对所有 `aria-describedby` 伪造 `mouseout` 的补丁。
- 标准 Tooltip 在 pointerdown/click 时同步清除可见层和 pending timer，并只在
  真实 pointer move 或 leave 后进入新 hover 周期。Tab hover tooltip 独立保留
  180ms、C3 menu description 独立保留 550ms，但 tab activation 同样抑制到真实
  movement。
- `dev/build/preview` 显式绑定 `vite.config.ts`；`vite.config.js` 只 re-export
  该 source。页面 entry 保留 modulepreload 和 file-only lazy chunks；MV3
  service worker 通过既有 loader seam 静态注入 fileStorage/fsDirectory，避免
  Chrome 禁止 worker dynamic `import()` 后又被 Vite error handler 遮蔽成
  `window is not defined`。
- Storage Authority 对上述 `document` / `window is not defined` 历史构建错误
  自动重试 File backend；普通 permission、
  corruption 或 offline fallback 不自动重试。Options 检测到该精确旧状态时主动
  初始化一次 Authority，因此无需先打开 Manager 或手工 Reconnect。

当前状态：Current。静态 owner 门禁、Authority/Options/production-build 回归和
真实 Chromium Tooltip 时序均已覆盖；原生 folder picker/OS permission 仍是手工边界。

### 2026-08-03: 全项目 Tip 生命周期统一

问题：

- Compact action、菜单解释、Tab 富预览和 New Session 拖拽提示分别持有 timer/open
  state；跨类型移动时旧提示不会被新提示可靠清除。
- Mantine 菜单无条件聚焦首项，使 pointer 打开也立即触发 focus tip；切换到其他
  menu item 后，旧 focus tip 与新 pointer tip 可以同时存在。

变化：

- 新增 page-realm 级 `tipLifecycle` coordinator，统一 pending timer、current owner、
  replacement 和 release。四类既有模板与 1000/550/180/300ms 延迟保持不变。
- Pointer 打开菜单不自动聚焦首项；keyboard 打开仍聚焦首项但不显示 tip，第一次
  Up/Down 后立即显示当前项说明。
- 新 owner claim 前同步清理旧 timer、可见层和 `aria-describedby`；activation、
  leave、Escape、blur、drag start/drop/cancel 都释放 ownership。

当前状态：Current。预览已确认，focused Vitest 与 Chromium menu/action 回归通过。

### 2026-08-03: Popup Duplicate Remove 取消二次确认

- Popup 已明确展示可移除 duplicate 数量和保留策略；额外确认弹窗在 320px viewport
  中被截断，并重复同一信息。
- Remove 现在直接调用既有 `dedupe-window` worker action；loading、错误反馈、pinned
  protection 和成功后关闭 Popup 的行为不变。
- 其他 destructive action 的确认策略不变。

### 2026-08-04: GitHub Release 产物与 Chrome Web Store 首发准备

- `vX.Y.Z` tag 成为唯一发布入口；tag、`package.json`、`package-lock.json` 和
  `manifest.json` 版本不一致时停止发布。
- GitHub Actions 在 check、unit 和串行 Chromium E2E 通过后，生成根目录包含
  `manifest.json` 的 ZIP 和 SHA-256 文件。用户无需安装 Node.js 或在本地构建。
- README 将 GitHub Release 作为当前二进制安装入口，并明确解压安装不会自动更新。
- 新增公开隐私政策、Chrome Web Store 首发文案、权限说明和 1280x800 合成数据截图。
- 首次 Web Store 提交使用 GitHub Release 的同一份 ZIP；API 自动上传等待首个条目
  审核通过并获得 item ID 后再实现。

当前状态：`v0.1.0` 因历史 lockfile 中残留内网 registry 地址而在 `npm ci`
阶段失败，未创建 Release；`v0.1.1` 已通过公开 registry、check 和 unit，但 Linux
runner 暴露三处本地时区、字体子像素和固定动画采样的 E2E 假设，同样未创建 Release。
`v0.1.2` 修复上述合同，但提交前清理误删了相邻动画测试实际使用的局部声明，线上
91/92 后停止，未创建 Release。恢复声明后使用不可变的新 patch 版本 `v0.1.3`
重新发布。`v0.1.3` 的 CI 全部通过并创建了 Release，但发布后验收发现 Playwright
dev server 在 E2E 阶段覆盖了 `dist/`，导致 ZIP 包含 CRXJS dev loader；该 Release
已标记为不可用 prerelease。`v0.1.4` 在打包脚本中拒绝 dev loader，并在 E2E 后重新
production build/check 再打包。

发布结果：

- Release：`https://github.com/zhaoshe/tab-board/releases/tag/v0.1.4`。
- Workflow：`https://github.com/zhaoshe/tab-board/actions/runs/30877302356`，
  全部步骤通过。
- 产物：`tabboard-v0.1.4.zip` 和 `tabboard-v0.1.4.sha256`。
- ZIP SHA-256：
  `582778e8611bb371dd9bad412a85f672c74ccd6b7ed4624939e6bae4e145b81b`。
- 下载后复算摘要一致，ZIP 根目录与 production HTML 检查通过。
- 使用下载后的 ZIP 运行真实 MV3 empty Manager/Options benchmark 通过；
  Manager 发起一次 Open Tabs worker 调用，页面和 worker 启动正常。

当前状态：`v0.1.4` 是首个可安装 Release，可用于 Chrome Web Store 首次人工上传。

### 2026-08-05: 危险操作确认开关覆盖全部危险入口

- Options Advanced 文案改为 `Confirm before dangerous operations`。
- 保留 `confirmBeforeDestructive` 持久化字段和默认开启值，不做 schema migration。
- 开关现在统一控制 Session/Saved Item 删除、浏览器 Tab 关闭、Workspace/Category
  删除、Trash 永久删除/清空和 Reset Settings。
- 关闭后直接执行原 mutation/runtime command；Workspace/Category 删除失败继续在
  manager 内显示错误，并可再次点击 Delete 重试。
- Storage migration 策略对话框继续保留；Popup duplicate Remove 继续直接执行。

当前状态：Current。

## 待观察问题

- 右键菜单触发筛选是否足够容易被发现。
- 批量拖动已勾选 open tabs 到已有 session 是否需要更明显的拖拽提示。
- 拖动 open tab 到 session 是否需要视觉提示说明是 copy 而不是 move。
- Quick list 下线后，是否还需要更轻量的“临时工作区”概念。
- Kanban/grid 在 session 数量很大时是否需要虚拟列表或分页。
- icon-only 动作在新用户第一次使用时是否足够清晰。
- `Inbox` 是否比 `Unfiled` 更符合用户对“没有 category”的直觉。
- 2026-07-19：收敛 Open Tabs URL policy 为单一自定义过滤规则。pinned、`chrome://` 与 `file://` 不再因内建规则不可选；命中自定义规则的 tab 直接从列表隐藏。
