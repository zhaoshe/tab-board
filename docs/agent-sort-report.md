# agent-sort: ZipTab 仓库 ECC Skill 分类报告

> 生成日期: 2026-07-21
> 方法: agent-sort skill,证据驱动的并行 review(本仓库单会话串行执行)
> 仓库: `/Users/zhaoshe/code/worktrees/ZipTab/dev`

---

## STACK

通过 `package.json`、`manifest.json`、文件扩展名统计、目录结构、已有 agent 配置实证确认:

| 维度 | 实证 |
|---|---|
| 语言 | TypeScript 为绝对主力:65 `.ts` + 21 `.tsx`;无 Python/Java/Go/Rust/Kotlin/Swift/Dart 源文件 |
| 运行时 | Chrome 浏览器扩展(Manifest V3),含 Service Worker、Popup、Options、New-Tab Manager 四个入口 |
| UI 框架 | React 18 + Mantine v7 + @dnd-kit(拖拽) + @tabler/icons-react |
| 状态管理 | Zustand + chrome.storage.local(非 Redux/Context-heavy) |
| 构建 | Vite 5 + @crxjs/vite-plugin(beta.28);**非 Next.js**、无 webpack、无 Turbopack |
| 单测 | Vitest 2 + happy-dom(jsdom 替代品),通过 `npm test` 运行 |
| E2E | Playwright + Chromium,`tests/e2e/*.e2e.ts`(preview 模式,mock chrome API) |
| 脚本 | Node `.mjs` 脚本:`scripts/check-extension.mjs`、`scripts/generate-icons.mjs` |
| CI/Hooks | **无** `.github/workflows`、无 `.husky`、无 lint/format 配置(无 ESLint/Prettier) |
| 认证/后端 | **无**;纯本地 chrome.storage,无网络后端、无 Better Auth/NextAuth、无数据库 |
| 文档 | Markdown(`docs/*.md`、README.md、AGENTS.md) |
| 现有 agent 配置 | `AGENTS.md`(CLAUDE.md 软链到它);`.claude/skills/chrome-extension-ui` **悬空软链**(已删除,见 INSTALL PLAN) |
| 平台部署 | Chrome MV3 扩展打包(无 Vercel/服务器部署) |

**结论**: 这是一个非常聚焦的项目——**Chrome 扩展 + React/TS + MV3 Service Worker + Vitest + Playwright**,没有后端、没有移动端、没有多语言、没有 CI、没有 SaaS 集成。绝大多数 skills 对这个项目是"未来可能用到,但不该每次会话都加载"。

---

## DAILY

每次会话都应默认加载/触发时直接可用,直接对应当前栈。所有条目都带仓库实证。

> **superpowers 插件说明**: 下方标注 `(superpowers v6.1.1)` 的 skills 来自 TraeX 已安装的 `obra/superpowers` 插件最新版 v6.1.1(`~/.trae/plugins/cache/superpowers-marketplace/superpowers/6.1.1/skills/`)。TraeX 会优先使用 plugin 版本,而不是 `~/.agents/skills/` 下的老扁平副本(如 brainstorming、systematic-debugging 等,建议在 traecli.toml 中禁用这些扁平副本以避免版本漂移,见 skills-inventory.md §5.4)。

