/**
 * @dshaired/evidence-report — DSHAIred 证据与报告插件（REPORT-01）。
 *
 * 采用与 @dshaired/project（BASE-03）相同的 Cordis 插件契约：一个 `Service`
 * 子类，`static Config` 用 schemastery 声明配置，构造时 `super(ctx, '<serviceKey>')`
 * 注册到 Context 上；`declare module` 扩展 `Context` 类型。
 *
 * 本包只建立"当前交付所需"的最小模型：
 * - 发现（Finding）状态区分 已验证/待验证/未复现/阻塞（FindingStatus）。
 * - 已验证发现必须挂至少一条"发现层级"的证据引用（EvidenceRef），
 *   不允许用工具调用成功或任务完成的证据代替漏洞验证成功（见下方
 *   EvidenceAssertionLevel 的说明），由 addFinding() 在写入时强制校验，
 *   不做事后补造。
 * - 阻塞记录（BlockerRecord）与发现分开维护，阻塞原因与发现状态不互相冒充。
 * - 基础 Markdown 报告输出（toMarkdown），呈现层字段对应
 *   resources/report-templates/basic.md（TEMPLATE-01），但本包不依赖该
 *   模板文件本身——模板只负责呈现，验证规则在本包实现（见两包 README 的边界约定）。
 *
 * 不在本任务范围内（留给后续任务，见 TASKS.md REPORT-02）：
 * - 读取/合并 Swarm 侧生成的阶段报告与产物。
 * - 敏感字段检测、报告持久化、跨报告的证据去重。
 *
 * @module @dshaired/evidence-report
 */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Context {
    evidenceReport: EvidenceReportService
  }
}

/** 发现状态：已验证 / 待验证 / 未复现 / 阻塞。不新增第五种状态。 */
export type FindingStatus = 'verified' | 'unverified' | 'unreproduced' | 'blocked'

/**
 * 证据引用所代表的断言层级——刻意区分三个不同层次，禁止互相替代：
 * - `tool_call_success`：某次工具调用本身执行成功（不代表任务完成，
 *   也不代表任何安全结论）。
 * - `task_completed`：一个任务/步骤按其自身终态完成（不代表其中的
 *   安全假设已被验证）。
 * - `finding_verified`：针对该发现的漏洞/问题验证已经成立，且有可
 *   追溯的原始产物支持。
 *
 * 只有包含 `finding_verified` 层级证据的发现才允许被标记为已验证
 * （见 addFinding 的校验）。
 */
export type EvidenceAssertionLevel = 'tool_call_success' | 'task_completed' | 'finding_verified'

/** 证据引用：指向原始产物的稳定标识，不携带产物正文本身。 */
export interface EvidenceRef {
  /** 证据在本报告内的唯一标识。 */
  id: string
  /** 该证据支持的断言层级。 */
  assertionLevel: EvidenceAssertionLevel
  /** 指向原始产物的稳定标识/路径/URI；产物丢失时由调用方明确标注缺失，不由本包补写。 */
  locator: string
  /** 证据内容的简要说明（例如："HTTP 响应片段"、"命令输出"）。 */
  description: string
  /** 采集时间（ISO 字符串），可选。 */
  capturedAt?: string
}

/** 新增发现时的输入。 */
export interface FindingInput {
  id: string
  title: string
  /** 被测目标（组件/端点/账号等），用于与项目上下文关联。 */
  target: string
  status: FindingStatus
  /** 事实与推测需分开描述，本包不做强制解析，仅保留自由文本字段。 */
  summary: string
  evidenceRefs?: EvidenceRef[]
  /** 状态为 blocked 时的阻塞原因；其余状态可留空。 */
  blockedReason?: string
}

/** 已写入报告的发现（补齐默认值后的只读视图）。 */
export interface Finding {
  readonly id: string
  readonly title: string
  readonly target: string
  readonly status: FindingStatus
  readonly summary: string
  readonly evidenceRefs: readonly EvidenceRef[]
  readonly blockedReason?: string
}

/** 阻塞记录：与具体发现关联的执行/验证阻塞，独立于发现状态维护。 */
export interface BlockerRecord {
  id: string
  description: string
  reason: string
  /** 关联的发现 id，可选（阻塞也可能发生在验证之外，如环境不可用）。 */
  relatedFindingId?: string
}

export interface EvidenceReportConfig {
  /** 报告归属的项目标识，用于渲染报告标题；默认值供最小加载测试使用。 */
  projectName: string
}

