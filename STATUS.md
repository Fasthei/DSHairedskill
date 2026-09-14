# 当前状态

本文件描述仓库的实际现状，不是开发计划。历史开发计划文档（`docs/planning/`、`docs/implementation/`、各目录 `TASKS.md`）已删除。

## 已验证可用

- 工作区：pnpm workspace（`packages/*`），Node `^22.19.0 || >=24.0.0`，TypeScript 5.9.3，vitest 3.2.4。
- `pnpm build`（`pnpm -r run build`）通过：`packages/evidence-report`、`packages/execution`、`packages/project`、`packages/mcp-toolbox` 四个包编译成功。
- `pnpm test`（vitest run）通过：4 个测试文件、33 项测试全部通过。

## 各包实际内容

- **`packages/mcp-toolbox`**：唯一有实质业务实现的包。一个 stdio MCP server，`src/tools/` 下含侦察（recon）、交互（interact）、消耗探测（consumption）、输出处理（output）、制品扫描（artifact_scan）、供应链（supply_chain）、A2A、MCP 探测（mcp_probe）、检测（detection）、载荷托管（payload_host）、防御扫描器（defensive_scanners）共 11 个工具模块。防御扫描器适配器（`defensive_tool_status`、`skill_security_scan`、`model_artifact_scan`、`osv_dependency_scan`、`trivy_filesystem_scan`）已注册，但宿主未安装对应外部 CLI，实际验证的是注册/状态探测/无效目标短路/构建不回归，不是四个扫描器的真实扫描结果。
- **`packages/evidence-report`**：最小模型骨架——发现（Finding）状态（已验证/待验证/未复现/阻塞）、证据引用（EvidenceRef，三层断言级别）、阻塞记录、Markdown 报告输出。仅 `src/index.ts` 一个文件，无持久化、无跨报告去重、不读取 Swarm 侧产物。
- **`packages/project`**：最小项目上下文模型——目标范围（scope）、材料引用（不存内容，仅定位符）、观察、假设（带置信度）、信任关系、与 Swarm 任务的关联记录。仅 `src/index.ts` 一个文件，内存态，无持久化层。
- **`packages/execution`**：占位骨架。真正的执行原语已在 `mcp-toolbox` 实现，本包只保留一个可被 Cordis 加载的最小 Service，未做实质扩展。
- **`packages/redteam-bundle`**、**`packages/swarm-bridge`**：只有 `README.md`，无 `src`，未实现。

## 未实现 / 无代码

- `swarm/profiles`、`swarm/worker-overlay`：只有 README，无实际 profile/overlay 文件。
- `tests/contracts`、`tests/integration`：只有 README，无契约测试或集成测试代码。
- `scripts/install`：只有 `install.sh` 占位和 README，未验证安装流程。
- 两个上游（DSH、agent-swarm）的插件/UI/身份扩展点、Swarm 任务提交/追加/取消/等待/记忆/产物接口：均未做真实联调验证，`.upstream/` 下仅有本地克隆参考（gitignored，未整库复制进产品）。

## 知识资产

- `skills/`：17 个红蓝队方法论 Skill（`SKILL_AUTHORING.md` 为编写规范，不计入内容 Skill），每个含 `SKILL.md`，内容来自课程蒸馏，不含课程原文、私人地址或密钥。

## 已知限制

- 无 lockfile 提交状态未在本文件重新核实，如需确认以 `git ls-files | grep lock` 为准。
- 本文件基于 2026-09-14 的 `pnpm build`/`pnpm test` 结果与目录扫描编写，之后的代码变更需自行重新核实再更新本文件。
