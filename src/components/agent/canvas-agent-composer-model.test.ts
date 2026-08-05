import { describe, expect, it } from 'vitest'
import {
  attachCanvasAgentNode,
  clearCanvasAgentTarget,
  removeCanvasAgentNode,
  serializeCanvasAgentComposer,
  type CanvasAgentAttachment
} from './canvas-agent-composer-model'

describe('canvas Agent composer model', () => {
  it('keeps one target first and demotes the previous target to a reference', () => {
    const initial: CanvasAgentAttachment[] = [
      { nodeId: 'text-a', role: 'target' },
      { nodeId: 'text-b', role: 'reference' }
    ]

    expect(attachCanvasAgentNode(initial, 'text-b', 'target')).toEqual([
      { nodeId: 'text-b', role: 'target' },
      { nodeId: 'text-a', role: 'reference' }
    ])
  })

  it('deduplicates attachments, removes labels, and enforces the ten-node limit', () => {
    const initial = Array.from({ length: 10 }, (_, index) => ({
      nodeId: `text-${index}`,
      role: (index === 0 ? 'target' : 'reference') as CanvasAgentAttachment['role']
    }))

    expect(attachCanvasAgentNode(initial, 'text-1', 'reference')).toHaveLength(10)
    expect(attachCanvasAgentNode(initial, 'text-10', 'reference')).toEqual(initial)
    expect(removeCanvasAgentNode(initial, 'text-1')).toHaveLength(9)
  })

  it('clears the target without removing it from the mounted node pool', () => {
    const initial: CanvasAgentAttachment[] = [
      { nodeId: 'text-a', role: 'target' },
      { nodeId: 'text-b', role: 'reference' }
    ]

    expect(clearCanvasAgentTarget(initial)).toEqual([
      { nodeId: 'text-a', role: 'reference' },
      { nodeId: 'text-b', role: 'reference' }
    ])
  })

  it('serializes atomic mentions as readable @ labels and keeps their node ids', () => {
    expect(serializeCanvasAgentComposer([
      { type: 'text', text: '以 ' },
      { type: 'mention', nodeId: 'text-a', label: '目标节点' },
      { type: 'text', text: ' 为目标，参考 ' },
      { type: 'mention', nodeId: 'text-b', label: '参考节点' }
    ])).toEqual({
      content: '以 @目标节点 为目标，参考 @参考节点',
      mentions: [
        { nodeId: 'text-a', label: '目标节点' },
        { nodeId: 'text-b', label: '参考节点' }
      ]
    })
  })
})
