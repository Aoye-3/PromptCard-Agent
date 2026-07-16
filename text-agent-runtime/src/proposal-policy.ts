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

export interface InvocationInput {
  content: string
  permissionScope: PermissionScope
  workspaceContext: Record<string, any> | null
  promptLibrary: PromptLibraryItem[]
  attachment?: {
    assetId: string
    contentType: string
    data: string
  }
}

export interface InvocationPolicy {
  allowedProposalKinds: string[]
  selectedTextNodeId: string | null
}

export function buildInvocation(input: InvocationInput) {
  const snapshot = input.workspaceContext?.snapshot
  const selectedNode = snapshot?.selectedNode
  const selectedTextNodeId =
    selectedNode?.kind === 'text' && selectedNode?.id === snapshot?.selectedNodeId
      ? String(selectedNode.id)
      : null

  let allowedProposalKinds: string[] = []
  if (input.permissionScope === 'prompt-library-agent') {
    allowedProposalKinds = ['prompt_library_write_proposal']
  } else if (input.permissionScope === 'workspace-chatbot-agent') {
    allowedProposalKinds = selectedTextNodeId
      ? ['free_canvas_text_update']
      : ['free_canvas_text_create']
  }

  return {
    content: input.content.trim(),
    workspaceContext: input.workspaceContext,
    promptLibrary: input.promptLibrary.slice(0, 100),
    attachments: input.attachment
      ? [{
          assetId: input.attachment.assetId,
          mimeType: input.attachment.contentType,
          data: input.attachment.data
        }]
      : [],
    policy: {
      allowedProposalKinds,
      selectedTextNodeId
    } satisfies InvocationPolicy
  }
}
