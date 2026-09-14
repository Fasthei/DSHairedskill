# resources/report-templates

提供基础 Markdown 报告布局，允许用户或模型替换。

## 开发入口

先读根目录 [CLAUDE.md](../../CLAUDE.md) 和 [实施方案](../../docs/planning/04-implementation-plan.md)，再按本目录 [TASKS.md](TASKS.md) 开发。当前仅为目录与任务骨架，没有业务实现。

## 边界

模板只负责呈现；验证规则由 evidence-report 实现。

## 完成规则

各任务状态以本目录 TASKS.md 为准。完成时补充改动文件、验证命令与结果；依赖满足后再进入下一任务。接口不确定时回到 P0 的接口映射核实。

