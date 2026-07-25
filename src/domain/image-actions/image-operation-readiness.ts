import type { ModelCapabilities, ModelCatalogEntry } from '@/domain/models/model-management'
import type {
  ImageCapabilityRequirement,
  ImageOperationDefinition,
  ImageOperationQualityStatus,
  ImageProductOperation
} from './image-operations'

export type ImageOperationDisabledReason =
  | 'select_one_ready_image'
  | 'model_unavailable'
  | 'runtime_unavailable'
  | 'unsupported'
  | 'not_implemented'
  | 'adapter_not_implemented'
  | 'missing_model_capability'
  | 'not_evaluated'
  | 'policy_disabled'

export type ImageOperationSelection =
  | {
      nodeKind: 'image'
      count: number
      assetId: string | null
      generationState: 'ready' | 'running' | 'failed'
    }
  | {
      nodeKind: 'document' | 'other'
      count: number
    }

export interface ImageOperationAvailability {
  enabled: boolean
  reason: ImageOperationDisabledReason | null
  qualityStatus: ImageOperationQualityStatus
}

export interface ImageOperationAvailabilityContext {
  model: ModelCatalogEntry | null
  runtimeReady: boolean
  selection: ImageOperationSelection
  adapterImplementedOperations: readonly ImageProductOperation[]
  policyEnabledOperations: readonly ImageProductOperation[]
}

export const evaluateImageOperationAvailability = (
  definition: ImageOperationDefinition,
  context: ImageOperationAvailabilityContext
): ImageOperationAvailability => {
  const blocked = (reason: ImageOperationDisabledReason): ImageOperationAvailability => ({
    enabled: false,
    reason,
    qualityStatus: definition.qualityStatus
  })

  if (
    context.selection.nodeKind !== 'image'
    || context.selection.count !== 1
    || !context.selection.assetId
    || context.selection.generationState !== 'ready'
  ) {
    return blocked('select_one_ready_image')
  }
  if (definition.support === 'unsupported') return blocked('unsupported')
  if (definition.implementationStatus !== 'implemented') return blocked('not_implemented')
  if (!context.adapterImplementedOperations.includes(definition.id)) {
    return blocked('adapter_not_implemented')
  }
  if (!context.model) return blocked('model_unavailable')
  if (!supportsRequirements(context.model.capabilities, definition.requiredCapabilities)) {
    return blocked('missing_model_capability')
  }
  if (!context.runtimeReady) return blocked('runtime_unavailable')
  if (definition.qualityStatus === 'untested') return blocked('not_evaluated')
  if (!context.policyEnabledOperations.includes(definition.id)) return blocked('policy_disabled')

  return {
    enabled: true,
    reason: null,
    qualityStatus: definition.qualityStatus
  }
}

const supportsRequirements = (
  capabilities: ModelCapabilities | undefined,
  requirements: readonly ImageCapabilityRequirement[]
): boolean => requirements.every(requirement => {
  if (!capabilities) return false
  if (requirement.kind === 'mode') {
    return capabilities.modes?.includes(requirement.value) === true
  }
  if (requirement.kind === 'reference-count') {
    return (capabilities.maxReferenceImages || 0) >= requirement.minimum
  }
  if (requirement.kind === 'region-input') {
    return (capabilities.regionInputs as readonly string[] | undefined)?.includes(requirement.value) === true
  }
  if (requirement.kind === 'annotation-input') {
    return capabilities.annotationInputs?.includes(requirement.value) === true
  }
  return (capabilities.outputCount || 0) >= requirement.minimum
})
