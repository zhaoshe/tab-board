# TabBoard Docs

这个目录记录 TabBoard 的功能面、架构、产品决策和对外叙事，方便回溯与复盘。

## 核心文档

面向使用者和贡献者，先看这些：

- [Project Overview](project-overview.md): 项目定位、目标、边界、当前状态和成功标准。
- [Feature Spec](feature-spec.md): 当前功能面、入口、交互规则和 legacy 能力。
- [Technical Architecture](technical-architecture.md): extension 架构、数据模型、关键流程和验证方式。
- [Feature Evolution](feature-evolution.md): 功能从哪里来、什么时候变化、当前状态是什么。
- [Product Decisions](product-decisions.md): 关键决策的背景、取舍、结果和后续观察点。
- [Product Story](product-story.md): 面向用户或评审时怎么介绍 TabBoard。

## 内部过程记录

以下是开发过程中的工作笔记，非必读，仅用于追溯当时的分析与实现路径：

- [tabExtend Analysis](tabextend-analysis.md): 竞品拆解与借鉴清单。
- `reviews/`: 各阶段的 UI/UX、性能和验收评审。
- `superpowers/`: 分阶段实现计划与设计规格。
- `architecture-analysis-*.md`、`architecture-optimization-completion-audit-*.md`、`performance-optimization-review.md`: 架构与性能专项记录。
- `agent-sort-report.md`、`skills-inventory.md`: 早期整理与工具清单。

## 维护规则

每次做完一个明显的产品方向变化，都补一条记录：

1. 在 `feature-evolution.md` 追加一条变更。
2. 如果这次变化带有方向性取舍，在 `product-decisions.md` 新增一条决策。
3. 如果这次变化影响对外表达，在 `product-story.md` 同步更新卖点。

记录重点是可追溯，不追求长篇。写清楚“当时的问题、选择了什么、为什么、代价是什么”就够了。
