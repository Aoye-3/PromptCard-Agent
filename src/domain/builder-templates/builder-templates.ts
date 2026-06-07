import type { IPromptProject } from '@/models/PromptHistory.model'

export type BuilderTemplateId = 'free-canvas' | 'card' | 'storyboard' | 'three-stage'
export type BuilderTemplateProjectType = IPromptProject['type']

export interface BuilderModeModule {
  id: string
  label: string
  description: string
  children?: readonly BuilderModeModule[]
}

export interface BuilderTemplate {
  id: BuilderTemplateId
  projectType: BuilderTemplateProjectType
  title: string
  shortTitle: string
  description: string
  defaultTitlePrefix: string
  accentClassName: string
  capabilities: string[]
  modules: readonly BuilderModeModule[]
}

export interface BuilderTemplatePage {
  page: number
  pageCount: number
  pageSize: number
  templates: BuilderTemplate[]
  total: number
}

export const BUILDER_TEMPLATES: readonly BuilderTemplate[] = [
  {
    id: 'free-canvas',
    projectType: 'three-stage',
    title: '自由画布式构建',
    shortTitle: '自由画布',
    description: '在自由画布中节点化组织三段式提示词，并预留图片、文字、箭头和媒体组合节点。',
    defaultTitlePrefix: '自由画布项目',
    accentClassName: 'text-violet-500 border-violet-200 bg-violet-50',
    capabilities: ['自由画布', '媒体节点', 'Agent 植入'],
    modules: [
      {
        id: 'free-canvas-three-stage-nodes',
        label: '三段式节点画布',
        description: '把人物板、故事板和视频提示词映射为可拖拽节点，保持三段式数据为真源。',
        children: [
          { id: 'free-canvas-media-layer', label: '自建媒体层', description: '管理图片、文字、箭头和组合节点，不引入 tldraw 生产依赖。' },
          { id: 'free-canvas-agent-rail', label: '固定 Agent 协作', description: '右侧悬浮 Agent 根据当前节点植入内容。' }
        ]
      }
    ]
  },
  {
    id: 'card',
    projectType: 'card',
    title: '卡片式提示词构建',
    shortTitle: '卡片式',
    description: '用模块化卡片组织主体、动作、场景、风格、镜头、灯光、音频和约束。',
    defaultTitlePrefix: '未命名项目',
    accentClassName: 'text-amber-500 border-amber-200 bg-amber-50',
    capabilities: ['分页卡片', '预设注入', 'Agent 协作'],
    modules: [
      {
        id: 'card-page-stack',
        label: '分页卡片工作区',
        description: '管理页面、卡片顺序和卡片选中状态。',
        children: [
          { id: 'card-fields', label: '结构化卡片字段', description: '维护标题、自定义内容和卡片类型。' },
          { id: 'card-prompt-injection', label: '提示词注入适配器', description: '把通用预设注入到当前卡片、新卡片或替换目标。' }
        ]
      },
      { id: 'card-agent-adapter', label: 'Agent 协作适配器', description: '把 Agent 提案转换为卡片创建或卡片更新。' }
    ]
  },
  {
    id: 'storyboard',
    projectType: 'storyboard',
    title: '分镜表单式构建',
    shortTitle: '分镜表单',
    description: '按镜头序列管理镜头字段、全局风格和生成约束。',
    defaultTitlePrefix: '分镜项目',
    accentClassName: 'text-blue-500 border-blue-200 bg-blue-50',
    capabilities: ['镜头序列', '字段表单', 'Agent 细节'],
    modules: [
      {
        id: 'storyboard-sequence-stack',
        label: '镜头序列模块',
        description: '维护分镜序列、镜头行和当前镜头选择。',
        children: [
          { id: 'storyboard-row-fields', label: '镜头字段模块', description: '维护主体、动作、场景、镜头、灯光、音频和时长字段。' },
          { id: 'storyboard-agent-detail', label: 'Agent 细节模块', description: '围绕单镜头打开可复用的 Agent 细节工作区。' }
        ]
      }
    ]
  },
  {
    id: 'three-stage',
    projectType: 'three-stage',
    title: '三阶段提示词构建',
    shortTitle: '三阶段',
    description: '并列维护人物板、故事板和视频生成提示词，适合分阶段推进。',
    defaultTitlePrefix: '三段式项目',
    accentClassName: 'text-emerald-500 border-emerald-200 bg-emerald-50',
    capabilities: ['三段结构', '字段注入', '聚焦编辑'],
    modules: [
      {
        id: 'three-stage-section-stack',
        label: '三阶段区段模块',
        description: '维护人物板、故事板和视频提示词三个独立区段。',
        children: [
          { id: 'three-stage-field-editor', label: '字段编辑模块', description: '维护每个字段的聚焦、追加和替换。' },
          { id: 'three-stage-prompt-injection', label: '字段级提示词注入适配器', description: '复用通用注入面板，仅暴露字段可用动作。' }
        ]
      }
    ]
  }
] as const

export const getBuilderTemplates = (): readonly BuilderTemplate[] => BUILDER_TEMPLATES

export const getBuilderTemplateById = (id: BuilderTemplateId): BuilderTemplate => {
  const template = BUILDER_TEMPLATES.find(item => item.id === id)
  if (!template) {
    throw new Error(`Unknown builder template: ${id}`)
  }
  return template
}

export const getBuilderTemplateModules = (id: BuilderTemplateId): readonly BuilderModeModule[] =>
  getBuilderTemplateById(id).modules

export const getBuilderTemplatePage = (page: number, pageSize = 2): BuilderTemplatePage => {
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const pageCount = Math.max(1, Math.ceil(BUILDER_TEMPLATES.length / safePageSize))
  const safePage = Math.min(Math.max(1, Math.floor(page)), pageCount)
  const start = (safePage - 1) * safePageSize

  return {
    page: safePage,
    pageCount,
    pageSize: safePageSize,
    templates: BUILDER_TEMPLATES.slice(start, start + safePageSize),
    total: BUILDER_TEMPLATES.length
  }
}

export const createBuilderTemplateProjectTitle = (
  template: BuilderTemplate,
  existingProjects: readonly Pick<IPromptProject, 'type'>[]
): string => {
  const sameTypeCount = existingProjects.filter(project => project.type === template.projectType).length
  return `${template.defaultTitlePrefix} ${sameTypeCount + 1}`
}