| 组件 | 类型 | 仓库证据 | 为何 DAILY |
|---|---|---|---|
| **AGENTS.md**(已有) | project instruction | 仓库根存在,CLAUDE.md 已软链 | 项目规则入口 |
| `coding-standards` | skill(共享库) | 全仓库是 TS/TSX,有统一代码风格需求 | 跨语言 baseline |
| `brainstorming`(superpowers v6.1.1) | plugin-skill | 项目有 `docs/feature-spec.md` / `feature-evolution.md`,新功能先设计再写 | 任何非平凡功能/UI 变更前的强制 gate(v6 带 `<HARD-GATE>` checklist) |
| `systematic-debugging`(superpowers v6.1.1) | plugin-skill | 有 Vitest/Playwright 测试、MV3 service worker 易出异步 bug | 遇到 bug/测试失败时的结构化调试流程 |
| `verification-before-completion`(superpowers v6.1.1) | plugin-skill | AGENTS.md 明确要求 `npm run build && npm run check && npm test` 作为验证 checklist | 任务"完成"前的验证 checklist(替代老的 `verification-loop` 扁平副本) |
| `frontend-patterns` | skill(共享库) | 21 个 `.tsx`,React 18 + Zustand + DnD | React/TS 日常问题的通用模式库 |
| `vercel-react-best-practices` | skill(vercel-labs) | React 18 + hooks 密集使用 | Vercel 官方 React/Next 性能/模式经验 |
| `vercel-composition-patterns` | skill(vercel-labs) | Mantine 组件 + DnD 封装,可能出现 props 爆炸 | React 组合模式(compound/render props/React 19 API) |
| `e2e-testing` | skill(共享库) | 已有 `playwright.config.ts`、6 个 `tests/e2e/*.e2e.ts` | Playwright E2E 模式直接匹配当前测试栈 |
| `webapp-testing` | skill(共享库) | 本地 vite dev server(`npm run dev` 起 5173) + preview harness | 与本地 dev server 交互的 Playwright 模式 |
| `impeccable` | skill(共享库) | manager/popup/options 三屏 UI;AGENTS.md UX 规则密集 | UI 打磨/UX review 全能,适合现有 Mantine UI 精修 |
| `documentation-lookup` | skill(Context7) | 依赖较新的 Mantine v7、@dnd-kit v10、@crxjs beta,文档易过时 | 查 React/Vite/Playwright 等最新 API |
| `mermaid-diagrams` | skill(共享库) | `docs/` 目录存在,技术架构和 feature docs 需要图表 | 在文档中画架构/流程/状态机图 |
| `web-access` | skill(中文生态) | TRAE 中文版联网操作强制入口;需查 Mantine/dnd-kit/crxjs 文档/问题 | 任何联网操作统一入口(替代直接 WebSearch/WebFetch/browser-use 等) |
| traex-guide / ai-contribution:check-hook-reporting | plugin-skill(TraeX BD 市场) | 平台内置 | TraeX 官方指南 + 贡献上报自检,默认启用无需处理 |
| plugin-creator / skill-creator / skill-installer | system-skill(TraeX 内置) | 平台内置 | 插件/skill 安装与开发,平台自带 |

**DAILY 计数**: 项目指令 1 + superpowers 3 + 前端/React 3 + 测试 2 + UI polish 1 + 文档/查询/联网 3 + 平台内置 5 ≈ **18 个**(其中 5 个是 TraeX 平台自带,不占项目上下文)。

> 注:
> - **未**包含 `test-driven-development`(superpowers 的 TDD skill):仓库当前没有严格 TDD 文化(不少文件无测试),AGENTS.md 的 verification checklist 只要求跑测试,未强制先写测试。需要对某个模块严格走 TDD 时再手动启用。
> - **未**包含 `security-review`(已从推荐清单移除):日常代码遵循常规安全常识即可,AGENTS.md 已要求"不要引入安全漏洞";**遇到 Chrome 扩展权限变更、处理用户 URL/浏览数据、接入 OAuth/外部 API 时**再临时调用 `security-review` 或 `code-review-specialist`。
> - **未**包含任何"方法论/流程编排"类 skill(writing-plans、executing-plans、subagent-driven-development、dispatching-parallel-agents 等 superpowers 进阶 skill、dmux/paseo/orchestration 等):TraeX 内置 `TodoWrite` 和 `Agent` sub-agent 已覆盖日常并行/计划需求,这些重流程 skill 适合复杂多日项目,ZipTab 是单人小型扩展,不必强制。

---

## LIBRARY

保留可达、但不默认加载(按原因分组)。

### LIBRARY-A: 栈不对口(当前项目不用)

