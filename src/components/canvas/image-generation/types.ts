export type ImageGenerationWorkflow =
  | 'text-to-image'
  | 'reference-generate'
  | 'smart-edit'
  | 'region-edit'

export type ImageGenerationTurnState = 'queued' | 'running' | 'succeeded' | 'failed'
export type ImageGenerationTurnAction = 'again' | 'edit' | 'reference' | 'place' | 'media'

export interface ImageGenerationTurnSettings {
  workflow: ImageGenerationWorkflow
  modelLabel: string
  resolution: string
  aspectRatio: string
  outputFormat: string
  watermark: boolean
}

export interface ImageGenerationTurn {
  id: string
  createdAt: number
  prompt: string
  state: ImageGenerationTurnState
  settings: ImageGenerationTurnSettings
  inputs?: Array<{ referenceId: string; assetId: string; imageUrl: string }>
  regionCount?: number
  result?: {
    assetId: string
    imageUrl: string
    width: number
    height: number
  }
  error?: { message: string; action?: string }
}

export interface ImageGenerationConversationSummary {
  id: string
  title: string
  updatedAt: number
  turns: ImageGenerationTurn[]
}

export interface SelectOption<T extends string = string> {
  value: T
  label: string
}

export interface ImageGenerationComposerProps {
  prompt: string
  onPromptChange: (value: string) => void
  references?: Array<{ referenceId: string; label: string; imageUrl: string; mentioned: boolean }>
  onMentionReference?: (referenceId: string) => void
  onRemoveReference?: (referenceId: string) => void
  workflows: SelectOption<ImageGenerationWorkflow>[]
  workflow: ImageGenerationWorkflow
  onWorkflowChange: (value: ImageGenerationWorkflow) => void
  models: SelectOption[]
  modelId: string
  onModelChange: (value: string) => void
  resolutions: string[]
  resolution: string
  onResolutionChange: (value: string) => void
  aspectRatios: string[]
  aspectRatio: string
  onAspectRatioChange: (value: string) => void
  outputFormats: string[]
  outputFormat: string
  onOutputFormatChange: (value: string) => void
  supportsWatermark: boolean
  watermark: boolean
  onWatermarkChange: (value: boolean) => void
  selectedNode?: { id: string; label: string }
  onInjectSelectedNode?: (nodeId: string) => void
  onUpload: (file: File) => void
  onEditRegions?: () => void
  onSubmit: () => void
  disabled?: boolean
  missingRequirements?: string[]
}

export interface ImageGenerationConversationPanelProps {
  projectLabel: string
  conversationLabel?: string
  statusLabel?: string
  statusReady?: boolean
  onConfigureModel?: () => void
  turns: ImageGenerationTurn[]
  composer: ImageGenerationComposerProps
  conversations: ImageGenerationConversationSummary[]
  onNewConversation: () => void
  onContinueConversation: (conversationId: string) => void
  onTurnAction?: (turn: ImageGenerationTurn, action: ImageGenerationTurnAction) => void
}

export interface ImageGenerationHistoryDialogProps {
  open: boolean
  conversations: ImageGenerationConversationSummary[]
  initialConversationId?: string
  onClose: () => void
  onContinue: (conversationId: string) => void
}
