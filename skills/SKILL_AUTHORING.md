# DSHairedskill Skill 编写规范（给所有 skill 作者 Agent）

本项目把美国战争部人工智能战略暗夜猫小组的资料按领域整理成 **DSH 原生 Skill**：约 12 个 skill 覆盖全部 66 个技术点，每个 Skill 内部安排它名下的技术点。模型按需用 `skill` 工具加载、或用户 `/名字` 调用；同一套 Skill 一键部署到 DSH（交互）与 agent-swarm（后台）。

## 文件与格式（DSH 源码确认，务必照做）

- 位置：`skills/<name>/SKILL.md`（目录形式）。`<name>` 为 kebab-case（`^[a-z0-9]+(?:-[a-z0-9]+)*$`）。
- 必须有 YAML frontmatter，**必填 `name`（=目录名）与 `description`**；可选 `whenToUse`。
- 调用控制（可选）：`disable-model-invocation: true` 使其不对模型可见（默认可见）；`user-invocable: false` 关闭 `/名字`（默认可用）。**不要用旧键 `modelInvocable`/`userInvocable`，会被拒。**

```markdown
---
name: recon-ai-targets
description: 一句话路由——这个 skill 覆盖什么、面对什么目标时加载它。
whenToUse: 可选的额外路由提示（更细的触发场景）。
---
（正文：见下方结构）
```

## 正文结构（建议统一）

1. `## 概述与何时用` —— 覆盖的领域、面对哪种目标/信号时用。
2. `## 在 SOP 中的位置` —— 对应 枚举→攻击→检测→规避 的哪一步；可与别的 skill 如何衔接。
3. `## 方法与技法（按技术点）` —— 逐个技术点给**可操作**的技法：做什么、具体请求/命令/payload 形态（泛化，不写死具体环境的 IP/凭据）、观察什么。每条注明来源技术点编号（如 `3.4`）。
4. `## 验证标准` —— 怎样才算真成立：区分「工具调用成功 / 目标端确有效果 / 发现已验证」；说明需要什么证据。
5. `## 常见失败与规避` —— 典型失败原因 + 规避要点。
6. `## 证据与报告` —— 该动作要抓哪些原始证据供报告引用。

## 硬规则

- 内容蒸馏整理，不整段复制原文；泛化成方法（通用红队，可打任意授权目标），不写死具体环境的 IP/主机/凭据/示例密钥。
- 面向用户自己授权的目标环境。技法是「方法」不是「保证」：命中/工具成功 ≠ 漏洞已验证，正文必须体现这条纪律。
- 只写你负责的那个 `skills/<name>/SKILL.md`，不碰别人的目录、不改根配置、不 git commit、不碰 .env/secret。
- Skill 是纯 markdown，无需构建/依赖/pnpm。

## 12 个 skill 映射（每人认领一个）

| # | skill 名（目录） | 覆盖技术点 |
|---|---|---|
| 1 | `ai-security-landscape` | 1.1 概览, 1.2 AI 安全格局, 1.3 |
| 2 | `recon-ai-targets` | 2.1 攻击面, 2.2 被动侦察, 2.3 主动侦察, 2.4 检测与规避, 2.5, Model-Specific Behavior Testing |
| 3 | `attack-single-agent` | 3.1 架构, 3.2 直接注入, 3.3 间接注入, 3.4 记忆攻击, 3.5, 3.6 |
| 4 | `attack-a2a-multi-agent` | 4.1–4.8 + Blind Command Execution Verification, Malicious Link Evasion, SQL Injection Evasion |
| 5 | `attack-rag-pipelines` | 5.1 架构, 5.2 攻击面, 5.3 绕过防御, 5.4 |
| 6 | `embedding-inversion` | 6.1 理论, 6.2 侦察, 6.3 zero-shot 反演, 6.4 预训练反演, 6.5 |
| 7 | `attack-mcp` | 7.1 架构与攻击面, 7.2 工具操纵, 7.3 权限滥用/约束绕过, 7.4 |
| 8 | `code-exec-and-tampering` | 8.1 代码执行, 8.2 模型/数据篡改, 8.3 规避, 8.4 |
| 9 | `cloud-and-container` | 9.1 云配置错误, 9.2 容器/编排利用, 9.3 |
| 10 | `target-reconstruction-engagement` | 10.1 残缺情报重建目标, 10.2 信任区/提权/交战规划, 10.3 |
| 11 | `capstone-full-chain` | 11.1 场景与拓扑, 11.2 公网站点, 11.3 网关横向, 11.4 内网枚举, 11.5 域接管, 11.6 |
| 12 | `ai-redteam-methodology` | 跨领域：枚举→攻击→检测→规避 总 SOP + 如何路由到上面 11 个 skill（这是"脑子/索引"） |

## 扩展 Skill（交叉 OWASP GenAI Top10 / MITRE ATLAS / NIST AI 100-2）

主体资料未独立覆盖但高价值的技法族。这些 skill 正文须**明确标注"超出主体资料范围"**，依据用公开框架分类，仍遵守"工具成功≠漏洞验证"与授权边界。

| skill 名（目录） | 主题 | 框架依据 | 承载工具 | 验证 |
| --- | --- | --- | --- | --- |
| `attack-output-handling` | 模型输出被下游不当处理（XSS/CSV/终端转义/markdown/模板/下游 shell-SQL） | OWASP LLM05 | `output_handling_probe`、`serve_payload` | P0–P3 可无害验证 |
| `resource-exhaustion-dos` | 无界消耗/经济型 DoS（上下文放大/递归调用/Agent 循环/Cost Harvesting） | OWASP LLM10 | `consumption_probe`（硬限速） | 观测可 P0–P3；真实 DoS 需 P4 |
| `supply-chain-reputation` | 供应链信誉操纵（幻觉包名抢注/仿冒/Rug Pull） | OWASP LLM03 | `package_reputation_check`（只读） | P0–P3 可验证 |
| `model-privacy-blackbox` | 黑盒模型提取/成员推断/侧信道 | NIST AI 100-2 | `blackbox_query_harness`（待实现） | 多数需 P4+算力 |
| `multimodal-computer-use` | 多模态/computer-use 注入（图片/二维码/字幕/DOM 欺骗） | ATLAS/OWASP | `multimodal_payload_gen`（待实现） | 投放需 P4 |

对应新增 MCP 工具在 `src/tools/`：`output.ts`(output_handling_probe)、`consumption.ts`(consumption_probe)、`supply_chain.ts`(package_reputation_check)、`payload_host.ts`(serve_payload/stop_payload_server)、`artifact_scan.ts`(pickle_scan)、`mcp_probe.ts`(新增 mcp_permission_probe)。`blackbox_query_harness`/`multimodal_payload_gen` 为 P4 待实现。
