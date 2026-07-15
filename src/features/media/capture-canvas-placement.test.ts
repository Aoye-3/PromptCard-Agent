import { describe, expect, it } from 'vitest'
import type { RecentCaptureItem } from '@/storage/storage-service-client'
import {
  createCaptureCanvasMediaNode,
  createCaptureCanvasUpdates,
  createGeneratedResultCanvasPlacement,
  applyGeneratedResultCanvasPlacement
} from './capture-canvas-placement'

const capture = (registeredPromptId: string | null = null): RecentCaptureItem => ({
  id: 'capture-1', assetId: 'asset-shared.png', kind: 'screenshot', status: registeredPromptId ? 'registeredToPromptLibrary' : 'recent',
  purpose: 'inspirationReference', role: 'scene', title: 'Scene', prompt: 'Scene prompt', userNote: '', sourcePlatform: 'Clipboard', sourceUrl: '',
  contentType: 'image/png', size: 100, width: 1200, height: 800, capturedAt: 1, origin: {}, createdAt: 1, updatedAt: 1, revision: 2,
  registeredPromptId
})

describe('capture Canvas placement', () => {
  it('creates unique Canvas nodes that keep the capture asset id', () => {
    const first = createCaptureCanvasMediaNode(capture(), 100)
    const second = createCaptureCanvasMediaNode(capture(), 101)
    expect(first.id).not.toBe(second.id)
    expect(first.assetId).toBe('asset-shared.png')
    expect(first.width).toBe(360)
    expect(first.height).toBe(240)
  })

  it('preserves registered status while writing independent Canvas links', () => {
    expect(createCaptureCanvasUpdates(capture('preset-1'), 'project-1', 'node-1')).toEqual({
      status: 'registeredToPromptLibrary', linkedProjectId: 'project-1', linkedCanvasNodeId: 'node-1'
    })
    expect(createCaptureCanvasUpdates(capture(), 'project-1', 'node-2').status).toBe('placedOnCanvas')
  })

  it('turns a generated result into an ordinary image or a reference-image placement', () => {
    const generated = { ...capture(), purpose: 'generatedResult' as const }

    const ordinary = createGeneratedResultCanvasPlacement(generated, { kind: 'image' }, 200)
    const reference = createGeneratedResultCanvasPlacement(generated, {
      kind: 'reference', targetNodeId: 'generator-next'
    }, 201)

    expect(ordinary.node.assetId).toBe(generated.assetId)
    expect(ordinary.connection).toBeNull()
    expect(reference.connection).toEqual({
      source: reference.node.id,
      target: 'generator-next',
      sourceHandle: 'image-output',
      targetHandle: 'reference-image'
    })
  })

  it('adds a generated result and a stable ordered reference edge to the selected generator', () => {
    const generated = { ...capture(), purpose: 'generatedResult' as const }
    const generator = {
      id: 'generator-next', kind: 'image-generator' as const, title: 'Next', position: { x: 0, y: 0 },
      width: 420, height: 560, mode: 'generate' as const,
      binding: { connectionId: 'ark', modelId: 'seedream' },
      settings: { resolution: '1K' as const, aspectRatio: 'smart' as const, outputFormat: 'png' as const, watermark: false },
      promptDocument: { version: 1 as const, segments: [] }, regions: [], meta: {}
    }
    const project = { nodes: [generator], edges: [], selectedNodeId: generator.id, meta: {} }

    const placed = applyGeneratedResultCanvasPlacement(project, generated, { kind: 'reference', targetNodeId: generator.id }, 300)

    expect(placed.project.nodes).toHaveLength(2)
    expect(placed.project.edges).toEqual([expect.objectContaining({
      source: placed.nodeId, target: generator.id, sourceHandle: 'image-output',
      targetHandle: 'reference-image', inputOrder: 0,
      referenceId: expect.stringContaining('reference-free-edge-')
    })])
    expect(placed.error).toBeNull()
  })

  it('does not write a generated reference when the target is missing or already has ten references', () => {
    const generated = { ...capture(), purpose: 'generatedResult' as const }
    const emptyProject = { nodes: [], edges: [], selectedNodeId: null, meta: {} }
    const missing = applyGeneratedResultCanvasPlacement(
      emptyProject,
      generated,
      { kind: 'reference', targetNodeId: 'missing' },
      301
    )
    expect(missing.project).toBe(emptyProject)
    expect(missing.error).toBe('target_not_image_generator')

    const generator = {
      id: 'generator-full', kind: 'image-generator' as const, title: 'Full', position: { x: 0, y: 0 },
      width: 420, height: 560, mode: 'generate' as const,
      binding: { connectionId: 'ark', modelId: 'seedream' },
      settings: { resolution: '1K' as const, aspectRatio: 'smart' as const, outputFormat: 'png' as const, watermark: false },
      promptDocument: { version: 1 as const, segments: [] }, regions: [], meta: {}
    }
    const images = Array.from({ length: 10 }, (_, index) => ({
      id: `image-${index}`, kind: 'image' as const, title: 'Image', position: { x: 0, y: 0 },
      width: 200, height: 200, annotations: [], meta: {}
    }))
    const fullProject = {
      nodes: [generator, ...images],
      edges: images.map((image, index) => ({
        id: `edge-${index}`, source: image.id, target: generator.id,
        targetHandle: 'reference-image' as const, inputOrder: index,
        referenceId: `reference-${index}`, createdAt: index
      })),
      selectedNodeId: generator.id,
      meta: {}
    }
    const eleventh = applyGeneratedResultCanvasPlacement(
      fullProject,
      generated,
      { kind: 'reference', targetNodeId: generator.id },
      302
    )
    expect(eleventh.project).toBe(fullProject)
    expect(eleventh.error).toBe('reference_image_input_limit')
  })
})
