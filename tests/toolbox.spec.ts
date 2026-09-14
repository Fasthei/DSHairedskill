import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const serverPath = resolve(pkgRoot, 'lib/server.js')

let fixture: Server
let baseUrl: string
let client: Client

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => res(data))
  })
}

beforeAll(async () => {
  fixture = createServer(async (req, res) => {
    const url = req.url ?? '/'
    if (url === '/' ) {
      res.setHeader('server', 'nginx/1.24.0')
      res.setHeader('x-ai-backend', 'OpenAI-GPT5.2')
      res.setHeader('x-rag-provider', 'ChromaDB')
      res.end('ok')
      return
    }
    if (url === '/health') { res.end(JSON.stringify({ status: 'healthy', agent: 'Baseline Agent', port: 8001 })); return }
    if (url === '/.well-known/agent.json') {
      res.end(JSON.stringify({ name: 'A2A Orchestrator', url: 'http://x', protocolVersion: '0.2', skills: [{ id: 'agent-discovery' }, { id: 'workflow-planning' }], metadata: { model: 'Qwen2.5-7B' } }))
      return
    }
    if (url === '/openapi.json') { res.end(JSON.stringify({ paths: { '/a2a/workflow': {}, '/agents': {}, '/health': {} } })); return }
    if (url === '/docs') { res.end('<html>swagger</html>'); return }
    if (url === '/agents') { res.end(JSON.stringify([{ id: 'sales' }, { id: 'presentation' }])); return }
    if (url.startsWith('/secret')) { res.statusCode = 401; res.end('unauthorized'); return }
    if (url.startsWith('/a2a/message/send')) { const b = await readBody(req); res.end(JSON.stringify({ echoed: b })); return }
    if (url === '/chat') { const b = await readBody(req); res.end(JSON.stringify({ reply: 'got:' + b })); return }
    if (url.startsWith('/_all/_search') || url.startsWith('/logs/_search')) {
      res.end(JSON.stringify({ hits: { total: { value: 1 }, hits: [{ _index: 'logs', _source: { rule: 'prompt-injection-detected' } }] } }))
      return
    }
    res.statusCode = 404; res.end('not found')
  })
  await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r))
  const addr = fixture.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  baseUrl = `http://127.0.0.1:${port}`

  client = new Client({ name: 'toolbox-test', version: '0.0.0' })
  await client.connect(new StdioClientTransport({ command: 'node', args: [serverPath], cwd: pkgRoot }))
}, 30000)

afterAll(async () => {
  await client?.close()
  await new Promise<void>((r) => fixture?.close(() => r()))
})

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  const res = await client.callTool({ name, arguments: args })
  const content = (res.content as Array<{ type: string; text: string }>)[0]
  return JSON.parse(content.text)
}

