# packages/evidence-report

定义证据、发现和报告契约，并提供本地与后台结果的一致呈现。

## 开发入口

先读根目录 [CLAUDE.md](../../CLAUDE.md) 和 [实施方案](../../docs/planning/04-implementation-plan.md)，再按本目录 [TASKS.md](TASKS.md) 开发。当前仅为目录与任务骨架，没有业务实现。

## 边界

区分任务完成、工具成功和发现验证；不由模型补造缺失证据。

## 完成规则

各任务状态以本目录 TASKS.md 为准。完成时补充改动文件、验证命令与结果；依赖满足后再进入下一任务。接口不确定时回到 P0 的接口映射核实。

