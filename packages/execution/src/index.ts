/**
 * @dshaired/execution — DSHAIred 执行插件（最小可加载骨架）。
 *
 * 采用 DSH 上游已核实的 Cordis 插件契约（BASE-02，与 packages/project 的骨架
 * 一致）：一个 `Service` 子类，`static Config` 用 schemastery 声明配置，构造时
 * `super(ctx, 'execution')` 把自身注册到 Context 上；`declare module` 扩展 `Context`。
 *
 * 说明：真正的执行“小工具”（HTTP 头指纹、/health、Agent Card、OpenAPI、
 * 401-404 枚举、send_prompt、A2A、MCP 探测、ELK 查询等）已作为 DSH 推荐的
 * MCP server 交付在 `@dshaired/mcp-toolbox`，避免重复实现；本包仅保留一个可被
 * Cordis 加载的最小 execution 服务占位，未来若需 DSH 侧原生 provider 再扩展。
 *
 * @module @dshaired/execution
 */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Context {
    execution: ExecutionService
  }
}

export interface ExecutionConfig {
  /** 能力矩阵标签（对应 README.md 的清点结果版本）。 */
  label: string
}

export class ExecutionService extends Service {
  static Config: z<ExecutionConfig> = z.object({
    label: z.string().default('unassigned'),
  })

  /** 能力矩阵标签（避免与 Service 自身的服务名字段冲突，另用独立字段）。 */
  readonly label: string

  constructor(ctx: Context, config: ExecutionConfig) {
    super(ctx, 'execution')
    this.label = config.label
  }
}

export default ExecutionService
