import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  MultiViewGroupPanel,
  type MultiViewGroupPanelMember
} from './MultiViewGroupPanel'

const members: MultiViewGroupPanelMember[] = [
  { nodeId: 'node-front', itemId: 'item-front', viewId: 'front', viewLabel: '正面', state: 'succeeded', assetId: 'asset-front' },
  { nodeId: 'node-left', itemId: 'item-left', viewId: 'left', viewLabel: '左侧', state: 'failed', assetId: null },
  { nodeId: 'node-rear', itemId: 'item-rear', viewId: 'rear', viewLabel: '背面', state: 'running', assetId: null }
]

describe('MultiViewGroupPanel', () => {
  it('stays clear of the collapsed project resource rail', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewGroupPanel
          groupId="group-1"
          members={members}
          sourceAvailable
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onUseAsReference={vi.fn()}
        />
      )
    })

    const panel = renderer.root.findByProps({ 'data-multi-view-group': 'group-1' })
    expect(panel.props.className).toContain('left-20')
    expect(panel.props.className).not.toContain('left-5')
  })

  it('shows partial state and per-member actions', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewGroupPanel
          groupId="group-1"
          members={members}
          sourceAvailable
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onUseAsReference={vi.fn()}
        />
      )
    })

    const text = JSON.stringify(renderer.toJSON())
    expect(text).toContain('部分完成')
    expect(text).toContain('"1","/","3"," 成功')
    expect(text).toContain('重试此视角')
    expect(text).toContain('作为参考')
  })

  it('retries only the chosen failed member and preserves historical members', () => {
    const onRetry = vi.fn()
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewGroupPanel
          groupId="group-1"
          members={members}
          sourceAvailable
          onSelect={vi.fn()}
          onRetry={onRetry}
          onUseAsReference={vi.fn()}
        />
      )
    })
    const retry = renderer.root.findAllByType('button').find(button => button.children.includes('重试此视角'))
    act(() => retry?.props.onClick())

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(members[1])
    expect(renderer.root.findAll(node => typeof node.props['data-multi-view-member'] === 'string')).toHaveLength(3)
  })

  it('disables retry when the source image no longer exists', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <MultiViewGroupPanel
          groupId="group-1"
          members={members}
          sourceAvailable={false}
          onSelect={vi.fn()}
          onRetry={vi.fn()}
          onUseAsReference={vi.fn()}
        />
      )
    })

    const retry = renderer.root.findAllByType('button').find(button => button.children.includes('重试此视角'))
    expect(retry?.props.disabled).toBe(true)
  })
})
