# Storage Authority owns the complete backend lifecycle

Storage Authority 的现有 interface 保持，显式切换、重连、读取和重读的完整流程由同一 module 排序。显式切换先在队列外取得既有 `tabboard-state-write` Web Lock，再进入 authority queue；队列内部只调用内部实现，不再次申请这把锁或等待公开 facade。State Persistence 和 Mutation Batch 的职责延续 ADR 0001。

候选 adapter 在准备期间静默，旧 backend 保持有效；提交并安装后，新 adapter 才有本上下文的发布资格。替换或同步 reset 使旧初始化、callback 和后续发布失效，避免只靠 revision 判断来源。旧 promise 的清理不能清空新初始化的 promise。已开始的磁盘或 transport 操作不作为可取消操作处理。

这个决定提高完整 lifecycle 的 locality 和 interface depth，Chrome/File 两种真实 adapter 保留同一 seam，多条读写与切换路径共用测试 leverage。代价是读取也等待本上下文的操作队列。迁移副本选择、recovery copies、unread 原字节、handle rollback、手动重读的 rejection 和自动重读的 fallback 保持；其他上下文仍通过现有切换消息刷新，不增加分布式 backend 协议。

Status: accepted for Cycle 2 implementation.
