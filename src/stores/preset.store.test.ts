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

vi.mock('@/utils/storage', () => ({
  storage: {
    presets: storageMocks
  }
}))

import { usePresetStore } from './preset.store'

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
})
