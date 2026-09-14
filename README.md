# DSHAIred

**AI 系统进攻推演、攻击链编排与证据验证工具箱。**

DSHAIred 关注的不是"再收集一批 Payload"，而是理解 AI 系统里的信任如何流动：

- 不可信输入如何进入模型上下文，并被误认为高优先级指令；
- 模型生成的文本如何进入工具、数据库、文件系统或其他解释器，变成真实动作；
- 一个 Agent、一个知识库或一个工具节点的失陷，如何继承更大范围的系统信任；
- 如何用目标侧状态、日志和原始请求响应证明攻击真正产生了影响。

项目提供两块东西：`skills/` 下的攻击方法论，和 `src/` 下配套的 MCP 执行工具。两者配合本机任意支持 MCP 与 Skill 的客户端（DSH、Claude Code、Codex CLI 等）使用，面向用户自己授权的靶场。

## 核心进攻逻辑

AI 系统的攻击链通常围绕三次"信任转换"展开：

```text
不可信数据 ──→ 被模型当成指令
模型输出   ──→ 被下游当成动作
局部控制   ──→ 被系统当成可信身份或可信节点
```

DSHAIred 用五个阶段组织一次进攻：

### 1. 重建攻击面

先识别模型、系统提示、记忆、RAG、工具、MCP Server、Agent 编排器、下游解释器和基础设施之间的关系。重点不是"开放了几个端口"，而是找出数据从哪里进入、决策在哪里发生、动作由谁执行、结果又写回哪里。

### 2. 获取控制原语

寻找最小但可重复的控制能力，例如：

- 让模型遵循攻击者提供的指令；
- 让指定内容进入未来会被检索的知识库或记忆；
- 影响工具选择、参数生成或 Agent 路由；
- 让模型输出可被下游解析器解释的内容；
- 让系统加载攻击者可控的模型、数据、包或插件制品。

### 3. 跨越信任边界

把"模型说了什么"推进到"系统做了什么"。观察控制原语能否触发文件读写、网络访问、数据库查询、MCP 调用、A2A 消息、代码执行或身份继承。这一步决定问题只是提示层现象，还是已经进入真实业务和基础设施。

### 4. 扩大与组合影响

继续判断单点能力能否形成持久化、横向传播或攻击链组合：一次提示注入能否写入长期记忆；一个被污染的 RAG 文档能否影响多个用户；一个受控 Worker 能否欺骗编排器；一个模型制品能否在加载阶段取得执行能力。

### 5. 用证据闭环

每条攻击链都区分三个层级：

1. **工具执行成功**：请求发出、命令返回或接口可达；
2. **目标产生效果**：状态、数据、调用路径或行为发生了可观察变化；
3. **发现得到验证**：效果可重复，并能与原始请求、响应、日志或制品对应。

只有第三层才能进入最终结论。

## 主要进攻方式

### Agent 指令与记忆劫持

直接或间接控制 Agent 的指令解释过程，测试系统提示提取、目标劫持、工具诱导、跨会话记忆污染和共享数据源投毒。

对应 Skill：`attack-single-agent`、`attack-output-handling`、`ai-redteam-methodology`

### RAG 检索与知识库攻击

同时覆盖读取和写入两条路线：一条从检索结果、引用和回答差异中恢复知识；另一条把攻击内容写进文档、向量或索引，使其在特定查询下被优先召回。

对应 Skill：`attack-rag-pipelines`、`embedding-inversion`

### MCP 与工具链攻击

枚举模型可见工具，分析描述、参数、路径、权限和返回值如何影响后续决策，测试工具描述操纵、参数约束绕过、越界资源访问和多工具组合。

对应 Skill：`attack-mcp`、`code-exec-and-tampering`

### A2A 与多 Agent 编排攻击

识别 Agent Card、OpenAPI、注册表、编排器和 Worker 之间的信任关系，测试消息伪造、流氓 Agent、工作流跳步、结果污染和跨节点传播。

对应 Skill：`attack-a2a-multi-agent`、`target-reconstruction-engagement`

### 输出处理与多模态攻击

模型输出可能进入 HTML、Markdown、CSV、终端、日志、模板、Shell 或 SQL；computer-use Agent 还会把像素、二维码、字幕和伪造界面解释成操作指令。

对应 Skill：`attack-output-handling`、`multimodal-computer-use`

### 模型、供应链与基础设施攻击

从系统已经信任的包、模型权重、序列化制品、适配器、数据集或插件进入，连接到不安全反序列化、模型行为篡改、云凭据、对象存储、容器和身份域。

对应 Skill：`supply-chain-reputation`、`code-exec-and-tampering`、`cloud-and-container`、`capstone-full-chain`

### 黑盒模型与资源消耗攻击

在只能查询模型的情况下，通过输出概率、排序、时间和行为差异测试模型提取、成员推断、训练数据恢复和侧信道；同时观察上下文放大、递归工具调用、Agent 循环是否造成不成比例的资源消耗。

对应 Skill：`model-privacy-blackbox`、`resource-exhaustion-dos`

## Skill 与工具如何配合

- **Skill 是打法**：`skills/` 下 17 个 Skill，描述适用信号、攻击前提、递进探针、失败分支、规避思路和验证标准。清单与编写约定见 [`skills/SKILL_AUTHORING.md`](skills/SKILL_AUTHORING.md)。
- **MCP 是动作**：`src/` 是一个 stdio MCP server，提供 23 个工具（侦察、Agent/A2A 交互、MCP 探测、检测查询、制品与依赖扫描、证据回收等）。

工具箱还提供 Cisco Skill Scanner、Protect AI ModelScan、Google OSV-Scanner 和 Aqua Trivy 的固定命令适配，用于从 Skill、模型制品、依赖和文件系统角度补充防御验证。适配器不会自动下载外部程序，实现见 [`src/tools/defensive_scanners.ts`](src/tools/defensive_scanners.ts)。

实际完成度、已验证内容见 [`STATUS.md`](STATUS.md)，本节只描述设计意图。

## 构建

环境要求：Node.js `^22.19.0` 或 `>=24.0.0`，pnpm `10.28.2`。

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## 接入 MCP 客户端

先构建出 `lib/server.js`（见上方"构建"），再按客户端注册：

**DSH**（cordis patch）：

```yaml
- id: mcp-dshaired
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: dshaired
    transport: stdio
    command: node
    args: ['<仓库绝对路径>/lib/server.js']
```

**Claude Code**：

```bash
claude mcp add dshaired -- node '<仓库绝对路径>/lib/server.js'
```

**Codex CLI**：

```bash
codex mcp add dshaired -- node '<仓库绝对路径>/lib/server.js'
```

Skill 的接入方式各客户端不同：把 `skills/<name>/` 目录复制到对应客户端的 Skill 根目录（如 Claude Code 的 `~/.claude/skills/`），或按客户端的 Skill 加载机制配置。

许可证见 [LICENSE](LICENSE)。
