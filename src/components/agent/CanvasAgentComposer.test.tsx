import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CanvasAgentComposer } from './CanvasAgentComposer'

const baseProps = {
  nodes: [],
  attachments: [],
  editMode: 'complete' as const,
  running: false,
  disabled: false,
  resetKey: 0,
  onEditModeChange: vi.fn(),
  onRemoveNode: vi.fn(),
  onSetTarget: vi.fn(),
  onClearTarget: vi.fn(),
  onSubmit: vi.fn(),
  onModelChange: vi.fn()
}

describe('CanvasAgentComposer model and edit controls', () => {
  it('renders the conversation model selector beside the three edit modes', () => {
    const markup = renderToStaticMarkup(
      <CanvasAgentComposer
        {...baseProps}
        selectedModelKey="connection-1::doubao-seed-2-0-lite-260215"
        modelOptions={[
          {
            key: 'connection-1::doubao-seed-2-0-lite-260215',
            displayName: 'Doubao Seed 2.0 Lite',
            available: true
          },
          {
            key: 'connection-1::doubao-seed-2-0-pro-260215',
            displayName: 'Doubao Seed 2.0 Pro',
            available: false,
            unavailableReason: '连接测试失败'
          }
        ]}
      />
    )

    expect(markup).toContain('aria-label="对话模型"')
    expect(markup).toContain('Doubao Seed 2.0 Lite')
    expect(markup).toContain('Doubao Seed 2.0 Pro · 连接测试失败')
    expect(markup).toContain('分析原文并穿插补充')
    expect(markup).toContain('Prompt库调取')
  })

  it('describes rewrite as creating a new node without changing the source', () => {
    const markup = renderToStaticMarkup(
      <CanvasAgentComposer
        {...baseProps}
        editMode="rewrite"
        selectedModelKey="connection-1::model"
        modelOptions={[{ key: 'connection-1::model', displayName: 'Model', available: true }]}
      />
    )

    expect(markup).toContain('生成新文本节点，原节点不变')
  })
})
