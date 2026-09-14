# swarm/profiles

提供可导入用户已有 Swarm 的 Lead/Worker 配置。

## 开发入口

先读根目录 [CLAUDE.md](../../CLAUDE.md) 和 [实施方案](../../docs/planning/04-implementation-plan.md)，再按本目录 [TASKS.md](TASKS.md) 开发。当前仅为目录与任务骨架，没有业务实现。

## 边界

遵循 Swarm 的原生模型、身份和部署方式；不把 DSH 主会话作为后台持续运行的必要条件。

## 完成规则

各任务状态以本目录 TASKS.md 为准。完成时补充改动文件、验证命令与结果；依赖满足后再进入下一任务。接口不确定时回到 P0 的接口映射核实。

