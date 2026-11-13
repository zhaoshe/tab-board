# TabBoard 架构优化交付记录

在独立 Orca SUB worktree `tabboard-optimization`、分支 `zhaoshe/optimization` 完成五轮架构深化。基线为 `ce0424bb8498b77c0a6175f21c37af7e0ad914fb`；每轮完成实现、独立审查和验证后提交，再从新提交重新分析。

| 优先级与领域 | 原有问题 | 交付结果 | 提交 |
| --- | --- | --- | --- |
| P1 · 技术、正确性 | pure/store、persistence 和 worker 分别推进 revision gap、Replay、原始索引和部分提交规则 | 一个私有 Mutation Batch interpreter 共享同步求值与异步验证；调用方保留真实 Chrome 验证和 durable write 职责 | `2940785049514b069454bf30296869c0965c0e72` |
| P1 · 技术、稳定性 | 准备、复制、bootstrap 和重读绕过 Authority queue；旧 callback 与 adapter 可以继续产生影响 | Storage Authority 拥有完整 transition/lifecycle，锁先于队列取得；reset 保留 IO 顺序，旧来源与发布资格失效 | `c0760d87e9d0e23eecbf7bf7d797e5d1b1ca8bb4` |
| P2 · 技术、体验 | Layout 必须协调恢复 guard、fresh validation 和导航；失败后只清 ref，Bookmark URL 无法 round-trip | 零参数 page-state hook 拥有完整恢复命令及即时失败同步；旧 effect 读取最新 ref/store；Bookmark 支持刷新和历史返回 | `d85abc1d863bc1818ccf8b8ba482a213a4235281` |
| P1 · 技术、并发正确性 | Capture runtime 按时间选择快照、合并 groups 并直接写投影，绕过 pending/in-flight owner | 同步 capture admission 回到 Publication；共享 canonical ordering/replay，保留 optimistic 工作、checked/outcome 与真实 drop 参数 | `fdf261b48890e8baa53bd6b6b42c6e10c34694bd` |
| P2 · 技术、体验 | reveal 等完整 card，而离屏新 Session 只有 shell，形成挂载前提循环 | 既有稳定 Session Slot 先定位/滚动，再用原 highlight retention 激活与释放 card | `e85d30b5ba92f81fa15f23d5c6e4e07fb56572f1` |
| P1 · 技术、并发正确性 | 显式选择低 revision 后端时旧数据高水位掩盖新提交；读取失败/reset 会重新带回旧高水位 | 本地 Authority 选择身份隔离 canonical 高水位，保留真实在途结果；读成功/失败后均检查身份 | `5ebfa7cfd4017887a47cdcac585848d5b0e95303` |

这些 module 将完整策略收回各自 owner，使 interface 隐藏执行顺序和内部协调。没有新增 runtime dependency、persistent UI store、通用 ports/策略框架；TabBoard schema、File v1 布局、DropIntent/Replay、Snapshot/CAS 和 capture/restore 策略保持。当前职责见 [技术架构](../technical-architecture.md)，领域词汇见 [GLOSSARY](../../GLOSSARY.md)，决策见 [ADR 0001](../adr/0001-mutation-batch-module.md)、[ADR 0002](../adr/0002-storage-authority-lifecycle.md)、[ADR 0003](../adr/0003-restore-navigation-owner.md)、[ADR 0004](../adr/0004-capture-projection-owner.md)、[ADR 0005](../adr/0005-reveal-session-slot.md) 与 D077–D081。

前一阶段 14 项优化的提交与验证见 [优化实施记录](2026-11-12-optimization-implementation.md)。

## 验证

| 范围 | 结果与关键证据 |
| --- | --- |
| 最终自动化 | `npm test`：119 个文件、1769 个测试通过。`npm run check`：build、extension sanity、import-cycle/architecture gates 和 19 个 release contracts 通过。`git diff --check` 干净。 |
| Mutation Batch | 原始坐标/gap、Replay 零 live read、fresh commit、普通错误整批拒绝、zero-accepted 快路径、最后一次 restore 前快照、timestamp 及真实 worker/persistence contracts 通过；7 个命名 runtime 契约通过。 |
| 拖拽 | Orca 浏览器五条路径通过：同分类排序、跨分类移动、saved tab 合入、选中 Open Tabs 合入、选中 Open Tabs 创建新 Session。 |
| 原生文件 | Orca OPFS 双重 restore 只有一次 durable write，final revision 9、最后 restore 前快照 revision 8，损坏原字节保留。 |
| Authority | 原生 File switch 对后续读写排序、候选静默、稳定 facade、已安装与退休 adapter 发布、最新 copy-back、显式 reconnect 选择、recovery copies、精确 unread bytes 和后续 revision 发布通过。 |
| Capture 并发 | Orca 原生捕获期间普通编辑 RPC 挂起，新 Session 已渲染且 optimistic edit 保留；pinned source 仍打开，较旧回复后内容和 ID 不丢失或重复。 |
| 离屏 reveal | 同一 Inbox board 从约 11909px 滚回约 59px，新 capture 的 Slot 可见、完整 card 已激活；真实 DOM 回归验证 3000ms 释放可返回 shell。 |
| 导航 | 真实 Publication recovery await 窗口中 guard 保持；失败保留 input/mode，立即同步后重试使用 revision 3，最终 revision 4。成功恢复保留 query、unmanaged URL 参数、hash/history state；Bookmark→Saved→Back 正确返回 Bookmark。 |

