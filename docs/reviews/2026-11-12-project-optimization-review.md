# TabBoard 项目优化建议

评审日期为 2026-11-12，基线是 `964ad58` 加当前未提交改动，版本为 `0.1.6`。TabBoard 是本地优先的 Chrome 标签管理扩展，核心任务是保存、恢复和组织浏览上下文。本次按单用户、多个 Manager 页面与 MV3 worker 同时运行、数百个 session 和数千条链接的使用方式评审；30,000 条链接作为长期积累的压力场景。

项目的主要功能和交互已经较完整。纯模型、Storage Authority、权威提交反馈、typed DnD、浏览器回归和架构检查都已有实现。下一轮投入应先解决本地文件存储的数据完整性，再补齐恢复能力、控制长期使用时的渲染与写入成本。

P0 表示应优先修复的数据完整性问题；P1 表示下一轮迭代应处理的可靠性、性能或维护问题；P2 表示可随后完成的体验与维护改进。下表的实现成本是相对判断，未包含详细排期。

| 编号 | 优先级 | 主要领域 | 建议 | 证据强度 | 相对成本 |
| --- | --- | --- | --- | --- | --- |
| 1 | P0 | 技术 / 数据安全 | 修复单文件替换失败时旧数据被删除的问题 | 隔离复现 | 低至中 |
| 2 | P0 | 技术 / 数据安全 | 让多文件提交真正保留可恢复的上一版本 | 隔离复现 | 中至高 |
| 3 | P1 | 功能 / 恢复 | 重连文件夹前处理降级期间产生的数据分歧 | 源码确认 | 中 |
| 4 | P1 | 体验 / 数据安全 | 把损坏 session 的跳过结果呈现给用户 | 源码与现有测试确认 | 低至中 |
| 5 | P1 | 性能 / 体验 | 限制已激活卡片的持续累积，并处理超大 session | 浏览器复现 | 中至高 |
| 6 | P1 | 性能 / 技术 | 降低普通编辑的全状态深拷贝与写放大 | 源码与微基准确认 | 中 |
| 7 | P1 | 功能 / 备份 | 增加完整备份恢复能力 | 导出导入实验确认 | 中 |
| 8 | P1 | 技术 / 安全维护 | 更新有已知告警的开发工具链 | 当前 npm audit | 中 |
| 9 | P1 | 工程质量 | 同步浏览器验收，增加 PR 检查与真实扩展核心回归 | 当前测试与 CI 配置确认 | 低至中 |
| 10 | P1 | 隐私 / 文档 | 修正“完全不发起网络请求”的绝对表述 | 源码确认 | 低 |
| 11 | P2 | 体验 | 改进首次使用提示和恢复动作的语义 | 产品机会，待使用测试 | 低 |
| 12 | P2 | 性能 / 体验 | 减少导入预览和搜索计数对输入线程的工作 | 源码确认，卡顿阈值待测 | 低至中 |
| 13 | P2 | 功能 / 体验 | 区分 Bookmark 加载失败与空数据，保护请求顺序 | 源码确认 | 低 |
| 14 | P2 | 技术 / 文档 | 校准当前规范、Agent Guide 与浏览器契约 | 当前文件对照确认 | 低 |

1. **单文件替换失败会丢掉旧文件。** 仅影响本地文件后端。[fsAtomic.ts](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/store/fsAtomic.ts:62) 先删除目标，再移动临时文件；异常处理又会删除临时文件。隔离实验先保存旧数据，再让 `move()` 抛错，结果目录中两个文件都不存在。

   建议使用保留旧目标的替换流程，按实际文件系统支持选择发布方式。无 `move()` 的路径也必须在成功关闭新写入前保留旧数据。增加“旧文件已存在、替换阶段失败、旧内容仍可读”的故障注入测试。此修复减少文件写入失败后的数据丢失风险，且不需要新的运行时依赖。

2. **多文件提交尚不能恢复上一份完整状态。** [fileStorage.ts](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/store/fileStorage.ts:454) 在写数据前，就把新 revision 和 session 顺序写入 `meta.json`，随后覆盖或删除现有数据文件。加载器遇到 `writeInProgress` 只记录日志，然后读取当前文件，并没有上一 revision 的文件集合可恢复。

   实验从 revision 7 开始，模拟 revision 8 在替换一个 session 后中断。重新加载得到 revision 8、新 session 标题和旧设置，组成了未成功提交的混合状态。现有恢复测试只修改标志并放置临时文件，没有模拟数据文件已替换或已删除的中断点，见 [fileStorage.test.ts](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/store/fileStorage.test.ts:293)。

   建议保留上一份已提交版本，新数据写入独立暂存版本，全部成功后再发布提交索引；旧数据的清理放在提交成功之后。验收要求是在写 session、删除 session、写设置和发布最终索引等不同阶段中断，恢复结果始终是一份完整的已提交状态。权衡是暂时多占一份数据空间，并需要兼容已有文件布局。

