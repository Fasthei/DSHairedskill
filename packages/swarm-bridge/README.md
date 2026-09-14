# packages/swarm-bridge

连接用户已经部署的 Swarm，交接任务并读取真实状态与产物。

## 开发入口

先读根目录 [CLAUDE.md](../../CLAUDE.md) 和 [实施方案](../../docs/planning/04-implementation-plan.md)，再按本目录 [TASKS.md](TASKS.md) 开发。当前仅为目录与任务骨架，没有业务实现。

## 边界

Swarm 管理后台任务；不部署云端、不创建本地无人值守引擎、不要求 Worker 使用 DSH。

## 完成规则

各任务状态以本目录 TASKS.md 为准。完成时补充改动文件、验证命令与结果；依赖满足后再进入下一任务。接口不确定时回到 P0 的接口映射核实。

