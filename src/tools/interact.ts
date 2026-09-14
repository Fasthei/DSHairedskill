/**
 * interact 工具模块（课程 Ch2.3 模型指纹 + Ch3.2 直接注入）。
 * 只提供"向目标发消息、看响应"的原语；系统提示提取、模型指纹判定等
 * 具体手法由调用方（模型）在构造 message 时实现。
 * 工具调用成功 ≠ 目标端有效果 ≠ 发现已验证：本模块只回传原始证据，
 * 结论判定与验证需人工/上层复核。面向用户授权目标。
 * @module @dshaired/mcp-toolbox/tools/interact
 */
import { z } from 'zod'
import { safeJson } from '../http.js'
import type { RegisterTools } from '../types.js'

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export const registerInteractTools: RegisterTools = (server, deps) => {
  server.registerTool(
    'send_prompt',
    {
      description:
        '直接注入原语（Ch3.2）：向目标 Agent/聊天端点 POST 一条消息，回读响应。' +
        '可用于系统提示提取、模型指纹（Ch2.3）等手法的"发送"步骤，具体 payload 由调用方构造。' +
        '警告：工具调用成功（HTTP 请求完成）≠ 目标端产生了预期效果 ≠ 发现已被验证；' +
        '响应需人工复核后才能作为结论证据。',
      inputSchema: {
        endpoint: z.string().describe('目标聊天/Agent 端点完整 URL，如 http://host:8000/chat'),
        message: z.string().describe('要发送的 prompt/消息内容'),
        field: z.string().default('message').describe('目标端接收 prompt 的 JSON 字段名，默认 message'),
        extraFields: z
          .record(z.string(), z.any())
          .optional()
          .describe('合并进请求体的其他字段（如 session_id、role 等）'),
      },
    },
    async ({ endpoint, message, field, extraFields }) => {
      const body = JSON.stringify({ [field]: message, ...extraFields })
      const { evidence, body: rawBody } = await deps.probe(endpoint, 'POST', {
        body,
        headers: { 'content-type': 'application/json' },
      })
      const parsed = safeJson(rawBody)
      return text({
        response: parsed !== undefined ? parsed : rawBody,
        note: '工具调用成功 ≠ 目标端有效果 ≠ 发现已验证；请人工复核 response/evidence 后再下结论。',
        evidence,
      })
    },
  )
}
