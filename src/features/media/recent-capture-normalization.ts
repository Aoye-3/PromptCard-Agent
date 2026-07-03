import type { RecentCaptureItem } from '@/storage/storage-service-client'
import type { RecentCaptureItemViewModel } from './media-types'

export const RECENT_CAPTURES_CHANGED_EVENT = 'recent-captures:changed'

export const createRecentCaptureViewModel = (capture: RecentCaptureItem): RecentCaptureItemViewModel => ({
  id: capture.id,
  assetId: capture.assetId,
  kind: capture.kind,
  status: capture.status,
  purpose: capture.purpose,
  role: capture.role || undefined,
  title: capture.title,
  prompt: capture.prompt,
  userNote: capture.userNote,
  sourcePlatform: capture.sourcePlatform,
  sourceUrl: capture.sourceUrl,
  contentType: capture.contentType,
  sizeLabel: formatBytes(capture.size),
  dimensionsLabel: capture.width > 0 && capture.height > 0 ? `${capture.width} x ${capture.height}` : undefined,
  capturedAtLabel: formatCapturedAt(capture.capturedAt)
})

export const createScreenshotCaptureDraft = (input: {
  assetId: string
  filename: string
  size: number
  width: number
  height: number
  capturedAt?: number
  selection?: { x: number; y: number; width: number; height: number }
}): Partial<RecentCaptureItem> & Pick<RecentCaptureItem, 'assetId'> => {
  const capturedAt = input.capturedAt || Date.now()
  return {
    id: `capture-${capturedAt}`,
    assetId: input.assetId,
    kind: 'screenshot',
    status: 'recent',
    purpose: 'inspirationReference',
    role: 'other',
    title: input.filename.replace(/\.[^.]+$/, '') || 'Screenshot capture',
    prompt: '',
    userNote: '',
    sourcePlatform: 'Floating toolbar',
    sourceUrl: '',
    contentType: 'image/png',
    size: input.size,
    width: input.width,
    height: input.height,
    capturedAt,
    origin: {
      type: 'floating-toolbar',
      selection: input.selection
    }
  }
}

export const notifyRecentCapturesChanged = () => {
  window.dispatchEvent(new CustomEvent(RECENT_CAPTURES_CHANGED_EVENT))
}

const formatBytes = (size: number): string => {
  if (!Number.isFinite(size) || size < 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const formatCapturedAt = (capturedAt: number): string => {
  const date = new Date(capturedAt)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  return date.toLocaleString()
}
