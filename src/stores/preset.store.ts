import { create } from 'zustand'
import type { IPreset, ICard } from '@/models/Card.model'
import { storage } from '@/utils/storage'
import { reorderPresetsByCategory, type PresetReorderType } from './preset-order'
import {
  LEGACY_QUICK_MESSAGE_SETTINGS_KEY,
  createQuickMessagePresetInput,
  getQuickMessageLegacyId,
  normalizeLegacyQuickMessage
} from '@/domain/prompt-library/quick-messages'

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
    await migrateLegacyQuickMessages(get().presets, presets => set({ presets }))
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
    const orderedIds = [created.id, ...get().presets.filter(preset => preset.id !== created.id).map(preset => preset.id)]
    const saved = await storage.presets.reorder(orderedIds)
    set({ presets: saved })
  },

  updatePreset: async (id, updates) => {
    await storage.presets.update(id, updates)
    await get().refresh()
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
    const ordered = reorderPresetsByCategory(get().presets, activeType, orderedIds)
    const saved = await storage.presets.reorder(ordered.map(preset => preset.id))
    set({ presets: saved })
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

const migrateLegacyQuickMessages = async (
  presets: IPreset[],
  setPresets: (presets: IPreset[]) => void
): Promise<void> => {
  try {
    const settings = await storage.settings.get()
    const raw = settings.meta?.[LEGACY_QUICK_MESSAGE_SETTINGS_KEY]
    if (!Array.isArray(raw)) return

    const existingLegacyIds = new Set(presets.map(getQuickMessageLegacyId).filter((id): id is string => Boolean(id)))
    const legacyPresets = raw.flatMap(value => {
      const legacy = normalizeLegacyQuickMessage(value)
      if (!legacy || existingLegacyIds.has(legacy.id)) return []
      existingLegacyIds.add(legacy.id)
      return [legacy]
    })
    if (legacyPresets.length === 0) return

    const created: IPreset[] = []
    for (const legacy of legacyPresets) {
      const draft = createQuickMessagePresetInput({
        name: legacy.name,
        body: legacy.body
      }, {
        legacyId: legacy.id,
        createdAt: legacy.createdAt
      })
      created.push(await storage.presets.create({
        ...draft,
        id: `preset-quick-${legacy.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        usageCount: 0
      }))
    }

    const ordered = await storage.presets.reorder([
      ...created.map(preset => preset.id),
      ...presets.map(preset => preset.id)
    ])
    setPresets(ordered)
  } catch (error) {
    console.error('Failed to migrate legacy quick messages:', error)
  }
}
