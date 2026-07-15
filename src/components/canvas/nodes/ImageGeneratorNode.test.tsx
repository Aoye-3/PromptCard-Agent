import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { IFreeCanvasImageGeneratorNode } from '@/models/PromptHistory.model'
import { ImageGeneratorNode, imageGeneratorStatus } from './ImageGeneratorNode'

vi.mock('@xyflow/react', () => ({
  Handle: ({ id, type }: { id: string; type: string }) => (
    <span data-handle-id={id} data-handle-type={type} />
  ),
  Position: { Left: 'left', Right: 'right' }
}))

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
  activeRunId: 'run-1',
  primaryAssetId: 'asset-result-1',
  meta: {}
}

describe('ImageGeneratorNode', () => {
  it('renders unique typed inputs, image output, model, size, status, result, and history entry', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorNode
        data={{
          canvasNode: generatorNode,
          status: 'Completed',
          resultThumbnailUrl: '/result.png',
          onOpenHistory: vi.fn()
        }}
        selected
      />
    )

    expect(markup.match(/data-handle-type="target"/g)).toHaveLength(3)
    expect(markup.match(/data-handle-id="prompt"/g)).toHaveLength(1)
    expect(markup.match(/data-handle-id="source-image"/g)).toHaveLength(1)
    expect(markup.match(/data-handle-id="reference-image"/g)).toHaveLength(1)
    expect(markup.match(/data-handle-id="image-output"/g)).toHaveLength(1)
    expect(markup).toContain('doubao-seedream-5-0-pro-260628')
    expect(markup).toContain('2K')
    expect(markup).toContain('16:9')
    expect(markup).toContain('Completed')
    expect(markup).toContain('/result.png')
    expect(markup).toContain('History')
  })

  it('uses only the supported persisted generation states', () => {
    expect(imageGeneratorStatus({ ...generatorNode, meta: { status: 'validating' } })).toBe('validating')
    expect(imageGeneratorStatus({ ...generatorNode, meta: { status: 'running' } })).toBe('running')
    expect(imageGeneratorStatus({ ...generatorNode, meta: { status: 'succeeded' } })).toBe('succeeded')
    expect(imageGeneratorStatus({ ...generatorNode, meta: { status: 'failed' } })).toBe('failed')
    expect(imageGeneratorStatus({ ...generatorNode, activeRunId: undefined, primaryAssetId: undefined, meta: { status: 'Completed' } })).toBe('idle')
  })
})
