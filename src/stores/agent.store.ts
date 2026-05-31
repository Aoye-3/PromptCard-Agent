import { create } from 'zustand'
import { agentRuntimeService } from '@/services/agent-runtime-service'
import type {
  AgentAuthStatus,
  AgentInfo,
  AgentMessage,
  AgentPermissionScope,
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
    options?: {
      workspaceContext?: AgentWorkspaceContext
      mode?: AgentWorkspaceMode
      permissionScope?: AgentPermissionScope
    }
  ) => Promise<AgentWorkspaceProposal[]>
  markProposalStatus: (id: string, status: 'approved' | 'rejected') => void
  clearMessages: () => void
}

const messageId = () => `agent-message-${Date.now()}-${Math.random().toString(16).slice(2)}`

const loadRuntimeCatalog = async () => {
  const catalog = await agentRuntimeService.catalog()

  return {
    models: catalog.models || [],
    skills: catalog.skills || [],
    tools: catalog.tools || [],
    builtinTools: catalog.builtins || [],
    subagentEnabled: Boolean(catalog.subagentEnabled),
    agents: catalog.agents || []
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

  sendMessage: async (content, _presets, options) => {
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

      const result = await agentRuntimeService.sendMessage({
        threadId: get().activeThreadId,
        content,
        mode: options?.mode,
        permissionScope: options?.permissionScope || (options?.workspaceContext ? 'workspace-chatbot-agent' : 'prompt-library-agent'),
        workspaceContext: options?.workspaceContext
      })
      const proposals = result.proposals.map(proposal => ({
        ...proposal,
        threadId: proposal.threadId || result.threadId,
        contextId: proposal.contextId || options?.workspaceContext?.contextId
      }))

      set(state => ({
        running: false,
        activeThreadId: result.threadId,
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
