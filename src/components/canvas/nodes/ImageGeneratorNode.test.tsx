import { renderToStaticMarkup } from 'react-dom/server'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { IFreeCanvasImageGeneratorNode } from '@/models/PromptHistory.model'
import { ImageGeneratorNode, imageGeneratorStatus } from './ImageGeneratorNode'

vi.mock('@xyflow/react', () => ({
  Handle: ({ id, type, isConnectable }: { id: string; type: string; isConnectable?: boolean }) => (
    <span data-handle-id={id} data-handle-type={type} data-connectable={isConnectable} />
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
  it('renders an existing result as a read-only legacy preview with a manual continue action', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorNode
        data={{
          canvasNode: generatorNode,
          status: 'Completed',
          resultThumbnailUrl: '/result.png',
          onOpenHistory: vi.fn(),
          onConfigure: vi.fn(),
          onContinueCreation: vi.fn()
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
    expect(markup).toContain('旧图片生成节点')
    expect(markup).toContain('只读')
    expect(markup).toContain('/result.png')
    expect(markup).toContain('继续创作')
    expect(markup).not.toContain('历史')
    expect(markup).not.toContain('前往配置')
    expect(markup).not.toContain('生成图片')
    expect(markup.match(/data-connectable="false"/g)).toHaveLength(4)
  })

  it('uses only the supported persisted generation states', () => {
    expect(imageGeneratorStatus({ ...generatorNode, meta: { status: 'validating' } })).toBe('validating')
    expect(imageGeneratorStatus({ ...generatorNode, meta: { status: 'running' } })).toBe('running')
    expect(imageGeneratorStatus({ ...generatorNode, meta: { status: 'succeeded' } })).toBe('succeeded')
    expect(imageGeneratorStatus({ ...generatorNode, meta: { status: 'failed' } })).toBe('failed')
    expect(imageGeneratorStatus({ ...generatorNode, activeRunId: undefined, primaryAssetId: undefined, meta: { status: 'Completed' } })).toBe('idle')
  })

  it('shows the legacy configuration summary and opens image generation when no result exists', () => {
    const markup = renderToStaticMarkup(
      <ImageGeneratorNode
        data={{
          canvasNode: {
            ...generatorNode,
            binding: { connectionId: '', modelId: '' },
            primaryAssetId: undefined,
            activeRunId: undefined,
            meta: {}
          },
          inputSummary: { promptConnected: false, sourceConnected: false, referenceCount: 0 },
          onConfigure: vi.fn(),
          onContinueCreation: vi.fn()
        }}
      />
    )

    expect(markup).toContain('尚未配置图片生成模型')
    expect(markup).toContain('旧配置')
    expect(markup).toContain('打开图片生成')
    expect(markup).not.toContain('前往配置')
    expect(markup).toContain('参考图 0/10')
    expect(markup).toContain('data-connectable="false"')
  })

  it('only invokes the explicit continue-creation callback after the user clicks', () => {
    const onContinueCreation = vi.fn()
    const renderer = create(
      <ImageGeneratorNode
        data={{
          canvasNode: generatorNode,
          resultThumbnailUrl: '/result.png',
          onContinueCreation
        }}
      />
    )

    expect(onContinueCreation).not.toHaveBeenCalled()

    const button = renderer.root.findByProps({ 'aria-label': '继续创作 Product render' })
    act(() => button.props.onClick({ stopPropagation: vi.fn() }))

    expect(onContinueCreation).toHaveBeenCalledTimes(1)
    expect(onContinueCreation).toHaveBeenCalledWith('generator-1')
  })
})
