import type {
  IFreeCanvasEdge,
  IFreeCanvasImageGeneratorNode,
  IFreeCanvasProject,
  PromptDocument,
  PromptSegment
} from '@/models/PromptHistory.model'
import { freeCanvasTextSegmentsToPlainText } from '@/domain/free-canvas/free-canvas-project'
import {
  readImageRegionBindings,
  restoreBoundImageRegions,
  validateBoundImageRegions
} from '@/domain/image-generation/regions'

export type ImagePromptInputRole = 'source-image' | 'reference-image'

export type PromptCompilerValidationErrorCode =
  | 'generator_not_found'
  | 'connected_prompt_unresolved'
  | 'missing_prompt'
  | 'unresolved_reference'
  | 'missing_reference_asset'
  | 'duplicate_reference_id'
  | 'unresolved_region_reference'
  | 'stale_region_reference'
  | 'invalid_region_geometry'
  | 'missing_source_image'

export interface PromptCompilerValidationError {
  code: PromptCompilerValidationErrorCode
  referenceId?: string
  edgeId?: string
  regionId?: string
}

export interface ConnectedImagePromptReference {
  edgeId: string
  nodeId: string
  referenceId: string
  label: string
  role: ImagePromptInputRole
  assetId: string | null
  order: number
}

export interface CompiledImagePromptAsset {
  referenceId: string
  role: ImagePromptInputRole
  assetId: string
  order: number
}

export interface ImageGeneratorPromptSnapshot {
  source: 'local' | 'connected' | 'empty'
  promptDocument: PromptDocument
  prompt: string
  references: ConnectedImagePromptReference[]
  inputAssets: CompiledImagePromptAsset[]
  validationErrors: PromptCompilerValidationError[]
  canGenerate: boolean
}

export const compileImageGeneratorPrompt = (
  project: IFreeCanvasProject,
  generatorId: string
): ImageGeneratorPromptSnapshot => {
  const generator = project.nodes.find((node): node is IFreeCanvasImageGeneratorNode => (
    node.id === generatorId && node.kind === 'image-generator'
  ))
  if (!generator) {
    return emptySnapshot([{ code: 'generator_not_found' }])
  }

  const validationErrors: PromptCompilerValidationError[] = []
  const references = connectedImageReferences(project, generatorId, validationErrors)
  const referenceById = new Map<string, ConnectedImagePromptReference>()
  references.forEach(reference => {
    if (referenceById.has(reference.referenceId)) {
      validationErrors.push({
        code: 'duplicate_reference_id',
        referenceId: reference.referenceId,
        edgeId: reference.edgeId
      })
      return
    }
    referenceById.set(reference.referenceId, reference)
    if (!reference.assetId) {
      validationErrors.push({
        code: 'missing_reference_asset',
        referenceId: reference.referenceId,
        edgeId: reference.edgeId
      })
    }
  })

  const sourceReferenceId = references.find(reference => reference.role === 'source-image')?.referenceId || null
  const regionValidation = validateBoundImageRegions(
    restoreBoundImageRegions(generator.regions, readImageRegionBindings(generator.meta)),
    sourceReferenceId,
    references.map(reference => reference.referenceId)
  )
  regionValidation.validationErrors.forEach(error => validationErrors.push({ ...error }))
  if (generator.mode !== 'generate' && !sourceReferenceId) {
    validationErrors.push({ code: 'missing_source_image' })
  }

  const localDocument = clonePromptDocument(generator.promptDocument)
  const localIsExplicit = hasExplicitPromptContent(localDocument)
  const connected = localIsExplicit ? null : connectedPromptSnapshot(project, generatorId)
  if (!localIsExplicit && connected?.error) validationErrors.push(connected.error)

  const source = localIsExplicit ? 'local' : connected?.document ? 'connected' : 'empty'
  const promptDocument = localIsExplicit
    ? localDocument
    : connected?.document || { version: 1, segments: [] }
  const prompt = promptDocument.segments.map(segment => {
    if (segment.type === 'text') return segment.text
    const reference = referenceById.get(segment.referenceId)
    if (!reference) {
      validationErrors.push({ code: 'unresolved_reference', referenceId: segment.referenceId })
      return `@${segment.label}`
    }
    return `图${reference.order + 1}`
  }).join('')

  if (!prompt.trim()) validationErrors.push({ code: 'missing_prompt' })

  return {
    source,
    promptDocument: clonePromptDocument(promptDocument),
    prompt,
    references: references.map(reference => ({ ...reference })),
    inputAssets: references.flatMap(reference => reference.assetId
      ? [{
          referenceId: reference.referenceId,
          role: reference.role,
          assetId: reference.assetId,
          order: reference.order
        }]
      : []),
    validationErrors,
    canGenerate: validationErrors.length === 0
  }
}

