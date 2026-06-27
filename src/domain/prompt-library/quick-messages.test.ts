import { describe, expect, test, vi } from 'vitest'
import {
  QUICK_MESSAGE_CATEGORY,
  createQuickMessagePresetInput,
  isQuickMessagePreset,
  normalizeLegacyQuickMessage,
  quickMessagePresetToDraft,
  quickMessageSearchText
} from './quick-messages'

describe('quick message presets', () => {
  test('normalizes current legacy quick message records', () => {
    expect(normalizeLegacyQuickMessage({
      id: 'quick-1',
      name: 'Storyboard',
      note: 'for boards',
      body: 'Create a board',
      createdAt: 100
    })).toEqual({
      id: 'quick-1',
      name: 'Storyboard',
      note: 'for boards',
      body: 'Create a board',
      createdAt: 100
    })
  })

  test('normalizes older text-only quick message records', () => {
    vi.spyOn(Date, 'now').mockReturnValue(200)

    expect(normalizeLegacyQuickMessage({
      id: 'quick-legacy',
      text: 'Use low-key lighting'
    })).toEqual({
      id: 'quick-legacy',
      name: 'Use low-key lighting',
      note: '',
      body: 'Use low-key lighting',
      createdAt: 200
    })
  })

  test('filters invalid legacy quick message records', () => {
    expect(normalizeLegacyQuickMessage(null)).toBeNull()
    expect(normalizeLegacyQuickMessage({ id: 'quick-empty', name: ' ', body: '' })).toBeNull()
    expect(normalizeLegacyQuickMessage({ name: 'Missing id', body: 'Body' })).toBeNull()
  })

  test('creates IPreset-compatible quick message input', () => {
    expect(createQuickMessagePresetInput({
      name: '  Storyboard  ',
      body: '  Create a board  '
    }, {
      legacyId: 'legacy-1',
      createdAt: 100
    })).toEqual({
      type: 'custom',
      category: QUICK_MESSAGE_CATEGORY,
      label: 'Storyboard',
      content: 'Create a board',
      createdAt: 100,
      meta: {
        quickMessage: {
          kind: QUICK_MESSAGE_CATEGORY,
          legacyId: 'legacy-1'
        }
      }
    })
  })

  test('preserves existing metadata when updating quick messages', () => {
    expect(createQuickMessagePresetInput({
      name: 'Storyboard updated',
      body: 'Create a better board'
    }, {
      meta: {
        media: [{
          id: 'media-image',
          kind: 'image',
          source: 'asset',
          assetId: 'asset-image'
        }],
        quickMessage: {
          kind: QUICK_MESSAGE_CATEGORY,
          note: 'old note',
          legacyId: 'legacy-1'
        }
      }
    })).toEqual({
      type: 'custom',
      category: QUICK_MESSAGE_CATEGORY,
      label: 'Storyboard updated',
      content: 'Create a better board',
      meta: {
        media: [{
          id: 'media-image',
          kind: 'image',
          source: 'asset',
          assetId: 'asset-image'
        }],
        quickMessage: {
          kind: QUICK_MESSAGE_CATEGORY,
          legacyId: 'legacy-1'
        }
      }
    })
  })

  test('detects quick message presets and extracts editable drafts', () => {
    const preset = {
      id: 'preset-1',
      type: 'custom' as const,
      category: QUICK_MESSAGE_CATEGORY,
      label: 'Storyboard',
      content: 'Create a board',
      usageCount: 0,
      meta: { quickMessage: { kind: QUICK_MESSAGE_CATEGORY, note: 'reusable' } }
    }

    expect(isQuickMessagePreset(preset)).toBe(true)
    expect(quickMessagePresetToDraft(preset)).toEqual({
      name: 'Storyboard',
      body: 'Create a board'
    })
  })

  test('does not include legacy notes in quick message search text', () => {
    const preset = {
      label: 'Storyboard',
      content: 'Create a board',
      category: QUICK_MESSAGE_CATEGORY,
      meta: { quickMessage: { kind: QUICK_MESSAGE_CATEGORY, note: 'legacy note' } }
    }

    expect(quickMessageSearchText(preset)).toBe(`Storyboard Create a board ${QUICK_MESSAGE_CATEGORY}`)
  })
})
