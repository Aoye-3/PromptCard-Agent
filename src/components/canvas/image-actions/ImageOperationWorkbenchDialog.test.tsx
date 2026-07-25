import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { ImageOperationDraft } from '@/domain/image-actions/image-operation-draft'
import { ImageOperationWorkbenchDialog } from './ImageOperationWorkbenchDialog'

const draft = (overrides: Partial<ImageOperationDraft> = {}): ImageOperationDraft => ({
  operation: 'effect-render',
  source: {
    nodeId: 'node-1',
    originalAssetId: 'asset-original',
    canvasAssetId: 'asset-canvas',
    providerAssetId: 'asset-provider',
    previewUrl: '/assets/asset-provider',
    requiresVisibleRaster: true,
    includesCrop: true,
    includesAnnotations: false,
    includesPresentation: false
  },
  prompt: '',
  presetId: 'product-sketch',
  preservationIntents: ['主体轮廓'],
  references: [],
  resolution: '2K',
  aspectRatio: '1:1',
  ...overrides
})

describe('ImageOperationWorkbenchDialog', () => {
  it('does not submit on open, preset change, prompt editing, or cancel', () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <ImageOperationWorkbenchDialog
          initialDraft={draft()}
          modelLabel="Fake image model"
          maximumInputs={1}
          onCancel={onCancel}
          onGenerate={onGenerate}
        />
      )
    })

    const textarea = renderer.root.findByType('textarea')
    act(() => textarea.props.onChange({ target: { value: '转为暖色产品摄影' } }))
    const preset = renderer.root.findAllByType('button').find(button => button.children.includes('工业设计'))
    act(() => preset?.props.onClick())
    const cancel = renderer.root.findAllByType('button').find(button => button.children.includes('取消'))
    act(() => cancel?.props.onClick())

    expect(onGenerate).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('submits exactly once only from the enabled Generate button', async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined)
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <ImageOperationWorkbenchDialog
          initialDraft={draft({ prompt: '转为暖色产品摄影' })}
          modelLabel="Fake image model"
          maximumInputs={4}
          onCancel={vi.fn()}
          onGenerate={onGenerate}
        />
      )
    })
    const generate = renderer.root.findAllByType('button').find(button => button.children.includes('Generate'))

    await act(async () => {
      await generate?.props.onClick()
    })

    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate.mock.calls[0][0]).toMatchObject({
      operation: 'effect-render',
      prompt: '转为暖色产品摄影'
    })
  })

  it('hides the Add reference control for a single-image model', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <ImageOperationWorkbenchDialog
          initialDraft={draft({ prompt: '生成变体' })}
          modelLabel="Single image model"
          maximumInputs={1}
          onCancel={vi.fn()}
          onGenerate={vi.fn().mockResolvedValue(undefined)}
        />
      )
    })

    expect(renderer.root.findAllByProps({ children: '添加参考图' })).toHaveLength(0)
    expect(renderer.root.findByProps({ children: '当前模型目录只允许单图输入，因此不显示无效的添加入口。' })).toBeTruthy()
  })
})
