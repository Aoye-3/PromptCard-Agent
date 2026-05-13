import { describe, expect, it } from 'vitest'
import type { ICard } from '@/models/Card.model'
import {
  countMixedTokens,
  countPromptSegments,
  findDuplicatePhrases,
  getPromptSegments,
  parsePromptToCardUpdates,
  splitPromptPhrases
} from './promptComposer'

const createCard = (id: string, type: ICard['type'], content: string): ICard => ({
  id,
  type,
  title: type,
  content,
  mode: 'edit',
  color: 'gray',
  createdAt: 1,
  updatedAt: 1,
  meta: {}
})

describe('promptComposer utilities', () => {
  it('builds ordered editable segments and excludes empty cards from segment counts', () => {
    const segments = getPromptSegments([
      createCard('2', 'action', 'running'),
      createCard('1', 'timing', ''),
      createCard('3', 'subject', 'young girl')
    ])

    expect(segments.map(segment => segment.card.type)).toEqual(['timing', 'subject', 'action'])
    expect(countPromptSegments(segments)).toBe(2)
  })

  it('counts mixed Chinese characters, English words, and time ranges', () => {
    expect(countMixedTokens('年轻女孩 running fast 00:00-00:04, 8K')).toBe(8)
  })

  it('splits phrases and detects repeated descriptions across cards', () => {
    const cards = [
      createCard('subject', 'subject', '黑色长发，阳光帅气，cinematic light'),
      createCard('scene', 'scene', '城市夜景，黑色长发，cinematic light')
    ]

    expect(splitPromptPhrases(cards[0].content)).toEqual(['黑色长发', '阳光帅气', 'cinematic light'])

    const result = findDuplicatePhrases(cards)
    expect(result.duplicates.map(duplicate => duplicate.phrase)).toEqual(['黑色长发', 'cinematic light'])
    expect(result.byCardId.subject).toEqual(['黑色长发', 'cinematic light'])
    expect(result.byCardId.scene).toEqual(['黑色长发', 'cinematic light'])
  })

  it('parses a whole prompt back into page card updates', () => {
    const pageOne = {
      cards: [
        createCard('time-1', 'timing', ''),
        createCard('subject-1', 'subject', ''),
        createCard('action-1', 'action', '')
      ]
    }
    const pageTwo = {
      cards: [
        createCard('time-2', 'timing', ''),
        createCard('subject-2', 'subject', ''),
        createCard('action-2', 'action', '')
      ]
    }

    const updates = parsePromptToCardUpdates(
      [pageOne, pageTwo],
      '[00:00-00:04] young hero, running fast\n[00:04-00:08] rainy street, camera follows'
    )

    expect(updates['time-1'].content).toBe('00:00-00:04')
    expect(updates['subject-1'].content).toBe('young hero')
    expect(updates['action-1'].content).toBe('running fast')
    expect(updates['time-2'].content).toBe('00:04-00:08')
    expect(updates['subject-2'].content).toBe('rainy street')
    expect(updates['action-2'].content).toBe('camera follows')
  })
})
