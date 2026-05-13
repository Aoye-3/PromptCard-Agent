import { describe, expect, test } from 'vitest'
import type { IPreset } from '@/models/Card.model'
import { reorderPresetsByCategory } from './preset-order'

const preset = (id: string, type: IPreset['type'], label = id): IPreset => ({
  id,
  type,
  category: type,
  label,
  content: label,
  usageCount: 0,
  meta: {}
})

describe('reorderPresetsByCategory', () => {
  test('reorders only the selected category while preserving other presets', () => {
    const presets = [
      preset('subject-1', 'subject'),
      preset('scene-1', 'scene'),
      preset('scene-2', 'scene'),
      preset('style-1', 'style'),
      preset('scene-3', 'scene'),
      preset('audio-1', 'audio')
    ]

    const result = reorderPresetsByCategory(presets, 'scene', ['scene-3', 'scene-1', 'scene-2'])

    expect(result.map(item => item.id)).toEqual([
      'subject-1',
      'scene-3',
      'scene-1',
      'style-1',
      'scene-2',
      'audio-1'
    ])
  })

  test('leaves the list unchanged for all-category sorting', () => {
    const presets = [preset('scene-1', 'scene'), preset('scene-2', 'scene')]

    expect(reorderPresetsByCategory(presets, 'all', ['scene-2', 'scene-1'])).toEqual(presets)
  })

  test('keeps missing category items at the end of that category order', () => {
    const presets = [preset('scene-1', 'scene'), preset('scene-2', 'scene'), preset('scene-3', 'scene')]

    const result = reorderPresetsByCategory(presets, 'scene', ['scene-3', 'scene-1'])

    expect(result.map(item => item.id)).toEqual(['scene-3', 'scene-1', 'scene-2'])
  })
})
