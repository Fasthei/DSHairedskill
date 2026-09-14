/**
 * defensive_scanners 工具模块：调用本机已安装的蓝队扫描器。
 *
 * 这里仅做固定命令的安全适配：不自动安装、不通过 shell 执行、不接受任意
 * command/args。扫描器未安装时返回结构化 unavailable，便于 DSH/Swarm 选择
 * 降级路径。第三方扫描结论始终是线索，不能替代人工复核。
 * @module @dshaired/mcp-toolbox/tools/defensive_scanners
 */
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { RegisterTools } from '../types.js'

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

interface ScannerDefinition {
  id: string
  binary: string
  repository: string
  license: string
  purpose: string
  installHint: string
  versionArgs: string[]
}

interface CliResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
  outputTruncated: boolean
  unavailable: boolean
  error?: string
}

const SCANNERS = {
  skillScanner: {
    id: 'skill-scanner',
    binary: 'skill-scanner',
    repository: 'https://github.com/cisco-ai-defense/skill-scanner',
    license: 'Apache-2.0',
    purpose: '扫描 Agent Skill 中的提示注入、数据外传、恶意代码和依赖风险',
    installHint: '固定版本安装 cisco-ai-skill-scanner；安装后确认 skill-scanner --version',
    versionArgs: ['--version'],
  },
  modelScan: {
    id: 'modelscan',
    binary: 'modelscan',
    repository: 'https://github.com/protectai/modelscan',
    license: 'Apache-2.0',
    purpose: '扫描 Pickle、PyTorch、Keras、SavedModel 等模型制品中的不安全序列化',
    installHint: '固定版本安装 modelscan；安装后确认 modelscan --version',
    versionArgs: ['--version'],
  },
  osvScanner: {
    id: 'osv-scanner',
    binary: 'osv-scanner',
    repository: 'https://github.com/google/osv-scanner',
    license: 'Apache-2.0',
    purpose: '根据锁文件和包清单扫描开源依赖漏洞',
    installHint: '从官方 GitHub Release 固定版本安装并校验 checksum；安装后确认 osv-scanner --version',
    versionArgs: ['--version'],
  },
  trivy: {
    id: 'trivy',
    binary: 'trivy',
    repository: 'https://github.com/aquasecurity/trivy',
    license: 'Apache-2.0',
    purpose: '扫描文件系统中的依赖漏洞、密钥和基础设施配置问题',
    installHint: '固定安全版本并校验官方 checksum/签名，避免 latest 浮动标签；安装后确认 trivy --version',
    versionArgs: ['--version'],
  },
} satisfies Record<string, ScannerDefinition>

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function runCli(binary: string, args: string[], timeoutMs: number): Promise<CliResult> {
  return new Promise((done) => {
    let stdout: Buffer = Buffer.alloc(0)
    let stderr: Buffer = Buffer.alloc(0)
    let outputTruncated = false
    let timedOut = false
    let settled = false
    let timer: NodeJS.Timeout | undefined
    let forceKillTimer: NodeJS.Timeout | undefined

    const finish = (result: CliResult) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      done(result)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(binary, args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (err) {
      finish({
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        outputTruncated: false,
        unavailable: true,
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }

    const terminate = () => {
      child.kill('SIGTERM')
      if (!forceKillTimer) {
        forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 1_000)
        forceKillTimer.unref()
      }
    }

    const append = (current: Buffer, chunk: Buffer | string): Buffer => {
      if (outputTruncated) return current
      const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const remaining = MAX_OUTPUT_BYTES - stdout.length - stderr.length
      if (remaining <= 0) {
        outputTruncated = true
        terminate()
        return current
      }
      if (incoming.length > remaining) {
        outputTruncated = true
        terminate()
        return Buffer.concat([current, incoming.subarray(0, remaining)])
      }
      return Buffer.concat([current, incoming])
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk)
    })

    child.once('error', (err: NodeJS.ErrnoException) => {
      finish({
        exitCode: null,
        signal: null,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        timedOut,
        outputTruncated,
        unavailable: err.code === 'ENOENT',
        error: err.message,
      })
    })

    child.once('close', (exitCode, signal) => {
      finish({
        exitCode,
        signal,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        timedOut,
        outputTruncated,
        unavailable: false,
      })
    })

    timer = setTimeout(() => {
      timedOut = true
      terminate()
    }, timeoutMs)
    timer.unref()
  })
}

