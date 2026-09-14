# packages/execution

核实并补齐本地 DSH 执行环境的真实缺口。

实际完成度见根目录 [STATUS.md](../../STATUS.md)。

## 边界

先复用终端、文件、HTTP、浏览器等上游能力；没有缺口则只交付验证记录，不强造服务。

## EXEC-01 · 能力清点（2026-09-12）

来源：读取 `.upstream/deepseek-harness`（固定 tag `dsh-v0.1.5-rc.2`）`packages/*/src` 源码与各包 `package.json`，未运行未发布代码。

### DSH 已提供、可复用的能力

| 能力 | 上游包 | 接口/seam | 关键语义 |
| --- | --- | --- | --- |
| 前台/后台 shell 执行 | `packages/shell/shell`（`dsh-shell`，`ctx.shell`）+ `bash-local`/`pwsh-local`/`bash-sandbox`/`pwsh-sandbox` 实现 | `resolve()/run()/start()`，返回 `ShellRunResult`/`ShellProcess` | 非零退出、超时、abort 均 resolve 不 reject；后台进程可增量 `readOutput()`、`kill()`；可选沙箱模式与 spill 落盘 |
| 受管子进程 | `packages/subprocess/subprocess`（`dsh-subprocess`，`ctx.subprocess`）+ `subprocess-local`/`win32-process` | `SubprocessSpawnSpec`/`SubprocessHandle` | 每流显式 stdio 模式、有界收集+溢出文件、`terminate()`/`waitForExit()` |
| 持久 PTY 终端 | `packages/terminal/terminal`（`dsh-terminal`）+ `terminal-bash`、`tool-terminal`（6 个模型侧工具） | `TerminalBackendSession`：`startSend/read/signal/status/close` | owner 隔离会话、前台进程组信号、scrollback 分页 |
| 匿名 HTTP(S) fetch | `packages/web/web-fetch-http`（`dsh-web-fetch-http`）挂到 `ctx.web`，`packages/web/tool-web` 暴露 `web_fetch`/`web_search` | `registerFetchProvider()` | 响应体/超时/重定向跳数上限可配，显式 `User-Agent`（非伪装浏览器） |
| Web 搜索 | `packages/web/web-search-deepseek`、`web-search-exa`、`web-search-perplexity` | 同上 `ctx.web` seam | 多 provider 可选，红队信息收集阶段可用 |
| 远程沙箱执行 | `packages/e2b/{e2b,fs-e2b,subprocess-e2b}` | 独立 e2b seam | 本地执行之外的隔离环境，替代/补充本地 subprocess |
| 文件读写/搜索/编辑 | `packages/fs/{fs,fs-local,fs-sandbox,tool-fs,tool-fs-search,tool-str-replace-editor}` | `ctx.fs` | 证据/产物落盘由此承接，非本包职责 |
| 代码智能 | `packages/lsp/{lsp,lsp-stdio,tool-lsp}` | `ctx.lsp` | 静态分析辅助，非渗透测试专用但可复用 |

### 确认的缺口

- **浏览器自动化**：`.upstream/deepseek-harness/packages` 下没有 browser/playwright/puppeteer 一类的通用 provider（仅 `benchmarks/long-session-browser` 基准和 `.agents/skills/record-browser-gif` 技能，均非可加载 seam）。红队常需的登录流程交互、DOM 检查、截图取证在 DSH 侧缺失。是否为此引入新依赖（如 Playwright）需 EXEC-02 前先询问用户（新依赖需用户批准，见硬护栏）。
- **dsh-\* 包不可直接作为 npm 依赖复用**：本仓已发布的 `@deepseek-ai/dsh-*` 系列 npm 版本仅到 `0.0.1-rc.1`，落后于本仓选定的源码基线 `dsh-v0.1.5-rc.2`。当前只把源码当接口参考，EXEC-02 落地时如何接（等待上游发版、vendor 固定 commit、还是仅参考接口自研 provider）尚未确定。

### 自检方法

- 接口核实：直接读取上游固定 commit 下的 `src/*.ts`（本次已读 `shell/shell`、`subprocess/subprocess`、`terminal/terminal`、`web/web-fetch-http` 的 `types.ts`/`index.ts`），不臆造字段。
- 无害样例（留给 EXEC-02 实际执行验证）：`echo`、`pwd`、对 `127.0.0.1` 的本地 HTTP 请求；不接用户靶场（P4 才接）。
- 本包骨架的加载验证见 `tests/execution.spec.ts`（`vitest`）。

