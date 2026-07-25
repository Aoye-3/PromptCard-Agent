import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { ImageOperationDraft } from '@/domain/image-actions/image-operation-draft'
import { MultiViewWorkbenchDialog } from './MultiViewWorkbenchDialog'

const initialDraft: ImageOperationDraft = {
  operation: 'multi-view',
  source: {
    nodeId: 'source-node',
    originalAssetId: 'asset-original',
    canvasAssetId: 'asset-canvas',
    providerAssetId: 'asset-provider',
    previewUrl: '/assets/asset-provider',
    requiresVisibleRaster: false,
    includesCrop: false,
    includesAnnotations: false,
    includesPresentation: false
  },
  prompt: '保持同一把椅子的身份与材质',
  presetId: 'identity-preserving',
  preservationIntents: ['主体身份'],
  references: [],
  resolution: '2K',
  aspectRatio: '1:1'
}

describe('MultiViewWorkbenchDialog', () => {
  it('shows the exact selected request count without submitting while editing', () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined)
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewWorkbenchDialog
          initialDraft={initialDraft}
          modelLabel="Fake image model"
          onCancel={vi.fn()}
          onGenerate={onGenerate}
        />
      )
    })

    expect(renderer.root.findByProps({ 'data-multi-view-request-count': true }).children).toEqual(['3'])
    const rear = renderer.root.findAllByType('button').find(button => button.findAllByType('span').some(span => span.children.includes('背面')))
    act(() => rear?.props.onClick())
    expect(renderer.root.findByProps({ 'data-multi-view-request-count': true }).children).toEqual(['4'])
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('offers a nine-position camera grid while retaining three-quarter and rear views', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewWorkbenchDialog
          initialDraft={initialDraft}
          modelLabel="Fake image model"
          onCancel={vi.fn()}
          onGenerate={vi.fn().mockResolvedValue(undefined)}
        />
      )
    })

    const grid = renderer.root.findByProps({ 'data-camera-direction-grid': true })
    expect(grid.findAllByType('button')).toHaveLength(9)
    expect(renderer.root.findByProps({ 'aria-label': '选择方位 左上' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '选择方位 仰视' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '选择补充视角 正面 3/4' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '选择补充视角 背面' })).toBeTruthy()
  })

  it('uses the model three-view shortcut without submitting until Generate is clicked', async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined)
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewWorkbenchDialog
          initialDraft={initialDraft}
          modelLabel="Fake image model"
          onCancel={vi.fn()}
          onGenerate={onGenerate}
        />
      )
    })

    act(() => renderer.root.findByProps({
      'aria-label': '选择模型三视图（正视、左视、俯视）'
    }).props.onClick())

    expect(renderer.root.findByProps({ 'data-multi-view-request-count': true }).children).toEqual(['3'])
    expect(onGenerate).not.toHaveBeenCalled()

    await act(async () => {
      await renderer.root.findByProps({ 'aria-label': 'Generate 3' }).props.onClick()
    })

    expect(onGenerate).toHaveBeenCalledWith(expect.any(Object), ['front', 'left', 'top'])
  })

  it('one explicit Generate authorizes the displayed independent requests', async () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined)
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewWorkbenchDialog
          initialDraft={initialDraft}
          modelLabel="Fake image model"
          onCancel={vi.fn()}
          onGenerate={onGenerate}
        />
      )
    })
    const generate = renderer.root.findByProps({ 'aria-label': 'Generate 3' })

    await act(async () => {
      await generate?.props.onClick()
    })

    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate.mock.calls[0][1]).toEqual(['front', 'front-three-quarter', 'left'])
  })

  it('states that inferred views are not precise 3D reconstruction', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewWorkbenchDialog
          initialDraft={initialDraft}
          modelLabel="Fake image model"
          onCancel={vi.fn()}
          onGenerate={vi.fn().mockResolvedValue(undefined)}
        />
      )
    })

    const text = JSON.stringify(renderer.toJSON())
    expect(text).toContain('不是精确 3D 重建')
    expect(text).toContain('每个视角对应一次请求')
  })
})
