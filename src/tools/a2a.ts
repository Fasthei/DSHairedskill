/**
 * a2a 工具模块（课程 Ch4 A2A 交互）。
 * Agent Card / OpenAPI 枚举已在 recon 模块中完成；本模块做与 A2A 编排器的
 * 实际交互：列出已注册 agent、发送 A2A 消息。都是可【单独调用】的原子动作，
 * 返回结构化结果 + 原始 HTTP 证据。工具调用成功 ≠ 交互效果 ≠ 发现已验证，
 * 需要结合响应内容与后续证据人工核实。面向用户授权目标。
 * @module @dshaired/mcp-toolbox/tools/a2a
 */
import { z } from 'zod'
import { resolveUrl, safeJson } from '../http.js'
import type { RegisterTools } from '../types.js'

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export const registerA2aTools: RegisterTools = (server, deps) => {
  server.registerTool(
    'a2a_list_agents',
    {
      description:
        'A2A 已注册 Agent 列表（Ch4）：GET /agents（编排器常见的已注册 Agent 枚举端点）。返回解析后的列表与原始证据；' +
        '工具调用成功不等于该端点确实存在或数据完整，需结合状态码与响应体人工核实。',
      inputSchema: { baseUrl: z.string().describe('目标基址，如 http://host:port') },
    },
    async ({ baseUrl }) => {
      const { evidence, body } = await deps.probe(resolveUrl(baseUrl, '/agents'), 'GET')
      const parsed = evidence.status === 200 ? safeJson(body) : undefined
      return text({ agents: parsed, evidence })
    },
  )

  server.registerTool(
    'a2a_send_message',
    {
      description:
        'A2A 消息发送（Ch4）：POST 一个 A2A 消息 JSON 对象到目标端点（默认 /a2a/message/send）。返回解析后的响应与原始证据；' +
        '工具调用成功 ≠ 消息被目标 agent 实际处理 ≠ 交互效果已验证，需结合响应内容与后续观察人工核实。',
      inputSchema: {
        baseUrl: z.string().describe('目标基址，如 http://host:port'),
        path: z.string().default('/a2a/message/send').describe('A2A 消息发送端点路径'),
        message: z.record(z.string(), z.any()).describe('A2A 消息 JSON 对象'),
      },
    },
    async ({ baseUrl, path, message }) => {
      const { evidence, body } = await deps.probe(resolveUrl(baseUrl, path), 'POST', {
        body: JSON.stringify(message),
        headers: { 'content-type': 'application/json' },
      })
      const parsed = safeJson(body)
      return text({ response: parsed, evidence })
    },
  )
}
