import type {
  AgentInfo,
  AgentModelInfo,
  AgentSkillInfo,
  AgentToolInfo,
  AgentWorkspaceProposal,
  PromptLibraryWriteProposal
} from '@/models/Agent.model'

const AGENT_API_BASE = '/agent-api'
const PROMPTCARD_RUNTIME_BASE = `${AGENT_API_BASE}/promptcard/runtime`

const jsonHeaders = () => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  const csrfToken = readCookie('csrf_token')
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  return headers
}

const readCookie = (name: string) => {
  if (typeof document === 'undefined') return undefined
  const prefix = `${name}=`
  return document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length)
}

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: 'include',
    ...init
  })
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText)
    throw new Error(message || response.statusText)
  }
  return response.json() as Promise<T>
}

const normalizeItems = <T>(payload: unknown, keys: string[]): T[] => {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as T[]
    }
  }
  return []
}

const messageText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          return typeof record.text === 'string' ? record.text : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

export const agentRuntimeService = {
  health: () => requestJson<Record<string, unknown>>(`${PROMPTCARD_RUNTIME_BASE}/status`),

  setupStatus: () =>
    requestJson<{ needs_setup?: boolean; initialized?: boolean }>(
      `${AGENT_API_BASE}/v1/auth/setup-status`
    ),

  bootstrap: () =>
    requestJson<{ user?: unknown; expires_in?: number }>(
      `${PROMPTCARD_RUNTIME_BASE}/bootstrap`,
      {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({})
      }
    ),

  initialize: (email: string, password: string) =>
    requestJson(`${AGENT_API_BASE}/v1/auth/initialize`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password, name: 'PromptCard Admin' })
    }),

  login: async (email: string, password: string) => {
    const body = new URLSearchParams()
    body.set('username', email)
    body.set('password', password)
    return requestJson(`${AGENT_API_BASE}/v1/auth/login/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
  },

  me: () => requestJson(`${AGENT_API_BASE}/v1/auth/me`),

  catalog: () =>
    requestJson<{
      models?: AgentModelInfo[]
      skills?: AgentSkillInfo[]
      tools?: AgentToolInfo[]
      builtins?: string[]
      subagentEnabled?: boolean
      agents?: AgentInfo[]
    }>(`${PROMPTCARD_RUNTIME_BASE}/catalog`),

  models: async () => normalizeItems<AgentModelInfo>(await agentRuntimeService.catalog(), ['models', 'items']),

  skills: async () => normalizeItems<AgentSkillInfo>(await agentRuntimeService.catalog(), ['skills', 'items']),

  tools: async () => {
    const payload = await agentRuntimeService.catalog()
    return {
      tools: normalizeItems<AgentToolInfo>(payload, ['tools', 'items']),
      builtins: Array.isArray(payload.builtins) ? (payload.builtins as string[]) : [],
      subagentEnabled: Boolean(payload.subagentEnabled)
    }
  },

  agents: async () => normalizeItems<AgentInfo>(await agentRuntimeService.catalog(), ['agents', 'items']),

  sendMessage: (body: {
    threadId?: string
    content: string
    mode?: string
    workspaceContext?: unknown
  }) =>
    requestJson<{
      threadId: string
      text: string
      proposals: AgentWorkspaceProposal[]
      diagnostics?: Record<string, unknown>
    }>(`${PROMPTCARD_RUNTIME_BASE}/messages`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(body)
    }),

  parsePromptLibraryProposals,
  parseAgentWorkspaceProposals
}

export function extractAssistantText(payload: Record<string, unknown>): string {
  const candidates = [
    payload.output,
    payload.result,
    payload.final,
    (payload.values as Record<string, unknown> | undefined)?.messages,
    payload.messages
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate
    if (Array.isArray(candidate)) {
      const assistant = [...candidate]
        .reverse()
        .find(item => item && typeof item === 'object' && ['assistant', 'ai'].includes(String((item as Record<string, unknown>).role || (item as Record<string, unknown>).type || '').toLowerCase()))
      if (assistant) {
        const text = messageText((assistant as Record<string, unknown>).content)
        if (text) return text
      }
    }
  }

  return JSON.stringify(payload, null, 2)
}

export function parsePromptLibraryProposals(text: string): PromptLibraryWriteProposal[] {
  return parseAgentWorkspaceProposals(text).filter(isPromptLibraryProposal)
}

export function parseAgentWorkspaceProposals(text: string): AgentWorkspaceProposal[] {
  const proposals: AgentWorkspaceProposal[] = []
  const seenProposalIds = new Set<string>()
  const jsonCandidates = [
    ...text.matchAll(/```json\s*([\s\S]*?)```/gi),
    ...text.matchAll(/(\{[\s\S]*"(?:agent_workspace_proposals|prompt_library_write_proposal|workspace_card_update|workspace_card_create|storyboard_update)"[\s\S]*\})/gi)
  ].map(match => match[1])

  for (const candidate of jsonCandidates) {
    try {
      const parsed = JSON.parse(candidate)
      const items = parsed.kind === 'agent_workspace_proposals' && Array.isArray(parsed.proposals)
        ? parsed.proposals
        : [parsed.kind === 'prompt_library_write_proposal' ? parsed.proposal : parsed]

      for (const item of items) {
        const normalized = normalizeProposal(item, proposals.length)
        if (normalized && !seenProposalIds.has(normalized.id)) {
          seenProposalIds.add(normalized.id)
          proposals.push(normalized)
        }
      }
    } catch {
      continue
    }
  }

  return proposals
}

function normalizeProposal(value: unknown, index: number): AgentWorkspaceProposal | null {
  if (!value || typeof value !== 'object') return null
  const proposal = value as Record<string, any>
  const kind = String(proposal.kind || '')
  const base = {
    id: String(proposal.id || `proposal-${Date.now()}-${index}`),
    contextId: typeof proposal.contextId === 'string' ? proposal.contextId : undefined,
    threadId: proposal.threadId ?? null,
    runId: proposal.runId ?? null,
    agentName: String(proposal.agentName || 'DeepSeek Agent'),
    rationale: String(proposal.rationale || ''),
    status: proposal.status === 'approved' || proposal.status === 'rejected' ? proposal.status : 'pending',
    createdAt: Number(proposal.createdAt || Date.now())
  }

  if ((kind === 'prompt_library_write_proposal' || proposal.presetDraft) && proposal.presetDraft?.label && proposal.presetDraft?.content) {
    return {
      ...base,
      kind: 'prompt_library_write_proposal',
      operation: proposal.operation || 'create',
      targetPresetId: proposal.targetPresetId ?? null,
      presetDraft: proposal.presetDraft
    }
  }

  if (kind === 'workspace_card_create' && proposal.cardDraft?.type && proposal.cardDraft?.content) {
    return {
      ...base,
      kind: 'workspace_card_create',
      pageIndex: Number.isFinite(Number(proposal.pageIndex)) ? Number(proposal.pageIndex) : undefined,
      cardDraft: {
        type: proposal.cardDraft.type,
        title: String(proposal.cardDraft.title || proposal.cardDraft.type),
        content: String(proposal.cardDraft.content || ''),
        meta: proposal.cardDraft.meta || {}
      }
    }
  }

  if (kind === 'workspace_card_update' && Array.isArray(proposal.updates) && proposal.updates.length > 0) {
    const updates = proposal.updates
      .filter((update: any) => update?.cardId && (typeof update.title === 'string' || typeof update.content === 'string'))
      .map((update: any) => ({
        cardId: String(update.cardId),
        title: typeof update.title === 'string' ? update.title : undefined,
        content: typeof update.content === 'string' ? update.content : undefined
      }))
    if (updates.length === 0) return null
    return {
      ...base,
      kind: 'workspace_card_update',
      updates
    }
  }

  if (kind === 'storyboard_update' && (proposal.sequenceUpdates || proposal.rowUpdates)) {
    return {
      ...base,
      kind: 'storyboard_update',
      sequenceId: proposal.sequenceId ?? null,
      rowId: proposal.rowId ?? null,
      sequenceUpdates: pickAllowed(proposal.sequenceUpdates, ['name', 'description', 'style', 'constraints']),
      rowUpdates: pickAllowed(proposal.rowUpdates, ['cutLabel', 'timeRange', 'subject', 'action', 'scene', 'camera', 'lighting', 'audio', 'duration'])
    }
  }

  return null
}

function pickAllowed(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const result: Record<string, string> = {}
  for (const key of keys) {
    if (typeof source[key] === 'string') result[key] = source[key] as string
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function isPromptLibraryProposal(proposal: AgentWorkspaceProposal): proposal is PromptLibraryWriteProposal {
  return proposal.kind === 'prompt_library_write_proposal' || Boolean((proposal as PromptLibraryWriteProposal).presetDraft)
}
