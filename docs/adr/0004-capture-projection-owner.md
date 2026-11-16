# Capture projection is reconciled by Authoritative Publication

Capture runtime 在现有 canonical read 和 created-ID 校验之后，通过 store facade 调用同步 `reconcileCaptureCommit(canonical)`。快照顺序、optimistic replay、structural sharing 与投影发布回到既有 Authoritative Publication module；不增加读取依赖、等待无关 RPC 或以 created IDs 建立第二套合并规则。

确认快照按 mutationRevision、updatedAt 与现有 canonical/buffer 选择基线。即时投影只重放已经展示的 optimistic work；checked/category 的在途变更继续等待确认。共享私有 replay 求值，但 preview 不改队列、waiter、timer、retry 或实际 drop 参数；临时 drop revision 仅作用于显示副本。无法形成合法投影时保留当前显示、缓存确认快照并失败，让 capture 进入既有 committed-but-unreconciled 分支。真正 settlement 保留原错误与确认职责。

保持当前有效 Workspace 在即时 projection 中，canonical base 不借此改写。worker capture、selection/source snapshot、Open Tabs refresh、feedback/reveal、schema 与其他 ADR 的职责保持。这个小 interface 集中两个真实执行入口的 projection policy，提高 locality、depth 与测试 leverage；代价是 owner 明确区分 preview 和 settlement，以及 optimistic 与 checked 在途工作。

Status: accepted.
