# tabExtend 功能、UI、UX 分析报告

> 分析对象：`chrome-extension://ffikidnnejmibopbgbelephlpigeniph/assets/html/newtab.html`
>
> 证据来源：
> - 安装包入口：`/Users/zhaoshe/Library/Application Support/Google/Chrome/Default/Extensions/ffikidnnejmibopbgbelephlpigeniph/3.4.3_0/manifest.json`
> - 新标签页壳：`/Users/zhaoshe/Library/Application Support/Google/Chrome/Default/Extensions/ffikidnnejmibopbgbelephlpigeniph/3.4.3_0/assets/html/newtab.html`
> - Side panel 壳：`/Users/zhaoshe/Library/Application Support/Google/Chrome/Default/Extensions/ffikidnnejmibopbgbelephlpigeniph/3.4.3_0/assets/html/sidebar.html`
> - 本地化文案：`/Users/zhaoshe/Library/Application Support/Google/Chrome/Default/Extensions/ffikidnnejmibopbgbelephlpigeniph/3.4.3_0/_locales/en/messages.json`
> - 打包后逻辑：`/Users/zhaoshe/Library/Application Support/Google/Chrome/Default/Extensions/ffikidnnejmibopbgbelephlpigeniph/3.4.3_0/newtab.js`、`background.js`
>
> 说明：本报告基于安装包静态拆解，不基于长时间真人试用；结论以代码、manifest、文案、资源命名为依据。

---

## 1. 一句话定位

`tabExtend` 不是纯标签页收纳器。

它本质上是把 Chrome New Tab 改造成 **workspace-first 的个人工作台**：

- 管当前打开 tabs
- 把 tabs 存成 group
- 用 workspace / category / group 组织
- 混入 note、to-do、reminder
- 再叠加同步、分享、协作

证据：

- New Tab override：`manifest.json:9-10`
- Side panel：`manifest.json:41-43`
- 扩展描述：`_locales/en/messages.json:542-545`
- “Kanban views” 明写：`_locales/en/messages.json:1586-1588`

结论：它卖点不是“存标签页”，而是 **浏览器内工作空间系统**。

---

## 2. 功能全景

### 2.1 标签页管理层

高置信功能：

- 查看当前窗口 open tabs：`_locales/en/messages.json:730-732`
- 保存当前 tabs 到 group
- Save as new group：`_locales/en/messages.json:1322-1328`
- Save and close / Close and move to：`_locales/en/messages.json:238-252`
- 从选中 tabs 创建 group：`_locales/en/messages.json:626-628`
- Open as group：`_locales/en/messages.json:1058-1060`
- Remove duplicates：`_locales/en/messages.json:1266-1268`
- Jump/focus opened tab：`_locales/en/messages.json:806-808`
- 管理 tab groups：`manifest.json:39` + `newtab.js` 内 `queryActiveTabs`、`allActiveTabs` 状态

这一层目标很清楚：**先接住 live browser context，再组织进长期结构。**

### 2.2 结构化组织层

主结构明显是：

**Workspace → Category → Group → Item**

证据：

- “Groups are sorted into editable categories, which are then sorted into workspaces.”：`_locales/en/messages.json:670-672`
- All workspaces / current workspace / new workspace：`_locales/en/messages.json:86-88`、`298-300`、`938-944`
- New category / edit categories：`_locales/en/messages.json:290-296`、`418-420`
- Group create / duplicate / move / merge / restore：`_locales/en/messages.json:622-676`

结论：它不是简单 folder list，而是更像项目管理工具的信息架构。

### 2.3 内容类型层

它不只存链接，还混合：

- site / saved site
- note：`_locales/en/messages.json:1006-1028`
- to-do：`_locales/en/messages.json:1674-1724`
- reminder：`_locales/en/messages.json:1214-1256`
- image：`_locales/en/messages.json:714-716`
- text selection：`_locales/en/messages.json:58-60`
- stacked item / stack / unstack：`_locales/en/messages.json:1550-1568`

结论：它是轻内容数据库，不是书签夹替代品。

### 2.4 输入来源层

高置信入口：

- 当前 open tabs
- bookmarks import：`_locales/en/messages.json:718-728`
- top sites：`_locales/en/messages.json:1914-1916`
- custom URL：`_locales/en/messages.json:2-8`
- image / text selection context menu：`background.js` 中 `saveImageTo`、`textSelection`
- keyboard shortcuts：`manifest.json:12-19`、`_locales/en/messages.json:814-816`

