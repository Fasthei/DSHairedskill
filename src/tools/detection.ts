/**
 * detection 工具模块（检测与规避 + 目标环境监控栈 ELK）。
 * 用途：攻击/探测动作之后，回查 ELK（Elasticsearch/Kibana）里是否有对应的检测记录或告警，
 * 判断行动是否已被防御侧发现。只读查询，不做任何写入或破坏操作。面向用户授权目标。
 * @module @dshaired/mcp-toolbox/tools/detection
 */
import { z } from 'zod'
import { resolveUrl, safeJson } from '../http.js'
import type { RegisterTools } from '../types.js'

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export const registerDetectionTools: RegisterTools = (server, deps) => {
  server.registerTool(
    'query_elk',
    {
      description:
        'ELK 检测查询：查询 Elasticsearch 索引，看攻击/探测动作是否触发了检测记录或告警。' +
        '给 body 则以原始 JSON 查询体 POST /_search；否则以 q（Lucene 查询串）+ size 做 GET /_search。命中是线索，非确证。',
      inputSchema: {
        esUrl: z.string().describe('Elasticsearch 基址，如 http://host:9200'),
        index: z.string().default('_all').describe('目标索引，默认 _all'),
        q: z.string().optional().describe('Lucene 查询串，如 "alert.severity:high"'),
        body: z.string().optional().describe('原始 JSON 查询体（Query DSL），给定后优先于 q，POST 发送'),
        size: z.number().default(20).describe('返回命中数量上限'),
      },
    },
    async ({ esUrl, index, q, body, size }) => {
      const result = body
        ? await deps.probe(resolveUrl(esUrl, `/${index}/_search`), 'POST', {
            body,
            headers: { 'content-type': 'application/json' },
          })
        : await deps.probe(
            resolveUrl(esUrl, `/${index}/_search?size=${size}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
            'GET',
          )

      const { evidence, body: respBody } = result
      const parsed = safeJson(respBody)
      if (!parsed || typeof parsed !== 'object') {
        return text({ found: false, note: '响应非 JSON 或解析失败', evidence })
      }

      const doc = parsed as Record<string, unknown>
      const hitsObj = doc.hits && typeof doc.hits === 'object' ? (doc.hits as Record<string, unknown>) : undefined
      const rawHits = hitsObj && Array.isArray(hitsObj.hits) ? hitsObj.hits : []
      const hits = rawHits
        .filter((h): h is Record<string, unknown> => h != null && typeof h === 'object')
        .map((h) => ({ _index: h._index, _id: h._id, _source: h._source }))

      return text({
        total: hitsObj?.total,
        hits,
        evidence,
      })
    },
  )
}
