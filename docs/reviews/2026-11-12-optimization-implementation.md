# 2026-11-12 优化实施记录

基线评审见 [2026-11-12-project-optimization-review.md](2026-11-12-project-optimization-review.md)。本记录汇总 1-14 项优化及最终集成修复的落地、提交和验证证据，保留原评审历史，不改写其问题背景。

## 最终基线

- 工作树：`/Users/zhaoshe/code/worktrees/ZipTab/tabboard-optimization`
- 分支：`zhaoshe/optimization`
- inherited baseline：`346e1098dc9be1d148842256c89de87b3c66e219`
- Task 14 起点：`a6131a0b3f803afb13584799f8b1ed8c98b7acac`
- 当前源码版本：`0.1.6`
- 运行 / 构建基线：Chrome `115+`，Node.js `20+`
- 工具链：Vite `6.4.6`、`@crxjs/vite-plugin` `2.7.1`、Vitest `4.1.12`、happy-dom `21.0.4`
- 最终默认全量门禁：`npm test`、`npm run check`、`git diff --check`
- 当前最终全量结果：`npm test` `117 files / 1702 tests` 通过；`npm run check` 通过，含 cycle `6/6`、architecture `8/8`、release `19/19`
- Task 8 安全门禁：`npm audit --json` 与 `npm audit --omit=dev --json` 均为 `0`
- 原始 14 文件保护：见 [final-parent-protection.json](../../.agents/optimization/final-parent-protection.json)，其中 `originalHeadMatches=true`、`statusMatches=true`、`changedFiles=[]`、`checkedFileCount=14`

## 最终集成修复

最终分支审查发现重连会漏存同 ID 未读原件，并持续关闭候选的投影发布。修复起点为 `6d76038a69e2af47db0a6b453d38e4ea6be262e6`；最终修复提交由父任务完成，不在本记录写自引用 hash。

- `fileStorage` 在任何已识别未读文件的同名替换前，用现有 `.tabboard-unread-before-restore/` 保留精确字节并检查唯一名称；备份失败阻止替换。重连未冲突原件继续留在 `sessions/`，完整 Restore 继续备份全部未读原件。
- `activeAdapter` 仅在重连准备阶段保持静默；数据和 handle 提交后，通过一次 storage 写入发布选定设置、状态和 ping，提交失败继续恢复旧 handle。安装后的直接提交与修复重读恢复正常发布。
- 架构文档改为进入/离开 viewport + overscan 的有界激活，并对齐现有 60 slots、首屏及横向往返后 6–8 个完整 cards 断言。
- 聚焦 RED 为 `7 failed / 76 passed`，两次 GREEN 均为 `83 passed`。最终完整 `npm test` 为 `117 files / 1702 tests`；`npm run check` 包含 build、extension sanity、cycle `6/6`、architecture `8/8`、release `19/19`，均通过；`git diff --check` 通过。
- 本修复波次未运行浏览器、未新增依赖、未提交。原有物理证据仍有其记录边界；新增重连契约的 Native/review 收口由父任务完成。

逐次输出与范围见 [最终集成修复报告](../../.superpowers/sdd/2026-11-12-optimization/final-integration-fix-report.md)，全量日志见 [final-fix-npm-test.log](../../.superpowers/sdd/2026-11-12-optimization/final-fix-npm-test.log) 与 [final-fix-npm-check.log](../../.superpowers/sdd/2026-11-12-optimization/final-fix-npm-check.log)。

## 物理验证边界

- 已记录的浏览器物理证据来自本地 Orca preview / native OPFS 路径，以及父任务保留的截图、JSON receipt 和任务报告。
- 本轮最终收口没有宣称重新完成 installed Chrome MV3 lifecycle、真实用户 Chrome profile、file picker permission prompt 或完整 `96` 条 Playwright 本地浏览器运行。
- `tests/e2e/` 的 `96` 条浏览器发现套件和 PR browser gate 已在仓库 / CI 中配置；Task 9 同步了 identity probe、runtime contract 记录和 PR workflow browser gate。

## 关键证据入口

- 最终全量测试日志：[final-npm-test.log](../../.agents/optimization/final-npm-test.log)
- 最终项目门禁日志：[final-npm-check.log](../../.agents/optimization/final-npm-check.log)
- 最终 audit 结果：[final-npm-audit.json](../../.agents/optimization/final-npm-audit.json)
- 原始 14 文件保护：[final-parent-protection.json](../../.agents/optimization/final-parent-protection.json)
- FSA / OPFS 总体验证：[native-storage-orca.json](../../.agents/optimization/native-storage-orca.json)
- 完整恢复成功与 unread bytes 保留：[task-7-orca-restored.json](../../.agents/optimization/task-7-orca-restored.json)，[task-7-orca-unread-bytes.json](../../.agents/optimization/task-7-orca-unread-bytes.json)
- 大 board / DnD 物理证据：[task-5-orca-scroll.json](../../.agents/optimization/task-5-orca-scroll.json)，[task-5-orca-dnd.json](../../.agents/optimization/task-5-orca-dnd.json)
- 文件差异写入证据：[task-6-native-file-diff.json](../../.agents/optimization/task-6-native-file-diff.json)
- 大输入热路径证据：[task-12-large-edit-cost.json](../../.agents/optimization/task-12-large-edit-cost.json)，[task-12-large-edit-cost-green.json](../../.agents/optimization/task-12-large-edit-cost-green.json)
- Bookmark 保留旧列表 / 拒绝旧响应 / 粗指针重试目标：[task-13-error-retained.json](../../.agents/optimization/task-13-error-retained.json)，[task-13-stale-rejected.json](../../.agents/optimization/task-13-stale-rejected.json)，[task-13-retry-touch-green.json](../../.agents/optimization/task-13-retry-touch-green.json)