这层做得好：不是逼用户迁移工作流，而是接住浏览器里已经存在的行为。

### 2.5 回收与恢复层

它不是 destructive-only。

有：

- Bin：`_locales/en/messages.json:142-144`
- Restore item / restore group：`_locales/en/messages.json:1290-1296`
- The bin contains your last 50 deleted items：`_locales/en/messages.json:1634-1636`
- Restored items：`_locales/en/messages.json:1294-1296`

结论：允许探索，允许误删，允许反悔。

### 2.6 协作与账号层

它已经不是纯本地工具。

有：

- 登录 / Google 登录：`manifest.json:34-39`、`_locales/en/messages.json:1478-1500`
- Sync across devices：`_locales/en/messages.json:14-16`、`1890-1892`
- Guest / account upgrade：`_locales/en/messages.json:262-264`、`1786-1796`
- Workspace sharing：`_locales/en/messages.json:1422-1428`、`34-36`
- Invite users / team：`_locales/en/messages.json:742-760`、`1918-1920`
- Realtime collaboration：`_locales/en/messages.json:66-68`

结论：它把 tab 管理扩到轻协作工作台。

### 2.7 视图与个性化层

高置信设置：

- Grid view：`_locales/en/messages.json:614-616`
- Theme / dark mode：`_locales/en/messages.json:138-140`、`1650-1652`、`1698-1700`
- Workspace emoji：`_locales/en/messages.json:1466-1472`
- Hide group symbol：`_locales/en/messages.json:698-704`
- Show site URL：`_locales/en/messages.json:1450-1456`
- Put saved groups first：`_locales/en/messages.json:1198-1204`
- Pin sidebar：`_locales/en/messages.json:1134-1136`
- Show min/max button：`_locales/en/messages.json:1442-1448`
- Show trash drop-zone：`_locales/en/messages.json:1458-1464`
- Trash drop-zone position：`_locales/en/messages.json:1702-1708`

结论：它重视长期使用后的个性化舒适度。

### 2.8 多入口容器层

至少有 3 个壳：

- New tab：`manifest.json:9-10`
- Side panel：`manifest.json:41-43`
- Toolbar action / popover：`manifest.json:2-5` + `background.js`

结论：它知道同一套能力，要出现在不同工作时机里。

---

## 3. UI 设计拆解

### 3.1 页面骨架

从文案和打包状态看，主骨架大概率是：

- 左侧 sidebar：当前窗口 open tabs、tab group 管理
- 中间主区域：workspace board / kanban groups
- 左上角：workspace switcher / workspace menu
- 右上角：settings / help / account / utility
- 内部卡片：group / item / stacked item

证据：

- left sidebar 文案：`_locales/en/messages.json:730-732`
- top-left workspace menu：`_locales/en/messages.json:734-736`
- top-right corner utility：`_locales/en/messages.json:738-740`
- `newtab.js` 状态名：`workspaceZoom`、`sidebarIsPinned`、`setSidePanelIsOpen`

结论：这是一套 **live context 在左，persistent structure 在中，global controls 在上** 的经典工作台布局。

### 3.2 视觉语言

从资源命名和 Chakra UI 痕迹看，风格偏：

**现代 SaaS + 轻插画 + 温和生产力工具**

特征：

- light / dark 双主题
- 专门 empty state 插画：`assets/images/EmptyState_*`
- gradient 装饰资源：`bookmarks_gradient.png`、`newgroup_gradient.png`、`settings_gradient.png`、`trash_gradient.png`
- emoji / symbol 作为分组识别物
- 圆角卡片、轻表面层级、弱边框
- 图标系统比较统一

技术迹象：`newtab.js` 中有大量 Chakra UI 组件实现。

结论：观感不是“后台工具”，而是“可拥有的个人工作空间”。

### 3.3 信息密度策略

它不是极简派。它是 **高密度，但用结构压复杂度**。

手法：

- workspace/category/group/item 四层嵌套
- open tabs 与 saved groups 分区
- 大量动作放进 hover / action menu / tooltip / context menu
- 空状态和 onboarding 负责解释“下一步做什么”

结论：它不是减少能力，而是减少能力暴露的同时性。

---

## 4. UX 风格判断

### 4.1 核心风格：workspace-first productivity

它不是 tab-first，也不是 archive-first。