3. **文件夹重连会直接切回文件侧数据。** [reconnectFolder()](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/store/activeAdapter.ts:617) 读取文件数据后直接安装 File backend，没有比较浏览器中降级期间的新写入。例如文件侧停留在 A，降级后用户新增 B，重连会再次显示 A。浏览器副本仍可能保留，但当前工作台不会带回 B。

   建议重连时先保存两侧快照，检测新增、修改与删除差异；有分歧时提供明确的恢复选择，再提交选定结果。无分歧时保持直接重连。不要仅用“文件侧优先”的同 ID 合并覆盖降级期间的修改。验收应覆盖新增 session、修改 note、删除 item 后重连。

4. **损坏 session 被跳过后，用户缺少恢复线索。** [readSessions()](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/store/fileStorage.ts:245) 解析失败时记录 warning 并跳过该文件；现有测试也把该 session 从加载结果中消失作为预期。其他数据继续可用是合理的，但普通用户看到的是 session 缺失。

   建议加载结果携带失败文件清单，在 Manager/Options 中提供简短、持续可见的恢复提示、重新读取和备份恢复入口。保留原始文件与诊断信息。这样用户能区分删除、筛选和文件损坏，避免把不完整加载误认为完整数据。

5. **卡片延迟激活主要降低首屏成本，浏览后的完整树会累积。** [useSessionActivation.ts](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/manager/hooks/useSessionActivation.ts:48) 在同一上下文中持续添加激活 ID；离开视口后不回退。浏览器实验用 80 个 session、每个 20 条链接，初始为 6 张完整卡片、120 行，浏览整块 board 再回到开头后仍保留 80 张完整卡片、1,600 行。

   [SessionTabList.tsx](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/manager/components/sessions/SessionTabList.tsx:70) 对已激活 session 的全部 matching tabs 创建行组件。单个 3,000 链接的 session 在首屏就挂载 3,000 行。

   生产扩展也在隔离 Chromium 149 profile 中测量，每个场景 3 次。300 个 session、合计 6,000 条链接时，可用 Manager 界面出现的中位数为 344ms，初始挂载 120 行；单个 3,000 链接 session 为 3,272ms，初始挂载 3,000 行，样本中最长主线程任务为 1,535ms。两者数据分布不同，这组小样本说明超大单 session 是明确的优化目标，不代表所有日常 session 都慢。

   建议先让远离视口的完整卡片回退到稳定 shell，同时保留正在选择、编辑、拖拽和搜索定位的 owner。再为超大 session 限制完整行交互树的挂载范围，保持插入位置和滚动几何。需明确浏览器 Ctrl+F、焦点恢复与选择状态的权衡；所有既有 DnD 路径仍须验收。先完成滚动往返后挂载数量有界的测试，再调整实现。

6. **普通编辑的成本随整个数据集增长。** [applyStateMutationCore()](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/store/stateMutations.ts:2448) 对普通 mutation 先深拷贝整个 state。浏览器后端还会整份读取、normalize 和写入；文件后端虽然会比较 session 差异，仍会写全部顶层数据文件，并用嵌套 `some()` 查找旧 session。

   Node v26.7.0 的纯函数微基准，每组预热 3 次、记录 9 次中位数，仅重命名 workspace 的结果如下，未包含 Chrome I/O、消息序列化或 React 渲染。

   | 链接数 | 状态 JSON 大小 | 重命名耗时中位数 | 后续 normalize 中位数 |
   | --- | --- | --- | --- |
   | 600 | 约 230 KB | 1.00ms | 0.13ms |
   | 6,000 | 约 2.30 MB | 8.43ms | 1.16ms |
   | 30,000 | 约 11.53 MB | 50.95ms | 6.88ms |

   建议从普通编辑路径开始，复用未修改的对象，只复制变化的 workspace/group/tab，保持既有校验和 normalize 边界。文件差异查找可用 ID Map，未变化的顶层文件可跳过写入。重构应按操作类型逐步完成，避免影响 CAS、重放判断和 locked 规则。常见数据量下收益较小，长期积累时更有价值。

