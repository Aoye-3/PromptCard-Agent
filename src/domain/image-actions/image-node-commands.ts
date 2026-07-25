import type {
  ImageOperationAvailability,
  ImageOperationDisabledReason
} from './image-operation-readiness'
import type { ImageOperationQualityStatus, ImageProductOperation } from './image-operations'

export type ImageNodeCommandSurface = 'toolbar' | 'more' | 'context' | 'shortcut'
export type ImageNodeCommandId =
  | 'copy'
  | 'duplicate'
  | 'delete'
  | 'zoom-selection'
  | 'layer-up'
  | 'bring-front'
  | 'layer-down'
  | 'send-back'
  | 'flip-horizontal'
  | 'flip-vertical'
  | 'as-reference'
  | 'effect-render'
  | 'region-redraw'
  | 'outpaint'
  | 'multi-view'
  | 'erase'
  | 'subject-extract'
  | 'text-edit'
  | 'enhance'
  | 'crop'
  | 'annotate'
  | 'copy-visible'
  | 'export-visible'
  | 'download-original'

export interface ImageNodeCommandDefinition {
  id: ImageNodeCommandId
  label: string
  surfaces: readonly ImageNodeCommandSurface[]
  shortcut?: string
  operation?: ImageProductOperation
}

export type ImageCommandTarget =
  | {
      nodeKind: 'image'
      count: number
      assetId: string | null
      generationState: 'ready' | 'running' | 'failed'
      source: 'upload' | 'generated'
    }
  | {
      nodeKind: 'document' | 'other'
      count: number
    }

export interface ResolvedImageNodeCommand extends ImageNodeCommandDefinition {
  enabled: boolean
  disabledReason: ImageOperationDisabledReason | null
  qualityStatus: ImageOperationQualityStatus | null
}

export const imageNodeCommandDefinitions: readonly ImageNodeCommandDefinition[] = [
  { id: 'copy', label: '复制', surfaces: ['context', 'shortcut'], shortcut: 'Ctrl+C' },
  { id: 'copy-visible', label: '复制所见图片', surfaces: ['context'] },
  { id: 'duplicate', label: '创建副本', surfaces: ['context', 'shortcut'], shortcut: 'Ctrl+D' },
  { id: 'delete', label: '删除', surfaces: ['context', 'shortcut'], shortcut: 'Backspace' },
  { id: 'zoom-selection', label: '缩放到选中内容', surfaces: ['context'], shortcut: 'Shift+1' },
  { id: 'layer-up', label: '向上移一层', surfaces: ['context', 'shortcut'], shortcut: 'Ctrl+]' },
  { id: 'bring-front', label: '置顶', surfaces: ['context', 'shortcut'], shortcut: 'Ctrl+Alt+]' },
  { id: 'layer-down', label: '向下移一层', surfaces: ['context', 'shortcut'], shortcut: 'Ctrl+[' },
  { id: 'send-back', label: '置底', surfaces: ['context', 'shortcut'], shortcut: 'Ctrl+Alt+[' },
  { id: 'flip-horizontal', label: '水平翻转', surfaces: ['context'] },
  { id: 'flip-vertical', label: '垂直翻转', surfaces: ['context'] },
  {
    id: 'as-reference',
    label: '作为参考',
    surfaces: ['toolbar', 'context'],
    operation: 'reference-generate'
  },
  {
    id: 'effect-render',
    label: '效果图',
    surfaces: ['toolbar', 'context'],
    operation: 'effect-render'
  },
  {
    id: 'region-redraw',
    label: '局部编辑',
    surfaces: ['toolbar', 'more', 'context'],
    operation: 'region-redraw'
  },
  {
    id: 'outpaint',
    label: '扩图',
    surfaces: ['toolbar', 'more', 'context'],
    operation: 'outpaint'
  },
  {
    id: 'multi-view',
    label: '多角度',
    surfaces: ['toolbar', 'context'],
    operation: 'multi-view'
  },
  {
    id: 'erase',
    label: '消除',
    surfaces: ['more', 'context'],
    operation: 'erase'
  },
  {
    id: 'subject-extract',
    label: '主体提取',
    surfaces: ['more', 'context'],
    operation: 'subject-extract'
  },
  {
    id: 'text-edit',
    label: '文字修改',
    surfaces: ['more', 'context'],
    operation: 'text-edit'
  },
  {
    id: 'enhance',
    label: '画质增强',
    surfaces: ['more', 'context'],
    operation: 'upscale'
  },
  { id: 'crop', label: '裁切', surfaces: ['more', 'context'] },
  { id: 'annotate', label: '标注', surfaces: ['more', 'context'] },
  { id: 'export-visible', label: '下载所见图片', surfaces: ['toolbar', 'context'] },
  { id: 'download-original', label: '下载原图', surfaces: ['context'] }
]

export const resolveImageNodeCommands = ({
  target,
  operationAvailability
}: {
  target: ImageCommandTarget
  operationAvailability: Partial<Record<ImageProductOperation, ImageOperationAvailability>>
}): ResolvedImageNodeCommand[] => {
  if (
    target.nodeKind !== 'image'
    || target.count !== 1
    || target.generationState !== 'ready'
    || !target.assetId
  ) {
    return []
  }

  return imageNodeCommandDefinitions.map(definition => {
    const availability = definition.operation
      ? operationAvailability[definition.operation]
      : null
    return {
      ...definition,
      enabled: definition.operation ? availability?.enabled === true : true,
      disabledReason: definition.operation
        ? availability
          ? availability.reason
          : 'not_implemented'
        : null,
      qualityStatus: definition.operation
        ? availability?.qualityStatus || null
        : null
    }
  })
}
