import { create } from 'zustand'
import type { IPreset, ICard } from '@/models/Card.model'
import { storage } from '@/utils/storage'
import { reorderPresetsByCategory, type PresetReorderType } from './preset-order'

interface PresetState {
  presets: IPreset[]
  loading: boolean
  initialized: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  getByType: (type: ICard['type']) => IPreset[]
  addPreset: (preset: Omit<IPreset, 'id' | 'usageCount' | 'meta'> & { meta?: IPreset['meta'] }) => Promise<void>
  updatePreset: (id: string, updates: Partial<IPreset>) => Promise<void>
  deletePreset: (id: string) => Promise<void>
  trashPresets: (ids: string[]) => Promise<void>
  restorePresets: (ids: string[]) => Promise<void>
  deletePresetsForever: (ids: string[]) => Promise<void>
  reorderPresets: (activeType: PresetReorderType, orderedIds: string[]) => Promise<void>
  incrementUsage: (id: string) => Promise<void>
  searchPresets: (searchTerm: string) => IPreset[]
}

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: [],
  loading: false,
  initialized: false,

  init: async () => {
    if (get().initialized || get().loading) return
    await get().refresh()
  },

  refresh: async () => {
    set({ loading: true })
    try {
      set({ presets: await storage.presets.getAll(), initialized: true })
    } catch (e) {
      console.error('Failed to load presets:', e)
      set({ initialized: true })
    } finally {
      set({ loading: false })
    }
  },

  getByType: (type: ICard['type']) => {
    return get().presets.filter(p => p.type === type)
  },

  addPreset: async (preset) => {
    const newPreset: IPreset = {
      ...preset,
      id: `preset-${Date.now()}`,
      usageCount: 0,
      meta: preset.meta || {}
    }
    const created = await storage.presets.create(newPreset)
    set({ presets: [...get().presets.filter(p => p.id !== created.id), created] })
  },

  updatePreset: async (id, updates) => {
    const updated = await storage.presets.update(id, updates)
    if (!updated) return
    set({ presets: get().presets.map(preset => preset.id === id ? updated : preset) })
  },

  deletePreset: async (id) => {
    await storage.presets.delete(id)
    set({ presets: get().presets.filter(p => p.id !== id) })
  },

  trashPresets: async (ids) => {
    await storage.presets.trash(ids)
    const idSet = new Set(ids)
    set({ presets: get().presets.filter(p => !idSet.has(p.id)) })
  },

  restorePresets: async (ids) => {
    await storage.presets.restore(ids)
    await get().refresh()
  },

  deletePresetsForever: async (ids) => {
    await storage.presets.deleteForever(ids)
  },

  reorderPresets: async (activeType, orderedIds) => {
    const previous = get().presets
    const ordered = reorderPresetsByCategory(get().presets, activeType, orderedIds)
    set({ presets: ordered })
    try {
      const saved = await storage.presets.reorder(ordered.map(preset => preset.id))
      set({ presets: saved })
    } catch (error) {
      set({ presets: previous })
      throw error
    }
  },

  incrementUsage: async (id: string) => {
    await storage.presets.incrementUsage(id)
    await get().refresh()
  },

  searchPresets: (searchTerm: string) => {
    return get().presets.filter(p =>
      p.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }
}))
