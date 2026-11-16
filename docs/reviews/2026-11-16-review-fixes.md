# TabBoard 独立评审修复交付，2026-11-16

[原独立评审](../../.agents/reviews/2026-11-13-independent-review/review.md) 的结论为 `With fixes`，确认 I1–I4 四项 Important 和 M1 文档问题。四项行为修复已分别提交，逐项 Spec/Quality 审阅通过，并有对应自动化和 Orca 原生验收记录。M1 已校准。[最终独立复审](../../.agents/reviews/2026-11-16-review-fixes/final-review.md) 的结论为 `Ready to merge: Yes`，I1–I4 和 M1 全部关闭，未确认新增 Critical、Important 或 Minor 问题。

行为修复范围为 `106b3964c20472636dfb65eab4218166eec1c575..191871550a2530441fc2aef1a9ef58f8a246951a`。原评审及早期失败、修正和验收证据保留。完整修复证据的归档目录为 `.agents/reviews/2026-11-16-review-fixes/`；最终提交、源码一致性、原工作区保护与链接检查结果见[交付验收记录](../../.agents/reviews/2026-11-16-review-fixes/final-verification.json)。

## 问题与提交

| 问题 | 修复结果 | 独立提交与验收记录 |
| --- | --- | --- |
| I1，修复文件后重读仍丢 Session | 显式重读先取得全局 Web Lock，再进入 Authority 队列；当前页面与 peer 接纳同 revision/timestamp 的修复结果。peer 按 event id 去重且不转发；普通旧观察仍受 high-water 保护。 | `6467fa6da15975027e1d915fefdfebe0be8e4307`，[Task 1](../../.agents/reviews/2026-11-16-review-fixes/task-1-verification.json) |
| I2，Restore 已提交却因回复丢失报冲突 | 预览固定 revision 与 OriginScope，Publication 冻结实际发送的完整请求，Persistence 在写锁内核对持久回执。同一请求重试确认原提交，不重复替换或覆盖恢复前快照；无回执仍保留 CAS，来源不明时阻止可能已提交的请求被拆到另一来源。 | `e0da20bf1b5aea5f4f7178cc4cc8dcd4dbb878c0`，[Task 2](../../.agents/reviews/2026-11-16-review-fixes/task-2-final-verification.json) |
| I3，自身导出的合法 ID 无法完整恢复 | 复用既有 `isEntityId` 契约，保留 dot 和正式生成的 `~` ID；继续校验唯一性与引用。文件路径限制在 File I/O 边界执行，写入前拒绝分隔符及 NUL。 | `7c3d2e8e686c1db3c45439d3c612494d3ec87633`，[Task 3](../../.agents/reviews/2026-11-16-review-fixes/task-3-final-verification.json) |
| I4，横向往返丢失卡片阅读位置 | 稳定 SessionSlot 在本地保存列表偏移，重新挂载时恢复并按缩短后的高度 clamp。脱离 DOM 的零值不覆盖已捕获位置，切换阅读上下文重置偏移；完整 card/row 树仍按视口释放。 | `191871550a2530441fc2aef1a9ef58f8a246951a`，[Task 4](../../.agents/reviews/2026-11-16-review-fixes/task-4-final-verification.json) |