| 组件 | 证据 / 理由 |
|---|---|
| `next-best-practices` / `nextjs-turbopack` | **无 next.config**,package.json 没有 next;是 Vite+CRXJS |
| `backend-patterns` / `api-design` | 纯客户端扩展,无 Node 后端/REST API |
| `better-auth-best-practices` | 无任何 auth 依赖/流程(纯本地 chrome.storage) |
| `bun-runtime` | 使用 npm + Node 脚本,无 bun.lockb |
| `java-coding-standards` | 零 .java 文件 |
| `android-*`(4 个) / `mobile-android-design` / `building-native-ui` / `vercel-react-native-skills` | 零移动端源文件,非移动端项目 |
| `x-api` / `api-gateway` | 无 Twitter/X 集成,无第三方 SaaS OAuth |
| `mcp-builder` / `mcp-server-patterns` | 本项目是 MCP/agent 的使用者,不构建 MCP server |
| `Codex-api` | 本项目是 Chrome 扩展,不集成 Claude/Codex API |
| `product-capability` | 单仓小型项目,非多服务协作,无需 PRD→SRS 流程 |
| 设计风格类(`industrial-brutalist-ui`/`minimalist-ui`/`gpt-taste`/`brandkit`/`high-end-visual-design`/`design-taste-frontend*`/`frontend-design`/`stitch-design-taste`/`ui-ux-pro-max`/`imagegen-frontend-*`/`image-to-code`/`redesign-existing-projects`) | UI 已确定用 Mantine,不需要整站重设计或营销页生成。`impeccable`(DAILY)足以做 UI 打磨 |
| `content-engine` / `copywriting` / `brand-voice` | 非营销/内容项目;UI 文案由 AGENTS.md UX 规则覆盖 |
| `pdf` / `pptx` / `docx` / `xlsx` | 项目交互是 JSON import/export,不处理办公文档 |
| `obsidian-*`(3 个) | 非 Obsidian vault |
| `notebooklm` | 未使用 NotebookLM |
| `audit-website` | 是 Chrome 扩展不是公网网站 |
| `browser-use` / `computer-use`(agent-browser 已弃用) | 浏览器操作统一走 `web-access`;测试用 Playwright(`webapp-testing`);不需要通用桌面自动化 |
| `deep-research` / `exa-search` | 日常开发不需要深度调研;普通查文档走 `web-access` + `documentation-lookup` |
| 多 agent 编排类(`dmux-workflows`、`paseo*`、`orchestration`、`orca-cli`) | 单仓单任务足够,TRAE 内置 `Agent` sub-agent 已满足并行需求,这些依赖外部 tmux/Orca/Paseo 运行时,已从推荐清单移除 |
| skill/agent 运维类(`find-skills`、`skill-cleaner`、`agent-md-refactor`、`darwin-skill`、`eval-harness`) | 偶发场景才用,不每次加载 |
| 已弃用的 superpowers 老副本(`tdd-workflow`、`verification-loop`) | 是 superpowers 扁平副本的重命名旧版;plugin v6.1.1 已改名为 `test-driven-development`/`verification-before-completion`,老副本应在 traecli.toml 中 disabled |
| 不推荐/已移除的 meta-skills(`full-output-enforcement`、`planning-with-files`、`strategic-compact`、`search-first`、`agent-browser`、`run-code`) | 与 TraeX 内置机制冲突或被更轻量方式替代,不推荐使用 |
| `lark-*`(30+ 个) / `bytedcli` / `bytedance-*` / `flow-ab` / `pb-update` / `rax-cli` / `tea-next-query` | 飞书/ByteDance 内部工具链;本仓库是个人 Chrome 扩展项目,不涉及内部服务/飞书 API 集成 |
| `daily-report` / `会议总结助手` | 个人办公事务,不跟项目绑定 |

### LIBRARY-B: 有用但按需触发

| 组件 | 何时启用 |
|---|---|
| `code-review-specialist` | 提 PR 前、大改动前做安全/性能/质量综合 review;涉及扩展权限变更时也可用 |
| `test-driven-development`(superpowers v6.1.1) | 对某个新模块想严格走 TDD 时启用 |
| `web-design-guidelines` | 做 a11y/规范合规 audit 时(和 `impeccable` 互补) |
| `agent-introspection-debugging` | 怀疑是 agent 自身行为问题(不是代码 bug)时 |
| `agent-md-refactor` | AGENTS.md 太长需要拆分时 |
| `skill-cleaner` / `agent-sort` | 定期清理 skill 集合时(本报告即用了 agent-sort) |
| superpowers 进阶 skill(`writing-plans`/`executing-plans`/`subagent-driven-development`/`dispatching-parallel-agents`/`requesting-code-review`/`receiving-code-review`/`finishing-a-development-branch`/`using-git-worktrees`) | 多日/复杂功能分支开发时按需启用 |
| `security-review` | **仅当**涉及 Chrome 扩展权限变更、处理用户 URL/浏览数据、引入 OAuth/外部 API 时临时启用 |
| `design-taste-frontend` / `frontend-design` / `imagegen-*` | 若将来做 marketing 站点或大改版时启用 |

