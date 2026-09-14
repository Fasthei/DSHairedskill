/**
 * artifact_scan 工具模块（课程 Ch8 供应链/反序列化 —— 无害静态检测）。
 * 只做静态字节扫描：找 pickle 危险 opcode / 危险模块导入字符串，
 * 不反序列化、不 unpickle、不执行任何制品内容。命中仅为线索，需人工复核。
 * @module @dshaired/mcp-toolbox/tools/artifact_scan
 */
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import type { RegisterTools } from '../types.js'

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

interface Suspicion {
  signal: string
  offsetHint: number
  why: string
}

const DANGEROUS_MODULE_STRINGS: Array<{ needle: string; why: string }> = [
  { needle: 'subprocess', why: '可执行外部命令的模块' },
  { needle: 'os.system', why: '直接系统命令执行' },
  { needle: 'posix.system', why: '直接系统命令执行（posix 别名）' },
  { needle: '__reduce__', why: 'pickle 自定义还原钩子，常被滥用于代码执行' },
  { needle: 'builtins', why: '内建命名空间，常配合 eval/exec/getattr 利用' },
  { needle: 'eval', why: '动态求值，可执行任意表达式' },
  { needle: 'exec', why: '动态执行，可执行任意代码' },
]

function scanBuffer(buf: Buffer): Suspicion[] {
  const found: Suspicion[] = []
  const latin1 = buf.toString('latin1')
  const utf8 = buf.toString('utf8')

  // pickle opcode 信号：REDUCE ('R'), GLOBAL ('c'), STACK_GLOBAL (0x93)
  const opcodeChecks: Array<{ ch: string; name: string; why: string }> = [
    { ch: 'R', name: 'REDUCE', why: 'pickle REDUCE opcode：调用可调用对象并传参，常见于反序列化利用链' },
    { ch: 'c', name: 'GLOBAL', why: 'pickle GLOBAL opcode：按名导入模块属性，是危险导入的入口' },
    { ch: '\x93', name: 'STACK_GLOBAL', why: 'pickle STACK_GLOBAL opcode（协议4+）：从栈取模块/名称，作用同 GLOBAL' },
  ]
  for (const { ch, name, why } of opcodeChecks) {
    let idx = latin1.indexOf(ch)
    let count = 0
    while (idx !== -1 && count < 20) {
      found.push({ signal: `opcode:${name}`, offsetHint: idx, why })
      idx = latin1.indexOf(ch, idx + 1)
      count++
    }
  }

  // 危险模块/函数名字符串（在 latin1 与 utf8 视图中都找一遍，避免编码差异漏检）
  for (const { needle, why } of DANGEROUS_MODULE_STRINGS) {
    for (const view of [latin1, utf8]) {
      let idx = view.indexOf(needle)
      let count = 0
      while (idx !== -1 && count < 10) {
        found.push({ signal: `import:${needle}`, offsetHint: idx, why })
        idx = view.indexOf(needle, idx + 1)
        count++
      }
    }
  }

  // 单独的 os / nt 模块名（避免与常见词误报过多，做粗略边界判断）
  for (const mod of ['os', 'nt']) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${mod}([^A-Za-z0-9_]|$)`)
    let idx = 0
    let count = 0
    while (count < 10) {
      const rest = latin1.slice(idx)
      const m = pattern.exec(rest)
      if (!m) break
      const at = idx + (m.index ?? 0)
      found.push({ signal: `import:${mod}`, offsetHint: at, why: mod === 'os' ? '操作系统接口模块，常见于命令执行利用' : 'Windows 原生模块，常见于命令执行利用' })
      idx = at + mod.length
      count++
    }
  }

  return found
}

function isZipContainer(buf: Buffer): boolean {
  // ZIP local file header magic: 'PK\x03\x04'，torch/joblib 打包格式常见
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

export const registerArtifactScanTools: RegisterTools = (server, _deps) => {
  void _deps
  server.registerTool(
    'pickle_scan',
    {
      description:
        'Pickle/PyTorch/Joblib 制品无害静态扫描（Ch8）：只读字节扫描危险 opcode（REDUCE/GLOBAL/STACK_GLOBAL）与危险导入字符串（os/subprocess/eval/exec/__reduce__ 等），不反序列化、不执行。命中是线索，需人工复核。',
      inputSchema: { path: z.string().describe('本地模型/制品文件路径') },
    },
    async ({ path }) => {
      let buf: Buffer
      try {
        buf = readFileSync(path)
      } catch (err) {
        return text({
          path,
          size: null,
          suspicious: [],
          verdict: 'clean',
          note: `读取文件失败，未执行扫描: ${err instanceof Error ? err.message : String(err)}`,
        })
      }

      const suspicious = scanBuffer(buf)
      const zip = isZipContainer(buf)
      const out: Record<string, unknown> = {
        path,
        size: buf.length,
        suspicious,
        verdict: suspicious.length > 0 ? 'suspicious' : 'clean',
        note: '命中危险 opcode/导入=需人工复核，非确证恶意',
      }
      if (zip) {
        out.note = `${out.note}；检测到 zip 容器（torch/joblib 常见打包格式），内部 data.pkl 需对提取后的文件单独调用本工具扫描`
      }
      return text(out)
    },
  )
}