M1 在 [技术架构](../technical-architecture.md) 中改为零参数 `useManagerPageState()` 拥有恢复 guard 和导航，Layout 只组合并传递 action；Export 从 More 打开，JSON 经 store `exportAll()` 导出完整 canonical state，Text 经 `exportToText()` 生成；[功能规格](../feature-spec.md#export) 同步该入口及完整 JSON 与文本的范围。原优化 plan 仅删除 EOF 多余空行，本项不改变产品行为。

## 已验证结果

最后一项行为修复的冻结源码通过 `npm test`，共 125 个测试文件、1853 项测试。`npm run check` 通过，包含 build、扩展 sanity、import-cycle、architecture 和 19 项 release contracts；`git diff --check` 通过。Task 4 定向 GREEN 为 5 个文件、82 项测试。这里只引用实际运行记录，文档校准不重复完整源码套件。

Orca 验收使用项目 preview harness、实际生产处理路径及真实浏览器 DOM；文件场景使用原生 OPFS/IndexedDB。具体结果如下。

- [I1 双页面重读](../../.agents/reviews/2026-11-16-review-fixes/task-1-fix1-native-reread.json) 在 revision 7、相同 meta 下让 source 与 peer 都显示恢复的 Session，unread count 清零。手动及 peer 重读在全局写锁持有期间被阻塞；跨页面 Chrome 通知由 BroadcastChannel 桥接 preview cache。
- I2 的 [Browser](../../.agents/reviews/2026-11-16-review-fixes/task-2-fix1-native-restore-reply.json) 与 [File](../../.agents/reviews/2026-11-16-review-fixes/task-2-fix1-native-file-restore-reply.json) 路径均丢弃首次成功回复，再发送相同 request id。最终 revision 8，状态或 final meta 只写一次，恢复前快照也只写一次且完整；Browser 另确认弹窗关闭、导航正确、搜索和非受管 history 保留。File 确认原生 handle association、IDB 与 OPFS。
- I3 的 [Browser](../../.agents/reviews/2026-11-16-review-fixes/task-3-native-browser-backup-ids.json) 与 [File](../../.agents/reviews/2026-11-16-review-fixes/task-3-native-file-backup-ids.json) 均完整往返 `group.legacy` 和 `drop_~57fc415dd1387da5_group`，内存及持久内容相等，旧快照保留。File 还验证四种非法路径 ID 在写入前拒绝，原字节和重读数据不变。
- I4 的 [普通往返](../../.agents/reviews/2026-11-16-review-fixes/task-4-native-card-scroll.json) 与 [重复往返](../../.agents/reviews/2026-11-16-review-fixes/task-4-native-card-scroll-repeat.json) 使用 20 Sessions、首卡 180 Links，无 selection/edit/menu/drag/reveal owner。离开后完整 card 卸载，返回时新列表从 `3876.111328125` 恢复到相同偏移，完整 cards 保持 6 张。[列表缩短](../../.agents/reviews/2026-11-16-review-fixes/task-4-native-card-scroll-clamp.json) 到 60 Links 后恢复到 `1768.3333740234375`，与理论最大值 1769 的差在浏览器取整范围内，clamp 验收通过。
- [五项鼠标 DnD](../../.agents/reviews/2026-11-16-review-fixes/task-4-native-dnd.json) 全部通过，包括 Session 同分类重排、跨分类移动、Saved Tab 加入已有 Session、多选 Open Tabs 加入已有 Session，以及多选 Open Tabs 命中 `new-session-insert` 创建 Session。fixture 清理记录随各 Task 归档。

## 验收边界与工作区保护

上述 preview 的 worker 路径执行真实项目模块，但没有验证安装后的 MV3 worker 生命周期、sender/权限或真实目录权限弹窗。鼠标 DnD 不证明实机触控长按；本轮没有运行完整 96-case Playwright E2E 或确认 PR CI 的实际结果。

继续保留原评审的其它范围限制：同步目录的多设备分布式冲突、D046 多 Manager 全局 Workspace 仲裁、旧版中断且无 recovery snapshot 的回滚，以及尚未复现的 cold Options 首次迁移风险。SessionSlot 覆盖正常 scroll event 和连接中的 cleanup，不承诺脚本同一 tick 设置偏移、事件尚未送达就卸载时的位置。

File 恢复前副本的准备仍先于 phase 1，后续准备失败可能更新该副本；final meta 与 recovery snapshot 对 canonical state 的保护仍然成立。Restore 回执保留在当前来源内，元数据会随完整恢复次数增长，本次没有新增过期策略。UI 页面销毁后也不持久保留待提交队列。这些边界已在最终复审中逐项记录。

修复在 `tabboard-optimization` SUB 内完成。[最终原工作区保护记录](../../.agents/reviews/2026-11-16-review-fixes/original-protection-final.json) 核对 `/Users/zhaoshe/code/worktrees/ZipTab/dev` 的 HEAD、status 和 14 个用户文件均未变化。修复沿用 Mutation Batch、Storage Authority、Publication、导航 hook 和稳定 SessionSlot，保持 canonical schema、File v1 核心布局及既有 Snapshot/CAS、Replay、capture/locked/pinned/error 合同，没有增加运行时依赖或第二份持久 UI store。

## 最终整段复审

最终复审由一个独立 reviewer 完成，覆盖四个行为提交、M1 文档校准和功能规格的 Export 补充。Task 5 的 Spec/Quality 均为 Approved，整段修复的结论为 `Ready to merge: Yes`。审查核对了源码、失败到通过的回归记录、实际原生验收及相关边界；故障注入产生的预期诊断日志不构成合并阻塞。

文档提交只记录已审阅内容和上述结论，1853 项测试及 check 对应的行为源码保持一致。完整审阅范围与提交追溯信息见[最终复审报告](../../.agents/reviews/2026-11-16-review-fixes/final-review.md)，执行取舍及范围裁定见[裁定记录](../../.agents/reviews/2026-11-16-review-fixes/rulings.md)。本次交付为合并通过结论，分支和 Orca SUB 保留供后续合并。
