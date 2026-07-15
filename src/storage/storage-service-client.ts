import type { CardType, IPreset } from '@/models/Card.model'
import type { IPromptProject } from '@/models/PromptHistory.model'

export interface TrashEntry<T> {
  id: string
  deletedAt: number
  deletedBy: 'user' | 'agent'
  deleteReason?: string | null
  payload: T
}

export interface RecentCaptureItem {
  id: string
  assetId: string
  kind: 'screenshot' | 'pastedMedia' | 'screenRecording'
  status: 'recent' | 'annotated' | 'registeredToPromptLibrary' | 'placedOnCanvas' | 'archived'
  purpose: 'inspirationReference' | 'generatedResult' | 'promptAttachment' | 'shotOutput'
  role?: 'character' | 'scene' | 'prop' | 'composition' | 'lighting' | 'color' | 'style' | 'mood' | 'other' | null
  title: string
  prompt: string
  userNote: string
  sourcePlatform: string
  sourceUrl: string
  contentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4'
  originalFilename?: string
  registeredPromptId?: string | null
  registeredAt?: number | null
  linkedProjectId?: string | null
  linkedCanvasNodeId?: string | null
  durationMs?: number
  hasAudio?: boolean
  size: number
  width: number
  height: number
  capturedAt: number
  origin: Record<string, unknown>
  createdAt: number
  updatedAt: number
  revision: number
}

export interface RecentCaptureRegistrationRequest {
  mode: 'separate' | 'merged'
  captures: Array<{
    id: string
    revision: number
    label?: string
    content?: string
    type?: CardType
  }>
  prompt?: {
    label: string
    content: string
    type: CardType
  }
}

export interface RecentCaptureRegistrationResult {
  presets: IPreset[]
  captures: RecentCaptureItem[]
}

export type ImageGenerationRunState = 'queued' | 'running' | 'succeeded' | 'failed'

export interface ImageGenerationRunSnapshot {
  mode: string
  promptDocument: {
    version: number
    segments: Array<{ type: 'text'; text: string } | { type: 'reference'; referenceId: string; label: string }>
  }
  inputAssets: Array<{ referenceId: string; assetId: string; order: number }>
  regions: Array<Record<string, string | number>>
  resolution: string
  outputFormat: string
  watermark: boolean
}

export interface ImageGenerationRun {
  id: string
  projectId: string
  nodeId: string
  connectionId: string
  providerId: string
  modelId: string
  state: ImageGenerationRunState
  requestSnapshot: ImageGenerationRunSnapshot
  outputAssetIds: string[]
  createdAt: number
  startedAt?: number
  finishedAt?: number
  providerRequestId?: string
  error?: { code: string; message: string; retryable: boolean }
  usage?: Record<string, number>
}

export interface ImageGenerationRunPage {
  runs: ImageGenerationRun[]
  nextCursor: string | null
}

export class StorageRevisionConflict<T> extends Error {
  current: T

  constructor(current: T) {
    super('Storage revision conflict')
    this.name = 'StorageRevisionConflict'
    this.current = current
  }
}

export class StorageHttpError extends Error {
  status: number
  code: string
  detail?: unknown

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message)
    this.name = 'StorageHttpError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
}

type ErrorEnvelope = {
  detail?: {
    code?: string
    message?: string
    detail?: unknown
    current?: unknown
  }
}

async function request<T>(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...JSON_HEADERS,
        ...(init?.headers || {})
      }
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError'
    throw new StorageHttpError(
      0,
      timedOut ? 'timeout' : 'service_unavailable',
      timedOut ? 'Storage request timed out.' : 'Storage service is unavailable.',
      error
    )
  } finally {
    globalThis.clearTimeout(timeoutId)
  }

  const payload = await response.json().catch(() => null) as (T & ErrorEnvelope) | ErrorEnvelope | null
  const storageError = (payload as ErrorEnvelope | null)?.detail

  if (response.status === 409 && storageError?.code === 'revision_conflict') {
    throw new StorageRevisionConflict(storageError.current)
  }
  if (!response.ok) {
    throw new StorageHttpError(
      response.status,
      storageError?.code || 'storage_request_failed',
      storageError?.message || `Storage request failed: ${response.status}`,
      storageError?.detail
    )
  }
  return payload as T
}

