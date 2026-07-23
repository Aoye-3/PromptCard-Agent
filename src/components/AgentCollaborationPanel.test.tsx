import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentWorkspaceContext } from '@/models/Agent.model'

const mocks = vi.hoisted(() => ({
  checkRuntime: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue([]),
  markProposalStatus: vi.fn(),
  init: vi.fn()
}))

vi.mock('@/stores/agent.store', () => ({
  useAgentStore: () => ({
    runtimeStatus: 'connected',
    authStatus: 'authenticated',
    runtimeError: null,
    getAgentSession: () => ({
      messages: [],
      proposals: [],
      running: false,
      runtimeError: null
    }),
    checkRuntime: mocks.checkRuntime,
    sendMessage: mocks.sendMessage,
    markProposalStatus: mocks.markProposalStatus
  })
}))

vi.mock('@/stores/preset.store', () => ({
  usePresetStore: () => ({
    presets: [],
    initialized: true,
    init: mocks.init
  })
}))

import { AgentCollaborationPanel } from './AgentCollaborationPanel'

const workspaceContext: AgentWorkspaceContext = {
  contextId: 'canvas-context',
  mode: 'free-canvas-workspace',
  projectId: 'project-a',
  projectTitle: 'Project A',
  snapshot: {}
}

describe('AgentCollaborationPanel dense embedded mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses a compact context strip and inline composer without the full-width send bar', () => {
    const markup = renderToStaticMarkup(
      <AgentCollaborationPanel
        title="Free Canvas Agent"
        mode="free-canvas-workspace"
        workspaceContext={workspaceContext}
        contextLabel="已读取画布 · 1 个节点"
        onApplyWorkspaceProposal={vi.fn()}
        compact
        embedded
      />
    )

    expect(markup).toContain('已读取画布 · 1 个节点')
    expect(markup).toContain('可以直接修改当前画布')
    expect(markup).toContain('min-h-[58px]')
    expect(markup).toContain('aria-label="发送给 Agent"')
    expect(markup).not.toContain('>发送给 Agent</button>')
  })

  it('moves the third quick action behind the compact overflow control', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <AgentCollaborationPanel
          title="Free Canvas Agent"
          mode="free-canvas-workspace"
          workspaceContext={workspaceContext}
          contextLabel="已读取画布"
          onApplyWorkspaceProposal={vi.fn()}
          compact
          embedded
        />
      )
    })

    act(() => renderer.root.findByProps({ 'aria-label': '新增卡片' }).props.onClick())
    expect(renderer.root.findByType('textarea').props.value).toContain('新增一张最有帮助的提示词卡片')
  })

  it('sends with Enter while preserving Shift+Enter for a new line', async () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <AgentCollaborationPanel
          title="Free Canvas Agent"
          mode="free-canvas-workspace"
          workspaceContext={workspaceContext}
          onApplyWorkspaceProposal={vi.fn()}
          embedded
        />
      )
    })

    act(() => renderer.root.findByType('textarea').props.onChange({ target: { value: '修改画布内容' } }))
    act(() => renderer.root.findByType('textarea').props.onKeyDown({
      key: 'Enter',
      shiftKey: true,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn()
    }))
    expect(mocks.sendMessage).not.toHaveBeenCalled()

    await act(async () => {
      renderer.root.findByType('textarea').props.onKeyDown({
        key: 'Enter',
        shiftKey: false,
        nativeEvent: { isComposing: false },
        preventDefault: vi.fn()
      })
    })
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      '修改画布内容',
      [],
      expect.objectContaining({ mode: 'free-canvas-workspace' })
    )
  })
})
