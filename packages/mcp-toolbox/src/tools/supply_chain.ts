/**
 * supply_chain 工具模块：AI 供应链信誉识别（OWASP LLM03）。
 * 只读查询公共 registry（npm/PyPI/HuggingFace），判断包/模型名是否真实存在、
 * 注册时间、下载量等信号，用于发现幻觉包名抢注（slopsquatting）或仿冒。
 * 不安装、不发布，只做只读侦察。信号是线索，非确证。
 * @module @dshaired/mcp-toolbox/tools/supply_chain
 */
import { z } from 'zod'
import { safeJson } from '../http.js'
import type { RegisterTools } from '../types.js'

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export const registerSupplyChainTools: RegisterTools = (server, deps) => {
  server.registerTool(
    'package_reputation_check',
    {
      description:
        '包/模型信誉检查（Ch15 供应链）：查询公共 registry（npm/PyPI/HuggingFace）确认给定名称是否真实存在，' +
        '并抽取注册时间、版本数、下载量等信号，用于发现幻觉包名抢注（slopsquatting）或仿冒知名包。' +
        '只读查询，不安装、不发布。命中的可疑信号（注册过新/下载量极低/名称近似知名包）是线索，非确证。',
      inputSchema: {
        name: z.string().describe('包名或模型名，如 "left-pad" 或 "bert-base-uncased"'),
        ecosystem: z.enum(['npm', 'pypi', 'huggingface']).describe('目标生态：npm、pypi 或 huggingface'),
      },
    },
    async ({ name, ecosystem }) => {
      if (ecosystem === 'npm') {
        const { evidence, body } = await deps.probe(`https://registry.npmjs.org/${encodeURIComponent(name)}`, 'GET')
        const exists = evidence.status === 200
        const parsed = exists ? safeJson(body) : undefined
        const signals: Record<string, unknown> = {}
        if (parsed && typeof parsed === 'object') {
          const o = parsed as Record<string, unknown>
          const time = o.time as Record<string, unknown> | undefined
          if (time && typeof time.created === 'string') signals.created = time.created
          const versions = o.versions as Record<string, unknown> | undefined
          if (versions && typeof versions === 'object') signals.versionCount = Object.keys(versions).length
          const distTags = o['dist-tags'] as Record<string, unknown> | undefined
          if (distTags && typeof distTags.latest === 'string') signals.latest = distTags.latest
        }
        return text({
          ecosystem,
          name,
          exists,
          signals,
          note: '注册过新/下载量极低/名称近似知名包 = 可疑线索，非确证；404 可能是幻觉包名或抢注目标。',
          evidence,
        })
      }

      if (ecosystem === 'pypi') {
        const { evidence, body } = await deps.probe(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, 'GET')
        const exists = evidence.status === 200
        const parsed = exists ? safeJson(body) : undefined
        const signals: Record<string, unknown> = {}
        if (parsed && typeof parsed === 'object') {
          const o = parsed as Record<string, unknown>
          const info = o.info as Record<string, unknown> | undefined
          if (info && typeof info.version === 'string') signals.latest = info.version
          const releases = o.releases as Record<string, unknown> | undefined
          if (releases && typeof releases === 'object') signals.releaseCount = Object.keys(releases).length
        }
        return text({
          ecosystem,
          name,
          exists,
          signals,
          note: '注册过新/下载量极低/名称近似知名包 = 可疑线索，非确证；404 可能是幻觉包名或抢注目标。',
          evidence,
        })
      }

      // huggingface
      const { evidence, body } = await deps.probe(`https://huggingface.co/api/models/${encodeURIComponent(name)}`, 'GET')
      const exists = evidence.status === 200
      const parsed = exists ? safeJson(body) : undefined
      const signals: Record<string, unknown> = {}
      if (parsed && typeof parsed === 'object') {
        const o = parsed as Record<string, unknown>
        if (typeof o.downloads === 'number') signals.downloads = o.downloads
        if (typeof o.likes === 'number') signals.likes = o.likes
        if (typeof o.createdAt === 'string') signals.createdAt = o.createdAt
      }
      return text({
        ecosystem,
        name,
        exists,
        signals,
        note: '注册过新/下载量极低/名称近似知名包 = 可疑线索，非确证；404 可能是幻觉模型名或抢注目标。',
        evidence,
      })
    },
  )
}