7. **JSON 导出包含完整状态，导入目前是追加 session 的流程。** [exportToJson()](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/model/import-export.ts:210) 导出整个 state；[importText()](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/model/session-operations.ts:220) 则把 groups 放入目标 workspace/category、生成新 ID，并清除 starred。实验导出 20 个 session、4 个自定义分类和 2 个 Saved session，导入后得到 20 个 session、0 个分类和 0 个 Saved assignment。

   现有 session 导入行为有其用途；产品仍需要完整备份恢复。建议在同一个 Import 入口识别完整 TabBoard 状态，提供清楚的恢复方式，保留 workspace、category、顺序、note 和 flags；恢复前保存当前快照。以多 workspace、多 category 和 Notes 的导出恢复实验作为验收。此能力比增加新的整理概念更直接服务本地数据的长期保存。

8. **开发工具链有已知依赖告警。** 本次 `npm audit` 返回 12 个受影响包项：2 critical、5 high、5 moderate，涉及 Vite、Vitest、happy-dom 和间接工具链依赖。`npm audit --omit=dev` 返回 0。包级严重性和传递依赖会聚合，不能把这 12 项理解为扩展运行时的 12 个漏洞。

   建议单独安排兼容性升级，核对 Vite、CRXJS、Vitest、happy-dom 与 CI Node 版本，再跑现有构建和回归。部分修复涉及主版本变化，应逐项处理。实际风险主要在开发服务器、测试执行和构建环境，具体告警与适用条件见 [dependency-audit.json](/Users/zhaoshe/code/worktrees/ZipTab/dev/.agents/audits/2026-11-12-optimization/dependency-audit.json)。

9. **浏览器验收和自动检查需要跟上当前功能。** 本次独立端口运行 95 项 E2E，93 项通过，2 项失败。[manager-boot.e2e.ts](/Users/zhaoshe/code/worktrees/ZipTab/dev/tests/e2e/manager-boot.e2e.ts:1254) 仍期待 9 个 Session 菜单项，实际 10 个；Saved Tab 菜单断言漏了 `Refresh Title`。新增标题刷新能力有当前规格依据，两项失败属于验收清单落后，仍会阻断 release workflow。

   现有 [release.yml](/Users/zhaoshe/code/worktrees/ZipTab/dev/.github/workflows/release.yml:3) 只在 tag push 后执行检查。建议先同步这两项菜单断言，再为 PR 增加同一套构建、单元和浏览器检查。另增加少量真实 unpacked extension 回归，覆盖捕获提交后关闭源 tab、部分恢复成功、worker 冷启动与重启、文件权限撤销和重连。

   当前 E2E 使用 mocked-Chrome preview，不能证明真实 sender、权限或 MV3 生命周期正确。本机默认 5173 端口还被另一服务占用，默认测试误进入 `Access Token Required` 页面；本次保留该服务，使用 5194/5195 隔离验证。建议测试启动时验证目标页面身份，并让端口可配置，减少环境导致的误报。

10. **隐私说明的网络表述需要校正。** [PRIVACY.md](/Users/zhaoshe/code/worktrees/ZipTab/dev/PRIVACY.md:6) 与 README 宣称不发起网络请求。实际上，标题刷新会通过 [service-worker.ts](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/background/service-worker.ts:674) 创建访问原 URL 的临时窗口；保存的远程 favicon 也会经 [Favicon.tsx](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/components/Favicon.tsx:35) 的图片元素加载。

   建议说明数据保存在本地、没有向 TabBoard 服务上传数据，同时解释恢复/刷新标题会由浏览器访问目标网页、favicon 可能从原站点加载。无需增加 host permissions。这样产品说明能准确反映现有行为。

11. **首次使用与恢复动作可以更易理解。** 当前密集工作台和 icon-first 设计适合频繁使用；主要隐藏规则包括拖拽表面、右键筛选、跨 session 移动，以及恢复后移除保存记录。`deleteRestoredTabs` 默认为 true，恢复移除也不会为这些 refs 新建 Bin entry，见 [stateMutations.ts](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/shared/store/stateMutations.ts:2787)。这符合既有 OneTab 工作流，但需要用户理解。

   建议在首次保存、首次拖动和相关动作提示中加入简短上下文说明；恢复动作按设置显示“打开并保留”或“打开并移除”，后续可增加明确的撤销方式。保留日常界面的密度和现有入口。此项是产品机会，本次没有新用户使用研究，建议先观察用户能否独立完成保存、查找和重复使用 session，再确定提示范围。

