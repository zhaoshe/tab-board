# TRAE CLI Skills 清单与分析(清理后 v3)

> 修订日期: 2026-07-21
> 环境: macOS / zsh
> 工作目录: `/Users/zhaoshe/code/worktrees/ZipTab/dev`

---

## 一、四家 Agent 生态总览

本机同时运行四家 agent CLI,都识别 `SKILL.md` 格式和 plugin 机制:

| 工具 | 厂商 | 版本管理 | Skills 目录 |
|---|---|---|---|
| **Claude Code** | Anthropic | 插件市场 + 扁平共享 | `~/.claude/skills/`(大部分 symlink 到 `~/.agents/skills/`) |
| **Codex CLI** | OpenAI | 插件市场 + 扁平共享 | `~/.codex/skills/`(symlink 链到 `~/.claude/skills/` 再到 `~/.agents/skills/`) |
| **TraeX CLI** | ByteDance | 插件市场(主) + 扁平共享(备) | `~/.trae/skills/`(.system/ + 少量 symlink;主力在 plugin cache) |
| **OpenCode** | 社区 | JS 插件(自有格式,非 marketplace) | `~/.config/opencode/`(plugin 数组,不读 SKILL.md 目录) |

### 1.1 关键事实

- **SKILL.md 是通用格式**:Claude Code / Codex / TraeX 三家都识别 YAML-frontmatter + Markdown 的 skill 文件,跨工具直接兼容。
- **Plugin 格式三家互通**:superpowers 插件同时提供 `.claude-plugin/`、`.codex-plugin/`、`.cursor-plugin/`、`.opencode/`、`GEMINI.md` 适配器。
- **Codex 直接消费 Claude Code 插件**:`~/.codex/config.toml` 配置了 `anthropics/claude-plugins-official.git` marketplace。
- **`~/.agents/skills/` 是跨工具共享层**:三家通过 symlink 链到此目录;但 TraeX 主要从 plugin cache 加载。
- **OpenCode 不兼容 marketplace 格式**:用 JS 文件插件,无法直接安装 superpowers 等 SKILL.md 插件。
- **共享层无自动更新**:`~/.agents/.skill-lock.json` 记录来源但无 `update --all` 命令。

### 1.2 技能来源分类

| 来源类别 | 典型路径 | 说明 |
|---|---|---|
| **各 CLI 系统内置** | `~/.trae/skills/.system/`、`~/.codex/skills/.system/` | CLI 分发时自带;三家同名但文件独立 |
| **Plugin cache** | `~/.*/plugins/cache/<mp>/<plugin>/<ver>/skills/` | 插件市场安装;可通过 `auto_update=true` 保持新鲜 |
| **用户共享层** | `~/.agents/skills/<name>/SKILL.md` | 早期 skill-installer 从 GitHub clone;存在版本漂移 |

### 1.3 本次清理已执行的操作(2026-07-21)

- **物理删除**了约 80+ 个冗余/不相关 skill(备份至 `/tmp/trae-skills-backup-20260721-170511/`)
- **全局禁用 lark-cli 插件**:TraeX `traecli.toml` 设 `enabled = false`;Codex `config.toml` 注释掉 `lark-mcp` MCP server 并删除已失效的 `[[skills.config]]` 条目;`~/.agents/skills/lark-*`(27 个)移至备份
- **添加 superpowers-marketplace 到 Codex** 并启用 `superpowers@superpowers-marketplace` 插件
- **TraeX superpowers-marketplace** 加 `auto_update = true` 以自动保持最新
- **TraeX 禁用扁平副本 skill-creator**(`[[skills.config]] enabled = false`),以系统内置版本为准
- **Codex `frontend-design@claude-plugins-official`** 已确认启用(包含 taste 能力),无需额外安装

### 1.4 清理后 skill 数量

| 目录 | 数量 |
|---|---|
| `~/.agents/skills/`(共享层) | 39 个(含 work-digest symlink) |
| `~/.claude/skills/` | 43 个(symlink + 独有) |
| `~/.codex/skills/` | 19 个(symlink) |
| `~/.trae/skills/` | 1 个(find-skills symlink;其余通过 plugin cache) |
| `~/.trae/plugins/cache/superpowers-marketplace/superpowers/6.1.1/skills/` | 14 个(plugin 版) |

