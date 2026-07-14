import localforage from 'localforage'
import type { ICard, IPreset, IExample } from '@/models/Card.model'
import type { IPromptHistory, IPromptProject, IStoryboardProject, IThreeStageProject } from '@/models/PromptHistory.model'
import {
  createStoryboardProject,
  createStoryboardRow,
  createStoryboardSequence,
  createStandaloneFreeCanvasProject,
  createThreeStageProject,
  normalizeProject,
  sortProjects
} from '@/domain/projects/project-normalization'
import { devPresetFileStorage, devProjectFileStorage, staticPresetFileStorage } from '@/storage/dev-file-storage'
import { storageServiceClient, type RecentCaptureItem, type RecentCaptureRegistrationRequest, type RecentCaptureRegistrationResult } from '@/storage/storage-service-client'
import type { IPromptTemplate } from '@/models/PromptTemplate.model'
import type { IUserSettings } from '@/models/UserSettings.model'
import type { IPage } from '@/stores/card-initial-state'
import type { ThreeStageTemplateSettings } from '@/domain/three-stage/three-stage-definitions'

export interface IPersistedWorkspace {
  pages: IPage[]
  currentPage: number
  savedAt: number
}

const MAX_PROMPT_HISTORY = 50
const BROWSER_CACHE_MIGRATION_KEY = 'storageServiceBrowserCacheMigrated'

export {
  createStoryboardProject,
  createStoryboardRow,
  createStoryboardSequence,
  createThreeStageProject,
  devPresetFileStorage,
  devProjectFileStorage,
  staticPresetFileStorage
}

localforage.config({
  name: 'PromptCard',
  version: 1.0,
  storeName: 'promptcard',
  description: 'PromptCard local UI cache'
})

async function migrateBrowserCacheOnce(): Promise<void> {
  const migrated = await localforage.getItem<boolean>(BROWSER_CACHE_MIGRATION_KEY)
  if (migrated) return

  const [projects, workspace, presets] = await Promise.all([
    localforage.getItem<IPromptProject[]>('projects'),
    localforage.getItem<IPersistedWorkspace>('workspace'),
    localforage.getItem<IPreset[]>('presets')
  ])

  if ((projects && projects.length > 0) || workspace || (presets && presets.length > 0)) {
    await storageServiceClient.migrateBrowserCache({
      migrationId: 'browser-cache-v1',
      projects: projects || [],
      workspace: workspace || undefined,
      presets: presets || []
    })
  }

  await localforage.setItem(BROWSER_CACHE_MIGRATION_KEY, true)
}

