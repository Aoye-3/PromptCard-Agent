import type { CardType, IPreset } from './Card.model'
import type { IStoryboardRow, IStoryboardSequence } from './PromptHistory.model'

export type AgentRuntimeStatus = 'unknown' | 'connected' | 'disconnected'

export type AgentAuthStatus =
  | 'unknown'
  | 'setup-required'
  | 'unauthenticated'
  | 'authenticated'

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
}

export interface AgentUser {
  id?: string
  email?: string
  name?: string
}

export interface AgentModelInfo {
  name: string
  display_name?: string
  supports_vision?: boolean
  supports_thinking?: boolean
  [key: string]: unknown
}

export interface AgentSkillInfo {
  name: string
  description?: string
  category?: string
  enabled?: boolean
  source?: string
  [key: string]: unknown
}

export interface AgentToolInfo {
  name: string
  group: string
  use?: string
  enabled?: boolean
  [key: string]: unknown
}

export interface AgentInfo {
  id?: string
  name?: string
  description?: string
  [key: string]: unknown
}

export interface PromptLibraryPresetDraft {
  type: CardType
  category: string
  label: string
  content: string
  meta?: Record<string, unknown>
}

export interface PromptLibraryWriteProposal {
  kind?: 'prompt_library_write_proposal'
  contextId?: string
  id: string
  threadId?: string | null
  runId?: string | null
  agentName: string
  operation: 'create' | 'update' | 'archive'
  targetPresetId?: string | null
  presetDraft: PromptLibraryPresetDraft
  rationale: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

export type AgentWorkspaceMode = 'card-workspace' | 'storyboard-workspace'

export interface AgentWorkspaceContext {
  contextId: string
  mode: AgentWorkspaceMode
  projectId: string
  projectTitle: string
  snapshot: Record<string, unknown>
}

export interface AgentCardCreateProposal {
  kind: 'workspace_card_create'
  contextId?: string
  id: string
  threadId?: string | null
  runId?: string | null
  agentName: string
  pageIndex?: number
  cardDraft: {
    type: CardType
    title: string
    content: string
    meta?: Record<string, unknown>
  }
  rationale: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

export interface AgentCardUpdateProposal {
  kind: 'workspace_card_update'
  contextId?: string
  id: string
  threadId?: string | null
  runId?: string | null
  agentName: string
  updates: Array<{
    cardId: string
    title?: string
    content?: string
  }>
  rationale: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

export interface AgentStoryboardUpdateProposal {
  kind: 'storyboard_update'
  contextId?: string
  id: string
  threadId?: string | null
  runId?: string | null
  agentName: string
  sequenceId?: string | null
  rowId?: string | null
  sequenceUpdates?: Partial<Pick<IStoryboardSequence, 'name' | 'description' | 'style' | 'constraints'>>
  rowUpdates?: Partial<Pick<IStoryboardRow, 'cutLabel' | 'timeRange' | 'subject' | 'action' | 'scene' | 'camera' | 'lighting' | 'audio' | 'duration'>>
  rationale: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
}

export type AgentWorkspaceProposal =
  | PromptLibraryWriteProposal
  | AgentCardCreateProposal
  | AgentCardUpdateProposal
  | AgentStoryboardUpdateProposal

export type PromptLibrarySnapshotPreset = Pick<
  IPreset,
  'id' | 'type' | 'category' | 'label' | 'content' | 'usageCount' | 'meta'
>