const connectedImageReferences = (
  project: IFreeCanvasProject,
  generatorId: string,
  validationErrors: PromptCompilerValidationError[]
): ConnectedImagePromptReference[] => project.edges
  .filter((edge): edge is IFreeCanvasEdge & { targetHandle: ImagePromptInputRole } => (
    edge.target === generatorId
    && (edge.targetHandle === 'source-image' || edge.targetHandle === 'reference-image')
  ))
  .sort(compareImageInputEdges)
  .flatMap((edge, order) => {
    const sourceNode = project.nodes.find(node => node.id === edge.source)
    const assetId = sourceNode?.kind === 'image'
      ? sourceNode.assetId || null
      : sourceNode?.kind === 'image-generator'
        ? sourceNode.primaryAssetId || null
        : null
    if (sourceNode?.kind !== 'image' && sourceNode?.kind !== 'image-generator') {
      const referenceId = edge.referenceId || `reference-${edge.id}`
      validationErrors.push({ code: 'unresolved_reference', referenceId, edgeId: edge.id })
      return []
    }
    return [{
      edgeId: edge.id,
      nodeId: sourceNode.id,
      referenceId: edge.referenceId || `reference-${edge.id}`,
      label: edge.label || sourceNode.title,
      role: edge.targetHandle,
      assetId,
      order
    }]
  })

const connectedPromptSnapshot = (
  project: IFreeCanvasProject,
  generatorId: string
): { document: PromptDocument | null; error?: PromptCompilerValidationError } | null => {
  const edge = project.edges
    .filter(candidate => candidate.target === generatorId && candidate.targetHandle === 'prompt')
    .sort(compareStableEdges)[0]
  if (!edge) return null
  const sourceNode = project.nodes.find(node => node.id === edge.source)
  if (sourceNode?.kind !== 'text') {
    return { document: null, error: { code: 'connected_prompt_unresolved', edgeId: edge.id } }
  }
  return {
    document: {
      version: 1,
      segments: [{ type: 'text', text: freeCanvasTextSegmentsToPlainText(sourceNode.segments) }]
    }
  }
}

const hasExplicitPromptContent = (document: PromptDocument): boolean => document.segments.some(segment => (
  segment.type === 'reference' || segment.text.trim().length > 0
))

const clonePromptDocument = (document: PromptDocument): PromptDocument => ({
  version: 1,
  segments: document.segments.map(clonePromptSegment)
})

const clonePromptSegment = (segment: PromptSegment): PromptSegment => segment.type === 'text'
  ? { type: 'text', text: segment.text }
  : { type: 'reference', referenceId: segment.referenceId, label: segment.label }

const compareImageInputEdges = (left: IFreeCanvasEdge, right: IFreeCanvasEdge): number => {
  if (left.targetHandle !== right.targetHandle) return left.targetHandle === 'source-image' ? -1 : 1
  const leftOrder = typeof left.inputOrder === 'number' ? left.inputOrder : Number.MAX_SAFE_INTEGER
  const rightOrder = typeof right.inputOrder === 'number' ? right.inputOrder : Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || compareStableEdges(left, right)
}

const compareStableEdges = (left: IFreeCanvasEdge, right: IFreeCanvasEdge): number => (
  left.createdAt - right.createdAt || left.id.localeCompare(right.id)
)

const emptySnapshot = (validationErrors: PromptCompilerValidationError[]): ImageGeneratorPromptSnapshot => ({
  source: 'empty',
  promptDocument: { version: 1, segments: [] },
  prompt: '',
  references: [],
  inputAssets: [],
  validationErrors,
  canGenerate: false
})
