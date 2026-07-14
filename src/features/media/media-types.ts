export type RecentCaptureKind = 'screenshot' | 'screenRecording' | 'pastedMedia' | 'uploadedMedia'

export type RecentCaptureStatus = 'recent' | 'annotated' | 'registeredToPromptLibrary' | 'placedOnCanvas' | 'archived'

export type RecentCapturePurpose = 'inspirationReference' | 'generatedResult' | 'promptAttachment' | 'shotOutput'

export type RecentCaptureRole =
  | 'character'
  | 'scene'
  | 'prop'
  | 'composition'
  | 'lighting'
  | 'color'
  | 'style'
  | 'mood'
  | 'other'

export interface RecentCaptureItemViewModel {
  id: string
  assetId: string
  kind: RecentCaptureKind
  status: RecentCaptureStatus
  purpose: RecentCapturePurpose
  role?: RecentCaptureRole
  title: string
  prompt: string
  userNote: string
  sourcePlatform: string
  sourceUrl: string
  contentType: string
  revision: number
  originalFilename?: string
  registeredPromptId: string | null
  registeredAt: number | null
  linkedProjectId: string | null
  linkedCanvasNodeId: string | null
  origin: Record<string, unknown>
  sizeLabel: string
  dimensionsLabel?: string
  capturedAtLabel: string
  thumbnailUrl?: string
}

export const recentCaptureRoleOptions: Array<{ value: RecentCaptureRole }> = [
  { value: 'character' },
  { value: 'scene' },
  { value: 'prop' },
  { value: 'composition' },
  { value: 'lighting' },
  { value: 'color' },
  { value: 'style' },
  { value: 'mood' },
  { value: 'other' }
]

export const recentCapturePurposeOptions: Array<{ value: RecentCapturePurpose }> = [
  { value: 'inspirationReference' },
  { value: 'generatedResult' },
  { value: 'promptAttachment' },
  { value: 'shotOutput' }
]
