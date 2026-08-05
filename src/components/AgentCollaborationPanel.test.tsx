import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMessage, AgentWorkspaceContext } from '@/models/Agent.model'

const mocks = vi.hoisted(() => ({
  checkRuntime: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue([]),
  markProposalStatus: vi.fn(),
  init: vi.fn(),
  sessionError: undefined as string | undefined,
  messages: [] as AgentMessage[]
}))

vi.mock('@/stores/agent.store', () => ({
  useAgentStore: () => ({
    runtimeStatus: 'connected',
    authStatus: 'authenticated',
    runtimeError: null,
    getAgentSession: () => ({
      messages: mocks.messages,
      proposals: [],
      running: false,
      runtimeError: mocks.sessionError
    }),
    skills: [{ id: 'SKL-tone', name: 'Tone Helper', source: 'external', trustState: 'trusted', toolDependencies: [] }],
    tools: [],
    checkRuntime: mocks.checkRuntime,
    sendMessage: mocks.sendMessage,
    markProposalStatus: mocks.markProposalStatus,
    hydrateSession: vi.fn()
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
  snapshot: {
    nodes: [
      { id: 'text-1', kind: 'text', title: 'TXT-ABC123', displayText: 'Secret full prompt', userText: 'Secret full prompt' },
      { id: 'text-2', kind: 'text', title: 'Reference node', displayText: 'Reference body', userText: 'Reference body' }
    ]
  }
}

describe('AgentCollaborationPanel dense embedded mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sessionError = undefined
    mocks.messages = []
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
    expect(markup).toContain('contenteditable="true"')
    expect(markup).toContain('aria-label="发送给 Agent"')
    expect(markup).toContain('Canvas Prompt Editor')
    expect(markup).toContain('Skill')
    expect(markup).toContain('Prompt库调取')
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
    expect(renderer.root.findByProps({ contentEditable: true }).props['data-agent-composer']).toBe(true)
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

    const composer = renderer.root.findByProps({ contentEditable: true })
    act(() => composer.props.onInput({ currentTarget: { textContent: '修改画布内容' } }))
    act(() => composer.props.onKeyDown({
      key: 'Enter',
      shiftKey: true,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn()
    }))
    expect(mocks.sendMessage).not.toHaveBeenCalled()

    await act(async () => {
      composer.props.onKeyDown({
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

  it('attaches a completion target without injecting its full content into the composer', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <AgentCollaborationPanel
          title="Free Canvas Agent"
          mode="free-canvas-workspace"
          workspaceContext={workspaceContext}
          onApplyWorkspaceProposal={vi.fn()}
          draftRequest={{
            id: 'complete-text-node-1',
            canvasNode: { nodeId: 'text-1', role: 'target', mode: 'complete' }
          }}
          embedded
        />
      )
    })

    const markup = JSON.stringify(renderer.toJSON())
    expect(markup).toContain('TXT-ABC123')
    expect(markup).not.toContain('Secret full prompt')
    expect(renderer.root.findByProps({ 'aria-label': 'Canvas Agent 编辑模式' }).props.value).toBe('complete')
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('renders a scrollable chat history with user messages aligned right and Agent messages left', () => {
    mocks.messages = Array.from({ length: 12 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `content-${index}`,
      createdAt: index
    }))

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

    const history = renderer.root.findByProps({ 'aria-label': 'Agent 对话消息' })
    expect(history.props.className).toContain('overflow-y-auto')
    expect(renderer.root.findAllByProps({ 'data-agent-message-role': 'user' })[0].props.className).toContain('justify-end')
    expect(renderer.root.findAllByProps({ 'data-agent-message-role': 'assistant' })[0].props.className).toContain('justify-start')
    const markup = JSON.stringify(renderer.toJSON())
    expect(markup).toContain('content-0')
    expect(markup).toContain('content-11')
  })

  it('summarizes oversized Prompt Library validation errors instead of expanding raw request data', () => {
    mocks.sessionError = '{"detail":[{"type":"too_long","loc":["body","promptLibrary"],"msg":"List should have at most 200 items after validation, not 254","input":[{"content":"secret prompt body"}]}]}'

    const markup = renderToStaticMarkup(
      <AgentCollaborationPanel
        title="Free Canvas Agent"
        mode="free-canvas-workspace"
        workspaceContext={workspaceContext}
        onApplyWorkspaceProposal={vi.fn()}
        embedded
      />
    )

    expect(markup).toContain('Prompt Library 条目超过上限（254/200）')
    expect(markup).not.toContain('secret prompt body')
  })

  it('keeps a referenced node in the pool while the modification target starts empty', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <AgentCollaborationPanel
          title="Free Canvas Agent"
          mode="free-canvas-workspace"
          workspaceContext={workspaceContext}
          onApplyWorkspaceProposal={vi.fn()}
          draftRequest={{ id: 'reference-1', canvasNode: { nodeId: 'text-2', role: 'reference' } }}
          embedded
        />
      )
    })

    expect(renderer.root.findByProps({ 'aria-label': '选择被修改对象' }).props['aria-expanded']).toBe(false)
    expect(JSON.stringify(renderer.toJSON())).toContain('尚未选择被修改对象')
    expect(JSON.stringify(renderer.toJSON())).toContain('Reference node')

    act(() => renderer.root.findByProps({ 'aria-label': '选择被修改对象' }).props.onClick())
    act(() => renderer.root.findByProps({ 'aria-label': '设为被修改对象 Reference node' }).props.onClick())

    expect(JSON.stringify(renderer.toJSON())).toContain('被修改对象')
    expect(renderer.root.findByProps({ 'aria-label': '清空被修改对象' })).toBeTruthy()

    act(() => renderer.root.findByProps({ 'aria-label': '清空被修改对象' }).props.onClick())
    expect(JSON.stringify(renderer.toJSON())).toContain('尚未选择被修改对象')
    expect(JSON.stringify(renderer.toJSON())).toContain('Reference node')
  })

  it('sends mounted references with a null modification target', async () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <AgentCollaborationPanel
          title="Free Canvas Agent"
          mode="free-canvas-workspace"
          workspaceContext={workspaceContext}
          onApplyWorkspaceProposal={vi.fn()}
          draftRequest={{ id: 'reference-only', canvasNode: { nodeId: 'text-2', role: 'reference' } }}
          embedded
        />
      )
    })

    const composer = renderer.root.findByProps({ contentEditable: true })
    act(() => composer.props.onInput({ currentTarget: { textContent: '先讨论参考节点' } }))
    await act(async () => {
      composer.props.onKeyDown({
        key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn()
      })
    })

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      '先讨论参考节点',
      [],
      expect.objectContaining({
        canvasNodeContext: expect.objectContaining({
          targetNodeId: null,
          referenceNodeIds: ['text-2']
        })
      })
    )
  })

  it('opens the mounted-node mention list when @ follows Chinese text without whitespace', () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <AgentCollaborationPanel
          title="Free Canvas Agent"
          mode="free-canvas-workspace"
          workspaceContext={workspaceContext}
          onApplyWorkspaceProposal={vi.fn()}
          draftRequest={{ id: 'mention-reference', canvasNode: { nodeId: 'text-2', role: 'reference' } }}
          embedded
        />
      )
    })

    const composer = renderer.root.findByProps({ contentEditable: true })
    act(() => composer.props.onInput({ currentTarget: { textContent: '请参考@' } }))

    expect(renderer.root.findByProps({ 'aria-label': '可引用的文字节点' })).toBeTruthy()
    expect(JSON.stringify(renderer.toJSON())).toContain('Reference node')
  })

  it('retains node labels when sending fails', async () => {
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <AgentCollaborationPanel
          title="Free Canvas Agent"
          mode="free-canvas-workspace"
          workspaceContext={workspaceContext}
          onApplyWorkspaceProposal={vi.fn()}
          draftRequest={{ id: 'target-1', canvasNode: { nodeId: 'text-1', role: 'target', mode: 'complete' } }}
          embedded
        />
      )
    })
    const composer = renderer.root.findByProps({ contentEditable: true })
    act(() => composer.props.onInput({ currentTarget: { textContent: '补全它' } }))
    mocks.sessionError = 'runtime failed'

    await act(async () => {
      composer.props.onKeyDown({
        key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false }, preventDefault: vi.fn()
      })
    })

    expect(JSON.stringify(renderer.toJSON())).toContain('TXT-ABC123')
  })
})
