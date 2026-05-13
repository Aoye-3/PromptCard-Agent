import { describe, expect, test, vi, afterEach } from 'vitest'
import { devPresetFileStorage } from './storage'
import type { IPreset } from '@/models/Card.model'

const samplePresets: IPreset[] = [
  {
    id: 'preset-test',
    type: 'subject',
    category: 'subject',
    label: 'Test Prompt',
    content: 'A persisted test prompt',
    usageCount: 0,
    meta: {}
  }
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('devPresetFileStorage', () => {
  test('loads presets from the dev file endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ presets: samplePresets })
    } as Response)

    await expect(devPresetFileStorage.getAll()).resolves.toEqual(samplePresets)
    expect(fetchMock).toHaveBeenCalledWith('/__promptcard/presets', {
      headers: { Accept: 'application/json' }
    })
  })

  test('saves presets to the dev file endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true
    } as Response)

    await expect(devPresetFileStorage.saveAll(samplePresets)).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/__promptcard/presets', {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ presets: samplePresets })
    })
  })

  test('returns fallback signals when the dev file endpoint is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))

    await expect(devPresetFileStorage.getAll()).resolves.toBeNull()
    await expect(devPresetFileStorage.saveAll(samplePresets)).resolves.toBe(false)
  })
})
