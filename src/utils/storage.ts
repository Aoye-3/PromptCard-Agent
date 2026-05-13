import localforage from 'localforage'
import type { ICard, IPreset, IExample } from '@/models/Card.model'
import type { IPromptHistory } from '@/models/PromptHistory.model'
import type { IPromptTemplate } from '@/models/PromptTemplate.model'
import type { IUserSettings } from '@/models/UserSettings.model'

const PRESET_FILE_ENDPOINT = '/__promptcard/presets'
const STATIC_PRESET_FILE_URL = '/prompt-library-presets.json'
const PRESET_SOURCE_UPDATED_AT_KEY = 'presetsSourceUpdatedAt'

interface PresetFilePayload {
  schemaVersion: number
  updatedAt: string | null
  presets: IPreset[]
}

export const devPresetFileStorage = {
  async getAll(): Promise<IPreset[] | null> {
    if (typeof fetch !== 'function') return null

    try {
      const response = await fetch(PRESET_FILE_ENDPOINT, {
        headers: { Accept: 'application/json' }
      })
      if (!response.ok) return null

      const data = await response.json() as PresetFilePayload
      return Array.isArray(data.presets) ? data.presets : null
    } catch {
      return null
    }
  },

  async saveAll(presets: IPreset[]): Promise<boolean> {
    if (typeof fetch !== 'function') return false

    try {
      const response = await fetch(PRESET_FILE_ENDPOINT, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ presets })
      })
      return response.ok
    } catch {
      return false
    }
  }
}

const staticPresetFileStorage = {
  async getPayload(): Promise<PresetFilePayload | null> {
    if (typeof fetch !== 'function') return null

    try {
      const response = await fetch(STATIC_PRESET_FILE_URL, {
        headers: { Accept: 'application/json' },
        cache: 'no-cache'
      })
      if (!response.ok) return null

      const data = await response.json() as PresetFilePayload
      return Array.isArray(data.presets) ? data : null
    } catch {
      return null
    }
  }
}

// 初始化localforage
localforage.config({
  name: 'PromptCard',
  version: 1.0,
  storeName: 'promptcard',
  description: 'PromptCard 4.0 本地存储'
})

export const storage = {
  // Card相关
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

  // Preset相关
  presets: {
    async getAll(): Promise<IPreset[]> {
      const filePresets = await devPresetFileStorage.getAll()
      if (filePresets) {
        await localforage.setItem('presets', filePresets)
        await localforage.setItem(PRESET_SOURCE_UPDATED_AT_KEY, new Date().toISOString())
        return filePresets
      }

      const localPresets = (await localforage.getItem<IPreset[]>('presets')) || []
      const staticPayload = await staticPresetFileStorage.getPayload()

      if (staticPayload?.presets) {
        const sourceUpdatedAt = staticPayload.updatedAt || 'static'
        const cachedSourceUpdatedAt = await localforage.getItem<string>(PRESET_SOURCE_UPDATED_AT_KEY)

        if (localPresets.length === 0 || cachedSourceUpdatedAt !== sourceUpdatedAt) {
          await localforage.setItem('presets', staticPayload.presets)
          await localforage.setItem(PRESET_SOURCE_UPDATED_AT_KEY, sourceUpdatedAt)
          return staticPayload.presets
        }
      }

      return localPresets
    },
    async saveAll(presets: IPreset[]): Promise<void> {
      const savedToFile = await devPresetFileStorage.saveAll(presets)
      if (!savedToFile) {
        console.warn('Prompt preset file storage unavailable; falling back to browser storage.')
      }
      await localforage.setItem('presets', presets)
    },
    async incrementUsage(id: string): Promise<void> {
      const presets = await this.getAll()
      const updated = presets.map(p => p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p)
      await this.saveAll(updated)
    },
    // 新增更新方法
    async update(id: string, updates: Partial<IPreset>): Promise<void> {
      const presets = await this.getAll()
      const updated = presets.map(p => 
        p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
      )
      await this.saveAll(updated)
    },
    // 新增删除方法
    async delete(id: string): Promise<void> {
      const presets = await this.getAll()
      await this.saveAll(presets.filter(p => p.id !== id))
    },
    // 新增查找方法
    async getById(id: string): Promise<IPreset | undefined> {
      const presets = await this.getAll()
      return presets.find(p => p.id === id)
    }
  },

  // Example相关
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

  // Prompt History相关
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
    async delete(id: string): Promise<void> {
      const all = await this.getAll()
      await localforage.setItem('history', all.filter(h => h.id !== id))
    },
    async clear(): Promise<void> {
      await localforage.removeItem('history')
    }
  },

  // Template相关
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

  // Settings相关
  settings: {
    async get(): Promise<IUserSettings> {
      const defaultSettings: IUserSettings = {
        theme: 'light',
        defaultMode: 'learn',
        autoSave: true,
        presetSort: 'usage',
        meta: {}
      }
      return (await localforage.getItem<IUserSettings>('settings')) || defaultSettings
    },
    async save(settings: Partial<IUserSettings>): Promise<IUserSettings> {
      const current = await this.get()
      const updated = { ...current, ...settings }
      await localforage.setItem('settings', updated)
      return updated
    }
  },

  // 通用操作
  async clearAll(): Promise<void> {
    await localforage.clear()
  },

  async exportData(): Promise<string> {
    const data = {
      cards: await this.cards.getAll(),
      presets: await this.presets.getAll(),
      examples: await this.examples.getAll(),
      history: await this.history.getAll(),
      templates: await this.templates.getAll(),
      settings: await this.settings.get(),
      exportTime: new Date().toISOString(),
      version: '4.0.0'
    }
    return JSON.stringify(data, null, 2)
  },

  async importData(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString)
      if (data.version !== '4.0.0') {
        throw new Error('不支持的版本')
      }
      await this.cards.saveAll(data.cards || [])
      await this.presets.saveAll(data.presets || [])
      await this.examples.saveAll(data.examples || [])
      await localforage.setItem('history', data.history || [])
      await localforage.setItem('templates', data.templates || [])
      await this.settings.save(data.settings || {})
      return true
    } catch (e) {
      console.error('导入失败:', e)
      return false
    }
  }
}
