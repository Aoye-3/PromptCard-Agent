import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { ResultActions } from './ResultActions'

describe('ResultActions', () => {
  it('exposes every result reuse destination with the run and local asset identity', () => {
    const handlers = {
      onView: vi.fn(),
      onSmartEdit: vi.fn(),
      onPlaceAsImage: vi.fn(),
      onConnectToGenerator: vi.fn(),
      onViewHistory: vi.fn(),
      onViewInMedia: vi.fn()
    }
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<ResultActions runId="run-1" assetId="asset-1" {...handlers} />)
    })

    const labels = ['查看大图', '智能改图', '作为图片放入画布', '连接到新图片生成节点', '查看本次历史', '在媒体库中查看']
    labels.forEach(label => act(() => renderer.root.findByProps({ children: label }).props.onClick()))
    Object.values(handlers).forEach(handler => expect(handler).toHaveBeenCalledWith({ runId: 'run-1', assetId: 'asset-1' }))
    expect(renderer.root.findAllByType('button')).toHaveLength(6)
  })
})
