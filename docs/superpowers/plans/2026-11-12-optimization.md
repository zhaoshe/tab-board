# TabBoard optimization implementation plan

**Goal:** 在 Orca SUB workspace 中逐项落地评审 1–14，每项独立验证并提交。

**Spec:** `docs/reviews/2026-11-12-project-optimization-review.md`，用户已授权按此评审落地。

**Architecture:** 沿用纯 model、Storage Authority、Authoritative Publication、React hooks/components 与 typed DnD，优先局部修改。原工作区只读，继承改动单独提交为 baseline。

**Global constraints:** 不增加运行时依赖；文件后端保持旧布局可读；保留 pinned/capture、locked、CAS、replay 与 Hybrid Commands；浏览器仅 Orca；逐项完成后提交，不自动合并或推送。

**Review focus:** 中断事务后再写入；降级后同 ID note 修改/删除；全量恢复无效引用；超大 session 搜索/选择/拖拽；worker 不可达和响应丢失。

### Task 1: 保留失败写入前的文件

**Files:** src/shared/store/fsAtomic.ts; src/shared/store/fsAtomic.test.ts

**Implementation:** 采用 FileSystemWritableFileStream 的 close 发布语义，取消先删目标及依赖 move 的替换；失败 abort，既有内容仍可读。

- [x] RED: 添加回归并确认因现有行为失败。Cases: 替换阶段失败后旧内容不变；user-picked folder 无可用 move 仍可保存；新文件失败不留下伪成功文件。
- [x] GREEN: 完成最小实现与相关当前规格更新。
- [x] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [x] Commit: `fix(storage): preserve committed files on write failure`，只暂存本项文件。

### Task 2: 恢复完整已提交状态

**Files:** src/shared/store/fileStorage.ts; src/shared/store/fileStorage.test.ts; docs/technical-architecture.md

**Implementation:** 提交前持久化上一份 normalized snapshot；pending meta 保留旧 revision，记录 pending revision；中断加载返回完整旧 snapshot，后续提交强制修复文件集合，读取前后校验 meta 防止混合读。保留 v1 可读文件布局。

- [x] RED: 添加回归并确认因现有行为失败。Cases: 替换/删除 session、写 settings、final meta 各阶段中断均恢复完整旧状态；恢复后再次提交不保留半次写入；提交中并发读取不观察混合状态。
- [x] GREEN: 完成最小实现与相关当前规格更新。
- [x] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [x] Commit: `fix(storage): recover interrupted file transactions`，只暂存本项文件。

### Task 3: 处理重连后的数据分歧

**Files:** src/shared/store/activeAdapter.ts; src/options/components/DataStorageCard.tsx; src/shared/store/activeAdapter.test.ts

**Implementation:** 重连前比较浏览器降级 snapshot 与文件 snapshot；无分歧直接重连；有分歧保留两侧并要求明确选择浏览器当前数据或文件数据，提交后安装 backend。

- [x] RED: 添加回归并确认因现有行为失败。Cases: 降级期间新增、改 note、删除后重连不会默默切回旧数据；取消不切 backend；失败保留当前 authority。
- [x] GREEN: 完成最小实现与相关当前规格更新。
- [x] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [x] Commit: `feat(storage): resolve reconnect data divergence`，只暂存本项文件。

### Task 4: 呈现文件恢复线索

**Files:** src/shared/store/fileStorage.ts; src/shared/store/settingsProjection.ts; src/options/components/DataStorageCard.tsx; src/manager/hooks

**Implementation:** 加载损坏 session 时保留其他数据，发布持久化的恢复问题摘要与恢复/重读入口，用户可区分加载不完整与删除。

- [x] RED: 添加回归并确认因现有行为失败。Cases: 损坏一份 session 后其他 session 可用且呈现明确提示；重新读取成功清除提示；原始损坏文件不被改写。
- [x] GREEN: 完成最小实现与相关当前规格更新。
- [x] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [x] Commit: `feat(storage): surface incomplete file recovery`，只暂存本项文件。

### Task 7: 完整备份恢复

**Files:** src/shared/model/session-operations.ts; src/shared/store/useTabBoardStore.ts; src/manager/components/import-export/ImportModal.tsx

**Implementation:** 同一 Import 入口识别完整 TabBoard JSON；默认可作为 sessions 导入，另提供明确的完整恢复选择；恢复工作区、分类、顺序、note、flags，恢复前保存当前 snapshot。

- [x] RED: 添加回归并确认因现有行为失败。Cases: 多 workspace/category/Saved/Archive/Notes 的导出恢复；保留当前快照；无效输入拒绝；既有 OneTab 导入保持可用。
- [x] GREEN: 完成最小实现与相关当前规格更新。
- [x] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [x] Commit: `feat(import): restore complete TabBoard backups`，只暂存本项文件。

### Task 5: 限制完整交互树

**Files:** src/manager/hooks/useSessionActivation.ts; src/manager/components/sessions/SessionTabList.tsx; src/manager/components/sessions/SessionCard.tsx

**Implementation:** 超出 viewport+overscan 后回退稳定 shell，选中、编辑、拖拽、搜索定位保留激活；超大 session 行使用稳定高度的渐进挂载，不新增运行时依赖。

- [x] RED: 添加回归并确认因现有行为失败。Cases: 浏览整块 board 回到开头后完整树有界；3000 link session 首屏完整行有界；selection/focus/search 与五条 DnD 路径正常。
- [x] GREEN: 完成最小实现与相关当前规格更新。
- [x] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [x] Commit: `perf(manager): bound session interaction trees`，只暂存本项文件。

### Task 6: 降低编辑与文件差异成本

**Files:** src/shared/store/stateMutations.ts; src/shared/store/fileStorage.ts; src/shared/store/stateStructuralSharing.test.ts

