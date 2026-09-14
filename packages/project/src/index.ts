/**
 * @dshaired/project — DSHAIred 项目与上下文插件。
 *
 * 采用 DSH 上游已核实的 Cordis 插件契约（BASE-02）：
 * 一个 `Service` 子类，`static Config` 用 schemastery 声明配置，构造时
 * `super(ctx, '<serviceKey>')` 把自身注册到 Context 上；`declare module`
 * 扩展 `Context` 类型。
 *
 * PROJECT-01：在 BASE-03 骨架之上补充项目/上下文最小模型——目标范围、
 * 材料引用、观察、假设（含置信度）、信任关系、本地项目与 Swarm 后台任务的
 * 关联。原始证据的存储与类型归 evidence-report 插件所有；这里只保存
 * “引用”（来源标识 + 定位符），不保存证据内容本身，避免材料缺失被当作事实。
 *
 * @module @dshaired/project
 */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Context {
    project: ProjectService
  }
}

export interface ProjectConfig {
  /** 当前项目标识。 */
  name: string
}

/** 当前项目清单的 schema 版本。变更结构时递增，并在 loadManifest 中明确处理旧版本。 */
export const PROJECT_MANIFEST_SCHEMA_VERSION = 1

/** 目标范围：任务边界，避免模型擅自扩大或缩小测试对象。 */
export interface ProjectScope {
  /** 本次测试的目标说明。 */
  goal: string
  /** 明确在范围内的对象（系统、账号、域名等）。 */
  inScope: string[]
  /** 明确排除的对象；与 inScope 冲突时以 outOfScope 为准。 */
  outOfScope: string[]
}

/**
 * 材料引用：只记录“材料在哪里”，不复制材料内容。
 * 原始证据内容与取证由 evidence-report 拥有；project 只维护指向它的引用。
 */
export interface MaterialReference {
  id: string
  /** 材料来源类型；开放字符串，允许业务侧扩展，不限定固定枚举。 */
  sourceType: 'local-file' | 'url' | 'user-note' | 'swarm-artifact' | (string & {})
  /** 定位符：本地路径、URL 或远端产物标识，不内嵌具体凭据。 */
  locator: string
  description?: string
  addedAt: string
}

/** 观察：对材料的客观描述，必须关联到至少一条已登记的材料引用。 */
export interface Observation {
  id: string
  summary: string
  /** 支撑该观察的材料引用 id；缺失材料的观察不可信，因此强制校验存在性。 */
  materialRefIds: string[]
  recordedAt: string
}

export type HypothesisStatus = 'open' | 'confirmed' | 'rejected'

/** 假设：基于观察推导出的待验证判断，附带置信度，不等同于已验证发现。 */
export interface Hypothesis {
  id: string
  statement: string
  /** 置信度，0–1 闭区间；不是发现状态，已验证发现的证据链归 evidence-report。 */
  confidence: number
  status: HypothesisStatus
  /** 支撑该假设的观察 id；缺失观察的假设视为凭空推测，予以拒绝。 */
  supportingObservationIds: string[]
  createdAt: string
  updatedAt: string
}

/** 信任关系：范围内实体之间的信任/依赖边，用于攻击路径分析。 */
export interface TrustRelationship {
  id: string
  from: string
  to: string
  /** 关系类型，开放字符串（如 authenticates-as、network-reachable、shares-credential）。 */
  kind: string
  /** 支撑该关系判断的观察或材料引用 id，不可为空——信任关系不能凭空断言。 */
  basisIds: string[]
  notes?: string
  createdAt: string
}

/** 本地项目与 Swarm 后台任务的关联；状态原样保留 Swarm 侧状态字符串，不在本地发明新状态。 */
export interface SwarmTaskLink {
  taskId: string
  status: string
  linkedAt: string
  updatedAt: string
  notes?: string
}

export interface ProjectManifest {
  schemaVersion: number
  scope: ProjectScope
  materials: MaterialReference[]
  observations: Observation[]
  hypotheses: Hypothesis[]
  trustRelationships: TrustRelationship[]
  swarmTasks: SwarmTaskLink[]
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`@dshaired/project: ${message}`)
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 生成内部 id。不依赖 `node:crypto`/`crypto` 全局（本包未声明 @types/node），
 * 仅用于清单内部条目标识，不作为安全凭据。
 */
