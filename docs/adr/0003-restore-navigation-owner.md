# Restore navigation belongs to the page-state module

深化现有 `managerPageState.ts` / `useManagerPageState.ts` module，公开 hook 改为零参数，提供页面 state、普通导航/query 和完整恢复命令。Layout 不再提供 validation snapshot、恢复 guard、fresh replace 或 Workspace 同步。hook 内部订阅既有 store 的导航相关分支；纯 core 继续只拥有 URL parsing、validation 和 serialization。

命令和 effect 均在执行时读取最新 navigation ref 与 store，不让旧 render 覆盖命令更新的 ref 或 URL。恢复在调用 store 前同步启动私有 guard；成功通过唯一 validated update 完成 board replace，失败先立即重评估合法 Workspace 同步再抛原错误，使 ImportModal 能读取必要同步后的 revision。query、preference、history 与 D046 的被动 global Workspace 同步策略保持，不建立通用 ManagerContext、第二份 persistent store 或新的 owner/ports 协议。

这个 interface 收回完整恢复时序，提高 locality 和 depth；已有 history/store adapter 与导航、恢复两条路径提供真实 test leverage。代价是 runtime hook 具体依赖既有 store，测试需 seed 实际 projection。多页面 Workspace 仲裁属于尚未明确的产品策略，不在这个决定中改变。所有已支持 category，包括 Bookmark，必须通过同一 URL interface round-trip。

Status: accepted.
