#!/usr/bin/env node
/**
 * @dshaired/mcp-toolbox — stdio MCP server（DSHAIred 小工具箱）。
 *
 * 向 DSH（dsh-mcp-client, transport: stdio）与 agent-swarm 暴露安全测试执行原语。
 * 知识由 skills 提供，本 server 提供"手"。每个工具模块在 tools/ 下，统一经
 * http.probe 探测、返回结构化结果 + 原始证据。面向用户自己授权的靶场。
 *
 * DSH 侧配置示例（cordis.patch 行）：
 *   - id: mcp-dshaired
 *     name: '@deepseek-ai/dsh-mcp-client'
 *     config:
 *       serverName: dshaired
 *       transport: stdio
 *       command: node
 *       args: ['<abs path>/packages/mcp-toolbox/lib/server.js']
 *
 * @module @dshaired/mcp-toolbox/server
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { DEFAULT_HTTP, probe } from './http.js'
import type { ProbeResult, RequestExtra, ToolDeps } from './types.js'
import { registerReconTools } from './tools/recon.js'
import { registerInteractTools } from './tools/interact.js'
import { registerA2aTools } from './tools/a2a.js'
import { registerMcpProbeTools } from './tools/mcp_probe.js'
import { registerDetectionTools } from './tools/detection.js'
import { registerPayloadHostTools } from './tools/payload_host.js'
import { registerOutputTools } from './tools/output.js'
import { registerSupplyChainTools } from './tools/supply_chain.js'
import { registerArtifactScanTools } from './tools/artifact_scan.js'
import { registerConsumptionTools } from './tools/consumption.js'
import { registerDefensiveScannerTools } from './tools/defensive_scanners.js'

const deps: ToolDeps = {
  probe: (url: string, method?: string, extra?: RequestExtra): Promise<ProbeResult> =>
    probe(url, method ?? 'GET', extra ?? {}, DEFAULT_HTTP),
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: 'dshaired-mcp-toolbox', version: '0.0.0' })
  // 各工具模块在此注册；新增模块时在此追加一行 import + 调用。
  registerReconTools(server, deps)
  registerInteractTools(server, deps)
  registerA2aTools(server, deps)
  registerMcpProbeTools(server, deps)
  registerDetectionTools(server, deps)
  registerPayloadHostTools(server, deps)
  registerOutputTools(server, deps)
  registerSupplyChainTools(server, deps)
  registerArtifactScanTools(server, deps)
  registerConsumptionTools(server, deps)
  registerDefensiveScannerTools(server, deps)
  return server
}

async function main(): Promise<void> {
  const server = buildServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`[dshaired-mcp-toolbox] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
  process.exitCode = 1
})
