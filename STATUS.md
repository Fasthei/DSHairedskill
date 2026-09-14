# 当前状态

本文件描述仓库的实际现状，不是开发计划。

## 范围

仓库只保留两块内容：

- `skills/`：17 个红蓝队方法论 Skill，每个含 `SKILL.md`，内容来自课程蒸馏，不含课程原文、私人地址或密钥。
- `packages/mcp-toolbox`：唯一的代码包，一个 stdio MCP server，`src/tools/` 下含侦察（recon）、交互（interact）、消耗探测（consumption）、输出处理（output）、制品扫描（artifact_scan）、供应链（supply_chain）、A2A、MCP 探测（mcp_probe）、检测（detection）、载荷托管（payload_host）、防御扫描器（defensive_scanners）共 11 个工具模块、23 个工具。

## 已验证可用

- 工作区：pnpm workspace（`packages/*`），Node `^22.19.0 || >=24.0.0`，TypeScript 5.9.3，vitest 3.2.4。
- `pnpm build`（`pnpm -r run build`）通过。
- `pnpm test`（vitest run）通过。

## 已知限制

- 防御扫描器适配器（`defensive_tool_status`、`skill_security_scan`、`model_artifact_scan`、`osv_dependency_scan`、`trivy_filesystem_scan`）已注册，但宿主未安装对应外部 CLI（Cisco Skill Scanner、Protect AI ModelScan、Google OSV-Scanner、Aqua Trivy），实际验证的是注册/状态探测/无效目标短路/构建不回归，不是四个扫描器的真实扫描结果。
- 本文件基于目录扫描与 `pnpm build`/`pnpm test` 结果编写，之后的代码变更需自行重新核实再更新本文件。
