# DSHairedskill

AI 红队方法论 Skill + 配套 MCP 执行工具箱。面向用户自己授权的靶场，不面向生产攻击。

- `skills/`：17 个红蓝队方法论 Skill（每个是一份 `SKILL.md`）。
- `src/`：一个 stdio MCP server（[`@fasthei/dshaired-mcp-toolbox`](https://github.com/Fasthei/DSHairedskill/pkgs/npm/dshaired-mcp-toolbox)），暴露 23 个执行工具。

两者各自独立、按需接入：Skill 装进支持 Skill 的 CLI，工具箱注册成 MCP server。项目设计意图见 [关于本项目](#关于本项目)。

## 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`
- pnpm `10.28.2`（仅源码构建需要；只装 npm 包不需要）

## 1. 获取 MCP 工具箱

两种方式二选一。**Skill 不在 npm 包里**，无论选哪种方式，装 Skill 都要看第 2 步。

### 方式一：装 npm 包（免 clone）

工具箱发布在 GitHub Packages，**装公开包也需要认证**（GitHub Packages 的限制，不是本项目设的，没发到 npmjs.com）：先在 GitHub 生成一个 classic PAT，勾选 `read:packages`，把下面的 `<PAT>` 换成它，一条命令配好认证并装上：

```bash
{ echo "@fasthei:registry=https://npm.pkg.github.com"; echo "//npm.pkg.github.com/:_authToken=<PAT>"; } >> ~/.npmrc && npm install -g @fasthei/dshaired-mcp-toolbox
```

装完后全局有一个 `dshaired-mcp-toolbox` 命令，`which dshaired-mcp-toolbox` 能拿到它的绝对路径，第 3 步注册 MCP 时用得到。

### 方式二：clone 源码构建

```bash
git clone https://github.com/Fasthei/DSHairedskill.git
cd DSHairedskill
pnpm install --frozen-lockfile
pnpm build   # 编译 src/ → lib/，产出 lib/server.js
pnpm test    # 可选：跑一遍 vitest
```

构建产物是 `lib/server.js`，第 3 步注册 MCP 时用得到它的绝对路径。

## 2. 安装 Skill

Skill 是纯 Markdown，没有构建步骤，按目标 CLI 把 `skills/<name>/` 整个目录复制过去即可：

```bash
# Claude Code（个人级）
cp -R skills/*/ ~/.claude/skills/     # 注意：会把 SKILL_AUTHORING.md 一起复制，可先排除

# 更精确的做法：逐个复制，跳过 SKILL_AUTHORING.md
for d in skills/*/; do
  name="$(basename "$d")"
  rm -rf ~/.claude/skills/"$name"
  cp -R "$d" ~/.claude/skills/"$name"
done
```

其他客户端把目标目录换掉即可：

| 客户端 | 个人级 Skill 目录 |
| --- | --- |
| DSH | `${DSH_HOME:-$HOME/.dsh}/skills` |
| Claude Code | `${CLAUDE_HOME:-$HOME/.claude}/skills` |
| Codex CLI | `${CODEX_HOME:-$HOME/.codex}/skills` |

要装到项目级（而不是个人级），把目标换成 `<项目路径>/.claude/skills`、`<项目路径>/.codex/skills` 等。

已安装的 17 个 Skill：`ai-redteam-methodology`、`ai-security-landscape`、`recon-ai-targets`、`attack-single-agent`、`attack-a2a-multi-agent`、`attack-rag-pipelines`、`embedding-inversion`、`attack-mcp`、`code-exec-and-tampering`、`cloud-and-container`、`target-reconstruction-engagement`、`capstone-full-chain`、`attack-output-handling`、`resource-exhaustion-dos`、`supply-chain-reputation`、`model-privacy-blackbox`、`multimodal-computer-use`。

## 3. 注册 MCP 工具箱

先确认 `lib/server.js` 已经构建出来（见第 1 步），把 `<仓库绝对路径>` 换成实际路径：

**Claude Code**：

```bash
claude mcp add dshaired -- node '<仓库绝对路径>/lib/server.js'
```

**Codex CLI**：

```bash
codex mcp add dshaired -- node '<仓库绝对路径>/lib/server.js'
```

**DSH**（在 cordis profile 里加一段 patch）：

```yaml
- id: mcp-dshaired
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: dshaired
    transport: stdio
    command: node
    args: ['<仓库绝对路径>/lib/server.js']
```

注册后新开一个会话，工具就会以 `mcp__dshaired__<tool>` 出现在模型的工具列表里；已安装的 Skill 会按 `description` 自动加载，或用 `/<skill名>` 手动调用。

## 4. 验证装成功

- Skill：新开会话后执行 `/ai-redteam-methodology`（或任意一个 Skill 名），能看到它的内容即成功。
- MCP：新开会话后让模型列出可用工具，能看到 `mcp__dshaired__` 前缀的一批工具（如 `recon_*`、`interact_*`、`consumption_probe`）即成功。

## 可选：防御扫描器外部依赖

`defensive_scanners.ts` 里的 5 个防御扫描工具（`defensive_tool_status`、`skill_security_scan`、`model_artifact_scan`、`osv_dependency_scan`、`trivy_filesystem_scan`）需要宿主机上装好对应外部 CLI，工具箱本身**不会自动下载或安装**它们：

| 工具 | 对应外部 CLI（需自行安装并在 `PATH` 中） |
| --- | --- |
| `skill_security_scan` | Cisco Skill Scanner（`skill-scanner`） |
| `model_artifact_scan` | Protect AI ModelScan（`modelscan`） |
| `osv_dependency_scan` | Google OSV-Scanner（`osv-scanner`） |
| `trivy_filesystem_scan` | Aqua Trivy（`trivy`） |

未安装对应 CLI 时，调用会返回结构化的 `unavailable`，不影响工具箱其他功能。

## 关于本项目

DSHairedskill 关注的不是"再收集一批 Payload"，而是理解 AI 系统里的信任如何流动：不可信输入如何被模型当成指令、模型输出如何变成下游真实动作、局部控制如何继承更大范围的系统信任，以及如何用目标侧证据证明攻击确有其效。

按攻击面划分，17 个 Skill 覆盖：

- **Agent 指令与记忆劫持**——`attack-single-agent`、`attack-output-handling`
- **RAG 检索与知识库攻击**——`attack-rag-pipelines`、`embedding-inversion`
- **MCP 与工具链攻击**——`attack-mcp`、`code-exec-and-tampering`
- **A2A 与多 Agent 编排攻击**——`attack-a2a-multi-agent`、`target-reconstruction-engagement`
- **输出处理与多模态攻击**——`attack-output-handling`、`multimodal-computer-use`
- **供应链与基础设施攻击**——`supply-chain-reputation`、`code-exec-and-tampering`、`cloud-and-container`、`capstone-full-chain`
- **黑盒模型与资源消耗攻击**——`model-privacy-blackbox`、`resource-exhaustion-dos`
- **总纲/路由**——`ai-redteam-methodology`、`ai-security-landscape`

每条攻击链要求区分三个证据层级：工具调用成功、目标产生可观察效果、发现被复现验证——只有第三层才能写进最终结论。Skill 的编写约定见 [`skills/SKILL_AUTHORING.md`](skills/SKILL_AUTHORING.md)，工具实现见 [`src/`](src)。

许可证见 [LICENSE](LICENSE)。