---

## 二、Plugin 版本对齐矩阵

### 2.1 当前各 agent 已安装 plugin 对比

| Plugin | 来源 Marketplace | Claude Code | Codex | TraeX | OpenCode |
|---|---|---|---|---|---|
| **superpowers** | obra/superpowers-marketplace | v5.1.0(claude-plugins-official,**过时**) | v6.1.1(本次新增 ✅) | **v6.1.1**(最新) | 不支持 |
| **frontend-design (taste)** | claude-plugins-official | unknown(已装) | unknown(已装 ✅) | 无(用设计 taste 扁平副本) | 不支持 |
| **context7** | claude-plugins-official | unknown(已装) | 无(MCP 需手动配) | 无(documentation-lookup 封装) | 不支持 |
| **skill-creator** | claude-plugins-official / 系统内置 | unknown(已装) | disabled | 系统内置 + 扁平副本(已禁用) | 不支持 |
| **github** | claude-plugins-official | unknown(已装) | 无 | 无 | 不支持 |
| **claude-mem** | thedotmack | v13.8.1(本地 marketplace) | 已启用 ✅ | 无 | claude-mem.js(自有插件) |
| **ponytail** | DietrichGebert/ponytail | v4.8.4 | 已启用 ✅ | 无 | 不支持 |
| **caveman** | JuliusBrussee/caveman | 655b7d9c | 已启用 ✅ | 无 | 不支持 |
| **kotlin-lsp** | claude-plugins-official | v1.0.0 | 已启用 ✅ | 无(用 rust/go/python/ts LSP) | 不支持 |
| **LSP 系列**(go/python/rust/ts) | traex-bd-plugins(内部) | 无 | 无 | 已启用 ✅ | 不支持 |
| **lark-cli** | traex-bd-plugins | 无 | 无(lark-mcp 已禁用) | **已禁用** ❌ | 不支持 |
| **ai-contribution** | traex-bd-plugins | 无 | 无 | disabled | 不支持 |
| **traex-guide** | traex-bd-plugins | 无 | 无 | 已启用 ✅ | 不支持 |
| **code-review** | claude-plugins-official | unknown(已装) | 无(bundled chrome) | 无 | 不支持 |
| **remember** | claude-plugins-official | v0.7.3 | 无 | 无 | 不支持 |
| **mattpocock-skills** | mattpocock | v1.2.0 | 无 | 无 | 不支持 |
| **understand-anything** | understand-anything | v2.9.3 | 无 | 无 | 不支持 |
| **adspirer-ads-agent** | claude-plugins-official | v1.2.0 | 无 | 无 | 不支持 |
| **claude-hud** | claude-hud | v0.1.1 | 无 | 无 | 不支持 |
| **playground** | claude-plugins-official | unknown | disabled | 无 | 不支持 |
| **code-simplifier** | claude-plugins-official | v1.0.0 | 无 | 无 | 不支持 |
| **feature-dev** | claude-plugins-official | unknown | 无 | 无 | 不支持 |
| **claude-md-management** | claude-plugins-official | v1.0.0 | 无 | 无 | 不支持 |
| **claude-code-setup** | claude-plugins-official | v1.0.0 | 无 | 无 | 不支持 |
| **kotlin-agent-skills** | Kotlin/kotlin-agent-skills | v1.0.0 | 无(有 kotlin-lsp) | 无 | 不支持 |

### 2.2 Codex 特有 OpenAI bundled/runtime plugins

| Plugin | 状态 | 功能 |
|---|---|---|
| chrome@openai-bundled | enabled | Chrome 浏览器自动化 |
| computer-use@openai-bundled | enabled | 桌面操控(SkyComputerUse) |
| visualize@openai-bundled | enabled | 可视化 |
| browser@openai-bundled | enabled | 浏览器 |
| sites@openai-bundled | enabled | 站点操作 |
| documents/pdf/spreadsheets/presentations@openai-primary-runtime | disabled | 文档处理(TraeX 用 docx/pdf/xlsx/pptx skills) |
| template-creator@openai-primary-runtime | disabled | 模板创建 |

