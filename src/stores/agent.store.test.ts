import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from './agent.store'
import type { AgentWorkspaceContext, AgentWorkspaceProposal } from '@/models/Agent.model'

const workspaceProposal: AgentWorkspaceProposal = {
  kind: 'workspace_card_update',
  id: 'proposal-card',
  contextId: 'card:project-1:0',
  threadId: null,
  runId: null,
  agentName: 'DeepSeek Agent',
  updates: [{ cardId: 'card-1', content: 'Updated subject content' }],
  rationale: 'Make the selected card more specific',
  status: 'pending',
  createdAt: 1
}

const serviceMock = vi.hoisted(() => ({
  health: vi.fn(),
  bootstrap: vi.fn(),
  me: vi.fn(),
  models: vi.fn(),
  skills: vi.fn(),
  tools: vi.fn(),
  agents: vi.fn(),
  createThread: vi.fn(),
  runAgentMessage: vi.fn(),
  buildPromptLibraryContext: vi.fn(),
  parseAgentWorkspaceProposals: vi.fn()
}))

vi.mock('@/services/agent-runtime-service', () => ({
  agentRuntimeService: serviceMock
}))

describe('agent store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMock.createThread.mockResolvedValue('thread-1')
    serviceMock.runAgentMessage.mockResolvedValue({ text: 'agent response', payload: {} })
    serviceMock.buildPromptLibraryContext.mockReturnValue('[]')
    serviceMock.parseAgentWorkspaceProposals.mockReturnValue([workspaceProposal])
    useAgentStore.setState({
      runtimeStatus: 'connected',
      authStatus: 'authenticated',
      runtimeError: undefined,
      user: undefined,
      models: [],
      skills: [],
      tools: [],
      builtinTools: [],
      subagentEnabled: false,
      agents: [],
      activeThreadId: undefined,
      messages: [],
      running: false,
      proposals: []
    })
  })

  it('returns workspace proposals from sendMessage for auto-apply UI', async () => {
    const workspaceContext: AgentWorkspaceContext = {
      contextId: 'card:project-1:0',
      mode: 'card-workspace',
      projectId: 'project-1',
      projectTitle: 'Project',
      snapshot: {
        selectedCardIds: ['card-1'],
        cards: [{ id: 'card-1', type: 'subject', title: 'Subject', content: '' }]
      }
    }

    const returned = await useAgentStore.getState().sendMessage('补全选中卡片', [], {
      workspaceContext,
      mode: 'card-workspace'
    })

    const expectedProposal = { ...workspaceProposal, threadId: 'thread-1' }
    expect(returned).toEqual([expectedProposal])
    expect(useAgentStore.getState().proposals).toEqual([expectedProposal])
    expect(serviceMock.runAgentMessage).toHaveBeenCalledWith(
      'thread-1',
      expect.stringContaining('frontend will apply workspace_card_update')
    )
  })
})