**LIBRARY 计数**: 约 100+ 个(绝大多数是栈不对口 skills,保持安装即可,不默认加载就不影响上下文)。

---

## INSTALL PLAN

### 1. 需要处理的现存问题

- **删除悬空软链** `.claude/skills/chrome-extension-ui`(指向不存在的 `../../.agents/skills/chrome-extension-ui`)。这个是当前仓库里唯一的项目级 skill 配置,且是坏的。
  ```bash
  rm .claude/skills/chrome-extension-ui
  # 若 .claude/skills/ 变空,也可保留空目录
  ```

### 2. 保持现状(不需要动项目文件)

DAILY 中的 skills 来自三处:
- **TraeX plugin cache**(superpowers v6.1.1、traex-bd-plugins):已由 TraeX 自动加载,无需项目配置。
- **TraeX 系统内置**(`.system/`):平台自带。
- **`~/.agents/skills/` 共享库**(coding-standards、frontend-patterns、vercel-react-best-practices、e2e-testing、webapp-testing、impeccable、documentation-lookup、mermaid-diagrams、web-access 等):已全局安装,**不要在项目级 `.trae/skills/` 复制一份**以避免版本漂移。

这些全局 skills 是否"每次会话都加载",取决于:
- Skill 自身的触发描述(agent 会按描述自动判断是否需要用);
- 不需要安装/卸载,只需要在不需要时**不主动调用**即可。
- 若未来出现上下文压力,在 `~/.trae/traecli.toml` 中用 `[[skills.config]] enabled = false` 禁用不对口的 skill 或 superpowers 老扁平副本(具体配置片段见 `skills-inventory.md` §5.4),而不是删磁盘文件。

### 3. 推荐不做的事

- **不要**在项目里新建 `.trae/skills/` 或 `.agents/skills/` 塞一堆 skills——项目只需要维护好 `AGENTS.md`(已经做得很好了,里面有明确的技术栈、命令、架构规则、UX 规则、DnD 规则、verification checklist)。
- **不要**为了"项目专属"复制 skill 副本。项目的特殊性已经体现在 `AGENTS.md` 里。
- **不要**引入 husky/ESLint/Prettier/CI 配置来"配"那些 hooks/lint skills——AGENTS.md 明确说"Prefer small, localized edits"且当前无 lint 工具链,不要为了用 skill 改工程配置。

### 4. 可选:创建一个简单的 `skill-library` 路由(如需)

如果想在项目里对 LIBRARY skills 做一个可见索引(而不是让所有 LIBRARY skills 完全不可见),可以创建:

```
.trae/skills/skill-library/SKILL.md
```

内容包括:
- DAILY/LIBRARY 二分原则
- 常用按需关键词映射(如 "UI 打磨" → `impeccable`、"代码 review" → `code-review-specialist`、"画架构图" → `mermaid-diagrams`、"查最新 API" → `documentation-lookup`)
- 指向本报告文件的引用

**本项目不建议立即创建**——规模还小,AGENTS.md + 本报告已经足够;等 skill 数量或团队规模扩大再考虑。

### 5. 建议在 AGENTS.md 补一条(可选)

在 AGENTS.md 的 "Verification Checklist" 附近可以加一句指引,把最常用的 skills 推荐给未来的 agent:

```markdown
## Agent Workflow Hints
- Before new features, use the `brainstorming` skill (from superpowers plugin).
- On bugs or test failures, use `systematic-debugging` (from superpowers plugin).
- Before declaring a task done, run through `verification-before-completion` (from superpowers plugin) plus `npm run check && npm test`.
- For UI polish or UX review, use `impeccable`.
- When touching extension permissions, tab/URL data, or external APIs, run `security-review`.
- For diagrams in docs, use `mermaid-diagrams`.
```

(这一步可选,当前 AGENTS.md 已经通过 "Read First" 和 verification checklist 隐含了这些流程。若采用,注意 brainstorming/systematic-debugging/verification-before-completion 由 TraeX superpowers v6.1.1 插件提供,impeccable/mermaid-diagrams 来自 `~/.agents/skills/` 共享库。)

