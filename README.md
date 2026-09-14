# DSHAIred

**AI 系统进攻推演、攻击链编排与证据验证工具箱。**

DSHAIred 关注的不是“再收集一批 Payload”，而是理解 AI 系统里的信任如何流动：

- 不可信输入如何进入模型上下文，并被误认为高优先级指令；
- 模型生成的文本如何进入工具、数据库、文件系统或其他解释器，变成真实动作；
- 一个 Agent、一个知识库或一个工具节点的失陷，如何继承更大范围的系统信任；
- 如何用目标侧状态、日志和原始请求响应证明攻击真正产生了影响。

项目使用本机 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 负责交互与决策，通过 stdio MCP Server 提供执行原语，并可把长任务交给 [agent-swarm](https://github.com/desplega-ai/agent-swarm) 继续处理。

## 核心进攻逻辑

AI 系统的攻击链通常围绕三次“信任转换”展开：

```text
不可信数据 ──→ 被模型当成指令
模型输出   ──→ 被下游当成动作
局部控制   ──→ 被系统当成可信身份或可信节点
```

DSHAIred 用五个阶段组织一次进攻：

### 1. 重建攻击面

先识别模型、系统提示、记忆、RAG、工具、MCP Server、Agent 编排器、下游解释器和基础设施之间的关系。重点不是“开放了几个端口”，而是找出数据从哪里进入、决策在哪里发生、动作由谁执行、结果又写回哪里。

### 2. 获取控制原语

寻找最小但可重复的控制能力，例如：

- 让模型遵循攻击者提供的指令；
- 让指定内容进入未来会被检索的知识库或记忆；
- 影响工具选择、参数生成或 Agent 路由；
- 让模型输出可被下游解析器解释的内容；
- 让系统加载攻击者可控的模型、数据、包或插件制品。

### 3. 跨越信任边界

把“模型说了什么”推进到“系统做了什么”。观察控制原语能否触发文件读写、网络访问、数据库查询、MCP 调用、A2A 消息、代码执行或身份继承。这一步决定问题只是提示层现象，还是已经进入真实业务和基础设施。

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

直接或间接控制 Agent 的指令解释过程，测试系统提示提取、目标劫持、工具诱导、跨会话记忆污染和共享数据源投毒。核心逻辑是让“外部数据”获得与“系统指令”相近的影响力，再把一次推理控制变成持续影响。

```text
可控输入 → 指令优先级混淆 → 模型决策改变 → 工具/记忆写入 → 后续会话继续受影响
```

对应 Skill：`attack-single-agent`、`attack-output-handling`、`ai-redteam-methodology`

### RAG 检索与知识库攻击

同时覆盖读取和写入两条路线：一条从检索结果、引用和回答差异中恢复知识；另一条把攻击内容写进文档、向量或索引，使其在特定查询下被优先召回。关键不是文件是否上传成功，而是污染内容是否真正进入检索上下文并改变最终决策。

```text
检索面识别 → 知识/向量探测 → 文档或嵌入投毒 → 召回命中 → 间接指令执行
```

对应 Skill：`attack-rag-pipelines`、`embedding-inversion`

### MCP 与工具链攻击

枚举模型可见工具，分析描述、参数、路径、权限和返回值如何影响后续决策。进攻重点包括工具描述操纵、参数约束绕过、越界资源访问和多工具组合。最终要证明的是：模型是否借助工具越过了原本只存在于文本层的边界。

```text
工具枚举 → 描述/参数控制 → 单工具能力确认 → 多工具串联 → 文件/网络/数据库影响
```

对应 Skill：`attack-mcp`、`code-exec-and-tampering`

### A2A 与多 Agent 编排攻击

识别 Agent Card、OpenAPI、注册表、编排器和 Worker 之间的信任关系，再测试消息伪造、流氓 Agent、工作流跳步、结果污染和跨节点传播。多 Agent 攻击的价值不在控制一个节点，而在利用编排器对节点身份和结果的信任扩大影响。

```text
拓扑发现 → 节点身份/能力伪装 → 编排决策操纵 → Worker 结果污染 → 跨 Agent 扩散
```

对应 Skill：`attack-a2a-multi-agent`、`target-reconstruction-engagement`

### 输出处理与多模态攻击

模型输出可能继续进入 HTML、Markdown、CSV、终端、日志、模板、Shell 或 SQL；computer-use Agent 还会把像素、二维码、字幕和伪造界面解释成操作指令。这类攻击利用的是“模型输出被默认可信”和“人类看到的内容与 Agent 解析的内容不一致”。

```text
攻击内容进入输出/画面 → 模型正常复述或识别 → 下游解释器/操作循环接收 → 产生副作用
```

对应 Skill：`attack-output-handling`、`multimodal-computer-use`

### 模型、供应链与基础设施攻击

从系统已经信任的包、模型权重、序列化制品、适配器、数据集或插件进入，连接到不安全反序列化、模型行为篡改、云凭据、对象存储、容器和身份域。核心逻辑是绕过前台输入防护，直接利用“加载即信任”的上游关系。

```text
可信制品入口 → 包/模型/数据被替换或仿冒 → 加载/训练/部署触发 → 主机或模型行为受控
```

对应 Skill：`supply-chain-reputation`、`code-exec-and-tampering`、`cloud-and-container`、`capstone-full-chain`

### 黑盒模型与资源消耗攻击

在只能查询模型的情况下，通过输出概率、排序、时间和行为差异测试模型提取、成员推断、训练数据恢复和侧信道；同时观察上下文放大、递归工具调用、Agent 循环和高成本模型路由是否造成不成比例的资源消耗。

对应 Skill：`model-privacy-blackbox`、`resource-exhaustion-dos`

## Skill 与工具如何配合

项目包含 17 个 Skill 和 23 个 MCP 工具：

- **Skill 是打法**：描述适用信号、攻击前提、递进探针、失败分支、规避思路和验证标准；
- **MCP 是动作**：执行 HTTP 指纹、端点枚举、Agent/A2A 交互、MCP 探测、检测查询、制品检查和证据回收；
- **DSH 是决策入口**：根据目标反馈选择下一步，而不是机械执行固定流水线；
- **agent-swarm 承接长任务**：继续进行后台验证、材料整理和多 Agent 协作。

工具箱还提供 Cisco Skill Scanner、Protect AI ModelScan、Google OSV-Scanner 和 Aqua Trivy 的固定命令适配，用于从 Skill、模型制品、依赖和文件系统角度补充防御验证。适配器不会自动下载外部程序，实现见 [`packages/mcp-toolbox/src/tools/defensive_scanners.ts`](packages/mcp-toolbox/src/tools/defensive_scanners.ts)。

Skill 清单与编写约定见 [`skills/`](skills) 和 [`skills/SKILL_AUTHORING.md`](skills/SKILL_AUTHORING.md)，工具实现位于 [`packages/mcp-toolbox/`](packages/mcp-toolbox)。

## 项目结构

```text
skills/                 17 个红蓝队方法论 Skill（每个含 SKILL.md）
packages/
  mcp-toolbox/          stdio MCP server，23 个执行工具的唯一实现
  evidence-report/      发现、证据引用、报告输出的最小模型
  project/              目标范围、材料引用、假设、信任关系的最小项目上下文模型
  execution/            DSH 本地执行环境能力清点（占位骨架，见包内 README）
resources/
  method-notes/         开发者编写的方法资料与来源索引
  report-templates/     基础 Markdown 报告布局
scripts/install/        本机一键安装脚本（铺 Skill + 构建工具箱 + 打印 MCP 注册命令）
```

各包/目录的实际完成度、已验证内容与未实现部分以根目录 [`STATUS.md`](STATUS.md) 为准，本文件只描述设计意图。

## 构建

环境要求：Node.js `^22.19.0` 或 `>=24.0.0`，pnpm `10.28.2`。

```bash
pnpm install --frozen-lockfile
pnpm -r build
pnpm test
```

## 接入 DSH

```yaml
- id: mcp-dshaired
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: dshaired
    transport: stdio
    command: node
    args: ['<仓库绝对路径>/packages/mcp-toolbox/lib/server.js']
```

源码试装脚本：[`scripts/install/install.sh`](scripts/install/install.sh)。许可证见 [LICENSE](LICENSE)。
