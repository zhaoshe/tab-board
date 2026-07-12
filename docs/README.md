# ZipTab Docs

这个目录用于记录 ZipTab 的功能变迁、产品决策和对外叙事，方便之后回溯、复盘和 sell。

## 文档地图

- [Project Overview](project-overview.md): 总结项目定位、目标、边界、当前状态和成功标准。
- [Feature Spec](feature-spec.md): 描述当前功能面、入口、交互规则和 legacy 能力。
- [Technical Architecture](technical-architecture.md): 描述 extension 架构、数据模型、关键流程和验证方式。
- [Feature Evolution](feature-evolution.md): 记录功能从哪里来、什么时候变化、当前状态是什么。
- [Product Decisions](product-decisions.md): 记录关键决策的背景、取舍、结果和后续观察点。
- [Product Story](product-story.md): 记录面向用户或评审时怎么介绍 ZipTab。
- [Nord UI Redesign](nord-ui-redesign.md): 当前 Web Awesome + Nord UI 改造的设计准则、实施状态和防漂移检查表。

## 维护规则

每次做完一个明显的产品方向变化，都补一条记录：

1. 在 `feature-evolution.md` 追加一条变更。
2. 如果这次变化带有方向性取舍，在 `product-decisions.md` 新增一条决策。
3. 如果这次变化影响对外表达，在 `product-story.md` 同步更新卖点。

记录重点是可追溯，不追求长篇。写清楚“当时的问题、选择了什么、为什么、代价是什么”就够了。