### 2.3 版本对齐建议(待手动执行)

Claude Code 的 superpowers v5.1.0 严重落后于 TraeX/Codex 的 v6.1.1。v6 引入了 `<HARD-GATE>` 强制检查机制,行为差异较大。升级方式:

```sh
# Claude Code: 升级 marketplace 再升级插件
claude plugin marketplace update claude-plugins-official
claude plugin update superpowers@claude-plugins-official
# 注意: claude-plugins-official 是 Anthropic 官方镜像,更新到 v6 需等待其同步
# 如果 claude-plugins-official 还没同步到 v6.1.1,可手动添加 obra/superpowers-marketplace:
claude plugin marketplace add superpowers-marketplace https://github.com/obra/superpowers-marketplace.git
claude plugin install superpowers@superpowers-marketplace
```

Codex 插件刷新(下次启动 Codex 时自动拉取新 marketplace):
```sh
# Codex 已在本次修改中添加 superpowers-marketplace;下次启动 codex 时会自动 clone
# 如需立即刷新:
codex plugin marketplace upgrade  # 刷新所有 marketplace
```

---

## 三、Plugin / Skill 保持新鲜的机制

### 3.1 Plugin 更新方式(各工具不同)

| 工具 | 更新命令 | 自动更新 |
|---|---|---|
| **TraeX** | 下次启动自动刷新已启用 `auto_update=true` 的 marketplace;也可在 TUI 中手动更新 | 支持(`auto_update = true` 在 marketplace 配置) |
| **Claude Code** | `claude plugin marketplace update <mp>` 刷新 marketplace 索引;`claude plugin update <name>` 更新插件 | 未知(默认行为未配置) |
| **Codex** | `codex plugin marketplace upgrade` 刷新所有 marketplace(无单插件 upgrade 命令;需移除再添加) | 启动时检查更新 |
| **OpenCode** | 无 marketplace,手动更新 `~/.config/opencode/plugins/` 下的 JS 文件 | 无 |

本次已将 TraeX 的 `superpowers-marketplace` 设为 `auto_update = true`;`traex-bd-plugins` 本来就有 `auto_update = true`。

### 3.2 `~/.agents/skills/` 扁平副本的更新问题

扁平 skills **没有自动更新机制**。`.skill-lock.json` 记录了每个 skill 的来源 GitHub repo 和 commit,但 skill-installer **不提供 `update --all` 命令**。

**可行的更新策略**:

1. **优先用 plugin 版本**:对于 superpowers、frontend-design/taste、context7 等有 plugin 版本的 skill,应在 config 中禁用扁平副本(本次已对 skill-creator 执行),让 plugin cache 的版本生效,plugin 的 `auto_update` 机制就会自动保持新鲜。
2. **手动 refresh 个别 skill**:如需更新特定扁平 skill,可以:
   ```sh
   cd ~/.agents/skills/<name>
   git pull  # 如果该目录本身是 git clone
   # 或者重新安装:
   skill-installer install <github-url>  # 重新安装覆盖
   ```
3. **定期 re-audit**:运行 `skill-cleaner` 做全局审计,识别版本过旧或重复的 skill。
4. **长期方案**:逐步将有 plugin 版本的扁平副本迁移到 plugin 形式,只保留没有 plugin 版本的独有 skill(如 bytedance-aeolus、flow-ab、tea-next-query 等内部工具,或 work-digest 这类本地项目 skill)。

---

## 四、skill-cleaner 与 agent-sort 详细对比

两者是**不同维度**的工具,不互斥,各有适用场景。

### 4.1 skill-cleaner

- **维度**:全局(跨所有项目)
- **来源**:第三方社区,跨 agent 通用
- **功能**:
  - 审计所有已安装 skill 的 live token budget(每个 skill 在 system prompt 中占用的 token 数)
  - 识别重复 skill(同名/同功能不同来源)
  - 识别未使用/低频使用 skill
  - 精简 skill 描述以减少 token 开销
  - 输出全局库存审计报告
- **工作方式**:读取所有 SKILL.md,静态分析 + 可选的使用频率统计(如果有历史数据)
- **适用场景**:
  - "我装了太多 skill,想做全局大扫除"
  - "为什么 system prompt 这么长,token 消耗太高"
  - "哪些 skill 是重复的,可以安全删除"
  - 新环境初始化时批量精简
