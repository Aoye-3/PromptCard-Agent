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
  catalog: vi.fn(),
  sendMessage: vi.fn(),
  getModelConfig: vi.fn(),
  saveModelConfig: vi.fn(),
  testModelConfig: vi.fn()
}))

vi.mock('@/services/agent-runtime-service', () => ({
  agentRuntimeService: serviceMock
}))

describe('agent store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMock.sendMessage.mockResolvedValue({
      threadId: 'thread-1',
      text: 'agent response',
      proposals: [workspaceProposal],
      diagnostics: {}
    })
    serviceMock.getModelConfig.mockResolvedValue({
      enabled: true,
      apiBase: 'https://api.deepseek.com',
      apiKeyConfigured: false,
      apiKeyPreview: null,
      modelName: 'deepseek-chat',
      temperature: 0.3,
      maxTokens: 4096,
      availableModels: ['deepseek-chat']
    })
    serviceMock.saveModelConfig.mockResolvedValue({
      enabled: true,
      apiBase: 'https://api.deepseek.com',
      apiKeyConfigured: true,
      apiKeyPreview: 'sk-...1234',
      modelName: 'deepseek-chat',
      temperature: 0.2,
      maxTokens: 3000,
      availableModels: ['deepseek-chat']
    })
    serviceMock.testModelConfig.mockResolvedValue({ success: true, message: 'ok' })
    serviceMock.catalog.mockResolvedValue({
      models: [],
      skills: [],
      tools: [],
      builtins: [],
      subagentEnabled: false,
      agents: []
    })
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
      sessionsByKey: {},
      modelConfig: undefined,
      modelConfigSaving: false,
      modelConfigTesting: false,
      modelConfigTestResult: undefined
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

    const returned = await useAgentStore.getState().sendMessage('Improve selected card', [], {
      sessionKey: 'workspace:card:project-1',
      workspaceContext,
      mode: 'card-workspace'
    })

    const expectedProposal = { ...workspaceProposal, threadId: 'thread-1' }
    const session = useAgentStore.getState().getAgentSession('workspace:card:project-1')
    expect(returned).toEqual([expectedProposal])
    expect(session.proposals).toEqual([expectedProposal])
    expect(serviceMock.sendMessage).toHaveBeenCalledWith({
      threadId: undefined,
      content: 'Improve selected card',
      mode: 'card-workspace',
      permissionScope: 'workspace-chatbot-agent',
      sessionKey: 'workspace:card:project-1',
      projectId: 'project-1',
      workspaceContext
    })
  })

  it('keeps Agent panel and project chat sessions isolated', async () => {
    serviceMock.sendMessage
      .mockResolvedValueOnce({
        threadId: 'thread-diagnostics',
        text: 'diagnostics response',
        proposals: [],
        diagnostics: {}
      })
      .mockResolvedValueOnce({
        threadId: 'thread-project',
        text: 'project response',
        proposals: [workspaceProposal],
        diagnostics: {}
      })

    await useAgentStore.getState().sendMessage('runtime?', [], {
      sessionKey: 'diagnostics:agent-panel',
      permissionScope: 'workspace-chatbot-agent'
    })
    await useAgentStore.getState().sendMessage('project request', [], {
      sessionKey: 'workspace:card:project-1',
      mode: 'card-workspace',
      workspaceContext: {
        contextId: 'card:project-1:0',
        mode: 'card-workspace',
        projectId: 'project-1',
        projectTitle: 'Project',
        snapshot: {}
      }
    })

    const diagnostics = useAgentStore.getState().getAgentSession('diagnostics:agent-panel')
    const project = useAgentStore.getState().getAgentSession('workspace:card:project-1')
    expect(diagnostics.threadId).toBe('thread-diagnostics')
    expect(project.threadId).toBe('thread-project')
    expect(diagnostics.messages.map(message => message.content)).toEqual(['runtime?', 'diagnostics response'])
    expect(project.messages.map(message => message.content)).toEqual(['project request', 'project response'])
    expect(project.proposals).toHaveLength(1)
  })

  it('reuses only the thread id for the matching session key', async () => {
    await useAgentStore.getState().sendMessage('first', [], {
      sessionKey: 'workspace:card:project-1',
      permissionScope: 'workspace-chatbot-agent'
    })
    serviceMock.sendMessage.mockResolvedValueOnce({
      threadId: 'thread-1',
      text: 'second response',
      proposals: [],
      diagnostics: {}
    })

    await useAgentStore.getState().sendMessage('second', [], {
      sessionKey: 'workspace:card:project-1',
      permissionScope: 'workspace-chatbot-agent'
    })

    expect(serviceMock.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      threadId: 'thread-1',
      sessionKey: 'workspace:card:project-1'
    }))
  })

  it('clears and updates proposals only inside the target session', async () => {
    await useAgentStore.getState().sendMessage('project', [], {
      sessionKey: 'workspace:card:project-1',
      permissionScope: 'workspace-chatbot-agent'
    })
    await useAgentStore.getState().sendMessage('other', [], {
      sessionKey: 'workspace:card:project-2',
      permissionScope: 'workspace-chatbot-agent'
    })

    useAgentStore.getState().markProposalStatus('proposal-card', 'approved', 'workspace:card:project-1')
    expect(useAgentStore.getState().getAgentSession('workspace:card:project-1').proposals[0].status).toBe('approved')
    expect(useAgentStore.getState().getAgentSession('workspace:card:project-2').proposals[0].status).toBe('pending')

    useAgentStore.getState().clearMessages('workspace:card:project-1')
    expect(useAgentStore.getState().getAgentSession('workspace:card:project-1').messages).toEqual([])
    expect(useAgentStore.getState().getAgentSession('workspace:card:project-2').messages.length).toBeGreaterThan(0)
  })

  it('loads, saves, and tests DeepSeek model config', async () => {
    await useAgentStore.getState().loadModelConfig()
    expect(useAgentStore.getState().modelConfig?.modelName).toBe('deepseek-chat')

    await useAgentStore.getState().saveModelConfig({ temperature: 0.2, maxTokens: 3000 })
    expect(serviceMock.saveModelConfig).toHaveBeenCalledWith({ temperature: 0.2, maxTokens: 3000 })
    expect(useAgentStore.getState().modelConfig?.apiKeyConfigured).toBe(true)

    await useAgentStore.getState().testModelConfig()
    expect(useAgentStore.getState().modelConfigTestResult).toEqual({ success: true, message: 'ok' })
  })
})
