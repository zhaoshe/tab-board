# Mutation Batch owns ordered evaluation and verification

Mutation Batch 的 revision gap、Replay、原始索引和失败隔离规则集中到一个纯 module。它提供固定的创建、同步求值和异步验证 interface，隐藏运行状态与验证后续批次的坐标；State Persistence 保留锁、fresh state 读取、normalize 和唯一写入，worker adapter 保留 Chrome 验证。

选择固定流程而不是任意策略 interpreter，减少调用方必须理解的组合；同步和异步执行共用私有 implementation。验证后的批次只携带通过验证的变更与原始结果坐标，不携带预检 state，也不重复扣除已消化的 revision gap。这延续 D042/D043 的职责，并保持普通错误整批拒绝、无效 drop 可隔离、写入成功后才报告 Partial commit 的行为。