更像：“我现在在哪个工作上下文里”。

这样好用原因：

- tab 不只是临时浏览痕迹
- 被提升成 workspace 里的可编排资产
- 用户从“关标签页”切到“整理工作流”

### 4.2 操作哲学：direct manipulation

明显依赖：

- 拖拽
- 移动
- 分组
- 堆叠
- 丢进垃圾区

证据：

- “Drop to remove…”：`_locales/en/messages.json:390-392`
- “drag and drop … create your first group”：`_locales/en/messages.json:1670-1672`
- `showTrashDropZone` 设置：`_locales/en/messages.json:1458-1464`

结论：更像摆工作台，不像填表单。

### 4.3 onboarding 风格：强引导

它非常清楚自己功能多，因此内建引导。

证据：

- Welcome to tabExtend：`_locales/en/messages.json:1846-1848`
- Show me around：`_locales/en/messages.json:1438-1440`
- walkthrough(6 steps)：`_locales/en/messages.json:1374-1376`
- top-left / left sidebar / top-right 都有 tour 文案：`_locales/en/messages.json:730-740`

结论：复杂产品靠 tour 过冷启动，不靠用户自己猜。

### 4.4 情绪风格：productive but soft

它不是硬核工具味，而是有一定“个人空间感”。

体现：

- emoji / symbol
- gradient 图
- empty state 插画
- workspace emoji / group symbol
- dark / light theme

结论：它不是只追求效率，也追求情绪黏性。

---

## 5. 为什么它会让人觉得“非常好用”

1. **心智模型顺**
   - 当前 tabs → 保存成 group → 放进 category → 归到 workspace

2. **同时覆盖即时操作与长期组织**
   - 左边 live，右边长期 board

3. **内容类型混合**
   - tab、note、todo、reminder 混排，工作上下文更完整

4. **入口多**
   - new tab、side panel、toolbar、context menu、shortcut

5. **允许反悔**
   - Bin + Restore 降低操作焦虑

6. **情绪价值高于普通 tab tool**
   - 它给人的不是“收纳箱”，而是“我的工作台”

---

## 6. 最值得学的设计点

1. 左边 live，右边 long-term
2. 组织层级清晰：workspace / category / group / item
3. 空状态不是空白，而是教学
4. 高级能力渐进暴露，不一次性摊开
5. 协作从数据模型原生长出来，不是外挂

---

## 7. 代价与边界

### 7.1 学习成本高

功能很多，不做 onboarding 会迷路。

### 7.2 功能边界偏大

同时做：

- tab manager
- notes
- reminders
- bookmarks
- top sites
- collaboration
- sync

能力强，负担也重。

### 7.3 Freemium 痕迹明显

文案里有不少：

- workspace limit
- free plan
- pro plan only
- upgrade to collaborate

这对商业有利，但会污染纯工具感。

### 7.4 不适合只想“存一下 tab”的轻用户

对轻需求用户来说，它偏重。

---

# 下一步 1：tabExtend 与 TabBoard 逐项对比

## 8. 总体定位对比

| 维度 | tabExtend | TabBoard |
|---|---|---|
| 产品一句话 | 浏览器内 workspace dashboard | local-first tab manager |
| 核心目标 | 管理 tabs + notes + reminders + 协作 | 保存和找回浏览现场 |
| 默认形态 | workspace OS | board-first manager |
| 复杂度 | 高 | 中等，刻意克制 |
| 商业模型 | 账号 + freemium + 协作升级 | 纯本地、无账号 |

TabBoard 当前定位证据：

- `docs/project-overview.md:5-8`
- `docs/project-overview.md:11-20`
- `docs/project-overview.md:91-127`

结论：

- tabExtend 更宽，更像平台
- TabBoard 更窄，更像专注版本地工具

## 9. 信息架构对比

### 9.1 相同点

两者都采用：

- workspace
- category / folder
- group / session
- open tabs 与 saved 内容联动

TabBoard 证据：

- `docs/project-overview.md:42-47`
- `docs/feature-spec.md:41-47`
- `docs/feature-spec.md:196-245`

### 9.2 差异点

| 维度 | tabExtend | TabBoard |
|---|---|---|
| 顶层抽象 | workspace OS | saved browsing context manager |
| group 内内容 | link + note + todo + reminder + image + stack | link + note |
| category 角色 | 更像栏目 / board column | session 导航目录 |
| live 区域 | 左侧 open tabs，较强操作性 | 左侧 Open Tabs · All windows |
| board 主体 | 强卡片工作区 | session board，偏恢复与整理 |

