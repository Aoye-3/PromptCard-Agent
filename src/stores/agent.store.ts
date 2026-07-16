import { create } from 'zustand'
import { agentRuntimeService, type DeepSeekModelConfig, type DeepSeekModelConfigUpdate } from '@/services/agent-runtime-service'
import type {
  AgentAuthStatus,
  AgentConversationSession,
  AgentInfo,
  AgentMessage,
  AgentPermissionScope,
  AgentModelInfo,
  AgentRuntimeStatus,
  AgentSessionKey,
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
  sessionsByKey: Record<AgentSessionKey, AgentConversationSession>
  modelConfig?: DeepSeekModelConfig
  modelConfigSaving: boolean
  modelConfigTesting: boolean
  modelConfigTestResult?: { success: boolean; message: string }
  checkRuntime: () => Promise<void>
  bootstrapRuntime: () => Promise<void>
  loadModelConfig: () => Promise<void>
  saveModelConfig: (config: DeepSeekModelConfigUpdate) => Promise<void>
  testModelConfig: (config?: DeepSeekModelConfigUpdate) => Promise<void>
  sendMessage: (
    content: string,
    presets: IPreset[],
    options?: {
      workspaceContext?: AgentWorkspaceContext
      mode?: AgentWorkspaceMode
      permissionScope?: AgentPermissionScope
      sessionKey: AgentSessionKey
    }
  ) => Promise<AgentWorkspaceProposal[]>
  getAgentSession: (sessionKey: AgentSessionKey) => AgentConversationSession
  markProposalStatus: (id: string, status: 'approved' | 'rejected', sessionKey: AgentSessionKey) => void
  clearMessages: (sessionKey: AgentSessionKey) => void
}

const messageId = () => `agent-message-${Date.now()}-${Math.random().toString(16).slice(2)}`
const STORAGE_KEY = 'promptcard-agent-sessions-v1'

const emptySession = (): AgentConversationSession => ({
  messages: [],
  proposals: [],
  running: false,
  updatedAt: 0
})

const getSessionFromState = (state: Pick<AgentState, 'sessionsByKey'>, sessionKey: AgentSessionKey) =>
  state.sessionsByKey[sessionKey] || emptySession()

const persistSessions = (sessionsByKey: Record<AgentSessionKey, AgentConversationSession>) => {
  if (typeof window === 'undefined') return
  const serializable = Object.fromEntries(
    Object.entries(sessionsByKey).map(([key, session]) => [
      key,
      {
        threadId: session.threadId,
        messages: session.messages,
        proposals: session.proposals,
        updatedAt: session.updatedAt
      }
    ])
  )
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
}

