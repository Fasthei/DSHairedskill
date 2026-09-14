import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ProjectService from '../src/index.ts'

describe('@dshaired/project 最小可加载插件', () => {
  it('能被 Cordis 加载并把 project 服务注册到 ctx 上', async () => {
    const ctx = new Context()
    await ctx.plugin(ProjectService, { name: 'demo' })

    expect(ctx.project).toBeInstanceOf(ProjectService)
    expect(ctx.project.projectName).toBe('demo')
    expect(ctx.project.name).toBe('project')
  })

  it('缺省 config 时用 schema 默认值', async () => {
    const ctx = new Context()
    // @ts-expect-error 故意不传 name，交给 static Config 的 default 填充
    await ctx.plugin(ProjectService, {})

    expect(ctx.project.projectName).toBe('untitled')
  })
})

describe('@dshaired/project 项目/上下文模型（PROJECT-01）', () => {
  it('未初始化清单时 manifest 为 undefined，且增量操作全部拒绝', async () => {
    const ctx = new Context()
    await ctx.plugin(ProjectService, { name: 'demo' })

    expect(ctx.project.manifest).toBeUndefined()
    expect(() => ctx.project.addMaterial({ sourceType: 'user-note', locator: 'note://1' })).toThrow(
      '项目清单未初始化',
    )
  })

  it('initManifest 建立清单，读取返回的是快照（外部修改不影响内部状态）', async () => {
    const ctx = new Context()
    await ctx.plugin(ProjectService, { name: 'demo' })

    const manifest = ctx.project.initManifest({ goal: '评估内部客服 Agent 的越权风险', inScope: ['agent-x'] })
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.scope.goal).toBe('评估内部客服 Agent 的越权风险')
    expect(manifest.materials).toEqual([])

    manifest.scope.inScope.push('不应该生效的目标')
    expect(ctx.project.manifest?.scope.inScope).toEqual(['agent-x'])
  })

  it('材料缺失时不能当作事实：观察必须关联已登记材料，否则报错', async () => {
    const ctx = new Context()
    await ctx.plugin(ProjectService, { name: 'demo' })
    ctx.project.initManifest({ goal: 'g' })

    expect(() => ctx.project.addObservation({ summary: '发现越权响应', materialRefIds: ['不存在的id'] })).toThrow(
      '引用了不存在的材料',
    )
    expect(() => ctx.project.addObservation({ summary: '发现越权响应', materialRefIds: [] })).toThrow(
      '必须至少关联一条材料引用',
    )
  })

  it('新建、读取、增量更新可用的完整链路：材料 -> 观察 -> 假设 -> 信任关系 -> Swarm 任务', async () => {
    const ctx = new Context()
    await ctx.plugin(ProjectService, { name: 'demo' })
    ctx.project.initManifest({ goal: '评估内部客服 Agent 的越权风险' })

    const material = ctx.project.addMaterial({
      sourceType: 'user-note',
      locator: 'local://transcripts/session-1.log',
      description: '用户提供的会话记录',
    })

    const observation = ctx.project.addObservation({
      summary: '会话记录显示 Agent 在拒绝时透露了工具存在',
      materialRefIds: [material.id],
    })

    const hypothesis = ctx.project.addHypothesis({
      statement: 'Agent 的拒绝话术会泄露受限工具的存在性',
      confidence: 0.4,
      supportingObservationIds: [observation.id],
    })
    expect(hypothesis.status).toBe('open')

    const updated = ctx.project.updateHypothesis(hypothesis.id, { confidence: 0.8, status: 'confirmed' })
    expect(updated.confidence).toBe(0.8)
    expect(updated.status).toBe('confirmed')

    const trust = ctx.project.addTrustRelationship({
      from: 'agent-x',
      to: 'internal-order-api',
      kind: 'authenticates-as',
      basisIds: [observation.id],
    })
    expect(trust.kind).toBe('authenticates-as')

    const link = ctx.project.linkSwarmTask({ taskId: 'swarm-task-1', status: 'running' })
    expect(link.status).toBe('running')
    const relinked = ctx.project.updateSwarmTaskStatus('swarm-task-1', 'completed')
    expect(relinked.status).toBe('completed')
    expect(() => ctx.project.linkSwarmTask({ taskId: 'swarm-task-1', status: 'running' })).toThrow('已关联')

    const manifest = ctx.project.manifest!
    expect(manifest.materials).toHaveLength(1)
    expect(manifest.observations).toHaveLength(1)
    expect(manifest.hypotheses).toHaveLength(1)
    expect(manifest.trustRelationships).toHaveLength(1)
    expect(manifest.swarmTasks).toHaveLength(1)
  })

  it('置信度必须在 [0,1] 区间；假设必须关联已存在的观察', async () => {
    const ctx = new Context()
    await ctx.plugin(ProjectService, { name: 'demo' })
    ctx.project.initManifest({ goal: 'g' })
    const material = ctx.project.addMaterial({ sourceType: 'user-note', locator: 'note://1' })
    const observation = ctx.project.addObservation({ summary: 'o', materialRefIds: [material.id] })

    expect(() =>
      ctx.project.addHypothesis({ statement: 'x', confidence: 1.5, supportingObservationIds: [observation.id] }),
    ).toThrow('confidence 必须在 [0, 1] 区间内')
    expect(() =>
      ctx.project.addHypothesis({ statement: 'x', confidence: 0.5, supportingObservationIds: ['不存在'] }),
    ).toThrow('引用了不存在的观察')
  })

  it('loadManifest 明确处理版本：不支持的 schemaVersion 一律拒绝，不做隐式迁移', async () => {
    const ctx = new Context()
    await ctx.plugin(ProjectService, { name: 'demo' })

    expect(() => ctx.project.loadManifest({ schemaVersion: 999, scope: { goal: 'g' } })).toThrow(
      '不支持的清单 schemaVersion',
    )

    const restored = ctx.project.loadManifest({
      schemaVersion: 1,
      scope: { goal: '恢复的项目', inScope: [], outOfScope: [] },
      materials: [],
      observations: [],
      hypotheses: [],
      trustRelationships: [],
      swarmTasks: [],
    })
    expect(restored.scope.goal).toBe('恢复的项目')
  })
})
