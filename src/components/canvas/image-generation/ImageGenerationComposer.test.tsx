import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ImageGenerationComposer } from './ImageGenerationComposer'
import type { ImageGenerationComposerProps } from './types'

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
})
