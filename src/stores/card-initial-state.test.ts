import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_TYPES, createInitialPage } from './card-initial-state'

describe('card initial state', () => {
  it('creates an empty starter page with the core card types', () => {
    const page = createInitialPage(12345)

    expect(page.id).toBe('12345')
    expect(page.cards.map(card => card.type)).toEqual(DEFAULT_CARD_TYPES)
    expect(page.cards).toHaveLength(9)
    expect(page.cards.every(card => card.content === '')).toBe(true)
  })
})
