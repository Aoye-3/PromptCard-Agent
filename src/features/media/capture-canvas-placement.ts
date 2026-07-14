import type { FreeCanvasMediaNode } from '@/domain/free-canvas/free-canvas'
import type { RecentCaptureItem } from '@/storage/storage-service-client'
import { storage } from '@/utils/storage'

export const createCaptureCanvasMediaNode = (
  capture: RecentCaptureItem,
  timestamp = Date.now(),
  assetUrl: (assetId: string) => string = storage.assets.url
): FreeCanvasMediaNode => {
  const size = fitCaptureForCanvas(capture.width, capture.height)
  return {
    id: `capture-media-${capture.id}-${timestamp}`,
    kind: 'imageAsset',
    title: capture.title,
    position: { x: 120, y: 120 },
    width: size.width,
    height: size.height,
    assetId: capture.assetId,
    imageUrl: assetUrl(capture.assetId),
    meta: {
      recentCaptureId: capture.id,
      originalWidth: capture.width,
      originalHeight: capture.height
    }
  }
}

export const createCaptureCanvasUpdates = (
  capture: RecentCaptureItem,
  projectId: string,
  nodeId: string
): Partial<RecentCaptureItem> => ({
  status: capture.registeredPromptId ? 'registeredToPromptLibrary' : 'placedOnCanvas',
  linkedProjectId: projectId,
  linkedCanvasNodeId: nodeId
})

const fitCaptureForCanvas = (width: number, height: number): { width: number; height: number } => {
  const maximum = 360
  const safeWidth = Math.max(1, width || maximum)
  const safeHeight = Math.max(1, height || 220)
  const scale = maximum / Math.max(safeWidth, safeHeight)
  return { width: safeWidth * scale, height: safeHeight * scale }
}
