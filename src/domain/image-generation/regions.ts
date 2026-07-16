import type { ImageRegion, ImageRegionInputType } from './image-generation'
import { SEEDREAM_5_PRO_IMAGE_CAPABILITIES } from './image-generation'

export const REGION_GRID_MAX = 999
export const MIN_BBOX_GRID_SIZE = 1

export interface RegionGridPoint {
  x: number
  y: number
}

export interface DisplayPoint {
  x: number
  y: number
}

export interface ImageDisplayMetrics {
  viewportWidth: number
  viewportHeight: number
  imageWidth: number
  imageHeight: number
  devicePixelRatio?: number
  zoom?: number
}

export interface ContainedImageRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BoundImagePointRegion extends RegionGridPoint {
  id: string
  referenceId: string
  type: 'point'
}

export interface BoundImageBoundingBoxRegion extends RegionGridPoint {
  id: string
  referenceId: string
  type: 'bbox'
  width: number
  height: number
}

export type BoundImageRegion = BoundImagePointRegion | BoundImageBoundingBoxRegion

export interface ImageRegionBinding {
  regionId: string
  referenceId: string
}

export interface ImageRegionCapabilities {
  modelId: string
  regionInputs: readonly ImageRegionInputType[]
}

export interface ImageRegionSource {
  referenceId: string
  label: string
  role: 'source-image' | 'reference-image'
  assetId: string
  imageUrl: string
}

export type BoundImageRegionValidationErrorCode =
  | 'unresolved_region_reference'
  | 'stale_region_reference'
  | 'invalid_region_geometry'

export interface BoundImageRegionValidationError {
  code: BoundImageRegionValidationErrorCode
  regionId: string
  referenceId: string
}

export interface BoundImageRegionValidation {
  validationErrors: BoundImageRegionValidationError[]
  canGenerate: boolean
}

export interface RegionHistory {
  past: BoundImageRegion[][]
  present: BoundImageRegion[]
  future: BoundImageRegion[][]
}

export type RegionHistoryAction =
  | { type: 'reset'; regions: readonly BoundImageRegion[] }
  | { type: 'add'; region: BoundImageRegion }
  | { type: 'move'; regionId: string; dx: number; dy: number }
  | { type: 'delete'; regionId: string }
  | { type: 'rebind'; regionId: string; referenceId: string }
  | { type: 'undo' }
  | { type: 'redo' }

export const SEEDREAM_5_PRO_REGION_CAPABILITIES: ImageRegionCapabilities = {
  modelId: SEEDREAM_5_PRO_IMAGE_CAPABILITIES.modelId,
  regionInputs: SEEDREAM_5_PRO_IMAGE_CAPABILITIES.regionInputs
}

export const imageRegionCapabilitiesForModel = (
  modelId: string
): ImageRegionCapabilities | null => (
  modelId === SEEDREAM_5_PRO_REGION_CAPABILITIES.modelId
    ? SEEDREAM_5_PRO_REGION_CAPABILITIES
    : null
)

