import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IPreset } from '@/models/Card.model'

const storageMocks = vi.hoisted(() => ({
  create: vi.fn(),
  reorder: vi.fn(),
  getAll: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  trash: vi.fn(),
  restore: vi.fn(),
  deleteForever: vi.fn(),
  incrementUsage: vi.fn()
}))

const settingsMocks = vi.hoisted(() => ({
  get: vi.fn()
}))

vi.mock('@/utils/storage', () => ({
  storage: {
    presets: storageMocks,
    settings: settingsMocks
  }
}))

import { usePresetStore } from './preset.store'
import { QUICK_MESSAGE_CATEGORY } from '@/domain/prompt-library/quick-messages'

const existingPreset: IPreset = {
  id: 'preset-existing',
  type: 'custom',
  category: 'custom',
  label: 'Existing',
  content: 'Existing content',
  usageCount: 0,
  meta: {},
  revision: 1
}

const createdPreset: IPreset = {
  id: 'preset-created',
  type: 'custom',
  category: 'custom',
  label: 'Created',
  content: 'Created content',
  usageCount: 0,
  meta: {},
  revision: 1
}

describe('preset store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePresetStore.setState({
      presets: [existingPreset],
      loading: false,
      initialized: true
    })
    settingsMocks.get.mockResolvedValue({ meta: {} })
  })

  it('persists new presets at the top of the active order', async () => {
    storageMocks.create.mockResolvedValue(createdPreset)
    storageMocks.reorder.mockResolvedValue([createdPreset, existingPreset])

    await usePresetStore.getState().addPreset({
      type: 'custom',
      category: 'custom',
      label: 'Created',
      content: 'Created content',
      meta: {}
    })

    expect(storageMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      label: 'Created',
      usageCount: 0
    }))
    expect(storageMocks.reorder).toHaveBeenCalledWith(['preset-created', 'preset-existing'])
    expect(usePresetStore.getState().presets.map(preset => preset.id)).toEqual(['preset-created', 'preset-existing'])
  })

  it('migrates legacy free canvas quick messages once during initialization', async () => {
    const migratedPreset: IPreset = {
      id: 'preset-quick',
      type: 'custom',
      category: QUICK_MESSAGE_CATEGORY,
      label: 'Storyboard',
      content: 'Create a board',
      usageCount: 0,
      meta: { quickMessage: { kind: QUICK_MESSAGE_CATEGORY, legacyId: 'quick-legacy' } },
      revision: 1
    }
    usePresetStore.setState({
      presets: [],
      loading: false,
      initialized: false
    })
    storageMocks.getAll.mockResolvedValue([existingPreset])
    settingsMocks.get.mockResolvedValue({
      meta: {
        freeCanvasQuickTextPresets: [
          { id: 'quick-legacy', name: 'Storyboard', note: 'note', body: 'Create a board', createdAt: 100 }
        ]
      }
    })
    storageMocks.create.mockResolvedValue(migratedPreset)
    storageMocks.reorder.mockResolvedValue([migratedPreset, existingPreset])

    await usePresetStore.getState().init()

    expect(storageMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'custom',
      category: QUICK_MESSAGE_CATEGORY,
      label: 'Storyboard',
      content: 'Create a board',
      meta: expect.objectContaining({
        quickMessage: {
          kind: QUICK_MESSAGE_CATEGORY,
          legacyId: 'quick-legacy'
        }
      })
    }))
    expect(storageMocks.reorder).toHaveBeenCalledWith(['preset-quick', 'preset-existing'])
    expect(usePresetStore.getState().presets.map(preset => preset.id)).toEqual(['preset-quick', 'preset-existing'])
  })

  it('does not duplicate legacy quick messages that already have a migrated preset', async () => {
    const existingQuickPreset: IPreset = {
      id: 'preset-quick',
      type: 'custom',
      category: QUICK_MESSAGE_CATEGORY,
      label: 'Storyboard',
      content: 'Create a board',
      usageCount: 0,
      meta: { quickMessage: { kind: QUICK_MESSAGE_CATEGORY, legacyId: 'quick-legacy' } },
      revision: 1
    }
    usePresetStore.setState({
      presets: [],
      loading: false,
      initialized: false
    })
    storageMocks.getAll.mockResolvedValue([existingQuickPreset])
    settingsMocks.get.mockResolvedValue({
      meta: {
        freeCanvasQuickTextPresets: [
          { id: 'quick-legacy', name: 'Storyboard', note: 'note', body: 'Create a board', createdAt: 100 }
        ]
      }
    })

    await usePresetStore.getState().init()

    expect(storageMocks.create).not.toHaveBeenCalled()
    expect(storageMocks.reorder).not.toHaveBeenCalled()
    expect(usePresetStore.getState().presets.map(preset => preset.id)).toEqual(['preset-quick'])
  })
})
