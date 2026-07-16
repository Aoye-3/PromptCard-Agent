import type { ImageGenerationRequest, ImageGenerationRegion } from '@/services/image-generation-client'
import type { ImageGenerationRun } from '@/storage/storage-service-client'
import type { IFreeCanvasNode, PromptDocument } from '@/models/PromptHistory.model'
import { freeCanvasTextSegmentsToPlainText } from '@/domain/free-canvas/free-canvas-project'

export type ProjectImageGenerationWorkflow =
  | 'text-to-image'
  | 'reference-generate'
  | 'smart-edit'
  | 'region-edit'

export interface ProjectImageGenerationInput {
  referenceId: string
  assetId: string
  sourceAssetId?: string
  order: number
  role: 'source-image' | 'reference-image'
  label?: string
}

export interface ImageGenerationComposerDraft {
  promptDocument: PromptDocument
  workflow: ProjectImageGenerationWorkflow
  connectionId: string
  modelId: string
  resolution: string
  aspectRatio: string
  width?: number
  height?: number
  promptOptimization: 'standard' | 'fast'
  outputFormat: 'png' | 'jpeg'
  watermark: boolean
  inputs: ProjectImageGenerationInput[]
  regions: ImageGenerationRegion[]
}

export interface CanvasInjectionResult {
  draft: ImageGenerationComposerDraft
  rejected: Array<{ nodeId: string; reason: string }>
}

export const createEmptyConversationDraft = (
  preferences: Partial<Pick<ImageGenerationComposerDraft,
    'connectionId' | 'modelId' | 'resolution' | 'aspectRatio' | 'width' | 'height'
    | 'promptOptimization' | 'outputFormat' | 'watermark'>> = {}
): ImageGenerationComposerDraft => ({
  promptDocument: { version: 1, segments: [{ type: 'text', text: '' }] },
  workflow: 'text-to-image',
  connectionId: preferences.connectionId || '',
  modelId: preferences.modelId || '',
  resolution: preferences.resolution || '2K',
  aspectRatio: preferences.aspectRatio || '1:1',
  ...(preferences.width ? { width: preferences.width } : {}),
  ...(preferences.height ? { height: preferences.height } : {}),
  promptOptimization: preferences.promptOptimization || 'standard',
  outputFormat: preferences.outputFormat || 'png',
  watermark: preferences.watermark === true,
  inputs: [],
  regions: []
})

export const buildConversationGenerationRequest = (
  projectId: string,
  conversationId: string,
  draft: ImageGenerationComposerDraft
): ImageGenerationRequest => ({
  projectId,
  conversationId,
  connectionId: draft.connectionId,
  modelId: draft.modelId,
  mode: workflowMode(draft.workflow),
  promptDocument: {
    version: 1,
    segments: draft.promptDocument.segments.map(segment => segment.type === 'text'
      ? { type: 'text', text: segment.text }
      : { type: 'reference', referenceId: segment.referenceId, label: segment.label })
  },
  inputs: [...draft.inputs]
    .sort((left, right) => left.order - right.order)
    .map(({ referenceId, role, assetId, sourceAssetId, order }) => ({
      referenceId,
      role,
      assetId,
      ...(sourceAssetId ? { sourceAssetId } : {}),
      order
    })),
  regions: draft.regions.map(region => ({ ...region })),
  resolution: draft.resolution,
  aspectRatio: draft.aspectRatio,
  ...(draft.aspectRatio === 'custom' && draft.width && draft.height
    ? { width: draft.width, height: draft.height }
    : {}),
  outputFormat: draft.outputFormat,
  watermark: draft.watermark,
  promptOptimization: draft.promptOptimization
})

