/**
 * payload_host 工具模块：承载"间接注入/RAG 投毒"可交付测试的本机文档托管。
 * 仅托管无害测试内容、仅监听 127.0.0.1、面向已获授权的目标——
 * 工具调用成功只代表测试载荷已可被摄取，不等于漏洞已被验证。
 * @module @dshaired/mcp-toolbox/tools/payload_host
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { z } from 'zod'
import type { RegisterTools } from '../types.js'

const servers = new Map<number, Server>()

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export const registerPayloadHostTools: RegisterTools = (server, _deps) => {
  void _deps

  server.registerTool(
    'serve_payload',
    {
      description:
        '本机托管一份无害测试文档/网页（间接注入/RAG 投毒场景用），返回可被目标摄取的 URL。' +
        '仅监听 127.0.0.1，仅用于已授权目标的可交付测试；返回 URL 可访问 ≠ 注入/投毒已被验证。',
      inputSchema: {
        content: z.string().describe('要托管的文档/网页内容'),
        contentType: z.string().default('text/html').describe('响应的 Content-Type'),
        path: z.string().default('/').describe('匹配的请求路径，其余路径返回 404'),
        port: z.number().default(0).describe('监听端口，0 表示由系统分配空闲端口'),
      },
    },
    async ({ content, contentType, path, port }) => {
      const srv = createServer((req, res) => {
        if (req.url === path) {
          res.writeHead(200, { 'content-type': contentType })
          res.end(content)
        } else {
          res.writeHead(404, { 'content-type': 'text/plain' })
          res.end('not found')
        }
      })

      await new Promise<void>((resolve, reject) => {
        srv.once('error', reject)
        srv.listen(port, '127.0.0.1', () => resolve())
      })

      const address = srv.address()
      const actualPort = typeof address === 'object' && address !== null ? address.port : port
      servers.set(actualPort, srv)

      return text({ url: `http://127.0.0.1:${actualPort}${path}`, port: actualPort })
    },
  )

  server.registerTool(
    'stop_payload_server',
    {
      description: '停止并释放 serve_payload 启动的本机测试服务器。',
      inputSchema: {
        port: z.number().describe('要停止的服务器端口'),
      },
    },
    async ({ port }) => {
      const srv = servers.get(port)
      if (!srv) {
        return text({ stopped: false })
      }
      await new Promise<void>((resolve, reject) => {
        srv.close((err) => (err ? reject(err) : resolve()))
      })
      servers.delete(port)
      return text({ stopped: true })
    },
  )
}
