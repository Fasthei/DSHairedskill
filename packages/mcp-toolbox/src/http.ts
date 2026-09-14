/**
 * 共享 HTTP 探测原语。所有工具经它发请求，统一超时、截断与证据格式。
 * 用 Node 全局 fetch；不跟随重定向以如实记录 3xx。面向用户授权目标。
 * @module @dshaired/mcp-toolbox/http
 */
import type { ProbeResult, RawHttpEvidence } from './types.js'

export interface HttpOptions {
  timeoutMs: number
  userAgent: string
  maxBodyBytes: number
}

export const DEFAULT_HTTP: HttpOptions = {
  timeoutMs: 15000,
  userAgent: 'DSHAIred-mcp-toolbox/0.0',
  maxBodyBytes: 65536,
}

/** 单次请求的可选项：请求体与额外头（用于 POST JSON，如 send_prompt / a2a / ELK 查询）。 */
export interface RequestExtra {
  body?: string
  headers?: Record<string, string>
}

function nowIso(): string {
  return new Date().toISOString()
}

/** 发一次 HTTP 请求，返回完整 body 与截断后的证据。失败不抛，记入 evidence.error。 */
export async function probe(url: string, method = 'GET', extra: RequestExtra = {}, opts: HttpOptions = DEFAULT_HTTP): Promise<ProbeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)
  try {
    const resp = await fetch(url, {
      method,
      headers: { 'user-agent': opts.userAgent, ...extra.headers },
      ...extra.body !== undefined ? { body: extra.body } : {},
      redirect: 'manual',
      signal: controller.signal,
    })
    const headers: Record<string, string> = {}
    resp.headers.forEach((value, key) => {
      headers[key] = value
    })
    const body = await resp.text()
    const truncated = Buffer.byteLength(body, 'utf8') > opts.maxBodyBytes
    const bodySnippet = truncated ? Buffer.from(body, 'utf8').subarray(0, opts.maxBodyBytes).toString('utf8') : body
    const evidence: RawHttpEvidence = {
      url,
      method,
      status: resp.status,
      headers,
      bodySnippet,
      bodyTruncated: truncated,
      at: nowIso(),
    }
    return { evidence, body }
  } catch (err) {
    const evidence: RawHttpEvidence = {
      url,
      method,
      status: null,
      headers: {},
      bodySnippet: '',
      bodyTruncated: false,
      error: err instanceof Error ? err.message : String(err),
      at: nowIso(),
    }
    return { evidence, body: '' }
  } finally {
    clearTimeout(timer)
  }
}

export function safeJson(text: string): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function resolveUrl(base: string, path: string): string {
  return new URL(path, base).toString()
}
