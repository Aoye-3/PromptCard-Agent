import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ImageGenerationHistoryDialog } from './ImageGenerationHistoryDialog'
import type { ImageGenerationConversationSummary } from './types'

const conversations: ImageGenerationConversationSummary[] = [{
  id: 'conversation-1', title: '产品主视觉', updatedAt: 200,
  turns: [{
    id: 'turn-1', createdAt: 100, prompt: '银色产品，柔和棚拍光', state: 'succeeded',
    settings: { workflow: 'text-to-image', modelLabel: 'Seedream 5.0 Pro', resolution: '1K', aspectRatio: '1:1', outputFormat: 'png', watermark: false },
    result: { assetId: 'asset-1', imageUrl: '/storage-api/assets/asset-1', width: 1024, height: 1024 }
  }]
}, {
  id: 'conversation-2', title: '场景探索', updatedAt: 300, turns: []
}]

describe('ImageGenerationHistoryDialog', () => {
  it('shows project conversations, transcript, and continues by id without prompt prefill', () => {
    const onContinue = vi.fn()
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <ImageGenerationHistoryDialog open conversations={conversations} onClose={vi.fn()} onContinue={onContinue} />
      )
    })

    expect(renderer.root.findByProps({ role: 'dialog' }).props['aria-modal']).toBe(true)
    act(() => renderer.root.findByProps({ 'aria-label': '打开会话 产品主视觉' }).props.onClick())
    expect(renderer.root.findByProps({ children: '银色产品，柔和棚拍光' })).toBeTruthy()
    act(() => renderer.root.findByProps({ children: '继续此会话' }).props.onClick())

    expect(onContinue).toHaveBeenCalledWith('conversation-1')
    expect(renderer.root.findAllByType('textarea')).toHaveLength(0)
  })

  it('focuses the close control, closes on Escape, and restores previous focus', () => {
    const focusClose = vi.fn()
    const focusPrevious = vi.fn()
    const onClose = vi.fn()
    vi.stubGlobal('document', { activeElement: { focus: focusPrevious } })
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <ImageGenerationHistoryDialog open conversations={conversations} onClose={onClose} onContinue={vi.fn()} />,
        { createNodeMock: element => element.props['aria-label'] === '关闭历史记录' ? { focus: focusClose } : {} }
      )
    })

    expect(focusClose).toHaveBeenCalled()
    act(() => renderer.root.findByProps({ role: 'dialog' }).props.onKeyDown({ key: 'Escape', preventDefault: vi.fn() }))
    expect(onClose).toHaveBeenCalledTimes(1)
    act(() => renderer.unmount())
    expect(focusPrevious).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
