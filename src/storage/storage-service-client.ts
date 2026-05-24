import type { IPreset } from '@/models/Card.model'
import type { IPromptProject } from '@/models/PromptHistory.model'

export interface TrashEntry<T> {
  id: string
  deletedAt: number
  deletedBy: 'user' | 'agent'
  deleteReason?: string | null
  payload: T
}

export class StorageRevisionConflict<T> extends Error {
  current: T

  constructor(current: T) {
    super('Storage revision conflict')
    this.name = 'StorageRevisionConflict'
    this.current = current
  }
}

const JSON_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init?.headers || {})
    }
  })

  if (response.status === 409) {
    const payload = await response.json()
    throw new StorageRevisionConflict(payload.detail?.current)
  }

  if (!response.ok) {
    throw new Error(`Storage request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const storageServiceClient = {
  projects: {
    async getAll(): Promise<IPromptProject[]> {
      const payload = await request<{ projects: IPromptProject[] }>('/storage-api/projects')
      return payload.projects
    },
    async getById(id: string): Promise<IPromptProject | null> {
      try {
        return await request<IPromptProject>(`/storage-api/projects/${encodeURIComponent(id)}`)
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) return null
        throw error
      }
    },
    async create(project: Partial<IPromptProject>): Promise<IPromptProject> {
      return request<IPromptProject>('/storage-api/projects', {
        method: 'POST',
        body: JSON.stringify(project)
      })
    },
    async update(id: string, revision: number, updates: Partial<IPromptProject>): Promise<IPromptProject> {
      return request<IPromptProject>(`/storage-api/projects/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ revision, updates })
      })
    },
    async trash(ids: string[], deletedBy: 'user' | 'agent' = 'user', deleteReason?: string): Promise<IPromptProject[]> {
      const payload = await request<{ projects: IPromptProject[] }>('/storage-api/projects/trash', {
        method: 'POST',
        body: JSON.stringify({ ids, deletedBy, deleteReason })
      })
      return payload.projects
    },
    async getTrash(): Promise<TrashEntry<IPromptProject>[]> {
      const payload = await request<{ items: TrashEntry<IPromptProject>[] }>('/storage-api/projects/trash')
      return payload.items
    },
    async restore(ids: string[]): Promise<IPromptProject[]> {
      const payload = await request<{ projects: IPromptProject[] }>('/storage-api/projects/trash/restore', {
        method: 'POST',
        body: JSON.stringify({ ids })
      })
      return payload.projects
    },
    async deleteForever(ids: string[]): Promise<void> {
      await request<{ ok: boolean }>('/storage-api/projects/trash', {
        method: 'DELETE',
        body: JSON.stringify({ ids })
      })
    }
  },

  presets: {
    async getAll(): Promise<IPreset[]> {
      const payload = await request<{ presets: IPreset[] }>('/storage-api/presets')
      return payload.presets
    },
    async getById(id: string): Promise<IPreset | undefined> {
      try {
        return await request<IPreset>(`/storage-api/presets/${encodeURIComponent(id)}`)
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) return undefined
        throw error
      }
    },
    async create(preset: Partial<IPreset>): Promise<IPreset> {
      return request<IPreset>('/storage-api/presets', {
        method: 'POST',
        body: JSON.stringify(preset)
      })
    },
    async update(id: string, revision: number, updates: Partial<IPreset>): Promise<IPreset> {
      return request<IPreset>(`/storage-api/presets/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ revision, updates })
      })
    },
    async reorder(orderedIds: string[], revisions: Record<string, number>): Promise<IPreset[]> {
      const payload = await request<{ presets: IPreset[] }>('/storage-api/presets/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds, revisions })
      })
      return payload.presets
    },
    async incrementUsage(id: string, revision: number): Promise<IPreset> {
      return request<IPreset>(`/storage-api/presets/${encodeURIComponent(id)}/increment-usage`, {
        method: 'POST',
        body: JSON.stringify({ revision })
      })
    },
    async trash(ids: string[], deletedBy: 'user' | 'agent' = 'user', deleteReason?: string): Promise<IPreset[]> {
      const payload = await request<{ presets: IPreset[] }>('/storage-api/presets/trash', {
        method: 'POST',
        body: JSON.stringify({ ids, deletedBy, deleteReason })
      })
      return payload.presets
    },
    async getTrash(): Promise<TrashEntry<IPreset>[]> {
      const payload = await request<{ items: TrashEntry<IPreset>[] }>('/storage-api/presets/trash')
      return payload.items
    },
    async restore(ids: string[]): Promise<IPreset[]> {
      const payload = await request<{ presets: IPreset[] }>('/storage-api/presets/trash/restore', {
        method: 'POST',
        body: JSON.stringify({ ids })
      })
      return payload.presets
    },
    async deleteForever(ids: string[]): Promise<void> {
      await request<{ ok: boolean }>('/storage-api/presets/trash', {
        method: 'DELETE',
        body: JSON.stringify({ ids })
      })
    }
  },

  async migrateBrowserCache(payload: { projects?: IPromptProject[]; workspace?: unknown; presets?: IPreset[] }): Promise<{ projects: number; presets: number }> {
    return request<{ projects: number; presets: number }>('/storage-api/migrations/browser-cache', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }
}