async function isHealthy(): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 750)
  try {
    const response = await fetch('/storage-api/health', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-cache'
    })
    return response.ok
  } catch {
    return false
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export const storageServiceClient = {
  health: isHealthy,

  assets: {
    async upload(file: File): Promise<{ id: string; filename: string; contentType: string; size: number }> {
      const contentType = inferAssetContentType(file)
      if (!contentType) throw new StorageHttpError(400, 'invalid_asset', '仅支持 PNG、JPEG、WebP 图片和 MP4、WebM 视频。')
      return request('/storage-api/assets', {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'X-File-Name': encodeURIComponent(file.name)
        },
        body: file
      }, 30_000)
    },
    url(assetId: string): string {
      return `/storage-api/assets/${encodeURIComponent(assetId)}`
    },
    diagnostics(): Promise<{ unregisteredFiles: string[]; missingFiles: string[]; unreferencedAssets: string[]; missingReferences: string[] }> {
      return request('/storage-api/assets/diagnostics')
    }
  },
  recentCaptures: {
    async getAll(): Promise<RecentCaptureItem[]> {
      return (await request<{ captures: RecentCaptureItem[] }>('/storage-api/recent-captures')).captures
    },
    async getById(id: string): Promise<RecentCaptureItem | null> {
      try {
        return await request<RecentCaptureItem>(`/storage-api/recent-captures/${encodeURIComponent(id)}`)
      } catch (error) {
        if (error instanceof StorageHttpError && error.status === 404) return null
        throw error
      }
    },
    create(capture: Partial<RecentCaptureItem> & Pick<RecentCaptureItem, 'assetId'>): Promise<RecentCaptureItem> {
      return request('/storage-api/recent-captures', { method: 'POST', body: JSON.stringify(capture) })
    },
    update(id: string, revision: number, updates: Partial<RecentCaptureItem>): Promise<RecentCaptureItem> {
      return request(`/storage-api/recent-captures/${encodeURIComponent(id)}`, {
        method: 'PUT', body: JSON.stringify({ revision, updates })
      })
    },
    async delete(id: string, revision: number): Promise<void> {
      await request(`/storage-api/recent-captures/${encodeURIComponent(id)}`, {
        method: 'DELETE', body: JSON.stringify({ revision })
      })
    },
    registerToPromptLibrary(payload: RecentCaptureRegistrationRequest): Promise<RecentCaptureRegistrationResult> {
      return request('/storage-api/recent-captures/register-to-prompt-library', {
        method: 'POST', body: JSON.stringify(payload)
      })
    }
  },
  imageGenerationRuns: {
    async getPage(query: {
      projectId: string
      nodeId: string
      cursor?: string | null
      limit?: number
    }): Promise<ImageGenerationRunPage> {
      const parameters = new URLSearchParams({ projectId: query.projectId, nodeId: query.nodeId })
      if (query.cursor) parameters.set('cursor', query.cursor)
      if (query.limit !== undefined) parameters.set('limit', String(query.limit))
      const page = await request<{ runs?: unknown[]; nextCursor?: unknown }>(
        `/storage-api/image-generation-runs?${parameters.toString()}`
      )
      return {
        runs: Array.isArray(page.runs) ? page.runs.flatMap(normalizeImageGenerationRun) : [],
        nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null
      }
    }
  },
  projects: {
    async getAll(): Promise<IPromptProject[]> {
      return (await request<{ projects: IPromptProject[] }>('/storage-api/projects')).projects
    },
    async getById(id: string): Promise<IPromptProject | null> {
      try {
        return await request<IPromptProject>(`/storage-api/projects/${encodeURIComponent(id)}`)
      } catch (error) {
        if (error instanceof StorageHttpError && error.status === 404) return null
        throw error
      }
    },
    create(project: Partial<IPromptProject>): Promise<IPromptProject> {
      return request('/storage-api/projects', { method: 'POST', body: JSON.stringify(project) })
    },
    update(id: string, revision: number, updates: Partial<IPromptProject>): Promise<IPromptProject> {
      return request(`/storage-api/projects/${encodeURIComponent(id)}`, {
        method: 'PUT', body: JSON.stringify({ revision, updates })
      })
    },
    async trash(ids: string[], deletedBy: 'user' | 'agent' = 'user', deleteReason?: string): Promise<IPromptProject[]> {
      return (await request<{ projects: IPromptProject[] }>('/storage-api/projects/trash', {
        method: 'POST', body: JSON.stringify({ ids, deletedBy, deleteReason })
      })).projects
    },
    async getTrash(): Promise<TrashEntry<IPromptProject>[]> {
      return (await request<{ items: TrashEntry<IPromptProject>[] }>('/storage-api/projects/trash')).items
    },
    async restore(ids: string[]): Promise<IPromptProject[]> {
      return (await request<{ projects: IPromptProject[] }>('/storage-api/projects/trash/restore', {
        method: 'POST', body: JSON.stringify({ ids })
      })).projects
    },
    async deleteForever(ids: string[]): Promise<void> {
      await request('/storage-api/projects/trash', { method: 'DELETE', body: JSON.stringify({ ids }) })
    }
  },
  presets: {
    async getAll(): Promise<IPreset[]> {
      return (await request<{ presets: IPreset[] }>('/storage-api/presets')).presets
    },
    async getById(id: string): Promise<IPreset | undefined> {
      try {
        return await request<IPreset>(`/storage-api/presets/${encodeURIComponent(id)}`)
      } catch (error) {
        if (error instanceof StorageHttpError && error.status === 404) return undefined
        throw error
      }
    },
    create(preset: Partial<IPreset>): Promise<IPreset> {
      return request('/storage-api/presets', { method: 'POST', body: JSON.stringify(preset) })
    },
    update(id: string, revision: number, updates: Partial<IPreset>): Promise<IPreset> {
      return request(`/storage-api/presets/${encodeURIComponent(id)}`, {
        method: 'PUT', body: JSON.stringify({ revision, updates })
      })
    },
    async replaceAll(presets: IPreset[]): Promise<IPreset[]> {
      return (await request<{ presets: IPreset[] }>('/storage-api/presets/batch', {
        method: 'PUT', body: JSON.stringify({ presets })
      })).presets
    },
    async reorder(orderedIds: string[], revisions: Record<string, number>): Promise<IPreset[]> {
      return (await request<{ presets: IPreset[] }>('/storage-api/presets/reorder', {
        method: 'POST', body: JSON.stringify({ orderedIds, revisions })
      })).presets
    },
    incrementUsage(id: string, revision: number): Promise<IPreset> {
      return request(`/storage-api/presets/${encodeURIComponent(id)}/increment-usage`, {
        method: 'POST', body: JSON.stringify({ revision })
      })
    },
    async trash(ids: string[], deletedBy: 'user' | 'agent' = 'user', deleteReason?: string): Promise<IPreset[]> {
      return (await request<{ presets: IPreset[] }>('/storage-api/presets/trash', {
        method: 'POST', body: JSON.stringify({ ids, deletedBy, deleteReason })
      })).presets
    },
    async getTrash(): Promise<TrashEntry<IPreset>[]> {
      return (await request<{ items: TrashEntry<IPreset>[] }>('/storage-api/presets/trash')).items
    },
    async restore(ids: string[]): Promise<IPreset[]> {
      return (await request<{ presets: IPreset[] }>('/storage-api/presets/trash/restore', {
        method: 'POST', body: JSON.stringify({ ids })
      })).presets
    },
    async deleteForever(ids: string[]): Promise<void> {
      await request('/storage-api/presets/trash', { method: 'DELETE', body: JSON.stringify({ ids }) })
    }
  },
  migrateBrowserCache(payload: {
    migrationId: string
    projects?: IPromptProject[]
    workspace?: unknown
    presets?: IPreset[]
  }): Promise<{ projects: number; presets: number; alreadyApplied: boolean }> {
    return request('/storage-api/migrations/browser-cache', { method: 'POST', body: JSON.stringify(payload) })
  }
}

