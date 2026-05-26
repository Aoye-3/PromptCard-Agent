import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { IPreset } from '@/models/Card.model'
import { storage } from '@/utils/storage'
import { usePresetStore } from './preset.store'

vi.mock('@/utils/storage', () => ({
  storage: {
    presets: {
      getAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      trash: vi.fn(),
      restore: vi.fn(),
      deleteForever: vi.fn(),
      reorder: vi.fn(),
      incrementUsage: vi.fn()
    }
  }
}))

const preset = (id: string, type: IPreset['type'], label = id, revision = 1): IPreset => ({
  id,
  type,
  category: type,
  label,
  content: `${label} content`,
  usageCount: 0,
  meta: {},
  revision
})

describe('usePresetStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePresetStore.setState({
      presets: [],
      loading: false,
      initialized: false
    })
  })

  test('adds a preset to memory from the create response without waiting for refresh data', async () => {
    const existing = preset('subject-1', 'subject')
    const created = preset('subject-2', 'subject', 'New subject')
    vi.mocked(storage.presets.create).mockResolvedValue(created)
    vi.mocked(storage.presets.getAll).mockResolvedValue([existing])
    usePresetStore.setState({ presets: [existing], initialized: true })

    await usePresetStore.getState().addPreset({
      type: 'subject',
      category: 'subject',
      label: 'New subject',
      content: 'New subject content'
    })

    expect(usePresetStore.getState().presets.map(item => item.id)).toEqual(['subject-1', 'subject-2'])
  })

  test('replaces a preset in memory from the update response', async () => {
    const existing = preset('camera-1', 'camera', 'Old camera')
    const updated = { ...existing, label: 'Updated camera', revision: 2 }
    vi.mocked(storage.presets.update).mockResolvedValue(updated)
    vi.mocked(storage.presets.getAll).mockResolvedValue([existing])
    usePresetStore.setState({ presets: [existing], initialized: true })

    await usePresetStore.getState().updatePreset(existing.id, { label: 'Updated camera' })

    expect(usePresetStore.getState().presets[0]).toMatchObject({
      id: 'camera-1',
      label: 'Updated camera',
      revision: 2
    })
  })

  test('optimistically reorders presets before the storage response resolves', async () => {
    const first = preset('scene-1', 'scene')
    const second = preset('scene-2', 'scene')
    let resolveReorder: (value: IPreset[]) => void = () => undefined
    vi.mocked(storage.presets.reorder).mockReturnValue(new Promise(resolve => {
      resolveReorder = resolve
    }))
    usePresetStore.setState({ presets: [first, second], initialized: true })

    const reorderPromise = usePresetStore.getState().reorderPresets('scene', ['scene-2', 'scene-1'])

    expect(usePresetStore.getState().presets.map(item => item.id)).toEqual(['scene-2', 'scene-1'])

    resolveReorder([{ ...second, revision: 2 }, { ...first, revision: 2 }])
    await reorderPromise

    expect(usePresetStore.getState().presets.map(item => item.revision)).toEqual([2, 2])
  })

  test('rolls back an optimistic reorder when storage rejects it', async () => {
    const first = preset('scene-1', 'scene')
    const second = preset('scene-2', 'scene')
    vi.mocked(storage.presets.reorder).mockRejectedValue(new Error('revision conflict'))
    usePresetStore.setState({ presets: [first, second], initialized: true })

    await expect(usePresetStore.getState().reorderPresets('scene', ['scene-2', 'scene-1'])).rejects.toThrow('revision conflict')

    expect(usePresetStore.getState().presets.map(item => item.id)).toEqual(['scene-1', 'scene-2'])
  })
})