- **优点**:全局视角,一次性找出所有冗余;token-budget 量化;识别跨 plugin/扁平层的重复
- **缺点**:不感知具体项目,不知道某个 skill 在当前项目是否有用;可能误删"低频但关键"的 skill
- **是否依赖 Node.js 脚本**:是(`scripts/` 下有 analyzer)

### 4.2 agent-sort

- **维度**:项目级(针对单个仓库)
- **来源**:ECC 生态
- **功能**:
  - 对仓库做并行证据收集(grep 代码、检查 `package.json`/依赖、检查文件扩展名)
  - 将 skills/commands/rules/hooks 分为 **DAILY**(这个项目日常需要)和 **LIBRARY**(备用,不默认加载)
  - 产出基于证据的 install plan(哪些该放项目级 AGENTS.md,哪些该去掉)
- **工作方式**:派生子 agent 并行分析仓库代码栈 → 交叉验证 → 输出分类
- **适用场景**:
  - "新开一个项目,该加载哪些 skill"
  - "项目栈换了(比如从 React 转到 RN),重新评估 skill 集"
  - 上下文压力大时做项目级裁剪
- **优点**:基于代码证据,不会推荐与当前项目栈无关的 skill;产出是可执行的 install plan
- **缺点**:只看一个项目;不解决全局重复;不量化 token cost
- **是否依赖外部脚本**:主要依赖 SKILL.md 指引 + Agent 工具自身

### 4.3 推荐用法

两者配合使用,顺序:
1. 先跑 **skill-cleaner** 做全局去重、清理过时版本、精简描述 → 降低全局 token 基线
2. 每个新项目(或项目栈变化时)跑 **agent-sort** → 确定项目级 DAILY 集
3. 定期(比如每 1-2 个月)重跑 skill-cleaner 保持全局整洁

---

## 五、当前保留的 Skills 详细清单

### 5.1 TraeX 系统内置(3 个,`.system/` 目录)

| skill | 功能 |
|---|---|
| plugin-creator | 脚手架 TraeX 插件目录,生成 `.codex-plugin/plugin.json` |
| skill-installer | 从精选列表或 GitHub 安装 skills |
| skill-creator | 教写高质量 SKILL.md;本次已在 TraeX 中禁用 `~/.agents/skills/` 下的扁平副本,避免版本冲突 |

### 5.2 TraeX BD 插件市场(traex-bd-plugins)

| skill | 插件 | 版本 | 状态 |
|---|---|---|---|
| traex-guide | traex-guide | 0.1.43 | enabled(TraeX 使用指南) |
| (LSP 系列:go-lsp/python-lsp/rust-lsp/typescript-lsp) | *_lsp | - | enabled(语言服务器支持,无独立 skill) |
| lark-cli 全部 skills | lark-cli | 0.1.3 | **disabled(全局禁用)** |
| check-hook-reporting | ai-contribution | 0.2.1 | disabled |

### 5.3 superpowers 插件(v6.1.1, obra/superpowers-marketplace)

TraeX 和 Codex 均通过 plugin cache 加载。这是 Jesse Vincent(`obra`)出品的 agentic 软件开发方法论插件(MIT),跨七家 agent 工具通用。

14 个 skills:
- `brainstorming`: 创意/功能/设计变更前的探索(v6 带 `<HARD-GATE>` 强制 checklist)
- `dispatching-parallel-agents`: 派发并行子 agent
- `executing-plans`: 执行计划
- `finishing-a-development-branch`: 完成开发分支
- `receiving-code-review`: 接收 code review
- `requesting-code-review`: 发起 code review
- `subagent-driven-development`: 子 agent 驱动开发
- `systematic-debugging`: 结构化 debug 流程
- `test-driven-development`: TDD 红-绿-重构
- `using-git-worktrees`: git worktree 工作流
- `using-superpowers`: superpowers 入口指引
- `verification-before-completion`: 完成前验证 checklist
- `writing-plans`: 写计划
- `writing-skills`: 写 skill(偏方法论;与系统 skill-creator 互补)

