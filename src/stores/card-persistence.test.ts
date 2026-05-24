import { describe, expect, it } from 'vitest'
import { useCardStore } from './card.store'
import type { IPage } from './card-initial-state'

const persistedPages: IPage[] = [
  {
    id: 'page-restored',
    cards: [
      {
        id: 'card-restored',
        type: 'subject',
        title: 'Subject',
        content: 'Restored subject',
        mode: 'edit',
        color: 'blue',
        createdAt: 1,
        updatedAt: 1,
        meta: {}
      }
    ]
  }
]

describe('card store persistence helpers', () => {
  it('replaces the workspace and clears transient selections', () => {
    const store = useCardStore.getState()
    store.selectCard('stale-card')
    store.setActiveCard('stale-card')
    store.setActivePresetCardId('stale-card')

    useCardStore.getState().restoreWorkspace({
      pages: persistedPages,
      currentPage: 4
    })

    const state = useCardStore.getState()

    expect(state.pages).toEqual(persistedPages)
    expect(state.currentPage).toBe(0)
    expect(state.selectedCards).toEqual([])
    expect(state.activeCardId).toBeNull()
    expect(state.activePresetCardId).toBeNull()
  })
})