let idSequence = 0
function generateId(): string {
  idSequence += 1
  return `${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 深拷贝清单。清单只包含 JSON 安全的字段，用 JSON 序列化即可，不依赖 structuredClone 全局。 */
function cloneManifest(manifest: ProjectManifest): ProjectManifest {
  return JSON.parse(JSON.stringify(manifest)) as ProjectManifest
}

export class ProjectService extends Service {
  static Config: z<ProjectConfig> = z.object({
    name: z.string().default('untitled'),
  })

  /** 项目标识（避免与 Service 自身的服务名字段冲突，另用独立字段）。 */
  readonly projectName: string

  private _manifest: ProjectManifest | undefined

  constructor(ctx: Context, config: ProjectConfig) {
    super(ctx, 'project')
    this.projectName = config.name
  }

  /** 当前项目清单；未初始化时返回 undefined，不臆造一份空清单当作已确认状态。 */
  get manifest(): ProjectManifest | undefined {
    return this._manifest ? cloneManifest(this._manifest) : undefined
  }

  /** 新建项目清单。重复调用会覆盖现有清单——调用方需自行确认这是预期行为。 */
  initManifest(input: { goal: string; inScope?: string[]; outOfScope?: string[] }): ProjectManifest {
    assert(input.goal.trim().length > 0, 'scope.goal 不能为空')
    this._manifest = {
      schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
      scope: {
        goal: input.goal,
        inScope: [...(input.inScope ?? [])],
        outOfScope: [...(input.outOfScope ?? [])],
      },
      materials: [],
      observations: [],
      hypotheses: [],
      trustRelationships: [],
      swarmTasks: [],
    }
    return this.manifest as ProjectManifest
  }

  /**
   * 从持久化数据恢复清单。版本处理明确：仅接受当前 schema 版本；
   * 更旧/更新的版本一律拒绝，不做隐式迁移，避免用臆测结构覆盖真实数据。
   */
  loadManifest(data: unknown): ProjectManifest {
    assert(typeof data === 'object' && data !== null, '清单数据必须是对象')
    const raw = data as Partial<ProjectManifest>
    assert(
      raw.schemaVersion === PROJECT_MANIFEST_SCHEMA_VERSION,
      `不支持的清单 schemaVersion：${String(raw.schemaVersion)}（当前支持 ${PROJECT_MANIFEST_SCHEMA_VERSION}），拒绝加载以避免用错误结构覆盖数据`,
    )
    assert(raw.scope && typeof raw.scope.goal === 'string', 'scope.goal 缺失')
    this._manifest = {
      schemaVersion: PROJECT_MANIFEST_SCHEMA_VERSION,
      scope: {
        goal: raw.scope.goal,
        inScope: [...(raw.scope.inScope ?? [])],
        outOfScope: [...(raw.scope.outOfScope ?? [])],
      },
      materials: [...(raw.materials ?? [])],
      observations: [...(raw.observations ?? [])],
      hypotheses: [...(raw.hypotheses ?? [])],
      trustRelationships: [...(raw.trustRelationships ?? [])],
      swarmTasks: [...(raw.swarmTasks ?? [])],
    }
    return this.manifest as ProjectManifest
  }

  private requireManifest(): ProjectManifest {
    assert(this._manifest, '项目清单未初始化，请先调用 initManifest')
    return this._manifest as ProjectManifest
  }

  /** 登记一条材料引用（只存来源定位符，不存材料内容）。 */
  addMaterial(input: Omit<MaterialReference, 'id' | 'addedAt'>): MaterialReference {
    const manifest = this.requireManifest()
    assert(input.locator.trim().length > 0, 'locator 不能为空')
    const material: MaterialReference = {
      id: generateId(),
      sourceType: input.sourceType,
      locator: input.locator,
      description: input.description,
      addedAt: nowIso(),
    }
    manifest.materials.push(material)
    return { ...material }
  }

  /** 记录一条观察；必须关联至少一条已登记的材料引用，否则视为无据推测。 */
  addObservation(input: { summary: string; materialRefIds: string[] }): Observation {
    const manifest = this.requireManifest()
    assert(input.summary.trim().length > 0, 'summary 不能为空')
    assert(input.materialRefIds.length > 0, '观察必须至少关联一条材料引用；材料缺失不能当作事实')
    const knownMaterialIds = new Set(manifest.materials.map((m) => m.id))
    for (const id of input.materialRefIds) {
      assert(knownMaterialIds.has(id), `materialRefIds 引用了不存在的材料：${id}`)
    }
    const observation: Observation = {
      id: generateId(),
      summary: input.summary,
      materialRefIds: [...input.materialRefIds],
      recordedAt: nowIso(),
    }
    manifest.observations.push(observation)
    return { ...observation }
  }

  /** 提出一条假设；必须关联至少一条已登记的观察，置信度限定在 [0, 1]。 */
  addHypothesis(input: { statement: string; confidence: number; supportingObservationIds: string[] }): Hypothesis {
    const manifest = this.requireManifest()
    assert(input.statement.trim().length > 0, 'statement 不能为空')
    assert(input.confidence >= 0 && input.confidence <= 1, 'confidence 必须在 [0, 1] 区间内')
    assert(input.supportingObservationIds.length > 0, '假设必须至少关联一条观察；不能凭空断言')
    const knownObservationIds = new Set(manifest.observations.map((o) => o.id))
    for (const id of input.supportingObservationIds) {
      assert(knownObservationIds.has(id), `supportingObservationIds 引用了不存在的观察：${id}`)
    }
    const ts = nowIso()
    const hypothesis: Hypothesis = {
      id: generateId(),
      statement: input.statement,
      confidence: input.confidence,
      status: 'open',
      supportingObservationIds: [...input.supportingObservationIds],
      createdAt: ts,
      updatedAt: ts,
    }
    manifest.hypotheses.push(hypothesis)
    return { ...hypothesis }
  }

  /**
   * 增量更新一条假设的置信度/状态。这是“假设”的置信度调整，不是发现验证——
   * 已验证发现及其证据链归 evidence-report 拥有，project 不重复保存证据。
   */
  updateHypothesis(id: string, patch: { confidence?: number; status?: HypothesisStatus }): Hypothesis {
    const manifest = this.requireManifest()
    const hypothesis = manifest.hypotheses.find((h) => h.id === id)
    assert(hypothesis, `未找到假设：${id}`)
    if (patch.confidence !== undefined) {
      assert(patch.confidence >= 0 && patch.confidence <= 1, 'confidence 必须在 [0, 1] 区间内')
      hypothesis.confidence = patch.confidence
    }
    if (patch.status !== undefined) {
      hypothesis.status = patch.status
    }
    hypothesis.updatedAt = nowIso()
    return { ...hypothesis }
  }

  /** 记录一条信任关系；必须有支撑依据（材料或观察 id），不能凭空断言实体间的信任。 */
  addTrustRelationship(input: { from: string; to: string; kind: string; basisIds: string[]; notes?: string }): TrustRelationship {
    const manifest = this.requireManifest()
    assert(input.from.trim().length > 0 && input.to.trim().length > 0, 'from/to 不能为空')
    assert(input.kind.trim().length > 0, 'kind 不能为空')
    assert(input.basisIds.length > 0, '信任关系必须至少关联一条材料或观察作为依据')
    const knownIds = new Set([
      ...manifest.materials.map((m) => m.id),
      ...manifest.observations.map((o) => o.id),
    ])
    for (const id of input.basisIds) {
      assert(knownIds.has(id), `basisIds 引用了不存在的材料/观察：${id}`)
    }
    const relationship: TrustRelationship = {
      id: generateId(),
      from: input.from,
      to: input.to,
      kind: input.kind,
      basisIds: [...input.basisIds],
      notes: input.notes,
      createdAt: nowIso(),
    }
    manifest.trustRelationships.push(relationship)
    return { ...relationship }
  }

  /** 关联一个本地项目与 Swarm 后台任务；status 原样保存 Swarm 侧状态，不在本地发明新状态。 */
  linkSwarmTask(input: { taskId: string; status: string; notes?: string }): SwarmTaskLink {
    const manifest = this.requireManifest()
    assert(input.taskId.trim().length > 0, 'taskId 不能为空')
    assert(!manifest.swarmTasks.some((t) => t.taskId === input.taskId), `taskId 已关联：${input.taskId}`)
    const ts = nowIso()
    const link: SwarmTaskLink = {
      taskId: input.taskId,
      status: input.status,
      notes: input.notes,
      linkedAt: ts,
      updatedAt: ts,
    }
    manifest.swarmTasks.push(link)
    return { ...link }
  }

  /** 更新已关联 Swarm 任务的状态；status 直接透传 Swarm 侧字符串。 */
  updateSwarmTaskStatus(taskId: string, status: string): SwarmTaskLink {
    const manifest = this.requireManifest()
    const link = manifest.swarmTasks.find((t) => t.taskId === taskId)
    assert(link, `未关联该 taskId：${taskId}`)
    link.status = status
    link.updatedAt = nowIso()
    return { ...link }
  }
}

export default ProjectService