### 5.4 `~/.agents/skills/` 扁平共享层(39 个,按领域分组)

> 下面是本次大清理后仍保留的扁平 skills。已物理删除的 skills 不再列出(备份在 `/tmp/trae-skills-backup-20260721-170511/`)。

#### A. Skill/Agent 自身运维(meta)

| skill | 来源 | 功能 | 备注 |
|---|---|---|---|
| agent-md-refactor | 第三方社区 | 重构臃肿的 AGENTS.md/CLAUDE.md,progressive disclosure 拆分 | |
| agent-sort | ECC 生态 | 项目级 DAILY/LIBRARY 证据分类 | 见第四章对比 |
| darwin-skill | 中文社区(Darwin) | SkillLens 9 维 rubric 自动优化 SKILL.md | 优化已有 skill |
| find-skills | **vercel-labs/skills** | 发现可用 skill("怎么做 X"时) | 不是任何 agent 内置;是 Vercel 发布到 GitHub 的第三方 |
| skill-cleaner | 第三方社区 | 全局 skill 审计(token/重复/使用频率) | 见第四章对比 |
| skill-creator | anthropics/skills | 写 SKILL.md 指南 | TraeX 中已禁用(用系统内置版) |
| web-access | 中文 agent 生态 | **统一联网入口**(搜索/抓取/登录后操作/动态渲染) | TraeX 中文版强制使用;替代 agent-browser/browser-use 等 |

#### B. 后端 / API / 服务端

| skill | 来源 | 功能 |
|---|---|---|
| backend-patterns | 第三方社区 | Node.js/Express/Next.js API 后端架构、API 设计、DB 优化 |
| java-coding-standards | 第三方社区 | Spring Boot Java 编码规范 |
| security-review | **ECC 社区**(anthropics/skills 衍生,origin: ECC) | 安全审查 checklist(认证/输入/密钥/API/支付) |

#### C. 前端 / UI / 设计

| skill | 来源 | 功能 | 备注 |
|---|---|---|---|
| design-taste-frontend (v2) | **Claude Code taste 插件**(扁平副本) | Anti-slop 前端设计(landing/portfolio/redesign) | v2 默认;v1 保留为兼容 |
| design-taste-frontend-v1 | Claude Code taste 插件(扁平副本,v1) | 旧版 taste | 仅向后兼容 |
| documentation-lookup | 第三方社区(基于 Context7 MCP) | 通过 Context7 查最新库/框架文档 | 等价于 Context7 MCP 封装;需配置 Context7 MCP server |
| frontend-design | **anthropics/skills**(Anthropic 官方仓库) | 高设计质量前端界面生成 | Codex 已通过 plugin 启用 `frontend-design@claude-plugins-official` |
| impeccable | 第三方社区 | 前端 UI 打磨全能(UX/a11y/性能/响应式/动效/文案) | **ZipTab(Mantine UI)优先推荐** |
| next-best-practices | 第三方社区 | Next.js 最佳实践(RSC/data/metadata/error) | |
| ui-ux-pro-max | 第三方社区 | UI/UX 大杂烩(50 风格/21 调色板/50 字体/9 栈) | 风格杂;聚焦 skill 结果更有辨识度 |
| vercel-composition-patterns | **vercel-labs/agent-skills** | React 组合模式(compound/render props/context,含 React 19) | |
| vercel-react-best-practices | **vercel-labs/agent-skills** | Vercel 官方 React/Next 性能优化 | |

#### D. 移动端 / Android / React Native / Expo

| skill | 来源 | 功能 |
|---|---|---|
| android-architecture | new-silvermoon/awesome-android-agent-skills | Clean Architecture + Hilt |
| android-data-layer | 同上 | Repository + Room + Retrofit,offline-first |
| android-testing | 同上 | Android 测试策略 |
| android-viewmodel | 同上 | StateFlow UI state + SharedFlow events |
| vercel-react-native-skills | **vercel-labs/agent-skills** | RN/Expo 性能最佳实践 |

#### E. 研究 / 桌面 / 浏览器

| skill | 来源 | 功能 | 备注 |
|---|---|---|---|
| computer-use | Orca 生态 | 通过 accessibility tree + 截图操控本地桌面 | 非浏览器场景用;浏览器优先 web-access |

