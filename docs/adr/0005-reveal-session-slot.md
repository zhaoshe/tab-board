# Reveal targets the stable Session Slot

Capture completion 与 URL `targetGroupId` 继续共用现有 reveal lifecycle，但按既有 `data-session-slot-id` 查找稳定 Session Slot。滚动与 highlight retention 不再以完整 SessionCard 已挂载为前提；Slot 可以先呈现 shell，保留交互资格后再激活 card。

这使 reveal/render 的既有 interface 隐藏渐进挂载状态，消除离屏新 Session 的“先有 card 才能 reveal、先 reveal 才激活 card”依赖。Workspace/category/filter ownership、取消、超时释放、reduced motion 和 D073 lazy activation 保持。无需通用 reveal framework、新保留协议或 DnD/持久化变更。真实 Slot 与两个 reveal 入口提供测试 leverage，完整生命周期仍由一个 owner 管理。

Status: accepted.
