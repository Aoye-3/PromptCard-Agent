import { create } from 'zustand'
import { agentRuntimeService } from '@/services/agent-runtime-service'
import type {
  AgentAuthStatus,
  AgentInfo,
  AgentMessage,
  AgentModelInfo,
  AgentRuntimeStatus,
  AgentSkillInfo,
  AgentToolInfo,
  AgentUser,
  AgentWorkspaceContext,
  AgentWorkspaceMode,
  AgentWorkspaceProposal
} from '@/models/Agent.model'
import type { IPreset } from '@/models/Card.model'

interface AgentState {
  runtimeStatus: AgentRuntimeStatus
  authStatus: AgentAuthStatus
  runtimeError?: string
  user?: AgentUser
  models: AgentModelInfo[]
  skills: AgentSkillInfo[]
  tools: AgentToolInfo[]
  builtinTools: string[]
  subagentEnabled: boolean
  agents: AgentInfo[]
  activeThreadId?: string
  messages: AgentMessage[]
  running: boolean
  proposals: AgentWorkspaceProposal[]
  checkRuntime: () => Promise<void>
  bootstrapRuntime: () => Promise<void>
  sendMessage: (
    content: string,
    presets: IPreset[],
    options?: { workspaceContext?: AgentWorkspaceContext; mode?: AgentWorkspaceMode }
  ) => Promise<AgentWorkspaceProposal[]>
  markProposalStatus: (id: string, status: 'approved' | 'rejected') => void
  clearMessages: () => void
}

const messageId = () => `agent-message-${Date.now()}-${Math.random().toString(16).slice(2)}`

const runtimePrompt = (content: string, presets: IPreset[], workspaceContext?: AgentWorkspaceContext) => {
  const promptLibrarySnapshot = agentRuntimeService.buildPromptLibraryContext(presets)
  return [
    'You are the embedded PMAgent collaboration agent. Reply in concise Chinese by default.',
    'You are a conversational editor for PromptCard components. Talk with the user, then return executable JSON instructions when a card change is clearly requested.',
    'For card workspace edits, the frontend will apply workspace_card_update and workspace_card_create instructions directly. Do not describe them as pending proposals or ask for approval after the user has requested the change.',
    'If the user intent is unclear, ask a concise follow-up question in Chinese and do not return JSON.',
    'When changing workspace cards, include a JSON block with this envelope:',
    '{"kind":"agent_workspace_proposals","proposals":[{"kind":"workspace_card_update","id":"proposal-...","contextId":"...","agentName":"DeepSeek Agent","updates":[{"cardId":"card-id","title":"optional","content":"new content"}],"rationale":"reason","status":"pending","createdAt":0},{"kind":"workspace_card_create","id":"proposal-...","contextId":"...","agentName":"DeepSeek Agent","pageIndex":0,"cardDraft":{"type":"style","title":"Style","content":"content","meta":{"source":"agent-runtime"}},"rationale":"reason","status":"pending","createdAt":0},{"kind":"storyboard_update","id":"proposal-...","contextId":"...","agentName":"DeepSeek Agent","sequenceId":"sequence-id","rowId":"row-id","sequenceUpdates":{"style":"optional"},"rowUpdates":{"subject":"optional","action":"optional","scene":"optional","camera":"optional","lighting":"optional","audio":"optional","duration":"optional","timeRange":"optional","cutLabel":"optional"},"rationale":"reason","status":"pending","createdAt":0},{"kind":"prompt_library_write_proposal","id":"proposal-...","contextId":"...","agentName":"DeepSeek Agent","operation":"create","targetPresetId":null,"presetDraft":{"type":"style","category":"agent","label":"name","content":"content","meta":{"source":"agent-runtime"}},"rationale":"reason","status":"pending","createdAt":0}]}',
    'Only include fields that should change. Never invent cardId, sequenceId, or rowId; use IDs from the workspace snapshot. For workspace_card_update, use existing cardId values only. For workspace_card_create, use a valid card type.',
    workspaceContext ? 'Current workspace snapshot:' : '',
    workspaceContext ? JSON.stringify(workspaceContext, null, 2) : '',
    'Current Prompt library snapshot:',
    promptLibrarySnapshot,
    'User request:',
    content
  ].filter(Boolean).join('\n\n')
}