---

## VERIFICATION

执行的检查:

- [x] `rg --files` + 扩展名统计:确认主力语言是 TS/TSX,无其他后端/移动端语言
- [x] 读取 `package.json`:确认 React 18 / Vite 5 / Vitest / Playwright / Mantine / @dnd-kit / Zustand / 无 Next/无 auth/无后端框架
- [x] 读取 `manifest.json`:确认 MV3、权限集、入口页面
- [x] 读取 `playwright.config.ts`:确认 E2E 真实配置(chromium + preview harness)
- [x] 遍历 `src/` 目录:确认 manager/popup/options/background/dev 五块结构,core/hooks/components 分层符合 AGENTS.md 规定
- [x] 检查 `tests/`:确认单测(Vitest `.test.ts`)和 E2E(`tests/e2e/*.e2e.ts`)并存
- [x] 检查 `.claude/` / `.codex/` / `.trae/` / `.github/` / `.husky/`:已删除悬空软链 `.claude/skills/chrome-extension-ui`(执行完成),未发现 CI、hooks、lint 配置
- [x] 调研三家生态(Claude Code / Codex CLI / TraeX)的 skill/plugin 关系,确认 superpowers 插件在 TraeX 中为 v6.1.1(最新),`~/.agents/skills/` 下存在老版本扁平副本(版本漂移)
- [x] 交叉核对 AGENTS.md 的 "Architecture Rules" / "Commands" / "Verification Checklist",确认 DAILY skills 不违反"Prefer small, localized edits"和"不要引入新运行时依赖"

遗留 / Open questions:

1. **superpowers 老扁平副本处理**: `~/.agents/skills/brainstorming`、`systematic-debugging`、`tdd-workflow`、`verification-loop` 等是 2026-02 安装的老版本,TraeX 通过 plugin cache 已有 v6.1.1。建议在 `~/.trae/traecli.toml` 中禁用这些扁平副本以避免版本冲突(配置片段见 `skills-inventory.md` §5.4),但这是全局配置改动,未自动执行。
2. **skill-creator 重复**:系统内置 `~/.trae/skills/.system/skill-creator/` 和 `~/.agents/skills/skill-creator/`(来自 anthropics/skills)重复,建议在 traecli.toml 中禁用扁平副本。
3. **项目是否需要 ESLint/Prettier?** 当前没有;如果未来引入 lint,可考虑对应 pre-commit hook skill,但目前按 AGENTS.md "不主动加依赖" 原则不动。
4. **CI 需求**:当前无 `.github/workflows`,如果未来上 CI,可把 `npm run check` 和 `npm run test:e2e` 放进 CI,不需要为此引入 skill。

### 分类计数汇总(修订后)

| Bucket | 数量(含内置) | 说明 |
|---|---|---|
| DAILY | ~18 | 含 5 个 TraeX 平台内置 skill + 3 个 superpowers v6.1.1 插件 skill + 1 条项目指令(AGENTS.md) |
| LIBRARY | ~100+ | 大部分是栈不对口/风格类/办公类/内部工具链 skills,保留安装不默认加载 |
| 已清理(悬空软链) | 1 | `.claude/skills/chrome-extension-ui` 已删除 |
| 待全局配置优化 | ~5 项 | superpowers 老扁平副本 + skill-creator 重复(需改 traecli.toml,未自动执行) |
| 需新增项目文件 | 0 | 不需要新建项目级 skill 文件 |

---

## 下一步建议操作

1. ~~删除悬空软链~~(已完成):`.claude/skills/chrome-extension-ui` 已删除。
2. (可选,全局改动)在 `~/.trae/traecli.toml` 中禁用 superpowers 老扁平副本和 skill-creator 重复,让 TraeX 只用 plugin v6.1.1 版本(片段见 `skills-inventory.md` §5.4)。
3. (可选,项目内)在 `AGENTS.md` 末尾加 "Agent Workflow Hints" 小节(内容见 INSTALL PLAN §5)。
4. 未来需要某个 LIBRARY skill(代码 review、画图、查 API 等)时直接点名调用,无需预先启用。