上述浏览器验收使用 Orca 的本地 preview 与真实 File System API；Chrome runtime seam 由项目 preview harness 提供。命名 runtime cases 在 Vitest 中执行真实 worker/store 代码，并模拟 Chrome/Storage 接口。这些证据不等同于已安装 Chrome 扩展的完整生命周期验证。

本地执行资料与 native receipts 位于 git-ignored `.agents/architecture/`。完整审查、冻结清单、差异与日志归档到 `.agents/architecture/reviews-and-ledger/`；汇总见 [最终验证记录](../../.agents/architecture/final-verification.json)。这些资料保留在当前工作区，代码、ADR 和本交付记录进入 Git。

## 取舍与范围

- **一致性优先于 reset 后立刻继续写入。** 保留 IO queue 防止同一目录出现两个 writer；已经开始的 IO 不作为可取消操作。代价是慢或挂起的旧 IO 会阻塞后续初始化/操作。
- **接口保持具体且小。** Authority 保留现有公开 interface；导航直接使用已有 store/history adapter。四组 ports、通用 ManagerContext 或纯 payload builder 没有当前 depth 收益。
- **恢复 guard 与最新状态共同成立。** 简单私有 guard 依赖所有命令/effect 读取最新 ref/store；若退回旧 render snapshot，必须重新检查成功导航与失败同步时序。
- **保留 D046。** `activeWorkspaceId` 仍持久化，页面 URL/global workspace mismatch 仍同步 store。两个不同有效 Manager URL 的仲裁尚未定义；没有把这轮重构扩大为独立页面 workspace 策略。

从 `e85d30b` 重新分析后，五项责任泄漏均已关闭，未发现下一项兼容且边界清楚的 Strong 深化机会。Transient URL cleanup、picker/drop cleanup 尚不足以支持新 module；历史 source-text assertions 可在相关路径后续改动时替换。通用 Context、payload/DOM wrapper 和按长度拆分仍属 speculative。实现循环据此停止。完整分支审查发现一项跨后端兼容问题和一项测试诊断问题，已完成唯一修复波次；最终 scoped 复审与 N1 关闭复核均通过，剩余 Critical、Important、Minor 均为 0。


## 最终兼容修复

完整分支审查发现：同一 Chrome context 下从文件数据 revision 50 显式切换到已有浏览器数据 revision 1 时，Publication 的高水位没有辨认数据集替换，可能在真实提交已到 revision 2 后仍显示文件数据。修复用已有 Storage Authority 的本地选择生命周期提供不透明 identity；Publication 仅在选择身份变化时重建 canonical 基线，保留 mutation queue、checked waiter、retry 与原错误策略。切换期间的旧 RPC 仍按真实结果结算，退休数据快照及已提交 mutation 不进入新数据集；新 Authority 暂时不可读也不会把真实成功改判为失败。读取结束无论成功还是失败，都会重新核对选择身份后才使用兜底观察，避免 reset 使读取失效后把上一数据集的高水位带入新数据集。预期的导航次生 warning 已在测试中捕获并断言。

新增 9 项回归，focused 为 5 个文件 / 292 项，全量 119 个文件 / 1769 项。Orca 同一 Chrome 实例中以原生 OPFS 执行 file 50 → 保留 browser 1 → checked browser 2，实际持久化与显示均为 browser 2；挂起普通编辑期间的捕获、pinned 保留、较旧回复后去重和离屏 Slot reveal 也通过。

本次 identity 仅属于本地 Authority，未作为持久化字段或跨页面协议传播。另一个页面选择后端时，当前页面仍需要既有 storage-switched/reset 流程感知；多页面切换仲裁、安装扩展后的 MV3 worker 休眠/重启与真实目录权限生命周期没有由这轮证据覆盖。

## 执行裁定

- 冻结源码后由独立 reviewer 检查，父任务串行完成 Orca 验收及提交；实现者不提前提交。
- Authority 保留原公开 interface，完整生命周期在内部排序。已开始的 IO 不取消，可能阻塞新生命周期。
- 导航采用简单私有 guard 的前提是每个命令和 effect 都读取最新 ref/store；不允许 render 将旧 snapshot 写回命令 ref。
- Capture 保留 canonical read 与 created-ID 校验，完整投影策略同步交给 Publication；preview 与 settlement 共用计算，但结算副作用分开。
- Reveal 使用已有稳定 Session Slot，不新增接口或框架；shell 已是合法定位位置，完整 card 可随后激活。
- 后端选择 identity 与 Chrome transport context 分开：只重置 canonical 高水位，不取消真实在途结果或清空工作队列；分布式选择策略另行决定。

最终兼容修复提交为 `5ebfa7cfd4017887a47cdcac585848d5b0e95303`。审查记录见 [整分支审查](../../.agents/architecture/reviews-and-ledger/final-architecture-review.md)、[最终增量与 N1 关闭结论](../../.agents/architecture/reviews-and-ledger/final-fix-review.md)；该记录保留初次 With fixes 及修正后的 Approved 历史。
