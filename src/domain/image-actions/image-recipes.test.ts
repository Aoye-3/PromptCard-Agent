import { describe, expect, it } from 'vitest'
import type { ModelCatalogEntry } from '@/domain/models/model-management'
import { resolveImageOperationAvailability } from './image-recipes'

const model: ModelCatalogEntry = {
  id: 'fake-high-instruction-image-model',
  providerId: 'fake-provider',
  displayName: 'Fake image model',
  modality: 'image',
  source: 'provider-catalog',
  assignable: true,
  integrationGroup: { id: 'fake-sdk', displayName: 'Fake SDK', kind: 'sdk' },
  capabilities: {
    modes: ['generate', 'edit', 'region-edit'],
    maxReferenceImages: 4,
    regionInputs: ['point', 'bbox'],
    resolutions: ['1K'],
    outputCount: 1,
    streaming: false
  }
}

describe('image recipe registry', () => {
  it('enables executable operations for a fake non-Seedream model', () => {
    const result = resolveImageOperationAvailability({
      model,
      runtimeReady: true,
      selection: {
        nodeKind: 'image',
        count: 1,
        assetId: 'asset-1',
        generationState: 'ready'
      }
    })

    expect(result['reference-generate']).toMatchObject({ enabled: true, reason: null })
    expect(result['region-redraw']).toMatchObject({ enabled: true, reason: null })
  })

  it('enables multi-view only when the registry, adapter, and policy all declare it executable', () => {
    const result = resolveImageOperationAvailability({
      model,
      runtimeReady: true,
      selection: {
        nodeKind: 'image',
        count: 1,
        assetId: 'asset-1',
        generationState: 'ready'
      },
      adapterImplementedOperations: [
        'reference-generate',
        'global-edit',
        'region-redraw',
        'multi-view'
      ],
      policyEnabledOperations: [
        'reference-generate',
        'global-edit',
        'region-redraw',
        'multi-view'
      ]
    })

    expect(result['multi-view']).toEqual({
      enabled: true,
      reason: null,
      qualityStatus: 'experimental'
    })
  })
})
