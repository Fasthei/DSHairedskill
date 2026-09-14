# packages/project

管理用户材料、项目事实与假设，以及本地项目和 Swarm 任务的关联。

## 开发入口

先读根目录 [CLAUDE.md](../../CLAUDE.md) 和 [实施方案](../../docs/planning/04-implementation-plan.md)，再按本目录 [TASKS.md](TASKS.md) 开发。当前仅为目录与任务骨架，没有业务实现。

## 边界

不自动发现未交代的新目标；不新建任务调度器或数据库服务。

## 完成规则

各任务状态以本目录 TASKS.md 为准。完成时补充改动文件、验证命令与结果；依赖满足后再进入下一任务。接口不确定时回到 P0 的接口映射核实。