const loadRuntimeCatalog = async () => {
  const [models, skills, toolsPayload, agents] = await Promise.all([
    agentRuntimeService.models(),
    agentRuntimeService.skills(),
    agentRuntimeService.tools(),
    agentRuntimeService.agents()
  ])

  return {
    models,
    skills,
    tools: toolsPayload.tools,
    builtinTools: toolsPayload.builtins,
    subagentEnabled: toolsPayload.subagentEnabled,
    agents
  }
}

export const useAgentStore = create<AgentState>((set, get) => ({
  runtimeStatus: 'unknown',
  authStatus: 'unknown',
  models: [],
  skills: [],
  tools: [],
  builtinTools: [],
  subagentEnabled: false,
  agents: [],
  messages: [],
  running: false,
  proposals: [],

  checkRuntime: async () => {
    set({ runtimeStatus: 'unknown', runtimeError: undefined })
    try {
      await agentRuntimeService.health()
      set({ runtimeStatus: 'connected' })
      await get().bootstrapRuntime()
    } catch (error) {
      set({
        runtimeStatus: 'disconnected',
        authStatus: 'unknown',
        runtimeError: error instanceof Error ? error.message : String(error)
      })
    }
  },

  bootstrapRuntime: async () => {
    try {
      const bootstrap = await agentRuntimeService.bootstrap()
      const user = ((bootstrap as { user?: AgentUser }).user || (await agentRuntimeService.me())) as AgentUser
      const catalog = await loadRuntimeCatalog()
      set({
        authStatus: 'authenticated',
        user,
        runtimeError: undefined,
        ...catalog
      })
    } catch (error) {
      set({
        authStatus: 'unauthenticated',
        user: undefined,
        runtimeError: error instanceof Error ? error.message : String(error)
      })
    }
  },

  sendMessage: async (content, presets, options) => {
    const userMessage: AgentMessage = {
      id: messageId(),
      role: 'user',
      content,
      createdAt: Date.now()
    }
    set(state => ({
      running: true,
      messages: [...state.messages, userMessage],
      runtimeError: undefined
    }))

    try {
      if (get().authStatus !== 'authenticated') {
        await get().bootstrapRuntime()
      }

      let threadId = get().activeThreadId
      if (!threadId) {
        threadId = await agentRuntimeService.createThread()
        set({ activeThreadId: threadId })
      }

      const result = await agentRuntimeService.runAgentMessage(
        threadId,
        runtimePrompt(content, presets, options?.workspaceContext)
      )
      const proposals = agentRuntimeService.parseAgentWorkspaceProposals(result.text).map(proposal => ({
        ...proposal,
        threadId: proposal.threadId || threadId,
        contextId: proposal.contextId || options?.workspaceContext?.contextId
      }))

      set(state => ({
        running: false,
        messages: [
          ...state.messages,
          {
            id: messageId(),
            role: 'assistant',
            content: result.text,
            createdAt: Date.now()
          }
        ],
        proposals: mergeProposals(state.proposals, proposals)
      }))
      return proposals
    } catch (error) {
      set(state => ({
        running: false,
        runtimeError: error instanceof Error ? error.message : String(error),
        messages: [
          ...state.messages,
          {
            id: messageId(),
            role: 'assistant',
            content: `Agent call failed: ${error instanceof Error ? error.message : String(error)}`,
            createdAt: Date.now()
          }
        ]
      }))
      return []
    }
  },

  markProposalStatus: (id, status) => {
    set(state => ({
      proposals: state.proposals.map(proposal =>
        proposal.id === id ? { ...proposal, status } : proposal
      )
    }))
  },

  clearMessages: () => {
    set({ messages: [], proposals: [], activeThreadId: undefined, runtimeError: undefined })
  }
}))

function mergeProposals(
  current: AgentWorkspaceProposal[],
  incoming: AgentWorkspaceProposal[]
) {
  const seen = new Set(current.map(proposal => proposal.id))
  return [
    ...current,
    ...incoming.filter(proposal => {
      if (seen.has(proposal.id)) return false
      seen.add(proposal.id)
      return true
    })
  ]
}