#### F. 内容创作 / 中文办公

| skill | 来源 | 功能 |
|---|---|---|
| daily-report | 中文 agent 生态 | 生成每日开发进度日报 |
| 会议总结助手 | 中文 agent 生态 | 根据会议录音总结内容 |

#### G. 办公文档

| skill | 来源 | 功能 |
|---|---|---|
| docx | 第三方社区 | Word(.docx)全操作(创建/读/编辑/格式) |
| pdf | 第三方社区 | PDF 全操作(读/抽取/合并/拆分/OCR) |
| pptx | 第三方社区 | PowerPoint(.pptx)全操作 |
| xlsx | 第三方社区 | 电子表格(.xlsx/.csv)全操作 |

> 注:docx/pdf/pptx/xlsx 是 Codex openai-primary-runtime 同名 plugin 的扁平备用(那些 plugin 在 Codex 中已 disabled)。

#### H. 可视化 / 图表

| skill | 来源 | 功能 |
|---|---|---|
| mermaid-diagrams | 第三方社区 | Mermaid 画图(类图/时序/流程/ER/C4/状态/gantt) |

#### I. AI / LLM API

| skill | 来源 | 功能 |
|---|---|---|
| Codex-api | 第三方社区(Anthropic) | Anthropic Claude/Codex API 使用指南(Messages API/streaming/tool use) |

> 注:该 skill 名字叫 Codex-api 但教的是 Anthropic API 使用,与 OpenAI Codex CLI 无直接关系。

#### J. Obsidian 工具链

| skill | 来源 | 功能 |
|---|---|---|
| obsidian-bases | 第三方社区 | Obsidian Bases(.base)数据库视图 |
| obsidian-cli | 第三方社区 | Obsidian vault 程序化操作/插件开发 |
| obsidian-markdown | 第三方社区 | Obsidian Flavored Markdown(wikilink/embed/callout) |

#### K. 其他工具类

| skill | 来源 | 功能 | 备注 |
|---|---|---|---|
| orca-cli | Orca 生态 | Orca worktree/terminal/browser 管理 | 非 Orca 环境不必加载 |
| learned | 用户本地 | 学习到的经验(本地积累) | |

#### L. Bytedance 内部研发工具链

> 非 Bytedance 环境下这些 skill 无意义(依赖内部 CLI/网关)。

| skill | 功能 |
|---|---|
| bytedcli | Bytedance 统一 CLI 入口(auth/Lark/Codebase/MR/CI) |
| bytedance-aeolus | Aeolus BI/数据分析(dashboard/SQL) |
| bytedance-tea | TEA(DataOpen/tea-next)数据分析 |
| flow-ab | Flow 豆包客户端 AB 实验接入 |
| pb-update | 多模态链路(AV/RTC/SAMI)PB 协议更新 |
| rax-cli | RAX 移动设备调试(设备/网络/UI/Lynx/AB) |
| tea-next-query | Tea Next 海外 VA/SG 机房 OpenAPI 数据查询 |

#### M. 本地项目 skill(symlink)

| skill | 来源 | 功能 |
|---|---|---|
| work-digest | `/Users/zhaoshe/work-digest/integrations/codex/skills/work-digest` | work-digest/push-me 项目的本地 skill |

### 5.5 本次物理删除的 skills(不再保留)

以下 skills 已从 `~/.agents/skills/`、`~/.claude/skills/`、`~/.codex/skills/`、`~/.trae/skills/` 中移除(备份在 `/tmp/trae-skills-backup-20260721-170511/`),理由是冗余、不适用当前工作流、或有更好的替代:

**superpowers 老扁平副本(与 plugin v6.1.1 重复):**
- brainstorming, systematic-debugging, tdd-workflow, verification-loop, strategic-compact, search-first, planning-with-files, dmux-workflows, full-output-enforcement

**Paseo/Orca 多 agent 编排(TraeX 内置 Agent 工具已覆盖):**
- paseo, paseo-advisor, paseo-committee, paseo-handoff, paseo-loop, orchestration

**浏览器/网页(TraeX 中文版统一用 web-access):**
- agent-browser, browser-use