function targetPath(path: string): { path?: string; error?: string } {
  const absolute = resolve(path)
  try {
    statSync(absolute)
    return { path: absolute }
  } catch (err) {
    return { error: `扫描目标不可读或不存在: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function parseJson(stdout: string): unknown | undefined {
  const trimmed = stdout.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

async function executeScanner(
  scanner: ScannerDefinition,
  args: string[],
  target: string,
  timeoutSeconds: number,
) {
  const startedAt = new Date().toISOString()
  const result = await runCli(scanner.binary, args, timeoutSeconds * 1000)
  const parsed = parseJson(result.stdout)

  let status: 'clean' | 'findings' | 'error' | 'unavailable' | 'timeout' | 'output-limit'
  if (result.unavailable) status = 'unavailable'
  else if (result.timedOut) status = 'timeout'
  else if (result.outputTruncated) status = 'output-limit'
  else if (result.exitCode === 0) status = 'clean'
  else if (result.exitCode === 1 && parsed !== undefined) status = 'findings'
  else status = 'error'

  return text({
    scanner: scanner.id,
    repository: scanner.repository,
    target,
    command: scanner.binary,
    args,
    status,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    outputTruncated: result.outputTruncated,
    parsed,
    raw: {
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    note:
      status === 'unavailable'
        ? `扫描器未安装或不在 PATH；本工具不会自动下载。${scanner.installHint}`
        : '扫描结果是辅助证据；clean/无发现不等于目标已被证明安全，findings 也需要结合原始输出复核。',
  })
}

const timeoutSchema = z.number().int().min(1).max(300).default(120).describe('超时秒数，默认 120，最大 300')

export const registerDefensiveScannerTools: RegisterTools = (server, _deps) => {
  void _deps

  server.registerTool(
    'defensive_tool_status',
    {
      description:
        '检查项目选定的四个蓝队扫描器（Skill Scanner、ModelScan、OSV-Scanner、Trivy）是否已安装并返回版本。只运行固定的 --version，不自动安装。',
      inputSchema: {},
    },
    async () => {
      const tools = await Promise.all(
        Object.values(SCANNERS).map(async (scanner) => {
          const result = await runCli(scanner.binary, scanner.versionArgs, 10_000)
          return {
            id: scanner.id,
            binary: scanner.binary,
            repository: scanner.repository,
            license: scanner.license,
            purpose: scanner.purpose,
            available: !result.unavailable && result.exitCode === 0,
            version: (result.stdout || result.stderr).trim() || null,
            exitCode: result.exitCode,
            error: result.error,
            installHint: scanner.installHint,
          }
        }),
      )
      return text({ tools, note: '这里只核实本机 PATH；未安装不会触发下载或修改环境。' })
    },
  )

  server.registerTool(
    'skill_security_scan',
    {
      description:
        '用 Cisco AI Defense Skill Scanner 对本地 Agent Skill 做静态蓝队扫描。默认不启用 LLM、VirusTotal 或 Cisco 云服务，不发送 API 密钥；命令未安装时返回 unavailable。',
      inputSchema: {
        path: z.string().min(1).describe('单个 Skill 目录或 skills 父目录'),
        mode: z.enum(['single', 'all']).default('all').describe('single 扫一个 Skill；all 递归扫描父目录'),
        policy: z.enum(['strict', 'balanced', 'permissive']).default('balanced'),
        timeoutSeconds: timeoutSchema,
      },
    },
    async ({ path, mode, policy, timeoutSeconds }) => {
      const target = targetPath(path)
      if (!target.path) return text({ scanner: SCANNERS.skillScanner.id, target: resolve(path), status: 'invalid-target', error: target.error })
      const command = mode === 'single' ? 'scan' : 'scan-all'
      const args = [command, target.path]
      if (mode === 'all') args.push('--recursive')
      args.push('--policy', policy, '--format', 'json', '--compact', '--fail-on-severity', 'info')
      return executeScanner(SCANNERS.skillScanner, args, target.path, timeoutSeconds)
    },
  )

  server.registerTool(
    'model_artifact_scan',
    {
      description:
        '用 Protect AI ModelScan 扫描本地模型制品的不安全序列化风险，补充内置 pickle_scan 的轻量字节检查。不会反序列化模型；命令未安装时返回 unavailable。',
      inputSchema: {
        path: z.string().min(1).describe('模型文件或包含模型制品的目录'),
        timeoutSeconds: timeoutSchema,
      },
    },
    async ({ path, timeoutSeconds }) => {
      const target = targetPath(path)
      if (!target.path) return text({ scanner: SCANNERS.modelScan.id, target: resolve(path), status: 'invalid-target', error: target.error })
      return executeScanner(SCANNERS.modelScan, ['-p', target.path, '-r', 'json'], target.path, timeoutSeconds)
    },
  )

  server.registerTool(
    'osv_dependency_scan',
    {
      description:
        '用 Google OSV-Scanner v2 扫描本地源码树/锁文件中的已知依赖漏洞。扫描器可能访问 OSV.dev；命令未安装时返回 unavailable。',
      inputSchema: {
        path: z.string().min(1).describe('源码目录、锁文件或包清单路径'),
        timeoutSeconds: timeoutSchema,
      },
    },
    async ({ path, timeoutSeconds }) => {
      const target = targetPath(path)
      if (!target.path) return text({ scanner: SCANNERS.osvScanner.id, target: resolve(path), status: 'invalid-target', error: target.error })
      const args = ['scan', 'source', '--format', 'json', '--recursive', target.path]
      return executeScanner(SCANNERS.osvScanner, args, target.path, timeoutSeconds)
    },
  )

  server.registerTool(
    'trivy_filesystem_scan',
    {
      description:
        '用 Aqua Trivy 扫描本地文件系统中的依赖漏洞、密钥和 IaC 配置问题。扫描器可能更新本地数据库并联网；固定使用 JSON 输出和发现时退出码 1。',
      inputSchema: {
        path: z.string().min(1).describe('要扫描的本地文件或目录'),
        scanners: z
          .array(z.enum(['vuln', 'secret', 'misconfig']))
          .min(1)
          .max(3)
          .default(['vuln', 'secret', 'misconfig'])
          .describe('启用的扫描类型'),
        timeoutSeconds: timeoutSchema,
      },
    },
    async ({ path, scanners, timeoutSeconds }) => {
      const target = targetPath(path)
      if (!target.path) return text({ scanner: SCANNERS.trivy.id, target: resolve(path), status: 'invalid-target', error: target.error })
      const args = ['fs', '--quiet', '--format', 'json', '--exit-code', '1', '--scanners', scanners.join(','), target.path]
      return executeScanner(SCANNERS.trivy, args, target.path, timeoutSeconds)
    },
  )
}
