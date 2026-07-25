import type { IFreeCanvasImageNode } from '@/models/PromptHistory.model'
import { hasVisibleImageEffects } from '@/domain/image-actions/render-visible-image'

export interface CanvasImageInputPlan {
  nodeId: string
  originalAssetId: string
  canvasAssetId: string
  requiresVisibleRaster: boolean
  includesCrop: boolean
  includesAnnotations: boolean
  includesPresentation: boolean
}

export interface ResolvedCanvasImageInput extends CanvasImageInputPlan {
  providerAssetId: string
  previewUrl: string
}

export interface CanvasImageInputGateway {
  renderVisible: (node: IFreeCanvasImageNode) => Promise<Blob>
  persistProviderInput: (
    blob: Blob,
    context: {
      filename: string
      sourceAssetId: string
      derivationKind: 'provider-input' | 'annotation-flattened'
      transform: Record<string, unknown>
    }
  ) => Promise<{ providerAssetId: string; previewUrl: string }>
  assetUrl: (assetId: string) => string
}

export const planCanvasImageInput = (
  node: IFreeCanvasImageNode
): CanvasImageInputPlan | null => {
  if (!node.assetId || node.meta.generationState === 'running' || node.meta.generationState === 'failed') return null
  const presentation = node.meta.presentation
  const presentationRecord = presentation && typeof presentation === 'object'
    ? presentation as Record<string, unknown>
    : {}
  const originalAssetId = typeof node.meta.originalAssetId === 'string'
    ? node.meta.originalAssetId
    : typeof node.meta.sourceAssetId === 'string'
      ? node.meta.sourceAssetId
      : node.assetId
  return {
    nodeId: node.id,
    originalAssetId,
    canvasAssetId: node.assetId,
    requiresVisibleRaster: hasVisibleImageEffects(node),
    includesCrop: Boolean(node.crop),
    includesAnnotations: node.annotations.length > 0,
    includesPresentation: presentationRecord.flipX === true || presentationRecord.flipY === true
  }
}

export const resolveCanvasImageInput = async (
  node: IFreeCanvasImageNode,
  gateway: CanvasImageInputGateway
): Promise<ResolvedCanvasImageInput> => {
  const plan = planCanvasImageInput(node)
  if (!plan) throw new Error('A ready image asset is required')
  if (!plan.requiresVisibleRaster) {
    return {
      ...plan,
      providerAssetId: plan.canvasAssetId,
      previewUrl: gateway.assetUrl(plan.canvasAssetId)
    }
  }

  const blob = await gateway.renderVisible(node)
  const result = await gateway.persistProviderInput(blob, {
    filename: `canvas-visible-${node.id}.png`,
    sourceAssetId: plan.originalAssetId,
    derivationKind: plan.includesAnnotations ? 'annotation-flattened' : 'provider-input',
    transform: {
      kind: 'canvas-visible-input',
      crop: node.crop ? { ...node.crop } : null,
      presentation: node.meta.presentation || null,
      annotationIds: node.annotations.map(annotation => annotation.id)
    }
  })
  return {
    ...plan,
    providerAssetId: result.providerAssetId,
    previewUrl: result.previewUrl
  }
}
