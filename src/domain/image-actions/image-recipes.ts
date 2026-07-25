import type { ModelCatalogEntry } from '@/domain/models/model-management'
import {
  evaluateImageOperationAvailability,
  type ImageOperationAvailability,
  type ImageOperationSelection
} from './image-operation-readiness'
import type {
  ImageOperationDefinition,
  ImageProductOperation
} from './image-operations'

export const imageOperationDefinitions: readonly ImageOperationDefinition[] = [
  {
    id: 'reference-generate',
    support: 'recipe',
    implementationStatus: 'implemented',
    qualityStatus: 'ready',
    requiredCapabilities: [
      { kind: 'mode', value: 'generate' },
      { kind: 'reference-count', minimum: 1 }
    ]
  },
  {
    id: 'global-edit',
    support: 'native',
    implementationStatus: 'implemented',
    qualityStatus: 'ready',
    requiredCapabilities: [{ kind: 'mode', value: 'edit' }]
  },
  {
    id: 'region-redraw',
    support: 'native',
    implementationStatus: 'implemented',
    qualityStatus: 'ready',
    requiredCapabilities: [
      { kind: 'mode', value: 'region-edit' },
      { kind: 'region-input', value: 'point' }
    ]
  },
  {
    id: 'effect-render',
    support: 'recipe',
    implementationStatus: 'implemented',
    qualityStatus: 'experimental',
    requiredCapabilities: [
      { kind: 'mode', value: 'edit' },
      { kind: 'reference-count', minimum: 1 }
    ]
  },
  {
    id: 'erase',
    support: 'recipe',
    implementationStatus: 'implemented',
    qualityStatus: 'experimental',
    requiredCapabilities: [
      { kind: 'mode', value: 'region-edit' },
      { kind: 'region-input', value: 'point' }
    ]
  },
  {
    id: 'outpaint',
    support: 'recipe',
    implementationStatus: 'implemented',
    qualityStatus: 'experimental',
    requiredCapabilities: [{ kind: 'mode', value: 'edit' }]
  },
  {
    id: 'text-edit',
    support: 'recipe',
    implementationStatus: 'implemented',
    qualityStatus: 'experimental',
    requiredCapabilities: [{ kind: 'mode', value: 'edit' }]
  },
  {
    id: 'multi-view',
    support: 'recipe',
    implementationStatus: 'implemented',
    qualityStatus: 'experimental',
    requiredCapabilities: [
      { kind: 'mode', value: 'edit' },
      { kind: 'reference-count', minimum: 1 }
    ]
  },
  {
    id: 'upscale',
    support: 'recipe',
    implementationStatus: 'implemented',
    qualityStatus: 'experimental',
    requiredCapabilities: [{ kind: 'mode', value: 'edit' }]
  },
  {
    id: 'subject-extract',
    support: 'recipe',
    implementationStatus: 'implemented',
    qualityStatus: 'experimental',
    requiredCapabilities: [{ kind: 'mode', value: 'edit' }]
  }
]

export const currentAdapterImplementedOperations: readonly ImageProductOperation[] = [
  'reference-generate',
  'global-edit',
  'region-redraw',
  'effect-render',
  'erase',
  'outpaint',
  'text-edit',
  'multi-view',
  'upscale',
  'subject-extract'
]

export const currentPolicyEnabledOperations: readonly ImageProductOperation[] = [
  'reference-generate',
  'global-edit',
  'region-redraw',
  'effect-render',
  'erase',
  'outpaint',
  'text-edit',
  'multi-view',
  'upscale',
  'subject-extract'
]

export const resolveImageOperationAvailability = ({
  model,
  runtimeReady,
  selection,
  adapterImplementedOperations = currentAdapterImplementedOperations,
  policyEnabledOperations = currentPolicyEnabledOperations
}: {
  model: ModelCatalogEntry | null
  runtimeReady: boolean
  selection: ImageOperationSelection
  adapterImplementedOperations?: readonly ImageProductOperation[]
  policyEnabledOperations?: readonly ImageProductOperation[]
}): Record<ImageProductOperation, ImageOperationAvailability> => Object.fromEntries(
  imageOperationDefinitions.map(definition => [
    definition.id,
    evaluateImageOperationAvailability(definition, {
      model,
      runtimeReady,
      selection,
      adapterImplementedOperations,
      policyEnabledOperations
    })
  ])
) as Record<ImageProductOperation, ImageOperationAvailability>
