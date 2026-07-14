import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type {
  IFreeCanvasImageGeneratorNode,
  IFreeCanvasImageNode,
  IFreeCanvasProject,
  IFreeCanvasTextNode
} from '@/models/PromptHistory.model'
import { applyImageGeneratorConnection } from '../nodes/ImageGeneratorNode'
import { ImageGeneratorInspector } from './ImageGeneratorInspector'

const generatorNode: IFreeCanvasImageGeneratorNode = {
  id: 'generator-1',
  kind: 'image-generator',
  title: 'Product render',
  position: { x: 120, y: 240 },
  width: 420,
  height: 560,
  mode: 'generate',
  binding: {
    connectionId: 'ark-primary',
    modelId: 'doubao-seedream-5-0-pro-260628'
  },
  settings: {
    resolution: '2K',
    aspectRatio: '16:9',
    outputFormat: 'png',
    watermark: false
  },
  promptDocument: { version: 1, segments: [] },
  regions: [],
  primaryAssetId: 'asset-result-1',
  meta: {}
}

const textNode = (id: string): IFreeCanvasTextNode => ({
  id,
  kind: 'text',
  title: 'Prompt',
  position: { x: 0, y: 0 },
  width: 420,
  height: 180,
  fontSize: 'large',
  segments: [],
  meta: {}
})

const imageNode = (id: string): IFreeCanvasImageNode => ({
  id,
  kind: 'image',
  title: 'Reference',
  position: { x: 0, y: 0 },
  width: 300,
  height: 220,
  annotations: [],
  meta: {}
})

const projectWith = (
  nodes: IFreeCanvasProject['nodes'],
  edges: IFreeCanvasProject['edges'] = []
): IFreeCanvasProject => ({
  nodes,
  edges,
  viewport: null,
  selectedNodeId: generatorNode.id,
  meta: {}
})

describe('ImageGeneratorInspector', () => {
  it('renders provider-neutral binding and generation controls', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorInspector
        node={generatorNode}
        status="Completed"
        resultThumbnailUrl="/result.png"
        onChange={vi.fn()}
        onOpenHistory={vi.fn()}
      />
    )

    expect(markup).toContain('ark-primary')
    expect(markup).toContain('doubao-seedream-5-0-pro-260628')
    expect(markup).toContain('Generation mode')
    expect(markup).toContain('Resolution')
    expect(markup).toContain('Aspect ratio')
    expect(markup).toContain('Completed')
    expect(markup).toContain('/result.png')
    expect(markup).toContain('History')
  })

  it('does not add an invalid second prompt connection to project state', () => {
    const project = projectWith(
      [generatorNode, textNode('prompt-1'), textNode('prompt-2')],
      [{
        id: 'prompt-edge-1',
        source: 'prompt-1',
        target: generatorNode.id,
        targetHandle: 'prompt',
        createdAt: 1
      }]
    )

    const updated = applyImageGeneratorConnection(project, {
      source: 'prompt-2',
      target: generatorNode.id,
      sourceHandle: null,
      targetHandle: 'prompt'
    }, 100)

    expect(updated).toBe(project)
    expect(updated.edges).toHaveLength(1)
  })

  it('adds a valid reference with deterministic referenceId and next inputOrder', () => {
    const project = projectWith(
      [generatorNode, imageNode('reference-1'), imageNode('reference-2')],
      [{
        id: 'reference-edge-1',
        source: 'reference-1',
        target: generatorNode.id,
        sourceHandle: 'image-output',
        targetHandle: 'reference-image',
        inputOrder: 0,
        referenceId: 'reference-existing',
        createdAt: 1
      }]
    )
    const connection = {
      source: 'reference-2',
      target: generatorNode.id,
      sourceHandle: 'image-output',
      targetHandle: 'reference-image'
    }

    const first = applyImageGeneratorConnection(project, connection, 100)
    const repeated = applyImageGeneratorConnection(project, connection, 100)

    expect(project.edges).toHaveLength(1)
    expect(first.edges[1]).toEqual({
      id: 'free-edge-reference-2-generator-1-reference-image-100',
      source: 'reference-2',
      target: generatorNode.id,
      sourceHandle: 'image-output',
      targetHandle: 'reference-image',
      inputOrder: 1,
      referenceId: 'reference-free-edge-reference-2-generator-1-reference-image-100',
      createdAt: 100
    })
    expect(repeated.edges[1]).toEqual(first.edges[1])
  })
})
