/**
 * consumption 工具模块（OWASP LLM10 无界消耗）。
 * 对授权目标端点发**有上限**的重复请求，观测时延与响应体大小变化，
 * 识别潜在的放大/循环迹象。硬上限内置且不可被调用方参数突破：
 * 仅用于观测，不构成真实压垮测试；造成真实拒绝服务需 P4 授权。
 * 工具调用成功 ≠ 目标端存在放大缺陷 ≠ 发现已验证：结论需人工复核。
 * 面向用户授权目标。
 * @module @dshaired/mcp-toolbox/tools/consumption
 */
import { z } from 'zod'
import type { RegisterTools } from '../types.js'

const MAX_REPEAT = 10
const MIN_DELAY_MS = 200

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const registerConsumptionTools: RegisterTools = (server, deps) => {
  server.registerTool(
    'consumption_probe',
    {
      description:
        '无界消耗观测（OWASP LLM10）：对授权目标端点发送有上限的重复请求，' +
        '记录每次时延（Date.now 差）与响应体字节数，用于识别放大/循环迹象。' +
        '限速、仅授权目标、非破坏：内置硬上限（repeat≤10，delayMs≥200ms），' +
        '不支持无限或高并发，不用于制造真实拒绝服务。工具调用成功 ≠ 目标端存在放大缺陷，' +
        '结果需人工复核后再下结论。',
      inputSchema: {
        endpoint: z.string().describe('目标端点完整 URL'),
        method: z.string().default('POST').describe('HTTP 方法，默认 POST'),
        body: z.string().optional().describe('请求体（JSON 字符串），可选'),
        repeat: z.number().default(3).describe('重复请求次数，硬上限 10（超出会被截断）'),
        delayMs: z.number().default(500).describe('每次请求间隔毫秒，硬下限 200（低于会被提升）'),
      },
    },
    async ({ endpoint, method, body, repeat, delayMs }) => {
      const effectiveRepeat = Math.min(repeat, MAX_REPEAT)
      const effectiveDelayMs = Math.max(delayMs, MIN_DELAY_MS)

      const samples: Array<{ i: number; status: number | null; latencyMs: number; bytes: number }> = []
      for (let i = 0; i < effectiveRepeat; i++) {
        const start = Date.now()
        const { evidence, body: rawBody } = await deps.probe(
          endpoint,
          method,
          body !== undefined ? { body, headers: { 'content-type': 'application/json' } } : {},
        )
        const latencyMs = Date.now() - start
        samples.push({
          i,
          status: evidence.status,
          latencyMs,
          bytes: Buffer.byteLength(rawBody, 'utf8'),
        })
        if (i < effectiveRepeat - 1) await sleep(effectiveDelayMs)
      }

      const avgLatencyMs = samples.reduce((sum, s) => sum + s.latencyMs, 0) / samples.length
      const bytesGrowth = samples.length > 1 ? samples[samples.length - 1].bytes - samples[0].bytes : 0

      return text({
        samples,
        summary: {
          avgLatencyMs,
          bytesGrowth,
          note: '仅观测放大迹象；造成真实拒绝服务需 P4 授权，禁止无限/高并发',
        },
        requestedRepeat: repeat,
        effectiveRepeat,
        requestedDelayMs: delayMs,
        effectiveDelayMs,
      })
    },
  )
}
