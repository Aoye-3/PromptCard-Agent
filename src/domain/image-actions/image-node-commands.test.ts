import { describe, expect, it } from 'vitest'
import {
  imageNodeCommandDefinitions,
  resolveImageNodeCommands,
  type ImageCommandTarget
} from './image-node-commands'

const readyImage: ImageCommandTarget = {
  nodeKind: 'image',
  count: 1,
  assetId: 'asset-source',
  generationState: 'ready',
  source: 'upload'
}

describe('image node command registry', () => {
  it('uses one command definition across toolbar, More, and context surfaces', () => {
    const multiView = imageNodeCommandDefinitions.find(command => command.id === 'multi-view')

    expect(multiView).toMatchObject({
      operation: 'multi-view',
      surfaces: ['toolbar', 'context']
    })
  })

  it('does not expose image commands for a document target', () => {
    expect(resolveImageNodeCommands({
      target: { nodeKind: 'document', count: 1 },
      operationAvailability: {}
    })).toEqual([])
  })

  it('gives uploads and generated results the same asset-based eligibility', () => {
    const operationAvailability = {
      'effect-render': { enabled: true, reason: null, qualityStatus: 'ready' as const }
    }

    const upload = resolveImageNodeCommands({
      target: readyImage,
      operationAvailability
    })
    const generated = resolveImageNodeCommands({
      target: { ...readyImage, source: 'generated' },
      operationAvailability
    })

    expect(generated).toEqual(upload)
    expect(upload.find(command => command.id === 'effect-render')).toMatchObject({
      enabled: true,
      disabledReason: null
    })
  })

  it('shares the same disabled reason on every surface', () => {
    const resolved = resolveImageNodeCommands({
      target: readyImage,
      operationAvailability: {
        'multi-view': {
          enabled: false,
          reason: 'missing_model_capability',
          qualityStatus: 'experimental'
        }
      }
    })
    const multiView = resolved.find(command => command.id === 'multi-view')

    expect(multiView?.surfaces).toEqual(['toolbar', 'context'])
    expect(multiView).toMatchObject({
      enabled: false,
      disabledReason: 'missing_model_capability'
    })
  })

  it('keeps 作为参考 as a local Composer action without Runtime readiness', () => {
    const asReference = resolveImageNodeCommands({
      target: readyImage,
      operationAvailability: {}
    }).find(command => command.id === 'as-reference')

    expect(asReference).toMatchObject({
      enabled: true,
      disabledReason: null
    })
    expect(asReference).not.toHaveProperty('operation')
  })

  it('does not expose ready-image actions for running or assetless placeholders', () => {
    expect(resolveImageNodeCommands({
      target: {
        nodeKind: 'image',
        count: 1,
        assetId: null,
        generationState: 'running',
        source: 'generated'
      },
      operationAvailability: {}
    })).toEqual([])
  })
})
