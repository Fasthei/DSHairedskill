import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ExecutionService from '../src/index.ts'

describe('@dshaired/execution 最小可加载插件', () => {
  it('能被 Cordis 加载并把 execution 服务注册到 ctx 上', async () => {
    const ctx = new Context()
    await ctx.plugin(ExecutionService, { label: 'exec-01' })

    expect(ctx.execution).toBeInstanceOf(ExecutionService)
    expect(ctx.execution.label).toBe('exec-01')
    expect(ctx.execution.name).toBe('execution')
  })

  it('缺省 config 时用 schema 默认值', async () => {
    const ctx = new Context()
    // @ts-expect-error 故意不传 label，交给 static Config 的 default 填充
    await ctx.plugin(ExecutionService, {})

    expect(ctx.execution.label).toBe('unassigned')
  })
})
