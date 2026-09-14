/**
 * mcp_probe 工具模块（MCP：枚举/调用目标 MCP 的工具、探权限边界）。
 * 这里连的是"被测的外部 MCP 服务器"（stdio 或 http transport），与本工具箱自身的
 * McpServer 无关。每次调用都新建 Client 连接，操作完毕即关闭，不长期持有会话。
 * 工具调用成功 ≠ 权限边界或漏洞已验证：这里只做枚举与转发调用，结果仍需人工判读。
 * @module @dshaired/mcp-toolbox/tools/mcp_probe
 */
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { RegisterTools } from '../types.js'

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

const connectionSchema = {
  transport: z.enum(['stdio', 'http']).describe('目标 MCP 服务器的传输方式'),
  command: z.string().optional().describe('stdio: 启动目标 MCP server 的可执行命令'),
  args: z.array(z.string()).optional().describe('stdio: 命令行参数'),
  env: z.record(z.string(), z.string()).optional().describe('stdio: 附加环境变量'),
  url: z.string().optional().describe('http: 目标 MCP server 的 URL'),
}

interface ConnectionInput {
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
}

/** 依据连接参数构造 transport；stdio 缺 command 或 http 缺 url 时抛错，由调用方 catch。 */
function buildTransport(input: ConnectionInput) {
  if (input.transport === 'stdio') {
    if (!input.command) throw new Error('stdio transport 需要 command')
    return new StdioClientTransport({
      command: input.command,
      args: input.args,
      env: input.env,
    })
  }
  if (!input.url) throw new Error('http transport 需要 url')
  return new StreamableHTTPClientTransport(new URL(input.url))
}

/** 未显式提供 probes 时使用的内置无害探针：路径遍历 / 绝对路径 / 越权资源标识。 */
const DEFAULT_PROBES = [
  '../../etc/passwd',
  '../../../etc/passwd',
  '/etc/passwd',
  '..\\..\\windows\\win32.ini',
  'file:///etc/passwd',
  '../../../../root/.ssh/id_rsa',
  'admin',
  '*',
]

/** 依据 argTemplate 中的 "{{probe}}" 占位符替换生成本次调用参数；无模板时退化为单字段 { path: probe }。 */
function buildProbeArguments(probe: string, argTemplate?: Record<string, unknown>): Record<string, unknown> {
  if (!argTemplate) return { path: probe }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(argTemplate)) {
    out[k] = typeof v === 'string' ? v.replaceAll('{{probe}}', probe) : v
  }
  return out
}

/** 粗粒度判断目标工具是否拒绝了越界请求：isError 或返回文本含拒绝类关键词视为“被拒绝”。 */
function looksBlocked(callResult: unknown): boolean {
  if (callResult && typeof callResult === 'object' && (callResult as Record<string, unknown>).isError === true) {
    return true
  }
  const rejectPattern = /(denied|forbidden|not allowed|unauthorized|invalid|reject|blocked|permission|constraint|out of scope|not permitted)/i
  const dump = JSON.stringify(callResult)
  return rejectPattern.test(dump)
}

export const registerMcpProbeTools: RegisterTools = (server, _deps) => {
  void _deps

  server.registerTool(
    'mcp_list_tools',
    {
      description:
        'MCP 工具枚举：连接目标 MCP server（stdio 或 http），listTools() 列出其暴露的工具名/描述/inputSchema。命中是线索，非确证——工具存在不代表可无权限调用。',
      inputSchema: connectionSchema,
    },
    async (input) => {
      let client: Client | undefined
      try {
        const transport = buildTransport(input)
        client = new Client({ name: 'dshaired-mcp-probe', version: '0.0.0' })
        await client.connect(transport)
        const result = await client.listTools()
        const tools = (result.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }))
        return text({ ok: true, count: tools.length, tools })
      } catch (err) {
        return text({ ok: false, error: err instanceof Error ? err.message : String(err) })
      } finally {
        if (client) {
          try {
            await client.close()
          } catch {
            // 关闭失败不影响已返回的结果
          }
        }
      }
    },
  )

  server.registerTool(
    'mcp_call_tool',
    {
      description:
        'MCP 工具调用：连接目标 MCP server，callTool() 调用其指定工具并转发参数，返回原始结果。用于探权限边界——调用成功只说明请求被接受，不代表越权或漏洞已验证，仍需结合上下文判读。',
      inputSchema: {
        ...connectionSchema,
        toolName: z.string().describe('要调用的目标工具名'),
        arguments: z.record(z.string(), z.any()).optional().describe('传给目标工具的参数'),
      },
    },
    async (input) => {
      let client: Client | undefined
      try {
        const transport = buildTransport(input)
        client = new Client({ name: 'dshaired-mcp-probe', version: '0.0.0' })
        await client.connect(transport)
        const result = await client.callTool({ name: input.toolName, arguments: input.arguments })
        return text({ ok: true, result })
      } catch (err) {
        return text({ ok: false, error: err instanceof Error ? err.message : String(err) })
      } finally {
        if (client) {
          try {
            await client.close()
          } catch {
            // 关闭失败不影响已返回的结果
          }
        }
      }
    },
  )

  server.registerTool(
    'mcp_permission_probe',
    {
      description:
        'MCP 权限滥用/约束绕过探测：连接目标 MCP server，对指定工具依次用越界参数值（路径遍历、绝对路径、越权资源标识等）调用，记录每次是被拒绝（错误/约束类消息）还是被接受。未给 probes 时使用内置无害探针集。未被拒绝仅是线索，需结合实际影响人工判读，非直接确证漏洞。',
      inputSchema: {
        ...connectionSchema,
        toolName: z.string().describe('要探测的目标工具名'),
        probes: z.array(z.string()).optional().describe('越界参数值列表，如路径遍历/绝对路径/越权标识；不给则用内置探针集'),
        argTemplate: z
          .record(z.string(), z.any())
          .optional()
          .describe('调用目标工具的参数模板，字符串字段中的 "{{probe}}" 会被替换为当前探针值；不给则退化为 { path: probe }'),
      },
    },
    async (input) => {
      const probes = input.probes && input.probes.length > 0 ? input.probes : DEFAULT_PROBES
      let client: Client | undefined
      const results: Array<{ probe: string; blocked: boolean; raw: unknown }> = []
      try {
        const transport = buildTransport(input)
        client = new Client({ name: 'dshaired-mcp-probe', version: '0.0.0' })
        await client.connect(transport)
        for (const probe of probes) {
          const args = buildProbeArguments(probe, input.argTemplate)
          try {
            const result = await client.callTool({ name: input.toolName, arguments: args })
            results.push({ probe, blocked: looksBlocked(result), raw: result })
          } catch (err) {
            results.push({
              probe,
              blocked: true,
              raw: { error: err instanceof Error ? err.message : String(err) },
            })
          }
        }
        return text({
          toolName: input.toolName,
          results,
          note: '未被拒=可能存在约束绕过线索，需结合影响判定，非直接确证',
        })
      } catch (err) {
        return text({ ok: false, error: err instanceof Error ? err.message : String(err) })
      } finally {
        if (client) {
          try {
            await client.close()
          } catch {
            // 关闭失败不影响已返回的结果
          }
        }
      }
    },
  )
}
