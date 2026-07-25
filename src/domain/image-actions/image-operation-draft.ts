import type { ImageGenerationComposerDraft } from '@/domain/image-generation/project-conversation'
import type { ResolvedCanvasImageInput } from '@/domain/image-generation/canvas-image-input'
import type {
  ImageOperationRecipeSnapshot,
  ImageProductOperation
} from './image-operations'

export type ImageReferenceRole = 'identity' | 'style' | 'material' | 'layout' | 'content'

export interface ImageOperationReference {
  referenceId: string
  assetId: string
  sourceAssetId?: string
  label: string
  role: ImageReferenceRole
  order: number
}

export interface ImageOperationDraft {
  operation: ImageProductOperation
  source: ResolvedCanvasImageInput
  prompt: string
  presetId: string
  preservationIntents: string[]
  references: ImageOperationReference[]
  resolution: string
  aspectRatio: string
  region?: { type: 'point'; x: number; y: number } | { type: 'bbox'; x1: number; y1: number; x2: number; y2: number }
  operationGroupId?: string
  operationItemId?: string
  viewSpec?: string
}

export interface ImageOperationModelBinding {
  connectionId: string
  modelId: string
  outputFormat: 'png' | 'jpeg'
  watermark: boolean
  promptOptimization: 'standard' | 'fast'
}

export const compileImageOperationDraft = (
  draft: ImageOperationDraft,
  binding: ImageOperationModelBinding
): ImageGenerationComposerDraft => {
  const sourceReferenceId = `source-${draft.source.nodeId}`
  const references = [...draft.references].sort((left, right) => left.order - right.order)
  const prompt = [
    operationInstruction(draft.operation, draft.presetId, draft.viewSpec),
    draft.prompt.trim(),
    ...references.map((reference, index) => (
      `参考图 ${index + 1}（${reference.label}）的应用用途是“${reference.role}”；请按该用途理解，但不要把它当作硬性参数。`
    )),
    draft.preservationIntents.length > 0
      ? `尽量保留：${draft.preservationIntents.join('、')}。`
      : ''
  ].filter(Boolean).join('\n')

  const operation = operationSnapshot(draft)
  return {
    promptDocument: { version: 1, segments: [{ type: 'text', text: prompt }] },
    workflow: operationWorkflow(draft.operation, Boolean(draft.region)),
    connectionId: binding.connectionId,
    modelId: binding.modelId,
    resolution: draft.resolution,
    aspectRatio: draft.aspectRatio,
    promptOptimization: binding.promptOptimization,
    outputFormat: binding.outputFormat,
    watermark: binding.watermark,
    inputs: [
      {
        referenceId: sourceReferenceId,
        assetId: draft.source.providerAssetId,
        sourceAssetId: draft.source.originalAssetId,
        order: 0,
        role: draft.operation === 'reference-generate' ? 'reference-image' : 'source-image',
        label: '当前画布图片'
      },
      ...references.map((reference, index) => ({
        referenceId: reference.referenceId,
        assetId: reference.assetId,
        ...(reference.sourceAssetId ? { sourceAssetId: reference.sourceAssetId } : {}),
        order: index + 1,
        role: 'reference-image' as const,
        label: reference.label
      }))
    ],
    regions: draft.region
      ? [draft.region.type === 'point'
          ? { type: 'point', referenceId: sourceReferenceId, x: draft.region.x, y: draft.region.y }
          : {
              type: 'bbox',
              referenceId: sourceReferenceId,
              x1: draft.region.x1,
              y1: draft.region.y1,
              x2: draft.region.x2,
              y2: draft.region.y2
            }]
      : [],
    operation
  }
}

export const imageOperationBlockingIssues = (
  draft: ImageOperationDraft,
  maximumInputs: number
): string[] => {
  const issues: string[] = []
  if (!draft.prompt.trim() && draft.operation !== 'upscale') issues.push('请描述希望得到的结果。')
  if (draft.references.length + 1 > maximumInputs) issues.push(`当前模型最多接受 ${maximumInputs} 张图片输入。`)
  if (requiresRegion(draft.operation) && !draft.region) issues.push('请在源图上点选或框选目标区域。')
  return issues
}

export const requiresRegion = (operation: ImageProductOperation): boolean => (
  operation === 'region-redraw' || operation === 'erase' || operation === 'text-edit'
)

const operationSnapshot = (draft: ImageOperationDraft): ImageOperationRecipeSnapshot => ({
  operation: draft.operation,
  recipeId: recipeId(draft.operation, draft.presetId),
  recipeVersion: '1',
  source: {
    nodeId: draft.source.nodeId,
    originalAssetId: draft.source.originalAssetId,
    canvasAssetId: draft.source.canvasAssetId,
    providerAssetId: draft.source.providerAssetId
  },
  preservationIntents: [...draft.preservationIntents],
  parameters: {
    preset: draft.presetId,
    referenceRoles: [...draft.references]
      .sort((left, right) => left.order - right.order)
      .map(reference => `${reference.referenceId}:${reference.role}`),
    ...(draft.region ? { regionType: draft.region.type } : {})
  },
  ...(draft.operationGroupId ? { operationGroupId: draft.operationGroupId } : {}),
  ...(draft.operationItemId ? { operationItemId: draft.operationItemId } : {}),
  ...(draft.viewSpec ? { viewSpec: draft.viewSpec } : {})
})

const operationWorkflow = (
  operation: ImageProductOperation,
  hasRegion: boolean
): ImageGenerationComposerDraft['workflow'] => {
  if (hasRegion && requiresRegion(operation)) return 'region-edit'
  if (operation === 'reference-generate') return 'reference-generate'
  return 'smart-edit'
}

const recipeId = (operation: ImageProductOperation, presetId: string): string => (
  `${operation}/${presetId || 'default'}`
)

const operationInstruction = (
  operation: ImageProductOperation,
  presetId: string,
  viewSpec?: string
): string => {
  if (operation === 'reference-generate') return '以当前图片为创作参考，生成新的图片，不覆盖源图。'
  if (operation === 'effect-render') return `把当前图转化为可呈现的效果图。效果类型：${presetId || '通用效果图'}。`
  if (operation === 'region-redraw') return '只修改点选或框选区域，区域外内容尽量保持不变。'
  if (operation === 'erase') return '移除所选区域内的对象，并根据周围内容自然补全背景。'
  if (operation === 'outpaint') return '扩展当前画面边界，并保持主体、透视、光照与画面风格连贯。'
  if (operation === 'text-edit') return '仅替换所选区域中的文字，尽量保持原排版、字号、颜色与材质。'
  if (operation === 'multi-view') return `根据同一主体推断新的观察角度：${viewSpec || '指定角度'}。这不是精确 3D 重建。`
  if (operation === 'upscale') return '进行生成式高分辨率重绘，尽量保持主体、构图与材质，不承诺逐像素不变。'
  if (operation === 'subject-extract') return '突出主体并重绘为干净的纯色背景效果图；不要声称输出透明抠图。'
  return '根据指令编辑当前图片并生成新结果。'
}
