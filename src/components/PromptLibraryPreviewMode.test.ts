import { describe, expect, test } from 'vitest'
import type { IPreset } from '@/models/Card.model'
import { QUICK_MESSAGE_CATEGORY } from '@/domain/prompt-library/quick-messages'
import {
  createCategoryCounts,
  createPromptLibraryCategories,
  filterPromptLibraryPresets
} from './PromptLibraryPreviewMode'

const preset = (id: string, overrides: Partial<IPreset> = {}): IPreset => ({
  id,
  type: 'custom',
  category: 'custom',
  label: id,
  content: id,
  usageCount: 0,
  meta: {},
  ...overrides
})

describe('PromptLibraryPreviewMode filtering', () => {
  test('filters quick messages through their dedicated category', () => {
    const quick = preset('quick-1', {
      category: QUICK_MESSAGE_CATEGORY,
      label: 'Storyboard shortcut',
      content: 'Create a board',
      meta: { quickMessage: { kind: QUICK_MESSAGE_CATEGORY, note: 'story note' } }
    })
    const normalCustom = preset('custom-1')

    expect(filterPromptLibraryPresets([quick, normalCustom], '', QUICK_MESSAGE_CATEGORY)).toEqual([quick])
    expect(filterPromptLibraryPresets([quick, normalCustom], '', 'custom')).toEqual([normalCustom])
    expect(filterPromptLibraryPresets([quick, normalCustom], 'story note', 'all')).toEqual([])
  })

  test('counts quick messages outside normal custom presets', () => {
    const categories = createPromptLibraryCategories([
      { type: 'custom', label: 'Custom' },
      { type: 'scene', label: 'Scene' }
    ])
    const quick = preset('quick-1', {
      category: QUICK_MESSAGE_CATEGORY,
      meta: { quickMessage: { kind: QUICK_MESSAGE_CATEGORY } }
    })
    const normalCustom = preset('custom-1')
    const scene = preset('scene-1', { type: 'scene', category: 'scene' })

    expect(createCategoryCounts(categories, [quick, normalCustom, scene])).toMatchObject({
      custom: 1,
      scene: 1,
      [QUICK_MESSAGE_CATEGORY]: 1
    })
  })
})
