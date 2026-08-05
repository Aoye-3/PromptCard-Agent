export type PermissionScope =
  | 'workspace-chatbot-agent'
  | 'prompt-library-agent'
  | 'media-analysis-agent'

export interface PromptLibraryItem {
  id?: string
  type?: string
  category?: string
  label: string
  content: string
  meta?: Record<string, unknown>
}

export interface ConversationHistoryMessage extends Record<string, unknown> {
  role: string
  text?: string
  content: Array<Record<string, unknown> & { type?: string; text?: string }>
}

export interface InvocationInput {
  content: string
  permissionScope: PermissionScope
  workspaceContext: (Record<string, unknown> & {
    snapshot?: Record<string, unknown> & {
      selectedNode?: (Record<string, unknown> & { kind?: unknown; id?: unknown }) | null
      selectedNodeId?: unknown
    }
  }) | null
  promptLibrary: PromptLibraryItem[]
  history?: ConversationHistoryMessage[]
  skillSnapshots?: Array<{
    skillId: string
    revision: number
    digest: string
    instructions: string
    references?: Array<Record<string, unknown>>
  }>
  canvasNodeContext?: {
    mode: 'complete' | 'rewrite' | 'prompt-library'
    targetNodeId: string | null
    referenceNodeIds: string[]
    mentions: Array<{ nodeId: string; label: string }>
    selection?: {
      start: number
      end: number
      selectedText: string
      baseContentDigest: string
    }
    targetNode?: Record<string, unknown> | null
    referenceNodes?: Array<Record<string, unknown>>
  } | null
  mediaAction?: 'chat' | 'preview' | 'selection-rewrite'
  mediaPreview?: Record<string, unknown> | null
  selection?: {
    start: number
    end: number
    text: string
  } | null
  attachment?: {
    assetId: string
    contentType: string
    data: string
  }
}

export interface InvocationPolicy {
  allowedProposalKinds: string[]
  selectedTextNodeId: string | null
  canvasEditMode: 'append' | 'rewrite_all' | 'rewrite_selection' | null
  canvasSelection: { start: number; end: number; selectedText: string } | null
  canSearchPromptLibrary: boolean
}

export function buildInvocation(input: InvocationInput) {
  const snapshot = input.workspaceContext?.snapshot
  const selectedNode = snapshot?.selectedNode
  const hasExplicitCanvasContext = input.canvasNodeContext !== undefined && input.canvasNodeContext !== null
  const canSearchPromptLibrary = input.permissionScope === 'prompt-library-agent'
    || input.canvasNodeContext?.mode === 'prompt-library'
  const selectedTextNodeId = hasExplicitCanvasContext
    ? input.canvasNodeContext?.mode === 'prompt-library' ? null : input.canvasNodeContext?.targetNodeId || null
    : selectedNode?.kind === 'text' && selectedNode?.id === snapshot?.selectedNodeId
      ? String(selectedNode.id)
      : null
  const canvasSelection = input.canvasNodeContext?.mode === 'rewrite' && input.canvasNodeContext.selection
    ? {
        start: input.canvasNodeContext.selection.start,
        end: input.canvasNodeContext.selection.end,
        selectedText: input.canvasNodeContext.selection.selectedText
      }
    : null
  const canvasEditMode = selectedTextNodeId && input.canvasNodeContext
    ? input.canvasNodeContext.mode === 'complete'
      ? 'append'
      : canvasSelection ? 'rewrite_selection' : 'rewrite_all'
    : null

  let allowedProposalKinds: string[] = []
  if (input.permissionScope === 'prompt-library-agent') {
    allowedProposalKinds = ['prompt_library_write_proposal']
  } else if (input.permissionScope === 'workspace-chatbot-agent') {
    allowedProposalKinds = hasExplicitCanvasContext
      ? selectedTextNodeId ? ['free_canvas_text_update'] : []
      : selectedTextNodeId ? ['free_canvas_text_update'] : ['free_canvas_text_create']
  } else if (
    input.permissionScope === 'media-analysis-agent' &&
    input.mediaAction === 'preview'
  ) {
    allowedProposalKinds = ['media_prompt_preview']
  }

  return {
    content: input.content.trim(),
    workspaceContext: input.workspaceContext,
    promptLibrary: canSearchPromptLibrary ? input.promptLibrary.slice(0, 100) : [],
    history: (input.history || []).slice(-40),
    skillSnapshots: (input.skillSnapshots || []).slice(0, 8),
    canvasNodeContext: input.canvasNodeContext || null,
    mediaAction: input.mediaAction || 'chat',
    mediaPreview: input.mediaPreview || null,
    selection: input.selection || null,
    attachments: input.attachment
      ? [{
          assetId: input.attachment.assetId,
          mimeType: input.attachment.contentType,
          data: input.attachment.data
        }]
      : [],
    policy: {
      allowedProposalKinds,
      selectedTextNodeId,
      canvasEditMode,
      canvasSelection,
      canSearchPromptLibrary
    } satisfies InvocationPolicy
  }
}
