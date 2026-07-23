import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ImageGenerationConversationPanel } from './ImageGenerationConversationPanel'
import type { ImageGenerationConversationPanelProps } from './types'

const turns: ImageGenerationConversationPanelProps['turns'] = [
  {
    id: 'turn-new', createdAt: 200, prompt: '后来生成的场景', state: 'failed',
    settings: { workflow: 'smart-edit', modelLabel: 'Seedream 5.0 Pro', resolution: '2K', aspectRatio: '16:9', outputFormat: 'png', watermark: true },
    error: { message: '图片服务请求过于频繁，请稍后重试。', action: '稍后重试' }
  },
  {
    id: 'turn-old', createdAt: 100, prompt: '先生成的产品图', state: 'succeeded',
    settings: { workflow: 'text-to-image', modelLabel: 'Seedream 5.0 Pro', resolution: '1K', aspectRatio: '1:1', outputFormat: 'jpeg', watermark: false },
    result: { assetId: 'asset-one', imageUrl: '/storage-api/assets/asset-one', width: 1024, height: 1024 }
  }
]

const props = (): ImageGenerationConversationPanelProps => ({
  projectLabel: '品牌视觉项目',
  turns,
  composer: {
    prompt: '',
    onPromptChange: vi.fn(),
    workflows: [{ value: 'text-to-image', label: '文生图' }],
    workflow: 'text-to-image',
    onWorkflowChange: vi.fn(),
    models: [{ value: 'seedream', label: 'Seedream 5.0 Pro' }],
    modelId: 'seedream',
    onModelChange: vi.fn(),
    resolutions: ['1K', '2K'], resolution: '1K', onResolutionChange: vi.fn(),
    aspectRatios: ['1:1'], aspectRatio: '1:1', onAspectRatioChange: vi.fn(),
    outputFormats: ['png', 'jpeg'], outputFormat: 'png', onOutputFormatChange: vi.fn(),
    supportsWatermark: true, watermark: false, onWatermarkChange: vi.fn(),
    onUpload: vi.fn(), onSubmit: vi.fn()
  },
  conversations: [],
  onNewConversation: vi.fn(),
  onContinueConversation: vi.fn()
})

describe('ImageGenerationConversationPanel', () => {
  it('renders turns chronologically with request settings and result or error cards', () => {
    const markup = renderToStaticMarkup(<ImageGenerationConversationPanel {...props()} />)

    expect(markup).toContain('图片生成')
    expect(markup).toContain('新建会话')
    expect(markup).toContain('历史记录')
    expect(markup.indexOf('先生成的产品图')).toBeLessThan(markup.indexOf('后来生成的场景'))
    expect(markup).toContain('Seedream 5.0 Pro')
    expect(markup).toContain('1K · 1:1 · JPEG')
    expect(markup).toContain('/storage-api/assets/asset-one')
    expect(markup).toContain('图片服务请求过于频繁，请稍后重试。')
    expect(markup).toContain('稍后重试')
    expect(markup).not.toContain('取消生成')
    expect(markup).not.toContain('删除会话')
    expect(markup).not.toMatch(/\d+%/)
  })

  it('starts a new conversation and opens project history from the header', () => {
    const panelProps = props()
    let renderer!: ReactTestRenderer
    act(() => { renderer = create(<ImageGenerationConversationPanel {...panelProps} />) })

    act(() => renderer.root.findByProps({ 'aria-label': '新建图片生成会话' }).props.onClick())
    act(() => renderer.root.findByProps({ 'aria-label': '打开图片生成历史' }).props.onClick())

    expect(panelProps.onNewConversation).toHaveBeenCalledTimes(1)
    expect(renderer.root.findByProps({ role: 'dialog' })).toBeTruthy()
  })

  it('keeps the empty state compact and routes starter actions into the existing workflow', () => {
    const panelProps = {
      ...props(),
      turns: [],
      onOpenSubjectLibrary: vi.fn()
    }
    let renderer!: ReactTestRenderer
    act(() => { renderer = create(<ImageGenerationConversationPanel {...panelProps} />) })

    expect(renderer.root.findByProps({ 'aria-label': '图片生成会话' })).toBeTruthy()
    expect(renderer.root.findByProps({ 'aria-label': '开始一次图片生成' })).toBeTruthy()
    act(() => renderer.root.findByProps({ 'aria-label': '生成一张新图' }).props.onClick())
    act(() => renderer.root.findByProps({ 'aria-label': '编辑选中图片' }).props.onClick())
    act(() => renderer.root.findByProps({ 'aria-label': '从主体库添加' }).props.onClick())

    expect(panelProps.composer.onPromptChange).toHaveBeenCalledWith('生成一张新图片：')
    expect(panelProps.composer.onWorkflowChange).toHaveBeenCalledWith('smart-edit')
    expect(panelProps.onOpenSubjectLibrary).toHaveBeenCalledTimes(1)
  })
})
