/**
 * recon 工具模块（课程 Ch2 侦察 + Ch4 A2A 枚举）。
 * 都是可【单独调用】的原子动作，返回结构化结果 + 原始 HTTP 证据。
 * 侦察结论是线索：工具调用成功 ≠ 发现已验证。面向用户授权目标。
 * @module @dshaired/mcp-toolbox/tools/recon
 */
import { z } from 'zod'
import { resolveUrl, safeJson } from '../http.js'
import type { RegisterTools } from '../types.js'

function classify(status: number | null): string {
  if (status === null) return 'error'
  if (status >= 200 && status < 300) return 'open'
  if (status === 401) return 'exists-auth-required'
  if (status === 403) return 'exists-forbidden'
  if (status === 404) return 'not-found'
  return `status-${status}`
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export const registerReconTools: RegisterTools = (server, deps) => {
  server.registerTool(
    'http_fingerprint',
    {
      description:
        'HTTP 头指纹（Ch2）：GET 目标，挑出与 AI 后端/向量库/编排框架相关的响应头（如 X-AI-Backend、X-RAG-Provider、Server）。命中是线索，非确证。',
      inputSchema: { url: z.string().describe('完整 URL，如 http://host:port/') },
    },
    async ({ url }) => {
      const { evidence } = await deps.probe(url, 'GET')
      const indicative = /(ai|model|rag|llm|vector|embed|openai|anthropic|deepseek|backend|powered-by)/i
      const aiIndicators: Record<string, string> = {}
      for (const [name, value] of Object.entries(evidence.headers)) {
        if (name.toLowerCase() === 'server' || indicative.test(name)) aiIndicators[name] = value
      }
      return text({ aiIndicators, server: evidence.headers['server'], poweredBy: evidence.headers['x-powered-by'], evidence })
    },
  )

  server.registerTool(
    'probe_health',
    {
      description: '/health 探测（Ch3）：确认服务并读取 agent 名与端口。',
      inputSchema: { baseUrl: z.string().describe('目标基址，如 http://host:8001') },
    },
    async ({ baseUrl }) => {
      const { evidence, body } = await deps.probe(resolveUrl(baseUrl, '/health'), 'GET')
      const parsed = safeJson(body)
      const out: Record<string, unknown> = { reachable: evidence.status === 200, evidence }
      if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>
        if (typeof o.status === 'string') out.healthStatus = o.status
        if (typeof o.agent === 'string') out.agent = o.agent
        if (typeof o.port === 'number') out.port = o.port
      }
      return text(out)
    },
  )

  server.registerTool(
    'fetch_agent_card',
    {
      description: 'Agent Card 拉取（Ch4 A2A 发现）：GET /.well-known/agent.json，解析 name/url/protocolVersion/skills 与 metadata.model。',
      inputSchema: { baseUrl: z.string().describe('目标基址，如 http://host:8000') },
    },
    async ({ baseUrl }) => {
      const { evidence, body } = await deps.probe(resolveUrl(baseUrl, '/.well-known/agent.json'), 'GET')
      const parsed = evidence.status === 200 ? safeJson(body) : undefined
      const out: Record<string, unknown> = { found: parsed != null, evidence }
      if (parsed && typeof parsed === 'object') {
        const c = parsed as Record<string, unknown>
        out.card = c
        if (typeof c.name === 'string') out.name = c.name
        if (typeof c.url === 'string') out.url = c.url
        if (typeof c.protocolVersion === 'string') out.protocolVersion = c.protocolVersion
        if (Array.isArray(c.skills)) {
          out.skills = c.skills
            .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>).id : undefined))
            .filter((id): id is string => typeof id === 'string')
        }
        const md = c.metadata
        if (md && typeof md === 'object' && typeof (md as Record<string, unknown>).model === 'string') {
          out.model = (md as Record<string, unknown>).model
        }
      }
      return text(out)
    },
  )

  server.registerTool(
    'dump_openapi',
    {
      description: 'OpenAPI/Swagger 转储（Ch4）：GET /openapi.json 列全端点，并探测 /docs 是否开放。',
      inputSchema: { baseUrl: z.string().describe('目标基址') },
    },
    async ({ baseUrl }) => {
      const { evidence, body } = await deps.probe(resolveUrl(baseUrl, '/openapi.json'), 'GET')
      const parsed = evidence.status === 200 ? safeJson(body) : undefined
      let paths: string[] = []
      if (parsed && typeof parsed === 'object') {
        const spec = parsed as Record<string, unknown>
        if (spec.paths && typeof spec.paths === 'object') paths = Object.keys(spec.paths as Record<string, unknown>)
      }
      const docs = await deps.probe(resolveUrl(baseUrl, '/docs'), 'GET')
      return text({ found: parsed != null, paths, docsAvailable: docs.evidence.status === 200, evidence, docsEvidence: docs.evidence })
    },
  )

  server.registerTool(
    'enum_endpoints',
    {
      description: '端点枚举 401-vs-404（Ch2）：逐个 GET 候选路径并按状态码分类（401/403=存在但受保护，404=不存在）。',
      inputSchema: {
        baseUrl: z.string().describe('目标基址'),
        paths: z.array(z.string()).describe('候选路径列表，如 ["/api/v1/users","/admin"]'),
      },
    },
    async ({ baseUrl, paths }) => {
      const results = []
      for (const p of paths) {
        const { evidence } = await deps.probe(resolveUrl(baseUrl, p), 'GET')
        results.push({ path: p, status: evidence.status, classification: classify(evidence.status), evidence })
      }
      return text({ base: baseUrl, results })
    },
  )
}