12. **导入预览和搜索计数仍在每次输入时做完整工作。** [ImportModal.tsx](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/manager/components/import-export/ImportModal.tsx:42) 每次输入都解析完整文本，正式导入时再次解析。[SearchBar.tsx](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/manager/components/search/SearchBar.tsx:40) 虽然延后 150ms 发布 query，即时计数仍按 localValue 扫描数据。

   建议缓存未变化的导入解析结果、延后预览计算；搜索在大数据量下让计数复用同一查询投影或延后计算，并明确更新中状态。普通数据量仍可保持即时反馈。只有测到明显阻塞时再引入 Worker 或索引，避免提前增加实现成本。验收用大 JSON 粘贴、连续输入和格式错误修正场景，而非仅检查解析结果。

13. **Bookmark 请求失败与空列表没有明确区分。** [useBookmarkSessions.ts](/Users/zhaoshe/code/worktrees/ZipTab/dev/src/manager/hooks/useBookmarkSessions.ts:23) 失败后把 groups 清空，页面会呈现空数据；多次刷新没有请求序号保护，较早请求晚返回时也能覆盖后来的结果。

   建议暴露 loading/error 状态，失败时保留上一份列表并允许重试；成功响应只接受当前请求代次。沿用 Open Tabs 已有的保留旧数据与明确错误反馈模式即可。验收覆盖请求失败、连续书签变更和响应倒序完成。

14. **当前规范有几处可机械核对的偏差。** [project-overview.md](/Users/zhaoshe/code/worktrees/ZipTab/dev/docs/project-overview.md:138) 仍写版本 `0.1.0`，包与 manifest 是 `0.1.6`。Agent Guide 的内置分类列表漏了已有的只读 Bookmark。feature-spec 说导入插入当前 workspace 头部，当前 `importText()` 追加到 groups 末尾。菜单刷新功能也未同步到前述两个 E2E。

   建议先确认导入位置的产品契约，再同步当前规范、Agent Guide 和可执行验收；版本等纯事实可直接校准。后续产品变更优先更新当前规格，历史决策保留清楚的适用状态。收益是减少后续维护者和 agent 重建已移除行为、按旧规格修改现有代码的概率。

建议执行顺序为 1、2 → 3、4、7 → 5、6 → 8、9、10 → 11 至 14。第 9 项中两条落后的菜单断言与第 10 项文案成本较低，可以穿插在前两批工作中完成。先解决数据可靠性，再以现有稳定 slot、typed mutation 和权威反馈机制为基础优化。

本次确认 `npm run check` 通过，包含 build、扩展产物检查、循环依赖与架构检查、release contracts；`npm test` 为 110 个文件、1,580 项通过；`git diff --check` 通过。E2E 为 93/95 通过，两个失败及原因已在第 9 项说明。隔离浏览器验证覆盖现有 preview 的拖拽、导航、焦点和布局，并完成生产扩展在新建 profile 中的启动测量。真实用户 Chrome profile、文件选择器权限提示、真实触摸长按和全部 MV3 故障场景没有在本次完成验收。

本次没有修改产品代码。原有 13 个未提交文件保持原样；新增此报告，复现脚本、JSON 和截图保存在 git 忽略的 `.agents/audits/2026-11-12-optimization/`。

可复核证据包括 [文件故障实验](/Users/zhaoshe/code/worktrees/ZipTab/dev/.agents/audits/2026-11-12-optimization/reproduction.json)、[纯函数微基准与导入实验](/Users/zhaoshe/code/worktrees/ZipTab/dev/.agents/audits/2026-11-12-optimization/microbenchmark.json)、[渲染数量实验](/Users/zhaoshe/code/worktrees/ZipTab/dev/.agents/audits/2026-11-12-optimization/render-evidence.json)、[生产扩展启动基准](/Users/zhaoshe/code/worktrees/ZipTab/dev/.agents/audits/2026-11-12-optimization/startup-evidence.json)、[80 个 session 截图](/Users/zhaoshe/code/worktrees/ZipTab/dev/.agents/audits/2026-11-12-optimization/render-80x20.png) 和 [3,000 链接 session 截图](/Users/zhaoshe/code/worktrees/ZipTab/dev/.agents/audits/2026-11-12-optimization/render-1x3000.png)。
