import { describe, expect, it } from 'vitest'
import type { ICard } from '@/models/Card.model'
import { createInitialPage } from '@/stores/card-initial-state'
import { assemblePrompt } from './promptParser'

const createCard = (id: string, type: ICard['type'], content: string): ICard => ({
  id,
  type,
  title: `custom ${type}`,
  content,
  mode: 'edit',
  color: 'gray',
  createdAt: 1,
  updatedAt: 1,
  meta: {}
})

describe('assemblePrompt', () => {
  it('returns empty text for the empty starter cards', () => {
    expect(assemblePrompt([createInitialPage(12345)])).toBe('')
  })

  it('injects the fixed duration label for a timing card', () => {
    expect(assemblePrompt([{ cards: [createCard('time', 'timing', '0-3S')] }])).toBe('时长：0-3S')
  })

  it('injects fixed labels and preserves card prompt order', () => {
    expect(assemblePrompt([{
      cards: [
        createCard('action', 'action', 'running fast'),
        createCard('time', 'timing', '0-3S'),
        createCard('subject', 'subject', 'young hero')
      ]
    }])).toBe(['时长：0-3S', '主体：young hero', '动作：running fast'].join('\n'))
  })

  it('separates non-empty pages with a standalone slash divider', () => {
    expect(assemblePrompt([
      { cards: [createCard('time-1', 'timing', '0-3S')] },
      { cards: [createCard('subject-2', 'subject', 'rainy street')] }
    ])).toBe(['时长：0-3S', '//', '主体：rainy street'].join('\n'))
  })
})