TabBoard 当前刻意不做：

- Todo 工作流：`docs/project-overview.md:48-53`
- 远端同步和协作：`docs/project-overview.md:48-53`, `121-127`

结论：TabBoard 现在是 **窄而稳**，tabExtend 是 **宽而强**。

## 10. 功能面逐项对比

### 10.1 Capture / Save

**tabExtend**
- save / save and close / close and move to
- group from selected tabs
- context menu save image / text selection / tabs
- bookmarks / top sites / custom URL 进入系统

**TabBoard**
- 保存当前窗口、选中 open tabs、左右 tabs、其他 tabs、全部窗口
- capture 时按源 URL 去重；所有有 URL 的非 TabBoard tabs 都进入 capture 尝试
- popup Save / Open / Dedupe

证据：

- TabBoard Capture：`docs/feature-spec.md:93-155`
- Popup：`docs/feature-spec.md:49-60`

判断：

- TabBoard 在“窗口保存”主链路上更干净
- tabExtend 在“多来源输入”上明显更丰富

### 10.2 Restore / Recovery

**tabExtend**
- restore group / item
- bin / restore deleted items

**TabBoard**
- 单 tab restore
- session restore
- restore 后按设置删除记录
- local bin

证据：

- TabBoard Restore：`docs/feature-spec.md:156-195`
- Bin：`docs/project-overview.md:86-88`

判断：

- 两者都重视恢复
- TabBoard 恢复语义更聚焦“浏览现场”
- tabExtend 更偏内容资产回收

### 10.3 组织 / 编辑

**tabExtend**
- workspace / category / group / item 四层
- note / todo / reminder / image
- stack / unstack
- public share / invite / collaboration

**TabBoard**
- workspace / category / session / tab item
- rename / note / lock / delete / drag
- note 仅作 session 辅助，不做任务系统

证据：

- TabBoard Organize / Edit / Move：`docs/feature-spec.md:11-15`
- 项目边界：`docs/project-overview.md:121-127`

判断：

- tabExtend 把“工作组织”做满
- TabBoard 更像“session memory manager”

### 10.4 搜索与发现

**tabExtend**
- 高概率有 workspace 内搜索、empty search state、most visited、bookmarks 辅助

**TabBoard**
- manager search
- omnibox 搜索 saved tabs
- 反查历史 session

证据：

- TabBoard Search / Filter：`docs/feature-spec.md:12`
- Omnibox：`docs/feature-spec.md:85-92`
- 项目目标里的反查：`docs/project-overview.md:15-18`

判断：

- TabBoard 搜索更贴浏览器恢复任务
- tabExtend 搜索更像工作台内容搜索

### 10.5 协作 / 同步

**tabExtend**
- 支持账号、同步、邀请、实时协作、公开链接

**TabBoard**
- 明确不做

证据：

- TabBoard 不做多设备同步和协作：`docs/project-overview.md:121-127`

判断：

- 这是两者最大战略分叉
- TabBoard 不该盲目追 tabExtend 这一块

## 11. UI 设计对比

### 11.1 相同点

- 都把 manager/new tab 当主要入口
- 都不是 popup-first
- 都偏 board/workbench，而不是简单 list

### 11.2 差异点

| 维度 | tabExtend | TabBoard |
|---|---|---|
| 视觉气质 | SaaS 工作台、插画化、柔和 | dense but calm、本地工具感更强 |
| 空状态 | 插画 + 教学 | 功能说明更直接，营销感低 |
| 内容对象 | 多类型卡片 | session card 为中心 |
| 可定制程度 | 高 | 中等，克制 |
| 新手引导 | 强 tour | 目前弱很多 |

TabBoard 原则证据：`docs/project-overview.md:100-105`

判断：

- tabExtend 更“产品化”
- TabBoard 更“工具化”

## 12. UX 风格对比

### tabExtend

- workspace-first
- direct manipulation first
- onboarding 重
- 渐进暴露强
- 情绪价值高

### TabBoard

- save fast, organize later：`docs/project-overview.md:94-95`
- sessions over bookmarks：`docs/project-overview.md:97-98`
- local-first：`docs/project-overview.md:91-93`
- dense but calm：`docs/project-overview.md:100-101`
- direct manipulation first：`docs/project-overview.md:103-105`

