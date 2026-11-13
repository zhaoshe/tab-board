# TabBoard

TabBoard 保存和组织浏览上下文。以下术语区分已保存内容、浏览器中的当前内容和变更结果。

## Language

**Workspace**:
用户组织浏览上下文的最高层范围，包含自己的 Session 和 Category。

**Session**:
一组已经保存、可以恢复的浏览上下文，包含 Link 和 Note。

**Tab item**:
Session 中的一个条目，内容是 Link 或 Note；它与浏览器中仍打开的 Open Tab 分开。

**Category**:
Session 的单一归属；Inbox、Saved 和 Archive 是内置归属，自定义 Category 由用户命名。

**Bookmark**:
浏览器书签文件夹的只读浏览视图，独立于已保存的 Session。

**Mutation Batch**:
一次提交中按顺序处理的一组 Workspace、Category、Session 或 Tab item 变更。它可以报告成功变更与失败的拖拽变更，而普通无效变更会拒绝这次提交。

**Replay**:
同一拖拽变更已成功生效后再次请求确认，不会重复创建或移动已保存内容。

**Partial commit**:
Mutation Batch 中只有成功变更被保存的结果，失败变更仍可辨认和重试。

**Storage Authority**:
当前保存数据的读写入口。它区分用户配置的保存位置与实际可用的后端；文件目录不可用时使用浏览器副本，重连时按用户确认的副本恢复文件保存。