/**
 * addFinding 拒绝写入时抛出的错误：状态与证据层级不匹配。
 * 调用方应据此停下确认，而不是自动降级或补造证据。
 */
export class FindingEvidenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FindingEvidenceError'
  }
}

export class EvidenceReportService extends Service {
  static Config: z<EvidenceReportConfig> = z.object({
    projectName: z.string().default('untitled'),
  })

  readonly projectName: string

  private readonly findings: Finding[] = []
  private readonly blockers: BlockerRecord[] = []

  constructor(ctx: Context, config: EvidenceReportConfig) {
    super(ctx, 'evidenceReport')
    this.projectName = config.projectName
  }

  /**
   * 新增一条发现。
   *
   * 校验规则（不可绕过）：
   * - status === 'verified' 时，evidenceRefs 必须非空，且至少包含一条
   *   assertionLevel === 'finding_verified' 的证据——只有工具调用成功
   *   或任务完成的证据不足以判定发现已验证。
   * - status === 'blocked' 时必须提供 blockedReason。
   * - id 不可与已有发现重复。
   */
  addFinding(input: FindingInput): Finding {
    if (this.findings.some((f) => f.id === input.id)) {
      throw new FindingEvidenceError(`发现 id 重复：${input.id}`)
    }

    const evidenceRefs = input.evidenceRefs ?? []

    if (input.status === 'verified') {
      const hasVerification = evidenceRefs.some((e) => e.assertionLevel === 'finding_verified')
      if (!hasVerification) {
        throw new FindingEvidenceError(
          `发现 ${input.id} 标记为已验证，但缺少 assertionLevel 为 finding_verified 的证据引用；` +
            `工具调用成功或任务完成不能代替漏洞验证成功。`,
        )
      }
    }

    if (input.status === 'blocked' && !input.blockedReason) {
      throw new FindingEvidenceError(`发现 ${input.id} 标记为阻塞，但未提供 blockedReason`)
    }

    const finding: Finding = {
      id: input.id,
      title: input.title,
      target: input.target,
      status: input.status,
      summary: input.summary,
      evidenceRefs,
      blockedReason: input.blockedReason,
    }
    this.findings.push(finding)
    return finding
  }

  listFindings(): readonly Finding[] {
    return this.findings
  }

  addBlocker(record: BlockerRecord): BlockerRecord {
    if (this.blockers.some((b) => b.id === record.id)) {
      throw new FindingEvidenceError(`阻塞记录 id 重复：${record.id}`)
    }
    this.blockers.push(record)
    return record
  }

  listBlockers(): readonly BlockerRecord[] {
    return this.blockers
  }

  /**
   * 生成最基础的 Markdown 报告（对应 resources/report-templates/basic.md
   * 的字段布局，但不读取该文件——两者各自维护，模板可被用户替换）。
   * 缺失证据时明确输出"缺失"，不补写为已验证。
   */
  toMarkdown(): string {
    const lines: string[] = []
    lines.push(`# ${this.projectName} 测试报告`)
    lines.push('')
    lines.push('## 发现')
    lines.push('')
    if (this.findings.length === 0) {
      lines.push('（无记录发现）')
    }
    for (const f of this.findings) {
      lines.push(`### ${f.title}（${f.id}）`)
      lines.push(`- 目标：${f.target}`)
      lines.push(`- 状态：${STATUS_LABEL[f.status]}`)
      lines.push(`- 说明：${f.summary}`)
      if (f.status === 'blocked' && f.blockedReason) {
        lines.push(`- 阻塞原因：${f.blockedReason}`)
      }
      if (f.evidenceRefs.length === 0) {
        lines.push('- 证据引用：缺失')
      } else {
        lines.push('- 证据引用：')
        for (const e of f.evidenceRefs) {
          lines.push(`  - [${e.assertionLevel}] ${e.description} → ${e.locator}`)
        }
      }
      lines.push('')
    }
    lines.push('## 阻塞记录')
    lines.push('')
    if (this.blockers.length === 0) {
      lines.push('（无记录阻塞）')
    }
    for (const b of this.blockers) {
      lines.push(`- ${b.description}（原因：${b.reason}${b.relatedFindingId ? `，关联发现：${b.relatedFindingId}` : ''}）`)
    }
    lines.push('')
    return lines.join('\n')
  }
}

const STATUS_LABEL: Record<FindingStatus, string> = {
  verified: '已验证',
  unverified: '待验证',
  unreproduced: '未复现',
  blocked: '阻塞',
}

export default EvidenceReportService
