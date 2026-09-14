import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import EvidenceReportService, { FindingEvidenceError } from '../src/index.ts'

describe('@dshaired/evidence-report 最小可加载插件', () => {
  it('能被 Cordis 加载并把 evidenceReport 服务注册到 ctx 上', async () => {
    const ctx = new Context()
    await ctx.plugin(EvidenceReportService, { projectName: 'demo' })

    expect(ctx.evidenceReport).toBeInstanceOf(EvidenceReportService)
    expect(ctx.evidenceReport.projectName).toBe('demo')
    expect(ctx.evidenceReport.name).toBe('evidenceReport')
  })

  it('缺省 config 时用 schema 默认值', async () => {
    const ctx = new Context()
    // @ts-expect-error 故意不传 projectName，交给 static Config 的 default 填充
    await ctx.plugin(EvidenceReportService, {})

    expect(ctx.evidenceReport.projectName).toBe('untitled')
  })

  it('已验证发现必须挂 finding_verified 层级的证据引用，否则拒绝写入', async () => {
    const ctx = new Context()
    await ctx.plugin(EvidenceReportService, { projectName: 'demo' })

    expect(() =>
      ctx.evidenceReport.addFinding({
        id: 'F-1',
        title: 'SSRF 疑似',
        target: 'internal-api',
        status: 'verified',
        summary: '未提供任何证据',
      }),
    ).toThrow(FindingEvidenceError)

    // 只有工具调用成功/任务完成层级的证据，仍不足以判定已验证
    expect(() =>
      ctx.evidenceReport.addFinding({
        id: 'F-2',
        title: 'SSRF 疑似',
        target: 'internal-api',
        status: 'verified',
        summary: '只有工具调用成功的证据',
        evidenceRefs: [
          { id: 'E-1', assertionLevel: 'tool_call_success', locator: 'artifact://e1', description: '工具输出' },
          { id: 'E-2', assertionLevel: 'task_completed', locator: 'artifact://e2', description: '任务完成日志' },
        ],
      }),
    ).toThrow(FindingEvidenceError)

    const verified = ctx.evidenceReport.addFinding({
      id: 'F-3',
      title: 'SSRF 已确认',
      target: 'internal-api',
      status: 'verified',
      summary: '通过 finding_verified 证据确认',
      evidenceRefs: [
        { id: 'E-3', assertionLevel: 'finding_verified', locator: 'artifact://e3', description: '目标端回显内网响应' },
      ],
    })
    expect(verified.status).toBe('verified')
    expect(ctx.evidenceReport.listFindings()).toHaveLength(1)
  })

  it('待验证/未复现发现不要求证据；阻塞发现必须提供阻塞原因', async () => {
    const ctx = new Context()
    await ctx.plugin(EvidenceReportService, { projectName: 'demo' })

    expect(() =>
      ctx.evidenceReport.addFinding({
        id: 'F-4',
        title: '待复测项',
        target: 'internal-api',
        status: 'unverified',
        summary: '尚未验证',
      }),
    ).not.toThrow()

    expect(() =>
      ctx.evidenceReport.addFinding({
        id: 'F-5',
        title: '阻塞项',
        target: 'internal-api',
        status: 'blocked',
        summary: '环境不可达',
      }),
    ).toThrow(FindingEvidenceError)

    expect(() =>
      ctx.evidenceReport.addFinding({
        id: 'F-6',
        title: '阻塞项',
        target: 'internal-api',
        status: 'blocked',
        summary: '环境不可达',
        blockedReason: '靶场未连接',
      }),
    ).not.toThrow()
  })

  it('toMarkdown 对缺失证据明确标注缺失，不补写为已验证', async () => {
    const ctx = new Context()
    await ctx.plugin(EvidenceReportService, { projectName: 'demo' })

    ctx.evidenceReport.addFinding({
      id: 'F-7',
      title: '未复现项',
      target: 'internal-api',
      status: 'unreproduced',
      summary: '多次尝试未能复现',
    })

    const md = ctx.evidenceReport.toMarkdown()
    expect(md).toContain('未复现项')
    expect(md).toContain('证据引用：缺失')
    expect(md).toContain('# demo 测试报告')
  })
})
