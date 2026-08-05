# 危险操作确认统一设计

## 目标

让 `confirmBeforeDestructive` 成为所有危险操作二次确认的统一开关，而不只控制
Saved Session 和 Saved Item 删除。

设置默认继续开启。关闭后，危险操作直接执行；开启后保持现有确认弹窗、文案、
焦点返回和 loading/error 状态。

## 设置文案

Options > Advanced 中的设置标题改为：

`Confirm before dangerous operations`

说明文案改为：

`Ask before closing browser tabs, deleting saved data or structure, permanently deleting Trash items, and resetting settings.`

保留底层字段名 `confirmBeforeDestructive`，不做 schema 或持久化迁移。

## 受开关控制的操作

现有受控操作保持不变：

- 删除 Session；
- 删除单个 Saved Tab 或 Saved Note；
- 删除 Saved Tab 上的备注；
- 批量删除 Session 中选中的 Saved Tabs / Notes。

新增以下操作：

- 关闭一个当前浏览器 Tab；
- 删除 Workspace；
- 删除 Category；
- 从 Trash 永久删除单个项目；
- Empty Trash；
- Reset Settings。

开关开启时，上述操作先显示现有确认弹窗；开关关闭时直接调用同一个 mutation 或
runtime command。

## 数据与错误语义

- 删除 Session 和 Saved Item 仍先进入 Trash。
- 删除 Category 时，其中的 Sessions 仍移动到 Inbox。
- 删除 Workspace 时仍删除其 Sessions 和 custom Categories，并按现有规则切换
  active Workspace。
- Trash 永久删除和 Empty Trash 仍不可撤销。
- Reset Settings 只恢复默认设置，Saved data 和本地文件不变。
- 关闭确认后，Workspace/Category 删除若失败，继续显示现有错误并允许重试；失败后
  不补开确认弹窗。
- 关闭浏览器 Tab 继续使用现有 focus restore 和 runtime error 处理。

## 不受开关控制

- Popup Remove duplicate tabs 继续直接执行。
- Storage location 的 Folder 选择、Use/Overwrite/Merge 和 Stop Using File
  Storage 对话框继续存在；这些是数据迁移策略选择，不是危险操作确认。
- Import、Export、Save 和 Restore 不增加确认。

## 验证

自动化测试必须覆盖：

- 设置标题、`aria-label` 和说明文案；
- 六个新增入口在开关开启时显示确认，且取消不执行；
- 六个新增入口在开关关闭时不显示确认并直接执行；
- Workspace/Category 关闭确认后的失败状态仍可见并可重试；
- Reset Settings 关闭确认后直接提交 `DEFAULT_SETTINGS`；
- Open Tab 关闭确认后仍执行 focus restore；
- Popup 去重和存储迁移对话框行为不变。

完成后运行 focused Vitest、`npm run check`、完整 `npm test`、串行 Playwright 和
`git diff --check`。
