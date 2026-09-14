# DSH 本地插件与装配

按 [任务总览](../docs/implementation/ROADMAP.md) 的依赖顺序推进。每个子目录包含 README.md 和 TASKS.md，目前没有业务实现。

- [redteam-bundle](redteam-bundle/README.md)：组合本地 DSH profile、插件与默认资源，是产品装配入口。
- [project](project/README.md)：管理用户材料、项目事实与假设，以及本地项目和 Swarm 任务的关联。
- [swarm-bridge](swarm-bridge/README.md)：连接用户已经部署的 Swarm，交接任务并读取真实状态与产物。
- [evidence-report](evidence-report/README.md)：定义证据、发现和报告契约，并提供本地与后台结果的一致呈现。
- [execution](execution/README.md)：核实并补齐本地 DSH 执行环境的真实缺口。

