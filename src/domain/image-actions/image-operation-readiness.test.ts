import { describe, expect, it } from 'vitest'
import type { ModelCatalogEntry } from '@/domain/models/model-management'
import {
  evaluateImageOperationAvailability,
  type ImageOperationAvailabilityContext
} from './image-operation-readiness'
import {
  type ImageOperationDefinition,
  type ImageProductOperation
} from './image-operations'

const model: ModelCatalogEntry = {
  id: 'high-instruction-image-model',
  providerId: 'provider-one',
  displayName: 'High instruction image model',
  modality: 'image',
  capabilities: {
    modes: ['generate', 'edit', 'region-edit'],
    maxReferenceImages: 4,
    regionInputs: ['point', 'bbox'],
    annotationInputs: ['raster-markup'],
    outputCount: 1
  }
}

const definition: ImageOperationDefinition = {
  id: 'effect-render',
  support: 'recipe',
  implementationStatus: 'implemented',
  qualityStatus: 'experimental',
  requiredCapabilities: [
    { kind: 'mode', value: 'generate' },
    { kind: 'reference-count', minimum: 1 }
  ]
}

const context = (
  overrides: Partial<ImageOperationAvailabilityContext> = {}
): ImageOperationAvailabilityContext => ({
  model,
  runtimeReady: true,
  selection: {
    nodeKind: 'image',
    count: 1,
    assetId: 'asset-source',
    generationState: 'ready'
  },
  adapterImplementedOperations: ['effect-render'],
  policyEnabledOperations: ['effect-render'],
  ...overrides
})

describe('image operation readiness', () => {
  it('enables an executable experimental recipe when every gate passes', () => {
    expect(evaluateImageOperationAvailability(definition, context())).toEqual({
      enabled: true,
      reason: null,
      qualityStatus: 'experimental'
    })
  })

  it.each([
    ['planned implementation', { implementationStatus: 'planned' }, 'not_implemented'],
    ['untested quality', { qualityStatus: 'untested' }, 'not_evaluated'],
    ['unsupported operation', { support: 'unsupported' }, 'unsupported']
  ] as const)('blocks a %s', (_label, definitionPatch, reason) => {
    expect(evaluateImageOperationAvailability(
      { ...definition, ...definitionPatch },
      context()
    )).toMatchObject({ enabled: false, reason })
  })

  it('requires adapter implementation independently from provider capability', () => {
    expect(evaluateImageOperationAvailability(definition, context({
      adapterImplementedOperations: []
    }))).toMatchObject({ enabled: false, reason: 'adapter_not_implemented' })
  })

  it('blocks a recipe when the selected model misses one native primitive', () => {
    expect(evaluateImageOperationAvailability({
      ...definition,
      requiredCapabilities: [{ kind: 'region-input', value: 'mask' }]
    }, context())).toMatchObject({
      enabled: false,
      reason: 'missing_model_capability'
    })
  })

  it('never treats a document selection as an image operation target', () => {
    expect(evaluateImageOperationAvailability(definition, context({
      selection: {
        nodeKind: 'document',
        count: 1
      }
    }))).toMatchObject({ enabled: false, reason: 'select_one_ready_image' })
  })

  it('requires an explicit product policy gate', () => {
    expect(evaluateImageOperationAvailability(definition, context({
      policyEnabledOperations: []
    }))).toMatchObject({ enabled: false, reason: 'policy_disabled' })
  })

  it('accepts a fake provider with different primitives without a model-id branch', () => {
    const fakeModel: ModelCatalogEntry = {
      ...model,
      id: 'fake-model',
      providerId: 'fake-provider',
      capabilities: {
        modes: ['edit'],
        maxReferenceImages: 1,
        annotationInputs: ['raster-markup'],
        outputCount: 1
      }
    }
    const operation: ImageProductOperation = 'erase'

    expect(evaluateImageOperationAvailability({
      id: operation,
      support: 'recipe',
      implementationStatus: 'implemented',
      qualityStatus: 'ready',
      requiredCapabilities: [
        { kind: 'mode', value: 'edit' },
        { kind: 'annotation-input', value: 'raster-markup' }
      ]
    }, context({
      model: fakeModel,
      adapterImplementedOperations: [operation],
      policyEnabledOperations: [operation]
    }))).toEqual({
      enabled: true,
      reason: null,
      qualityStatus: 'ready'
    })
  })
})