export const injectCanvasNodesIntoDraft = (
  current: ImageGenerationComposerDraft,
  nodes: readonly IFreeCanvasNode[]
): CanvasInjectionResult => {
  let promptDocument = clonePromptDocument(current.promptDocument)
  const inputs = [...current.inputs]
  const rejected: CanvasInjectionResult['rejected'] = []

  for (const node of nodes) {
    if (node.kind === 'text') {
      const text = freeCanvasTextSegmentsToPlainText(node.segments).trim()
      if (!text) {
        rejected.push({ nodeId: node.id, reason: '文字节点没有可见文本。' })
      } else {
        promptDocument = appendPromptText(promptDocument, text)
      }
      continue
    }
    if (node.kind === 'image') {
      if (!node.assetId) {
        rejected.push({ nodeId: node.id, reason: '图片节点没有可用的本地资产。' })
      } else if (inputs.length >= 10) {
        rejected.push({ nodeId: node.id, reason: '图片输入已达到 10 张上限。' })
      } else {
        inputs.push({
          referenceId: `canvas-${node.id}-${inputs.length + 1}`,
          assetId: node.assetId,
          order: inputs.length,
          role: 'reference-image',
          label: node.title
        })
      }
      continue
    }
    rejected.push({ nodeId: node.id, reason: '该节点类型不能作为图片生成输入。' })
  }

  return {
    draft: {
      ...current,
      promptDocument,
      inputs,
      workflow: current.workflow === 'text-to-image' && inputs.length > 0
        ? 'reference-generate'
        : current.workflow
    },
    rejected
  }
}

export const projectRunToTurn = (
  run: ImageGenerationRun,
  modelLabel: (modelId: string) => string = modelId => modelId
) => {
  const snapshot = run.requestSnapshot
  const prompt = snapshot.promptDocument.segments.map(segment => (
    segment.type === 'text' ? segment.text : `@${segment.label}`
  )).join('')
  const assetId = run.outputAssetIds[0]
  return {
    id: run.id,
    createdAt: run.createdAt,
    prompt,
    state: run.state,
    settings: {
      workflow: modeWorkflow(snapshot.mode, snapshot.inputAssets.length),
      modelLabel: modelLabel(run.modelId),
      resolution: snapshot.resolution,
      aspectRatio: snapshot.aspectRatio || '智能',
      outputFormat: snapshot.outputFormat,
      watermark: snapshot.watermark
    },
    inputs: snapshot.inputAssets.map(input => ({
      referenceId: input.referenceId,
      assetId: input.assetId,
      imageUrl: `/storage-api/assets/${encodeURIComponent(input.assetId)}`
    })),
    regionCount: snapshot.regions.length,
    ...(assetId ? {
      result: {
        assetId,
        imageUrl: `/storage-api/assets/${encodeURIComponent(assetId)}`,
        width: snapshot.width || 0,
        height: snapshot.height || 0
      }
    } : {}),
    ...(run.error ? { error: { message: run.error.message, action: run.error.retryable ? '再次生成' : undefined } } : {})
  }
}

export const promptDocumentPlainText = (document: PromptDocument): string => (
  document.segments.map(segment => segment.type === 'text' ? segment.text : `@${segment.label}`).join('')
)

const clonePromptDocument = (document: PromptDocument): PromptDocument => ({
  version: 1,
  segments: document.segments.map(segment => segment.type === 'text'
    ? { type: 'text', text: segment.text }
    : { type: 'reference', referenceId: segment.referenceId, label: segment.label })
})

const appendPromptText = (document: PromptDocument, text: string): PromptDocument => {
  const next = clonePromptDocument(document)
  const last = next.segments[next.segments.length - 1]
  if (last?.type === 'text') {
    last.text = [last.text.trim(), text].filter(Boolean).join('\n')
  } else {
    next.segments.push({ type: 'text', text })
  }
  return next
}

const workflowMode = (workflow: ProjectImageGenerationWorkflow): ImageGenerationRequest['mode'] => (
  workflow === 'smart-edit' ? 'edit' : workflow === 'region-edit' ? 'region-edit' : 'generate'
)

const modeWorkflow = (mode: string, inputCount: number): ProjectImageGenerationWorkflow => {
  if (mode === 'edit') return 'smart-edit'
  if (mode === 'region-edit') return 'region-edit'
  return inputCount > 0 ? 'reference-generate' : 'text-to-image'
}
