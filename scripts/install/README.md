# scripts/install

一键把 DSHAIred 的 Skill 与 MCP 工具箱装进本机 DSH。见根目录 [STATUS.md](../../STATUS.md) 了解仓库当前实际状态。

## 前置条件

- 本机已装好 DSH（DeepSeek Harness），且知道其 `DSH_HOME`（默认 `~/.dsh`）。
- 已装 `pnpm`（Node `^22.19.0 || >=24.0.0`）。
- 在仓库根目录执行，网络可访问以拉取依赖。

## 一键安装

支持三个目标：`dsh`（默认）、`claude`（Claude Code）、`codex`（Codex CLI）。三者的 Skill 目录格式相同（`<skills_root>/<name>/SKILL.md`），区别只在默认路径和 MCP 注册方式。

```bash
scripts/install/install.sh                       # DSH，默认 ${DSH_HOME:-$HOME/.dsh}/skills
scripts/install/install.sh --target claude        # Claude Code，默认 ${CLAUDE_HOME:-$HOME/.claude}/skills
scripts/install/install.sh --target codex         # Codex CLI，默认 ${CODEX_HOME:-$HOME/.codex}/skills
```

要装到项目级目录（而非个人级），在 `--target` 后加第二个参数：

```bash
scripts/install/install.sh --target claude /path/to/project/.claude/skills
scripts/install/install.sh --target codex  /path/to/project/.codex/skills
scripts/install/install.sh --target dsh    /path/to/project/.dsh/skills   # 或自定义 customSkillDirs
```

脚本做的事（不做其他事，不改上游 CLI 核心，不写 secret，不部署云）：

1. `pnpm install` + `pnpm --filter @dshaired/mcp-toolbox build`，产出 `packages/mcp-toolbox/lib/server.js`。
2. 把 `skills/<name>/SKILL.md` 目录逐个复制到目标 Skill 根（已存在同名目录会被覆盖）。
3. 打印对应 CLI 的 MCP 注册方式：
   - `dsh`：一段 cordis patch，手动加进 DSH profile。
   - `claude`：`claude mcp add dshaired -- node '<server.js 路径>'`。
   - `codex`：`codex mcp add dshaired -- node '<server.js 路径>'`。

## 装完之后

- **DSH**：把打印的 `mcp-dshaired` patch 加进 DSH profile，重启/重新发现后 `/<skill名>` 可调用。
- **Claude Code / Codex CLI**：执行脚本打印的 `claude mcp add` / `codex mcp add` 命令一次即可，新开会话生效；Skill 已就位，`/<skill名>` 可直接调用，模型也会按 `description` 自动加载。
- 三者都以 `mcp__dshaired__<tool>` 形式暴露工具箱中的能力。

`agent-swarm` 侧同理：把同一份 `skills/` 目录和相应的 MCP 注册方式提供给 Worker 环境，本脚本不代管远端部署。

## 已安装的 17 个 Skill

| Skill | 用途 |
| --- | --- |
| `ai-redteam-methodology` | 总纲 SOP，路由到其余 11 个专项 skill |
| `ai-security-landscape` | 入口定位：课程结构、三套业界框架（ATLAS/OWASP/NVIDIA） |
| `recon-ai-targets` | AI 目标侦察：攻击面枚举、被动/主动指纹、规避 |
| `attack-single-agent` | 单体 Agent 攻击：直接/间接提示注入、记忆攻击 |
| `attack-a2a-multi-agent` | 多 Agent / A2A：Agent Card 枚举、编排器操纵、SQL 注入 |
| `attack-rag-pipelines` | RAG 管道攻击：知识库泄露、投毒、检索劫持 |
| `embedding-inversion` | 向量嵌入反演：零样本/预训练反演恢复敏感文本 |
| `attack-mcp` | MCP 攻击面：工具投毒、权限越权、沙箱逃逸 |
| `code-exec-and-tampering` | 供应链代码执行与模型/数据篡改 |
| `cloud-and-container` | 云基础设施与容器编排攻击 |
| `target-reconstruction-engagement` | 残缺情报重建目标、划定信任区与提权路径 |
| `capstone-full-chain` | 端到端红队链路：外网到域控 |
| `attack-output-handling` | 输出未净化导致的下游 XSS/注入（课程外，OWASP LLM05） |
| `resource-exhaustion-dos` | 无界消耗/经济型 DoS（课程外，OWASP LLM10） |
| `supply-chain-reputation` | 包/模型/MCP 信誉操纵（课程外） |
| `model-privacy-blackbox` | 黑盒模型隐私与提取攻击（课程外） |
| `multimodal-computer-use` | 多模态/computer-use 注入（课程外） |

## 验证

已验证：`pnpm build`、`pnpm test`（4 文件 33 测试）通过；Skill 目录结构与 frontmatter 符合 DSH 要求（见各 `SKILL.md`）。未验证：真实 DSH 实例上的端到端安装（Skill 发现、`/名字` 调用、MCP 工具在模型工具列表中出现）——需要在实际 DSH 环境跑一遍 `install.sh` 后确认。