describe('@fasthei/dshaired-mcp-toolbox 集成测试（真起 HTTP 靶子）', () => {
  it('列出全部工具', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name)
    for (const n of ['http_fingerprint', 'probe_health', 'fetch_agent_card', 'dump_openapi', 'enum_endpoints', 'send_prompt', 'a2a_list_agents', 'a2a_send_message', 'mcp_list_tools', 'mcp_call_tool', 'mcp_permission_probe', 'query_elk', 'serve_payload', 'stop_payload_server', 'output_handling_probe', 'package_reputation_check', 'pickle_scan', 'consumption_probe', 'defensive_tool_status', 'skill_security_scan', 'model_artifact_scan', 'osv_dependency_scan', 'trivy_filesystem_scan']) {
      expect(names, `缺少工具 ${n}`).toContain(n)
    }
  })

  it('defensive_tool_status 返回四个固定蓝队扫描器且不自动安装', async () => {
    const r = await call('defensive_tool_status', {})
    expect(r.tools.map((tool: any) => tool.id).sort()).toEqual(
      ['modelscan', 'osv-scanner', 'skill-scanner', 'trivy'].sort(),
    )
    expect(r.note).toContain('不会触发下载')
  })

  it('外部扫描器在目标不存在时返回 invalid-target，不启动命令', async () => {
    const r = await call('model_artifact_scan', { path: join(tmpdir(), 'dshaired-does-not-exist.model') })
    expect(r.status).toBe('invalid-target')
    expect(r.error).toContain('不存在')
  })

  it('http_fingerprint 抓到 AI 后端头', async () => {
    const r = await call('http_fingerprint', { url: baseUrl + '/' })
    expect(r.aiIndicators['x-ai-backend']).toBe('OpenAI-GPT5.2')
    expect(r.aiIndicators['x-rag-provider']).toBe('ChromaDB')
    expect(r.evidence.status).toBe(200)
  })

  it('probe_health 读出 agent 名', async () => {
    const r = await call('probe_health', { baseUrl })
    expect(r.reachable).toBe(true)
    expect(r.agent).toBe('Baseline Agent')
  })

  it('fetch_agent_card 解析 skills 与 model', async () => {
    const r = await call('fetch_agent_card', { baseUrl })
    expect(r.found).toBe(true)
    expect(r.skills).toContain('agent-discovery')
    expect(r.model).toBe('Qwen2.5-7B')
  })

  it('dump_openapi 列出端点且发现 /docs', async () => {
    const r = await call('dump_openapi', { baseUrl })
    expect(r.paths).toContain('/a2a/workflow')
    expect(r.docsAvailable).toBe(true)
  })

  it('enum_endpoints 用 401-vs-404 分类', async () => {
    const r = await call('enum_endpoints', { baseUrl, paths: ['/secret', '/nope', '/health'] })
    const byPath = Object.fromEntries(r.results.map((x: any) => [x.path, x.classification]))
    expect(byPath['/secret']).toBe('exists-auth-required')
    expect(byPath['/nope']).toBe('not-found')
    expect(byPath['/health']).toBe('open')
  })

  it('send_prompt POST 到目标并拿回响应', async () => {
    const r = await call('send_prompt', { endpoint: baseUrl + '/chat', message: 'hello', field: 'q' })
    expect(JSON.stringify(r.response)).toContain('got:')
    expect(JSON.stringify(r.response)).toContain('hello')
  })

  it('a2a_list_agents 拿到已注册 agent', async () => {
    const r = await call('a2a_list_agents', { baseUrl })
    expect(JSON.stringify(r.agents)).toContain('sales')
  })

  it('a2a_send_message POST 消息', async () => {
    const r = await call('a2a_send_message', { baseUrl, message: { task: 'x' } })
    expect(JSON.stringify(r.response)).toContain('echoed')
  })

  it('query_elk 抽取命中', async () => {
    const r = await call('query_elk', { esUrl: baseUrl, index: 'logs', q: 'rule:*' })
    expect(r.total?.value ?? r.total).toBeDefined
    expect(JSON.stringify(r.hits)).toContain('prompt-injection-detected')
  })

  it('mcp_list_tools 连到我们自己的 server（stdio）能列出工具', async () => {
    const r = await call('mcp_list_tools', { transport: 'stdio', command: 'node', args: [serverPath] })
    expect(JSON.stringify(r)).toContain('http_fingerprint')
  })

  it('serve_payload 托管无害内容并可被取回，stop 后停止', async () => {
    const served = await call('serve_payload', { content: '<b>hi-dsh-marker</b>', path: '/p', contentType: 'text/html' })
    expect(served.url).toContain('127.0.0.1')
    const body = await (await fetch(served.url)).text()
    expect(body).toContain('hi-dsh-marker')
    const stopped = await call('stop_payload_server', { port: served.port })
    expect(stopped.stopped).toBe(true)
  })

  it('output_handling_probe 发出标记并回收结果', async () => {
    const r = await call('output_handling_probe', { endpoint: baseUrl + '/chat', field: 'message' })
    expect(Array.isArray(r.results)).toBe(true)
    expect(r.results.length).toBeGreaterThan(0)
    expect(JSON.stringify(r)).toContain('got:')
  })

  it('pickle_scan 对含危险 opcode/导入的文件判定 suspicious', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-pickle-'))
    const f = join(dir, 'evil.pkl')
    writeFileSync(f, Buffer.from('\x80\x04cposix\nsystem\nq\x00R.', 'latin1'))
    try {
      const r = await call('pickle_scan', { path: f })
      expect(r.verdict).toBe('suspicious')
      expect(r.suspicious.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('consumption_probe 强制上限（repeat≤10）', async () => {
    const r = await call('consumption_probe', { endpoint: baseUrl + '/health', method: 'GET', repeat: 50, delayMs: 10 })
    expect(r.samples.length).toBeLessThanOrEqual(10)
    expect(r.summary).toBeDefined()
  })

  it('mcp_permission_probe 连到我们自己的 server 返回结构化结果', async () => {
    const r = await call('mcp_permission_probe', { transport: 'stdio', command: 'node', args: [serverPath], toolName: 'probe_health', probes: ['../../etc/passwd'] })
    expect(Array.isArray(r.results)).toBe(true)
    expect(r.results.length).toBeGreaterThan(0)
  })
})