const inferAssetContentType = (file: File): string | null => {
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return file.type
  if (['video/mp4', 'video/webm'].includes(file.type)) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'mp4') return 'video/mp4'
  if (extension === 'webm') return 'video/webm'
  return null
}

const normalizeImageGenerationRun = (candidate: unknown): ImageGenerationRun[] => {
  if (!isRecord(candidate)) return []
  const state = candidate.state
  if (
    !isRunState(state)
    || !hasStrings(candidate, ['id', 'projectId', 'nodeId', 'connectionId', 'providerId', 'modelId'])
    || !isNonNegativeInteger(candidate.createdAt)
  ) return []
  const requestSnapshot = normalizeRunSnapshot(candidate.requestSnapshot)
  if (!requestSnapshot) return []
  const run: ImageGenerationRun = {
    id: candidate.id as string,
    projectId: candidate.projectId as string,
    nodeId: candidate.nodeId as string,
    connectionId: candidate.connectionId as string,
    providerId: candidate.providerId as string,
    modelId: candidate.modelId as string,
    state,
    requestSnapshot,
    outputAssetIds: Array.isArray(candidate.outputAssetIds)
      ? candidate.outputAssetIds.filter((item): item is string => typeof item === 'string')
      : [],
    createdAt: candidate.createdAt as number
  }
  if (isNonNegativeInteger(candidate.startedAt)) run.startedAt = candidate.startedAt
  if (isNonNegativeInteger(candidate.finishedAt)) run.finishedAt = candidate.finishedAt
  if (typeof candidate.providerRequestId === 'string') run.providerRequestId = candidate.providerRequestId
  if (isRecord(candidate.error) && hasStrings(candidate.error, ['code', 'message']) && typeof candidate.error.retryable === 'boolean') {
    run.error = {
      code: candidate.error.code as string,
      message: candidate.error.message as string,
      retryable: candidate.error.retryable
    }
  }
  if (isRecord(candidate.usage)) {
    run.usage = Object.fromEntries(Object.entries(candidate.usage).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
  }
  return [run]
}

const normalizeRunSnapshot = (candidate: unknown): ImageGenerationRunSnapshot | null => {
  if (!isRecord(candidate) || !isRecord(candidate.promptDocument)) return null
  const promptDocument = candidate.promptDocument
  const segments: ImageGenerationRunSnapshot['promptDocument']['segments'] = []
  if (Array.isArray(promptDocument.segments)) promptDocument.segments.forEach(segment => {
    if (!isRecord(segment)) return
    if (segment.type === 'text' && typeof segment.text === 'string') {
      segments.push({ type: 'text', text: segment.text })
      return
    }
    if (segment.type === 'reference' && typeof segment.referenceId === 'string' && typeof segment.label === 'string') {
      segments.push({ type: 'reference', referenceId: segment.referenceId, label: segment.label })
    }
  })
  const inputAssets = Array.isArray(candidate.inputAssets) ? candidate.inputAssets.flatMap(item => (
    isRecord(item)
    && typeof item.referenceId === 'string'
    && typeof item.assetId === 'string'
    && Number.isInteger(item.order)
      ? [{ referenceId: item.referenceId, assetId: item.assetId, order: item.order as number }]
      : []
  )) : []
  const regions = Array.isArray(candidate.regions) ? candidate.regions.flatMap(normalizeRunRegion) : []
  return {
    mode: typeof candidate.mode === 'string' ? candidate.mode : 'generate',
    promptDocument: {
      version: Number.isInteger(promptDocument.version) ? promptDocument.version as number : 1,
      segments
    },
    inputAssets,
    regions,
    resolution: typeof candidate.resolution === 'string' ? candidate.resolution : '',
    outputFormat: typeof candidate.outputFormat === 'string' ? candidate.outputFormat : '',
    watermark: candidate.watermark === true
  }
}

const normalizeRunRegion = (candidate: unknown): Array<Record<string, string | number>> => {
  if (!isRecord(candidate) || typeof candidate.referenceId !== 'string') return []
  if (candidate.type === 'point' && Number.isInteger(candidate.x) && Number.isInteger(candidate.y)) {
    return [{ type: 'point', referenceId: candidate.referenceId, x: candidate.x as number, y: candidate.y as number }]
  }
  if (
    candidate.type === 'bbox'
    && Number.isInteger(candidate.x1) && Number.isInteger(candidate.y1)
    && Number.isInteger(candidate.x2) && Number.isInteger(candidate.y2)
  ) {
    return [{
      type: 'bbox', referenceId: candidate.referenceId,
      x1: candidate.x1 as number, y1: candidate.y1 as number,
      x2: candidate.x2 as number, y2: candidate.y2 as number
    }]
  }
  return []
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const hasStrings = (value: Record<string, unknown>, keys: string[]): boolean => keys.every(key => typeof value[key] === 'string')
const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0
const isRunState = (value: unknown): value is ImageGenerationRunState => (
  value === 'queued' || value === 'running' || value === 'succeeded' || value === 'failed'
)