export const containedImageRect = (metrics: ImageDisplayMetrics): ContainedImageRect => {
  if (
    metrics.viewportWidth <= 0
    || metrics.viewportHeight <= 0
    || metrics.imageWidth <= 0
    || metrics.imageHeight <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  const scale = Math.min(
    metrics.viewportWidth / metrics.imageWidth,
    metrics.viewportHeight / metrics.imageHeight
  )
  const width = metrics.imageWidth * scale
  const height = metrics.imageHeight * scale
  const zoom = Math.max(0.01, metrics.zoom || 1)
  const zoomedWidth = width * zoom
  const zoomedHeight = height * zoom
  return {
    x: (metrics.viewportWidth - zoomedWidth) / 2,
    y: (metrics.viewportHeight - zoomedHeight) / 2,
    width: zoomedWidth,
    height: zoomedHeight
  }
}

export const displayToRegionPoint = (
  point: DisplayPoint,
  metrics: ImageDisplayMetrics
): RegionGridPoint => {
  const imageRect = containedImageRect(metrics)
  if (imageRect.width === 0 || imageRect.height === 0) return { x: 0, y: 0 }
  return {
    x: toGridCoordinate((point.x - imageRect.x) / imageRect.width),
    y: toGridCoordinate((point.y - imageRect.y) / imageRect.height)
  }
}

export const regionToDisplayPoint = (
  point: RegionGridPoint,
  metrics: ImageDisplayMetrics
): DisplayPoint => {
  const imageRect = containedImageRect(metrics)
  return {
    x: imageRect.x + (clampGridCoordinate(point.x) / REGION_GRID_MAX) * imageRect.width,
    y: imageRect.y + (clampGridCoordinate(point.y) / REGION_GRID_MAX) * imageRect.height
  }
}

export const bboxFromDisplayDrag = (
  id: string,
  referenceId: string,
  start: DisplayPoint,
  end: DisplayPoint,
  metrics: ImageDisplayMetrics
): BoundImageBoundingBoxRegion | null => {
  const startPoint = displayToRegionPoint(start, metrics)
  const endPoint = displayToRegionPoint(end, metrics)
  const x = Math.min(startPoint.x, endPoint.x)
  const y = Math.min(startPoint.y, endPoint.y)
  const width = Math.max(startPoint.x, endPoint.x) - x
  const height = Math.max(startPoint.y, endPoint.y) - y
  if (width < MIN_BBOX_GRID_SIZE || height < MIN_BBOX_GRID_SIZE) return null
  return { id, referenceId, type: 'bbox', x, y, width, height }
}

export const moveBoundImageRegion = (
  region: BoundImageRegion,
  dx: number,
  dy: number
): BoundImageRegion => {
  const roundedDx = Math.round(dx)
  const roundedDy = Math.round(dy)
  if (region.type === 'point') {
    return {
      ...region,
      x: clampGridCoordinate(region.x + roundedDx),
      y: clampGridCoordinate(region.y + roundedDy)
    }
  }
  return {
    ...region,
    x: clampInteger(region.x + roundedDx, 0, REGION_GRID_MAX - region.width),
    y: clampInteger(region.y + roundedDy, 0, REGION_GRID_MAX - region.height)
  }
}

export const createRegionHistory = (regions: readonly BoundImageRegion[]): RegionHistory => ({
  past: [],
  present: cloneRegions(regions),
  future: []
})

export const reduceRegionHistory = (
  history: RegionHistory,
  action: RegionHistoryAction
): RegionHistory => {
  if (action.type === 'reset') return createRegionHistory(action.regions)
  if (action.type === 'undo') {
    const previous = history.past[history.past.length - 1]
    if (!previous) return history
    return {
      past: history.past.slice(0, -1),
      present: cloneRegions(previous),
      future: [cloneRegions(history.present), ...history.future]
    }
  }
  if (action.type === 'redo') {
    const next = history.future[0]
    if (!next) return history
    return {
      past: [...history.past, cloneRegions(history.present)],
      present: cloneRegions(next),
      future: history.future.slice(1)
    }
  }

  const next = action.type === 'add'
    ? [...history.present, cloneRegion(action.region)]
    : action.type === 'move'
      ? history.present.map(region => region.id === action.regionId
          ? moveBoundImageRegion(region, action.dx, action.dy)
          : cloneRegion(region))
      : action.type === 'delete'
        ? history.present.filter(region => region.id !== action.regionId).map(cloneRegion)
        : history.present.map(region => region.id === action.regionId
            ? { ...cloneRegion(region), referenceId: action.referenceId }
            : cloneRegion(region))

  if (sameRegions(next, history.present)) return history
  return {
    past: [...history.past, cloneRegions(history.present)],
    present: next,
    future: []
  }
}

export const serializeBoundImageRegions = (
  regions: readonly BoundImageRegion[]
): { regions: ImageRegion[]; bindings: ImageRegionBinding[] } => ({
  regions: regions.map(region => region.type === 'point'
    ? { type: 'point', x: clampGridCoordinate(region.x), y: clampGridCoordinate(region.y) }
    : normalizeBoundingBoxGeometry(region)),
  bindings: regions.map(region => ({ regionId: region.id, referenceId: region.referenceId }))
})

export const restoreBoundImageRegions = (
  regions: readonly ImageRegion[],
  bindings: readonly ImageRegionBinding[]
): BoundImageRegion[] => {
  const restored: BoundImageRegion[] = []
  regions.forEach((region, index) => {
    const binding = bindings[index]
    const identity = {
      id: binding?.regionId || `region-${index}`,
      referenceId: binding?.referenceId || ''
    }
    if (region.type === 'point') {
      restored.push({
        ...identity,
        type: 'point',
        x: clampGridCoordinate(region.x),
        y: clampGridCoordinate(region.y)
      })
      return
    }
    const normalized = normalizeBoundingBoxGeometry({ ...identity, ...region })
    if (normalized.width >= MIN_BBOX_GRID_SIZE && normalized.height >= MIN_BBOX_GRID_SIZE) {
      restored.push({ ...identity, ...normalized })
    }
  })
  return restored
}

export const readImageRegionBindings = (meta: Record<string, unknown>): ImageRegionBinding[] => {
  const candidate = meta.imageRegionBindings
  if (!Array.isArray(candidate)) return []
  return candidate.flatMap(binding => {
    if (!binding || typeof binding !== 'object') return []
    const value = binding as Partial<ImageRegionBinding>
    return typeof value.regionId === 'string' && typeof value.referenceId === 'string'
      ? [{ regionId: value.regionId, referenceId: value.referenceId }]
      : []
  })
}

export const validateBoundImageRegions = (
  regions: readonly BoundImageRegion[],
  activeSourceReferenceId: string | null,
  availableReferenceIds: readonly string[]
): BoundImageRegionValidation => {
  const available = new Set(availableReferenceIds)
  const validationErrors: BoundImageRegionValidationError[] = []
  regions.forEach(region => {
    if (!available.has(region.referenceId)) {
      validationErrors.push({
        code: 'unresolved_region_reference',
        regionId: region.id,
        referenceId: region.referenceId
      })
      return
    }
    if (activeSourceReferenceId && region.referenceId !== activeSourceReferenceId) {
      validationErrors.push({
        code: 'stale_region_reference',
        regionId: region.id,
        referenceId: region.referenceId
      })
      return
    }
    if (!isValidRegionGeometry(region)) {
      validationErrors.push({
        code: 'invalid_region_geometry',
        regionId: region.id,
        referenceId: region.referenceId
      })
    }
  })
  return { validationErrors, canGenerate: validationErrors.length === 0 }
}

const normalizeBoundingBoxGeometry = (
  region: BoundImageBoundingBoxRegion
): ImageRegion & { type: 'bbox' } => {
  const width = clampInteger(region.width, 0, REGION_GRID_MAX)
  const height = clampInteger(region.height, 0, REGION_GRID_MAX)
  return {
    type: 'bbox',
    x: clampInteger(region.x, 0, REGION_GRID_MAX - width),
    y: clampInteger(region.y, 0, REGION_GRID_MAX - height),
    width,
    height
  }
}

const isValidRegionGeometry = (region: BoundImageRegion): boolean => {
  if (![region.x, region.y].every(isGridInteger)) return false
  if (region.type === 'point') return true
  return [region.width, region.height].every(value => Number.isInteger(value) && value >= MIN_BBOX_GRID_SIZE)
    && region.x + region.width <= REGION_GRID_MAX
    && region.y + region.height <= REGION_GRID_MAX
}

const isGridInteger = (value: number): boolean => (
  Number.isInteger(value) && value >= 0 && value <= REGION_GRID_MAX
)

const toGridCoordinate = (value: number): number => clampGridCoordinate(Math.round(value * REGION_GRID_MAX))
const clampGridCoordinate = (value: number): number => clampInteger(value, 0, REGION_GRID_MAX)
const clampInteger = (value: number, minimum: number, maximum: number): number => (
  Math.min(Math.max(Math.round(Number.isFinite(value) ? value : minimum), minimum), Math.max(minimum, maximum))
)
const cloneRegion = (region: BoundImageRegion): BoundImageRegion => ({ ...region })
const cloneRegions = (regions: readonly BoundImageRegion[]): BoundImageRegion[] => regions.map(cloneRegion)
const sameRegions = (left: readonly BoundImageRegion[], right: readonly BoundImageRegion[]): boolean => (
  JSON.stringify(left) === JSON.stringify(right)
)