判断：

- 两者都重直接操作
- TabBoard 更快、更克制
- tabExtend 更完整、更具“workspace 产品感”

---

# 下一步 2：TabBoard 可借鉴清单

## 13. 可以直接借鉴

### A. 强 onboarding

价值：高。

可借鉴点：

- 首次打开 manager 的 3~5 步引导
- 明确解释顶部 workspace、左侧 Open Tabs、右侧 saved sessions
- 空状态直接给操作建议

原因：TabBoard 现在结构已经不算简单，但新手引导偏弱。

### B. Empty state 组件化

价值：高。

可借鉴点：

- No sessions
- No search results
- No open tabs
- No categories
- Bin empty

每种空状态都给：

- 当前状态解释
- 下一步按钮
- 简短示意图或 icon block

### C. 多来源输入增强

价值：中高。

可借鉴点：

- Import bookmarks
- Most visited sites 作为快速导入源
- Save image / selection 到 note 或 session

注意：要按 TabBoard 边界做减法，不要把系统做重。

### D. Workspace 可识别性增强

价值：中高。

可借鉴点：

- workspace emoji / color
- current workspace 更强视觉锚点
- workspace switcher 更产品化

### E. 组级视觉识别

价值：中。

可借鉴点：

- session/category symbol
- 更强分组区分色或 meta 标记

前提：不能破坏 TabBoard 现在“dense but calm”原则。

### F. 引导式快捷提示

价值：中。

可借鉴点：

- 第一次拖拽时提示
- 第一次使用 select mode 时提示
- 第一次打开 popup 时解释 Save / Open / Dedupe

### G. 可见但不吵的高级设置

价值：中。

可借鉴点：

- 把高级交互偏好继续收敛到少量高价值设置
- 像 tabExtend 那样让个性化有明确目的，不是堆开关

---

## 14. 只能部分借鉴，不能整套搬

### A. Notes / To-do / Reminder 全家桶

原因：

- 会明显冲击 TabBoard 定位
- 会让 session memory manager 变成泛 productivity app
- 维护成本大增

建议：

- 只保留 note 强化
- 不引入 todo / reminder 系统

### B. 账号、同步、协作

原因：

- 与 TabBoard 的 local-first 原则冲突：`docs/project-overview.md:91-93`
- 会引入权限、后端、隐私、计费复杂度

建议：不做。

### C. Freemium / plan gating

原因：

- 与 TabBoard 当前产品气质不匹配
- 会污染工具体验

建议：不做。

### D. 过强个性化

原因：

- TabBoard 当前优势之一是界面相对收敛
- 太多样式开关会削弱可维护性

建议：只保留能提升识别与导航效率的个性化。

---

## 15. 不该借鉴的点

1. 产品边界过宽
2. 账号依赖
3. 升级文案打断
4. 过多内容类型混排
5. 把 tab manager 做成半个 Notion

TabBoard 现在最值钱地方，是“范围收得住”。

---

# 下一步 3：面向 TabBoard 的改造建议

## 16. 设计目标

在不破坏 TabBoard 当前定位前提下，借 tabExtend 长处，增强：

- 首次理解成本
- workspace 辨识度
- 多来源输入能力
- 空状态与引导质量
- 主工作台“产品完成度”

同时坚决不引入：

- 账号
- 云同步
- 协作
- todo/reminder 系统
- 过度个性化

---

## 17. 改造建议总表

| 优先级 | 建议 | 价值 | 成本 | 是否推荐 |
|---|---|---:|---:|---|
| P0 | 首次 onboarding + contextual empty states | 高 | 中 | 推荐 |
| P0 | 强化 workspace 视觉锚点 | 高 | 低 | 推荐 |
| P1 | Import bookmarks / most visited capture | 中高 | 中 | 推荐 |
| P1 | 拖拽与选择模式微引导 | 中高 | 低 | 推荐 |
| P1 | Session/category 轻量 symbol 系统 | 中 | 中 | 可选 |
| P2 | richer search assist / saved source chips | 中 | 中 | 可选 |
| P3 | note 能力小幅增强 | 低到中 | 中 | 谨慎 |
| X | todo/reminder/collab/account | 很高风险 | 很高 | 不推荐 |

---

## 18. 具体建议

### 18.1 P0：首次 onboarding + contextual empty states

**做什么**

