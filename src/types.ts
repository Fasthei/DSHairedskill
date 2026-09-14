/**
 * 工具箱共享类型与契约。每个 tools/<domain>.ts 导出一个 RegisterTools 函数，
 * 由 server.ts 统一注册到同一个 McpServer 上。所有工具复用 ToolDeps.probe
 * 做 HTTP 探测，保证证据格式一致。
 * @module @dshaired/mcp-toolbox/types
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

/** 一次 HTTP 探测的原始证据快照；工具返回它，供报告/证据引用，不由模型补写。 */
export interface RawHttpEvidence {
  url: string
  method: string
  /** HTTP 状态码；请求失败（网络/超时）时为 null，并在 error 说明。 */
  status: number | null
  headers: Record<string, string>
  bodySnippet: string
  bodyTruncated: boolean
  error?: string
  at: string
}

/** probe 的返回：完整响应体（供 JSON 解析）+ 截断后的证据。 */
export interface ProbeResult {
  evidence: RawHttpEvidence
  body: string
}

/** 单次请求的可选项：请求体与额外头（POST JSON 时用）。 */
export interface RequestExtra {
  body?: string
  headers?: Record<string, string>
}

/** 工具可用的共享依赖。 */
export interface ToolDeps {
  /** 发一次 HTTP 请求，返回完整 body 与证据。默认 GET、不跟随重定向；POST JSON 用 extra.body + extra.headers。 */
  probe: (url: string, method?: string, extra?: RequestExtra) => Promise<ProbeResult>
}

/** 每个工具模块导出的注册函数签名。 */
export type RegisterTools = (server: McpServer, deps: ToolDeps) => void