export const storage = {
  health(): Promise<boolean> {
    return storageServiceClient.health()
  },

  assets: {
    upload(file: File): Promise<{ id: string; filename: string; contentType: string; size: number }> {
      return storageServiceClient.assets.upload(file)
    },
    url(assetId: string): string {
      return storageServiceClient.assets.url(assetId)
    }
  },

  recentCaptures: {
    getAll(): Promise<RecentCaptureItem[]> {
      return storageServiceClient.recentCaptures.getAll()
    },
    getById(id: string): Promise<RecentCaptureItem | null> {
      return storageServiceClient.recentCaptures.getById(id)
    },
    create(capture: Partial<RecentCaptureItem> & Pick<RecentCaptureItem, 'assetId'>): Promise<RecentCaptureItem> {
      return storageServiceClient.recentCaptures.create(capture)
    },
    update(id: string, revision: number, updates: Partial<RecentCaptureItem>): Promise<RecentCaptureItem> {
      return storageServiceClient.recentCaptures.update(id, revision, updates)
    },
    delete(id: string, revision: number): Promise<void> {
      return storageServiceClient.recentCaptures.delete(id, revision)
    },
    registerToPromptLibrary(payload: RecentCaptureRegistrationRequest): Promise<RecentCaptureRegistrationResult> {
      return storageServiceClient.recentCaptures.registerToPromptLibrary(payload)
    }
  },

  projects: {
    async getAll(): Promise<IPromptProject[]> {
      await migrateBrowserCacheOnce()
      return sortProjects((await storageServiceClient.projects.getAll()).map(normalizeProject))
    },
    async getById(id: string): Promise<IPromptProject | null> {
      await migrateBrowserCacheOnce()
      const project = await storageServiceClient.projects.getById(id)
      return project ? normalizeProject(project) : null
    },
    createDraft(project: {
      title: string
      pages: IPage[]
      currentPage: number
      meta?: Record<string, unknown>
    }): IPromptProject {
      const now = Date.now()
      return normalizeProject({
        id: now.toString(),
        title: project.title,
        type: 'card',
        revision: 1,
        pages: project.pages,
        currentPage: project.currentPage,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        meta: project.meta || {}
      })
    },
    createStoryboardDraft(project: {
      title: string
      storyboard?: IStoryboardProject
      meta?: Record<string, unknown>
    }): IPromptProject {
      const now = Date.now()
      return normalizeProject({
        id: now.toString(),
        title: project.title,
        type: 'storyboard',
        revision: 1,
        pages: [],
        currentPage: 0,
        storyboard: project.storyboard || createStoryboardProject(now),
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        meta: project.meta || {}
      })
    },
    createThreeStageDraft(project: {
      title: string
      threeStage?: IThreeStageProject
      templateSettings?: ThreeStageTemplateSettings
      meta?: Record<string, unknown>
    }): IPromptProject {
      const now = Date.now()
      return normalizeProject({
        id: now.toString(),
        title: project.title,
        type: 'three-stage',
        revision: 1,
        pages: [],
        currentPage: 0,
        threeStage: project.threeStage || createThreeStageProject(now, project.templateSettings),
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        meta: project.meta || {}
      })
    },
    createFreeCanvasDraft(project: {
      title: string
      freeCanvas?: IPromptProject['freeCanvas']
      meta?: Record<string, unknown>
    }): IPromptProject {
      const now = Date.now()
      return normalizeProject({
        id: now.toString(),
        title: project.title,
        type: 'free-canvas',
        revision: 1,
        pages: [],
        currentPage: 0,
        freeCanvas: project.freeCanvas || createStandaloneFreeCanvasProject(now),
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        meta: project.meta || {}
      })
    },
    async persistCreated(project: IPromptProject): Promise<IPromptProject> {
      return normalizeProject(await storageServiceClient.projects.create(project))
    },
    async create(project: {
      title: string
      pages: IPage[]
      currentPage: number
      meta?: Record<string, unknown>
    }): Promise<IPromptProject> {
      return this.persistCreated(this.createDraft(project))
    },
    async createStoryboard(project: {
      title: string
      storyboard?: IStoryboardProject
      meta?: Record<string, unknown>
    }): Promise<IPromptProject> {
      return this.persistCreated(this.createStoryboardDraft(project))
    },
    async createThreeStage(project: {
      title: string
      threeStage?: IThreeStageProject
      meta?: Record<string, unknown>
    }): Promise<IPromptProject> {
      return this.persistCreated(this.createThreeStageDraft(project))
    },
    async update(
      id: string,
      updates: Partial<Omit<IPromptProject, 'id' | 'createdAt'>>,
      options: { revision?: number } = {}
    ): Promise<IPromptProject | null> {
      const { revision: updateRevision, ...safeUpdates } = updates as Partial<IPromptProject>
      const revision = typeof options.revision === 'number'
        ? options.revision
        : typeof updateRevision === 'number'
          ? updateRevision
          : undefined

      if (typeof revision !== 'number') {
        const current = await this.getById(id)
        if (!current) return null
        return normalizeProject(await storageServiceClient.projects.update(id, current.revision, safeUpdates))
      }

      return normalizeProject(await storageServiceClient.projects.update(id, revision, safeUpdates))
    },
    async delete(id: string): Promise<IPromptProject[]> {
      return (await storageServiceClient.projects.trash([id], 'user')).map(normalizeProject)
    },
    async trash(ids: string[]): Promise<IPromptProject[]> {
      return (await storageServiceClient.projects.trash(ids, 'user')).map(normalizeProject)
    },
    async getTrash() {
      return storageServiceClient.projects.getTrash()
    },
    async restore(ids: string[]): Promise<IPromptProject[]> {
      return (await storageServiceClient.projects.restore(ids)).map(normalizeProject)
    },
    async deleteForever(ids: string[]): Promise<void> {
      await storageServiceClient.projects.deleteForever(ids)
    },
    async setLastOpened(id: string, options: { revision?: number; projects?: IPromptProject[] } = {}): Promise<IPromptProject | null> {
      const sourceProjects = options.projects || await this.getAll()
      const maxLastOpenedAt = Math.max(0, ...sourceProjects.map(project => project.lastOpenedAt || 0))
      const currentProject = sourceProjects.find(project => project.id === id)
      const now = Math.max(Date.now(), maxLastOpenedAt + 1)
      return this.update(id, { lastOpenedAt: now, updatedAt: now }, {
        revision: options.revision ?? currentProject?.revision
      })
    },
    async saveToFile(): Promise<boolean> {
      await this.getAll()
      return true
    }
  },

  workspace: {
    async get(): Promise<IPersistedWorkspace | null> {
      return (await localforage.getItem<IPersistedWorkspace>('workspace')) || null
    },
    async save(workspace: IPersistedWorkspace): Promise<void> {
      void workspace
    },
    async clear(): Promise<void> {
      await localforage.removeItem('workspace')
    }
  },

  cards: {
    async getAll(): Promise<ICard[]> {
      return (await localforage.getItem<ICard[]>('cards')) || []
    },
    async saveAll(cards: ICard[]): Promise<void> {
      await localforage.setItem('cards', cards)
    },
    async clear(): Promise<void> {
      await localforage.removeItem('cards')
    }
  },

  presets: {
    async getAll(): Promise<IPreset[]> {
      await migrateBrowserCacheOnce()
      return storageServiceClient.presets.getAll()
    },
    async create(preset: Omit<IPreset, 'revision'> & { revision?: number }): Promise<IPreset> {
      return storageServiceClient.presets.create(preset)
    },
    async saveAll(presets: IPreset[]): Promise<void> {
      await storageServiceClient.presets.replaceAll(presets)
    },
    async incrementUsage(id: string): Promise<void> {
      const preset = await this.getById(id)
      if (preset) await storageServiceClient.presets.incrementUsage(id, preset.revision || 1)
    },
    async update(id: string, updates: Partial<IPreset>): Promise<void> {
      const preset = await this.getById(id)
      if (!preset) return
      await storageServiceClient.presets.update(id, updates.revision || preset.revision || 1, {
        ...updates,
        updatedAt: Date.now()
      })
    },
    async delete(id: string): Promise<void> {
      await storageServiceClient.presets.trash([id], 'user')
    },
    async trash(ids: string[]): Promise<void> {
      await storageServiceClient.presets.trash(ids, 'user')
    },
    async getTrash() {
      return storageServiceClient.presets.getTrash()
    },
    async restore(ids: string[]): Promise<void> {
      await storageServiceClient.presets.restore(ids)
    },
    async deleteForever(ids: string[]): Promise<void> {
      await storageServiceClient.presets.deleteForever(ids)
    },
    async reorder(orderedIds: string[]): Promise<IPreset[]> {
      const revisions = Object.fromEntries((await this.getAll()).map(preset => [preset.id, preset.revision || 1]))
      return storageServiceClient.presets.reorder(orderedIds, revisions)
    },
    async getById(id: string): Promise<IPreset | undefined> {
      await migrateBrowserCacheOnce()
      return storageServiceClient.presets.getById(id)
    }
  },

  examples: {
    async getAll(): Promise<IExample[]> {
      return (await localforage.getItem<IExample[]>('examples')) || []
    },
    async saveAll(examples: IExample[]): Promise<void> {
      await localforage.setItem('examples', examples)
    },
    async getByType(type: ICard['type']): Promise<IExample | undefined> {
      const examples = await this.getAll()
      return examples.find(e => e.type === type)
    }
  },

  history: {
    async getAll(): Promise<IPromptHistory[]> {
      return (await localforage.getItem<IPromptHistory[]>('history')) || []
    },
    async add(history: Omit<IPromptHistory, 'id' | 'createdAt'>): Promise<IPromptHistory> {
      const all = await this.getAll()
      const newHistory: IPromptHistory = {
        ...history,
        id: Date.now().toString(),
        createdAt: Date.now()
      }
      await localforage.setItem('history', [newHistory, ...all])
      return newHistory
    },
    async addSnapshot(snapshot: {
      content: string
      cards: ICard[]
      pages?: IPage[]
      title?: string
      meta?: Record<string, unknown>
    }): Promise<IPromptHistory | null> {
      const content = snapshot.content.trim()
      if (!content) return null

      const all = await this.getAll()
      const withoutDuplicate = all.filter(item => item.content.trim() !== content)
      const now = Date.now()
      const newHistory: IPromptHistory = {
        id: now.toString(),
        content,
        cards: snapshot.cards,
        pages: snapshot.pages,
        title: snapshot.title || `Prompt ${new Date(now).toLocaleString()}`,
        score: 0,
        createdAt: now,
        meta: snapshot.meta || {}
      }

      await localforage.setItem('history', [newHistory, ...withoutDuplicate].slice(0, MAX_PROMPT_HISTORY))
      return newHistory
    },
    async delete(id: string): Promise<void> {
      const all = await this.getAll()
      await localforage.setItem('history', all.filter(h => h.id !== id))
    },
    async clear(): Promise<void> {
      await localforage.removeItem('history')
    }
  },

  templates: {
    async getAll(): Promise<IPromptTemplate[]> {
      return (await localforage.getItem<IPromptTemplate[]>('templates')) || []
    },
    async add(template: Omit<IPromptTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<IPromptTemplate> {
      const all = await this.getAll()
      const newTemplate: IPromptTemplate = {
        ...template,
        id: Date.now().toString(),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      await localforage.setItem('templates', [newTemplate, ...all])
      return newTemplate
    },
    async update(id: string, updates: Partial<IPromptTemplate>): Promise<void> {
      const all = await this.getAll()
      const updated = all.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t)
      await localforage.setItem('templates', updated)
    },
    async toggleFavorite(id: string): Promise<void> {
      const all = await this.getAll()
      const updated = all.map(t => t.id === id ? { ...t, isFavorite: !t.isFavorite, updatedAt: Date.now() } : t)
      await localforage.setItem('templates', updated)
    },
    async incrementUsage(id: string): Promise<void> {
      const all = await this.getAll()
      const updated = all.map(t => t.id === id ? { ...t, usageCount: t.usageCount + 1, updatedAt: Date.now() } : t)
      await localforage.setItem('templates', updated)
    }
  },

  settings: {
    async get(): Promise<IUserSettings> {
      const defaultSettings: IUserSettings = {
        theme: 'light',
        defaultMode: 'learn',
        autoSave: true,
        autoSaveIdleSeconds: 10,
        presetSort: 'usage',
        meta: {}
      }
      return { ...defaultSettings, ...((await localforage.getItem<Partial<IUserSettings>>('settings')) || {}) }
    },
    async save(settings: Partial<IUserSettings>): Promise<IUserSettings> {
      const current = await this.get()
      const updated = { ...current, ...settings }
      await localforage.setItem('settings', updated)
      return updated
    }
  },

  async clearAll(): Promise<void> {
    await localforage.clear()
  },

  async exportData(): Promise<string> {
    const data = {
      cards: await this.cards.getAll(),
      projects: await this.projects.getAll(),
      presets: await this.presets.getAll(),
      examples: await this.examples.getAll(),
      history: await this.history.getAll(),
      templates: await this.templates.getAll(),
      settings: await this.settings.get(),
      recentCaptures: await this.recentCaptures.getAll(),
      assetReferences: collectAssetReferences([
        await this.projects.getAll(),
        await this.recentCaptures.getAll()
      ]),
      exportTime: new Date().toISOString(),
      version: '4.0.0'
    }
    return JSON.stringify(data, null, 2)
  },

  async importData(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString)
      if (data.version !== '4.0.0') {
        throw new Error('Unsupported version')
      }
      await this.cards.saveAll(data.cards || [])
      await storageServiceClient.migrateBrowserCache({
        migrationId: `logical-import-${data.exportTime || 'v4'}`,
        projects: data.projects || [],
        presets: data.presets || []
      })
      await this.examples.saveAll(data.examples || [])
      await localforage.setItem('history', data.history || [])
      await localforage.setItem('templates', data.templates || [])
      await this.settings.save(data.settings || {})
      return true
    } catch (e) {
      console.error('Import failed:', e)
      return false
    }
  }
}

const collectAssetReferences = (value: unknown): string[] => {
  const found = new Set<string>()
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }
    if (!candidate || typeof candidate !== 'object') return
    const record = candidate as Record<string, unknown>
    if (typeof record.assetId === 'string' && record.assetId) found.add(record.assetId)
    Object.values(record).forEach(visit)
  }
  visit(value)
  return Array.from(found).sort()
}
