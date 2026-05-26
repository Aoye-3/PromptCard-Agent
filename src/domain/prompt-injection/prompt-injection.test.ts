import { describe, expect, test } from 'vitest'
import type { IPreset } from '@/models/Card.model'
import {
  filterPromptInjectionPresets,
  getDefaultPromptInjectionTypes,
  promptInjectionCardTypes
} from './prompt-injection'

const preset = (id: string, type: IPreset['type'], label: string, content: string): IPreset => ({
  id,
  type,
  category: type,
  label,
  content,
  usageCount: 0,
  meta: {}
})

describe('prompt injection helpers', () => {
  test('filters presets by type', () => {
    const presets = [
      preset('subject-1', 'subject', 'Subject', 'person'),
      preset('camera-1', 'camera', 'Camera', 'push in'),
      preset('camera-2', 'camera', 'Handheld', 'handheld motion')
    ]

    expect(filterPromptInjectionPresets(presets, 'camera').map(item => item.id)).toEqual([
      'camera-1',
      'camera-2'
    ])
  })

  test('searches presets by label and content within the selected type', () => {
    const presets = [
      preset('camera-1', 'camera', 'Wide shot', 'establishing frame'),
      preset('camera-2', 'camera', 'Macro', 'close detail'),
      preset('subject-1', 'subject', 'Camera operator', 'person with camera')
    ]

    expect(filterPromptInjectionPresets(presets, 'camera', 'detail').map(item => item.id)).toEqual([
      'camera-2'
    ])
    expect(filterPromptInjectionPresets(presets, 'camera', 'camera operator')).toEqual([])
  })

  test('does not mutate preset objects or the default type list', () => {
    const presets = [preset('style-1', 'style', 'Noir', 'high contrast')]
    const before = JSON.stringify(presets)
    const defaultTypes = getDefaultPromptInjectionTypes()

    filterPromptInjectionPresets(presets, 'style', 'noir')
    defaultTypes.pop()

    expect(JSON.stringify(presets)).toBe(before)
    expect(promptInjectionCardTypes).toContain('custom')
  })
})