const loadPersistedSessions = (): Record<AgentSessionKey, AgentConversationSession> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, Partial<AgentConversationSession>>)
        .filter(([, value]) => value && typeof value === 'object')
        .map(([key, value]) => [
          key,
          {
            threadId: typeof value.threadId === 'string' ? value.threadId : undefined,
            messages: Array.isArray(value.messages) ? value.messages : [],
            proposals: Array.isArray(value.proposals) ? value.proposals : [],
            running: false,
            runtimeError: undefined,
            updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0
          }
        ])
    )
  } catch {
    return {}
  }
}

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
  sessionsByKey: loadPersistedSessions(),
  modelConfigSaving: false,
  modelConfigTesting: false,

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
      const user = (bootstrap as { user?: AgentUser }).user as AgentUser
      const [catalog, modelConfig] = await Promise.all([
        loadRuntimeCatalog(),
        agentRuntimeService.getModelConfig()
      ])
      set({
        authStatus: 'authenticated',
        user,
        modelConfig,
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

  loadModelConfig: async () => {
    try {
      const modelConfig = await agentRuntimeService.getModelConfig()
      set({ modelConfig, runtimeError: undefined })
    } catch (error) {
      set({ runtimeError: error instanceof Error ? error.message : String(error) })
    }
  },

  saveModelConfig: async (config) => {
    set({ modelConfigSaving: true, runtimeError: undefined })
    try {
      const modelConfig = await agentRuntimeService.saveModelConfig(config)
      const catalog = await loadRuntimeCatalog()
      set({ modelConfigSaving: false, modelConfig, ...catalog })
    } catch (error) {
      set({
        modelConfigSaving: false,
        runtimeError: error instanceof Error ? error.message : String(error)
      })
    }
  },

  testModelConfig: async (config = {}) => {
    set({ modelConfigTesting: true, modelConfigTestResult: undefined, runtimeError: undefined })
    try {
      const modelConfigTestResult = await agentRuntimeService.testModelConfig(config)
      set({ modelConfigTesting: false, modelConfigTestResult })
    } catch (error) {
      set({
        modelConfigTesting: false,
        modelConfigTestResult: {
          success: false,
          message: error instanceof Error ? error.message : String(error)
        }
      })
    }
  },

  sendMessage: async (content, presets, options) => {
    const sessionKey = options?.sessionKey
    if (!sessionKey) {
      throw new Error('Agent sessionKey is required')
    }
    const userMessage: AgentMessage = {
      id: messageId(),
      role: 'user',
      content,
      createdAt: Date.now()
    }
    set(state => ({
      sessionsByKey: updateSessions(state.sessionsByKey, sessionKey, session => ({
        ...session,
        running: true,
        runtimeError: undefined,
        messages: [...session.messages, userMessage],
        updatedAt: Date.now()
      })),
      runtimeError: undefined
    }))

    try {
      if (get().authStatus !== 'authenticated') {
        await get().bootstrapRuntime()
      }

      const result = await agentRuntimeService.sendMessage({
        threadId: getSessionFromState(get(), sessionKey).threadId,
        content,
        mode: options?.mode,
        permissionScope: options?.permissionScope || (options?.workspaceContext ? 'workspace-chatbot-agent' : 'prompt-library-agent'),
        sessionKey,
        projectId: options?.workspaceContext?.projectId,
        workspaceContext: options?.workspaceContext,
        promptLibrary: presets.map(preset => ({
          id: preset.id,
          type: preset.type,
          category: preset.category,
          label: preset.label,
          content: preset.content,
          meta: preset.meta
        }))
      })
      const proposals = result.proposals.map(proposal => ({
        ...proposal,
        threadId: proposal.threadId || result.threadId,
        contextId: proposal.contextId || options?.workspaceContext?.contextId
      }))

      set(state => ({
        sessionsByKey: updateSessions(state.sessionsByKey, sessionKey, session => ({
          ...session,
          running: false,
          threadId: result.threadId,
          messages: [
            ...session.messages,
            {
              id: messageId(),
              role: 'assistant',
              content: result.text,
              createdAt: Date.now()
            }
          ],
          proposals: mergeProposals(session.proposals, proposals),
          updatedAt: Date.now()
        }))
      }))
      return proposals
    } catch (error) {
      set(state => ({
        runtimeError: error instanceof Error ? error.message : String(error),
        sessionsByKey: updateSessions(state.sessionsByKey, sessionKey, session => ({
          ...session,
          running: false,
          runtimeError: error instanceof Error ? error.message : String(error),
          messages: [
            ...session.messages,
            {
              id: messageId(),
              role: 'assistant',
              content: `Agent call failed: ${error instanceof Error ? error.message : String(error)}`,
              createdAt: Date.now()
            }
          ],
          updatedAt: Date.now()
        }))
      }))
      return []
    }
  },

  getAgentSession: (sessionKey) => getSessionFromState(get(), sessionKey),

  markProposalStatus: (id, status, sessionKey) => {
    set(state => ({
      sessionsByKey: updateSessions(state.sessionsByKey, sessionKey, session => ({
        ...session,
        proposals: session.proposals.map(proposal =>
          proposal.id === id ? { ...proposal, status } : proposal
        ),
        updatedAt: Date.now()
      }))
    }))
  },

  clearMessages: (sessionKey) => {
    set(state => ({
      sessionsByKey: updateSessions(state.sessionsByKey, sessionKey, () => emptySession()),
      runtimeError: undefined
    }))
  }
}))

function updateSessions(
  sessionsByKey: Record<AgentSessionKey, AgentConversationSession>,
  sessionKey: AgentSessionKey,
  updater: (session: AgentConversationSession) => AgentConversationSession
) {
  const next = {
    ...sessionsByKey,
    [sessionKey]: updater(getSessionFromState({ sessionsByKey }, sessionKey))
  }
  persistSessions(next)
  return next
}

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