**Implementation:** 普通 mutation 使用 immutable 局部复制，复用未改对象；文件差异通过 ID Map，跳过未变顶层文件；保留校验、CAS 和 replay 规则。

- [x] RED: 添加回归并确认因现有行为失败。Cases: 修改 workspace 不复制无关 groups/tabs；输入 state 未被修改；locked/CAS/replay 原测试全通过；微基准可对照。
- [x] GREEN: 完成最小实现与相关当前规格更新。
- [x] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [x] Commit: `perf(state): avoid full clones for ordinary edits`，只暂存本项文件。

### Task 8: 工具链安全更新

**Files:** package.json; package-lock.json; vite.config.ts; .github/workflows/release.yml

**Implementation:** 按实际 audit 的可修复版本更新 Vite/Vitest/happy-dom 及兼容插件；对照 Chrome 115 与 CI Node 版本；不新增运行时依赖。

- [ ] RED: 添加回归并确认因现有行为失败。Cases: npm audit --omit=dev 仍为 0；可修复开发告警消除；全套 build/check/tests；Orca browser 可启动预览。
- [ ] GREEN: 完成最小实现与相关当前规格更新。
- [ ] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [ ] Commit: `chore(deps): update vulnerable development tooling`，只暂存本项文件。

### Task 9: 同步浏览器与持续验证

**Files:** tests/e2e/manager-boot.e2e.ts; playwright.config.ts; .github/workflows

**Implementation:** 修复漏掉标题刷新动作的菜单断言；PR CI 复用 build/check/test；端口参数化并验证目标身份；真实 extension 边界用已有 worker tests 加可执行专项验收记录。实际浏览器驱动使用 Orca。

- [ ] RED: 添加回归并确认因现有行为失败。Cases: 新增刷新动作 keyboard/focus 可达；测试配置不复用任意 200 页面；CI 包含 PR gate；capture partial restore worker 生命周期故障有专项结果。
- [ ] GREEN: 完成最小实现与相关当前规格更新。
- [ ] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [ ] Commit: `test(ci): align browser contracts and PR validation`，只暂存本项文件。

### Task 10: 准确的隐私文案

**Files:** PRIVACY.md; README.md

**Implementation:** 说明本地保存且不上传 TabBoard 服务；恢复/标题刷新访问原网页，favicon 可能远程加载；不增加 host 权限。

- [ ] RED: 添加回归并确认因现有行为失败。Cases: 文案与运行时对齐，无完全不访问网络的绝对表述。
- [ ] GREEN: 完成最小实现与相关当前规格更新。
- [ ] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [ ] Commit: `docs(privacy): describe browser network activity accurately`，只暂存本项文件。

### Task 11: 首次使用与恢复语义

**Files:** src/manager/components/sessions/SessionCardHeader.tsx; src/manager/components/sessions/TabItemRow.tsx; src/manager/components/shell

**Implementation:** 相关 tooltip 按设置说明打开并保留/打开并移除；首次保存后给一次可关闭的拖拽/右键说明，保持工作台密度。

- [ ] RED: 添加回归并确认因现有行为失败。Cases: 两种恢复设置提示正确；提示可关闭且不重复干扰；Orca browser 检查桌面与窄屏。
- [ ] GREEN: 完成最小实现与相关当前规格更新。
- [ ] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [ ] Commit: `feat(ux): clarify saved session actions`，只暂存本项文件。

### Task 12: 延后导入与计数计算

**Files:** src/manager/components/import-export/ImportModal.tsx; src/manager/components/search/SearchBar.tsx

**Implementation:** 缓存未变解析结果，延后导入预览；搜索计数复用 deferred 查询，标识更新中并保持 clear/close 即时。

- [ ] RED: 添加回归并确认因现有行为失败。Cases: 连续输入只解析最终文本；格式错误修正恢复预览；clear/close 即时；导入 pending/failed 保留用户输入。
- [ ] GREEN: 完成最小实现与相关当前规格更新。
- [ ] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [ ] Commit: `perf(input): defer import preview and search counts`，只暂存本项文件。

### Task 13: Bookmark 明确状态与顺序

**Files:** src/manager/hooks/useBookmarkSessions.ts; src/manager/components/shell/ManagerLayout.tsx

**Implementation:** 保留最后成功列表，暴露 loading/error/retry；用请求代次拒绝旧响应，清理后不发布。

- [ ] RED: 添加回归并确认因现有行为失败。Cases: 响应倒序不覆盖最新列表；失败保留已显示内容并提示重试；workspace 切换和 unmount 清理。
- [ ] GREEN: 完成最小实现与相关当前规格更新。
- [ ] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [ ] Commit: `fix(bookmarks): retain data and reject stale refreshes`，只暂存本项文件。

### Task 14: 校准当前规范

**Files:** AGENTS.md; docs/project-overview.md; docs/feature-spec.md; docs/technical-architecture.md; docs/feature-evolution.md; docs/product-decisions.md

**Implementation:** 以现有追加导入顺序为兼容行为，校准规格；补 Bookmark 只读分类、版本与当前检查命令；记录每项最终实现和验证。

- [ ] RED: 添加回归并确认因现有行为失败。Cases: 当前规范与代码、测试和版本一致；所有 14 项有 commit/verification 记录。
- [ ] GREEN: 完成最小实现与相关当前规格更新。
- [ ] Verify: `npm test` 与 `npm run check`，需要渲染时使用 Orca browser 并保存证据。Expected: 全部 unit/build/architecture gates 通过；已知旧浏览器断言在 Task 9 修复。纯文案使用链接/差异轻量检查。
- [ ] Commit: `docs: align current product and verification contracts`，只暂存本项文件。