## 逐项落地

| 项 | 提交 | 主题 | 结果摘要 |
| --- | --- | --- | --- |
| 1 | `b2aa54359ab7c2d8c628a39ff7090ec42be6287b` | `fix(storage): preserve committed files on write failure` | 修复文件替换失败丢旧内容；全量 `110/1582` + `check` 通过。 |
| 2 | `391be90b55f659cd08d9af474e99ab7797491751` | `fix(storage): recover interrupted file transactions` | 引入完整恢复快照，避免混合状态；全量 `110/1589` + `check` 通过。 |
| 2 follow-up | `143e1072562f1d66d7502a84ba898f290a1a0efc` | `fix(storage): settle file operations before retrying transactions` | 等待并发文件操作 settle 后再 retry；全量 `110/1590` + `check` 通过。 |
| 3 | `af3c693900aae1de361f05043caad77c58547c18` | `feat(storage): resolve reconnect data divergence` | 重连前显式比较 browser/file 数据并要求选择；全量 `110/1598` + `check` 通过，Orca native filesystem 两侧保留证据成立。 |
| 4 | `03ca1039ca7d5cafedd2ea2bde751e47799254e4` + `adaedb71872e67ac9c3dc871af62770bee94a155` | `feat(storage): surface incomplete file recovery` + `fix(storage): retain unread file health after reconnect` | 损坏文件跳过后持续提示 `Incomplete folder data`，并保留 unread 健康信息；全量 `111/1604` + `check` 通过。 |
| 5 | `0b65593713292d3581b8939df4c10b7e1f357e95` + `00f2cce5272aa739207e119c2faa433f840fd6c8` | `perf(manager): bound session interaction trees` + `test(manager): cover responsive session row geometry` | 限制已激活卡片和超大 session 的完整交互树；全量 `113/1645` + `check` 通过，五条 Orca 指针 DnD 路径通过。 |
| 6 | `489a82e88c83c53df8ac1e718dff0257fec1e128` | `perf(state): avoid full clones for ordinary edits` | 普通 mutation 复用未改分支并减少文件写放大；全量 `113/1654` + `check` 通过，native file diff 与微基准记录已保存。 |
| 7 | `00b46539727beb3255a5544d689ebe8d2aac9935` + `2d9ebdbb9ed1461d86190f301950d66a7dac9913` | `feat(import): restore complete TabBoard backups` + `fix(storage): preserve unread file bytes during restore` | 保留默认追加导入，同时为完整备份提供显式 Restore；全量 `112/1629` + `check` 通过，Orca 文件恢复与 unread bytes 证据保留。 |
| 8 | `ffb9ea3740237490925b3896147c1e5ba48beef2` | `chore(deps): update vulnerable development tooling` | 升级到 Vite `6.4.6`、Vitest `4.1.12`、happy-dom `21.0.4`，保留 CRX `2.7.1`；`npm audit` 与 `npm audit --omit=dev` 均为 `0`，全量 `113/1654` + `check` 通过。 |
| 9 | `a20fda9c41034d3270748427e0810cae47ec00a1` | `test(ci): align browser contracts and PR validation` | 同步菜单断言、preview identity、runtime contract record 和 PR browser gate；全量 `114/1661` + `check` 通过。未在本地重新跑完整 `96` 条 Playwright，仅确认套件与 CI 门禁已配置。 |
| 10 | `072fb0805afee0afa916ab79de4b5dcab09a02b7` | `docs(privacy): describe browser network activity accurately` | README / PRIVACY 与真实浏览器访问边界对齐；docs-only，源代码核对 + Node release tests + `git diff --check` 通过。 |
| 11 | `3cea1db16558783de3d75a5c33a4cfe7f0ca9dc7` | `feat(ux): clarify saved session actions` | Restore tooltip 反映 keep/remove 真实语义，首次 saved-session 帮助提示只出现一次；全量 `116/1680` + `check` 通过，父任务 Orca 视口与语义验收通过。 |
| 12 | `d59cf95c44d9a200840c9f8581689f41a9c7a877` | `perf(input): defer import preview and search counts` | 导入预览与搜索计数延后到已发布 query / preview，超大文本改为 6 行滚动编辑器；全量 `116/1689` + `check` 通过，父任务记录大 JSON 原生输入改善。 |
| 13 | `a6131a0b3f803afb13584799f8b1ed8c98b7acac` | `fix(bookmarks): retain data and reject stale refreshes` | Bookmark 保留最后成功列表，显式 `Loading bookmarks…` / `Could not load bookmarks` / `Retry`，旧响应不会覆盖新结果；全量 `117/1695` + `check` 通过。 |
| 14 | `this docs commit` | `docs: align current product and verification contracts` | 当前文档与 Agent Guide 对齐 `0.1.6`、Bookmark 只读分类、默认追加导入顺序与真实 `check` 流水线；本行不写自引用 hash，最终提交 HEAD 由父任务回复。 |

## 当前裁定与收尾

- 保留历史评审与决策上下文，但当前规格只描述最终行为，不回写已移除的 Todo、Quick list 或 `All items` 导航。
- 默认 Import 继续向当前 workspace/category 追加 sessions，以保留现有兼容行为；完整 Restore 仍是显式选择。
- Bookmark 仍是只读运行时投影，不进入 canonical saved state。
- Task 14 对齐当前文档与交付记录；最终集成修复补齐重连原字节保留与发布生命周期，不引入新的运行时依赖或扩大浏览器验证宣称。