1. 首次进入 manager 时，做 3 步轻引导：
   - 顶部：workspace / search / utilities
   - 左侧：Open Tabs
   - 右侧：saved sessions board

2. 给以下空状态加专门组件：
   - 没有 saved sessions
   - search 无结果
   - 当前 workspace 没 category
   - bin 为空
   - Open Tabs 为空或全被规则过滤

3. 每个空状态都给“下一步动作”：
   - Save current window
   - Import
   - Clear search
   - Create category
   - Open options

**为什么**

tabExtend 最强地方之一，不是功能多，而是会告诉用户下一步该干嘛。

**为什么适合 TabBoard**

不改数据模型，不改核心定位，但能显著提升完成度。

### 18.2 P0：强化 workspace 视觉锚点

**做什么**

1. 顶部 workspace switcher 增加更明显的当前状态
2. 可选增加 workspace emoji 或 color chip
3. 在 category / section 处适度反映当前 workspace 身份

**为什么**

TabBoard 已经有 workspace，但感知强度还不够高。

**收益**

更接近 tabExtend 那种“我现在在某个空间里工作”的感觉。

### 18.3 P1：Import bookmarks / most visited 作为输入增强

**做什么**

1. 增加 bookmarks import 流程
2. 可选增加 “Most visited → save as session”
3. 保持它们是“导入源”，不是长期常驻首页内容

**为什么**

tabExtend 很强一点，是它不仅接当前 tabs，还接浏览器里别的内容源。

**边界控制**

- 不做 dashboard 小组件化
- 不做 permanent top sites 面板
- 只做 capture source

### 18.4 P1：拖拽与选择模式微引导

**做什么**

1. 第一次进入 select mode 时显示 1 行提示
2. 第一次拖 open tabs 到 session 时显示 drop affordance 提示
3. DnD 空白状态时给“拖到这里创建 session”明确引导

**为什么**

TabBoard 已经有强 DnD，但可发现性仍偏工程化。

### 18.5 P1：Session/category 轻量 symbol 系统

**做什么**

- 允许 category 或 session 附一个简单 symbol / emoji
- 默认关闭或弱展示
- 只用于导航识别，不做装饰泛滥

**为什么**

tabExtend 的 symbol/emoji 提高了扫描效率。

**风险控制**

必须限制密度，不能把 TabBoard 弄成花板子。

### 18.6 P2：搜索辅助增强

**做什么**

- 搜索结果里显示匹配原因：title / url / note / category
- 搜索为空时给建议 query 或 quick filter
- 可考虑“recently saved” / “from current open tab URL” 辅助线索

**为什么**

这能强化 TabBoard 的“找回浏览现场”优势。

### 18.7 P3：note 能力小幅增强，不扩成任务系统

**做什么**

- 改善 note 编辑体验
- 支持更好的 note 预览 / copy / convert from tab selection

**不做什么**

- 不引入 todo
- 不引入 reminder
- 不引入日历语义

**理由**

TabBoard 需要的是“session 注释能力”，不是第二个 productivity suite。

---

## 19. 建议的实施顺序

### Phase 1：低风险高收益

1. onboarding
2. empty states
3. workspace 视觉锚点
4. select / drag 微引导

### Phase 2：中等范围增强

5. bookmarks import
6. most visited capture
7. 搜索辅助增强

### Phase 3：谨慎试点

8. session/category symbol
9. note 微增强

### 明确不进计划

- 账号
- 云同步
- 协作
- todo/reminder
- freemium gating

---

## 20. 最终结论

### 对 tabExtend 的判断

它好用，不是因为“能存 tab”。
而是因为它把 tab 管理提升成了 **workspace 设计**。

### 对 TabBoard 的判断

TabBoard 现在方向是对的：

- local-first
- save fast, organize later
- sessions over bookmarks
- board-first manager

证据：

- `docs/project-overview.md:91-105`
- `docs/feature-spec.md:39-71`

### 对 TabBoard 下一步最合理方向

不是把 tabExtend 全搬过来。
而是借它这些长处：

- onboarding
- empty states
- workspace 感知
- 多来源输入
- 更好的引导式交互

同时保住 TabBoard 当前最值钱的东西：

- 本地优先
- 边界克制
- 围绕“浏览现场记忆”而不是泛 productivity

### 一句话建议

**TabBoard 应该学 tabExtend 的“产品完成度”，不要学它的“产品膨胀度”。**
