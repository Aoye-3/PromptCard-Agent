import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ImageGenerationComposer } from './ImageGenerationComposer'
import type { ImageGenerationComposerProps } from './types'
import type { PromptDocument } from '@/models/PromptHistory.model'

const createProps = (): ImageGenerationComposerProps => ({
  prompt: '生成一张产品图', onPromptChange: vi.fn(),
  workflows: [{ value: 'text-to-image', label: '文生图' }, { value: 'smart-edit', label: '智能改图' }],
  workflow: 'text-to-image', onWorkflowChange: vi.fn(),
  models: [{ value: 'seedream', label: 'Seedream 5.0 Pro' }],
  modelId: 'seedream', onModelChange: vi.fn(),
  resolutions: ['1K', '2K'], resolution: '1K', onResolutionChange: vi.fn(),
  aspectRatios: ['1:1', '16:9'], aspectRatio: '1:1', onAspectRatioChange: vi.fn(),
  outputFormats: ['png', 'jpeg'], outputFormat: 'png', onOutputFormatChange: vi.fn(),
  supportsWatermark: true, watermark: false, onWatermarkChange: vi.fn(),
  selectedNode: { id: 'node-1', label: '产品主图' },
  onInjectSelectedNode: vi.fn(), onUpload: vi.fn(), onSubmit: vi.fn()
})

describe('ImageGenerationComposer', () => {
  it('exposes compact capability-driven controls and selected-node injection', () => {
    const props = createProps()
    let renderer!: ReactTestRenderer
    act(() => { renderer = create(<ImageGenerationComposer {...props} />) })
    const root = renderer.root

    act(() => root.findByProps({ 'aria-label': '生成方式' }).props.onChange({ target: { value: 'smart-edit' } }))
    act(() => root.findByProps({ 'aria-label': '图片模型' }).props.onChange({ target: { value: 'seedream' } }))
    act(() => root.findByProps({ 'aria-label': '分辨率' }).props.onChange({ target: { value: '2K' } }))
    act(() => root.findByProps({ 'aria-label': '图片比例' }).props.onChange({ target: { value: '16:9' } }))
    act(() => root.findByProps({ 'aria-label': '输出格式' }).props.onChange({ target: { value: 'jpeg' } }))
    act(() => root.findByProps({ 'aria-label': '添加水印' }).props.onChange({ target: { checked: true } }))
    act(() => root.findByProps({ 'aria-label': '注入当前节点' }).props.onClick())

    expect(props.onWorkflowChange).toHaveBeenCalledWith('smart-edit')
    expect(props.onModelChange).toHaveBeenCalledWith('seedream')
    expect(props.onResolutionChange).toHaveBeenCalledWith('2K')
    expect(props.onAspectRatioChange).toHaveBeenCalledWith('16:9')
    expect(props.onOutputFormatChange).toHaveBeenCalledWith('jpeg')
    expect(props.onWatermarkChange).toHaveBeenCalledWith(true)
    expect(props.onInjectSelectedNode).toHaveBeenCalledWith('node-1')
  })

  it('sends one local image file and submits through explicit callbacks', () => {
    const props = createProps()
    let renderer!: ReactTestRenderer
    act(() => { renderer = create(<ImageGenerationComposer {...props} />) })
    const file = new File(['image'], 'reference.png', { type: 'image/png' })

    act(() => renderer.root.findByProps({ 'aria-label': '上传本地参考图' }).props.onChange({ target: { files: [file], value: 'reference.png' } }))
    act(() => renderer.root.findByProps({ 'aria-label': '图片生成输入' }).props.onSubmit({ preventDefault: vi.fn() }))

    expect(props.onUpload).toHaveBeenCalledWith(file)
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('uses a structured PromptDocument and keeps unresolved reference tokens visible', () => {
    const document: PromptDocument = {
      version: 1,
      segments: [
        { type: 'text', text: 'Use ' },
        { type: 'reference', referenceId: 'missing-reference', label: 'Missing' }
      ]
    }
    const props = {
      ...createProps(),
      promptDocument: document,
      onPromptDocumentChange: vi.fn(),
      unresolvedReferenceIds: ['missing-reference'],
      references: [{
        referenceId: 'reference-one',
        assetId: 'asset-one',
        label: 'One',
        imageUrl: '/one.png',
        mentioned: false,
        role: 'reference-image' as const,
        order: 0
      }]
    }

    let renderer!: ReactTestRenderer
    act(() => { renderer = create(<ImageGenerationComposer {...props} />) })

    expect(renderer.root.findByProps({ 'data-reference-id': 'missing-reference' }).props['data-unresolved']).toBe(true)
    expect(renderer.root.findAllByProps({ 'aria-label': '图片描述' })).toHaveLength(0)
  })

  it('supports source/reference roles, input ordering, prompt optimization, and custom dimensions', () => {
    const props: ImageGenerationComposerProps = {
      ...createProps(),
      promptOptimizationModes: ['standard', 'fast'],
      promptOptimization: 'standard',
      onPromptOptimizationChange: vi.fn(),
      aspectRatios: ['1:1', 'custom'],
      aspectRatio: 'custom',
      customWidth: 2048,
      customHeight: 2048,
      onCustomSizeChange: vi.fn(),
      references: [{
        referenceId: 'reference-one',
        assetId: 'asset-one',
        label: 'One',
        imageUrl: '/one.png',
        mentioned: false,
        role: 'reference-image',
        order: 0
      }],
      onReferenceRoleChange: vi.fn(),
      onMoveReference: vi.fn()
    }
    let renderer!: ReactTestRenderer
    act(() => { renderer = create(<ImageGenerationComposer {...props} />) })
    const root = renderer.root

    act(() => root.findByProps({ 'aria-label': '提示词优化' }).props.onChange({ target: { value: 'fast' } }))
    act(() => root.findByProps({ 'aria-label': '输入角色 One' }).props.onChange({ target: { value: 'source-image' } }))
    act(() => root.findByProps({ 'aria-label': '下移 One' }).props.onClick())
    act(() => root.findByProps({ 'aria-label': '自定义宽度' }).props.onChange({ target: { value: '2496' } }))
    act(() => root.findByProps({ 'aria-label': '自定义高度' }).props.onChange({ target: { value: '1664' } }))

    expect(props.onPromptOptimizationChange).toHaveBeenCalledWith('fast')
    expect(props.onReferenceRoleChange).toHaveBeenCalledWith('reference-one', 'source-image')
    expect(props.onMoveReference).toHaveBeenCalledWith('reference-one', 1)
    expect(props.onCustomSizeChange).toHaveBeenCalledWith(2496, 2048)
    expect(props.onCustomSizeChange).toHaveBeenCalledWith(2048, 1664)
  })

  it('accepts every official Seedream input format and blocks the eleventh image', () => {
    const props: ImageGenerationComposerProps = {
      ...createProps(),
      references: Array.from({ length: 10 }, (_, order) => ({
        referenceId: `reference-${order}`,
        assetId: `asset-${order}`,
        label: `${order}`,
        imageUrl: `/${order}.png`,
        mentioned: false,
        role: order === 0 ? 'source-image' : 'reference-image',
        order
      }))
    }
    let renderer!: ReactTestRenderer
    act(() => { renderer = create(<ImageGenerationComposer {...props} />) })

    const upload = renderer.root.findByProps({ 'aria-label': '上传本地参考图' })
    expect(upload.props.accept).toBe('image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/heic,image/heif,.heic,.heif')
    expect(renderer.root.findByProps({ 'aria-label': '打开本地参考图选择' }).props.disabled).toBe(true)
  })
})
