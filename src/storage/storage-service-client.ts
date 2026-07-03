import type { IPreset } from '@/models/Card.model'
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
  kind: 'screenshot'
  status: 'recent' | 'annotated' | 'registeredToPromptLibrary' | 'placedOnCanvas' | 'archived'
  purpose: 'inspirationReference' | 'generatedResult' | 'promptAttachment' | 'shotOutput'
  role?: 'character' | 'scene' | 'prop' | 'composition' | 'lighting' | 'color' | 'style' | 'mood' | 'other' | null
  title: string
  prompt: string
  userNote: string
  sourcePlatform: string
  sourceUrl: string
  contentType: 'image/png'
  size: number
  width: number
  height: number
  capturedAt: number
  origin: Record<string, unknown>
  createdAt: number
  updatedAt: number
  revision: number
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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 10_000)
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

export const storageServiceClient = {
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
      })
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