**MCP 开发(日常业务不需要构建 MCP server):**
- mcp-builder, mcp-server-patterns

**后端/框架指南(当前项目用不到或有更优替代):**
- api-design, better-auth-best-practices, bun-runtime, coding-standards

**前端/UI 设计风格类(风格过多,选最实用的):**
- e2e-testing, frontend-patterns, gpt-taste, high-end-visual-design, image-to-code, imagegen-frontend-mobile, imagegen-frontend-web, industrial-brutalist-ui, minimalist-ui, nextjs-turbopack, redesign-existing-projects, stitch-design-taste, web-design-guidelines, webapp-testing, building-native-ui, mobile-android-design

**研究/搜索(MCP 配置或 web-access 覆盖):**
- deep-research, exa-search, notebooklm

**内容创作/营销(非开发场景):**
- brand-voice, brandkit, content-engine, copywriting

**网站审计/代码审查(superpowers requesting-code-review 覆盖):**
- api-gateway, audit-website, code-review-specialist, product-capability

**X/Twitter API(无项目需求):**
- x-api

**运行代码辅助(TraeX 内置 Bash 足够):**
- run-code

**Agent 自调试(systematic-debugging plugin 版覆盖):**
- agent-introspection-debugging

**Eval 框架(非日常需求):**
- eval-harness

**飞书/Lark(全局禁用,27 个 lark-* skills):**
- lark-approval, lark-apps, lark-attendance, lark-base, lark-calendar, lark-contact, lark-doc, lark-drive, lark-event, lark-im, lark-mail, lark-markdown, lark-minutes, lark-note, lark-okr, lark-openapi-explorer, lark-shared, lark-sheets, lark-skill-maker, lark-slides, lark-task, lark-vc, lark-vc-agent, lark-whiteboard, lark-whiteboard-cli, lark-wiki, lark-workflow-meeting-summary, lark-workflow-standup-report

---

## 六、SKILL.md 跨工具兼容性结论

**文件格式 100% 兼容。** Claude Code / Codex / TraeX 三家都识别:
- YAML frontmatter(`name`、`description`、`origin` 等)
- Markdown 正文
- `scripts/`、`references/`、`assets/`、`templates/` 子目录引用
- progressive disclosure 加载

**不兼容点:**
1. **外部 CLI 依赖**:skill 引用 lark-cli/bytedcli/dmux/orca 等外部命令时,需要二进制在 PATH 且完成认证
2. **专有 MCP 名称**:skill 使用特定 agent 特有的 MCP server 名,其他 agent 需对应配置
3. **版本漂移**:superpowers v5 vs v6 的同名 skill 内容差异大(v6 的 HARD-GATE 在 v5 没有)
4. **OpenCode**:不支持 marketplace/SKILL.md 格式,使用 JS 插件

---

## 七、ZipTab 项目 DAILY 推荐集

> 详细证据见 `docs/agent-sort-report.md`,此处给结论。

**ZipTab 是 React + TypeScript + Vite + Mantine v7 Chrome MV3 扩展。**

- **项目指令**: `AGENTS.md`(已有)
- **平台自动加载**: plugin-creator、skill-creator、skill-installer、traex-guide、LSP 系列
- **DAILY 按需触发**:
  - React/TS/前端模式 → `vercel-react-best-practices`
  - React 组件重构/props 爆炸 → `vercel-composition-patterns`
  - UI polish/UX review → `impeccable`(首选)
  - 查第三方库最新 API → `documentation-lookup`(需配 Context7 MCP)
  - 文档画图 → `mermaid-diagrams`
  - 联网查资料 → `web-access`
  - 新功能/大变更前 → superpowers `brainstorming`
  - 遇到 bug → superpowers `systematic-debugging`
  - 完成前验证 → superpowers `verification-before-completion`;日常用 `npm run check && npm test`
  - 写新 skill → 系统 `skill-creator` 或 superpowers `writing-skills`
  - Git 工作流 → superpowers `using-git-worktrees`
  - Code review → superpowers `requesting-code-review`/`receiving-code-review`
- **LIBRARY(不默认加载,按需手动调用)**: 其余保留的 skills(设计风格、文档处理、Android/RN、Obsidian、bytedance 内部、pdf/docx 等)