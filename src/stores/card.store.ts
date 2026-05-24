import { create } from 'zustand'
import type { ICard, CardType } from '@/models/Card.model'
import { createInitialPage, getCardColor, type IPage } from './card-initial-state'

interface CardState {
  pages: IPage[]
  currentPage: number
  activeCardId: string | null
  activePresetCardId: string | null
  selectedCards: string[]
  currentSelectedCardId: string | null
  addCard: (type: CardType, title: string, content: string) => void
  removeCard: (id: string) => void
  updateCard: (id: string, updates: Partial<ICard> | ((prevCard: ICard) => Partial<ICard>)) => void
  updateCards: (updatesById: Record<string, Partial<ICard>>) => void
  setActiveCard: (id: string | null) => void
  setActivePresetCardId: (id: string | null) => void
  setCurrentSelectedCard: (id: string | null) => void
  switchCardMode: (id: string, mode: 'view' | 'edit') => void
  addPage: () => void
  switchPage: (pageIndex: number) => void
  removePage: (pageIndex: number) => void
  restoreWorkspace: (workspace: { pages: IPage[]; currentPage: number }) => void
  selectCard: (cardId: string) => void
  deselectCard: (cardId: string) => void
  clearSelection: () => void
  getCombinedPrompt: () => string
}

export const useCardStore = create<CardState>((set, get) => ({
  pages: [createInitialPage()],
  currentPage: 0,
  activeCardId: null,
  activePresetCardId: null,
  selectedCards: [],
  currentSelectedCardId: null,

  setCurrentSelectedCard: (cardId: string | null) => set(() => ({
    currentSelectedCardId: cardId
  })),

  selectCard: (cardId) => set((state) => {
    if (!state.selectedCards.includes(cardId)) {
      return { selectedCards: [...state.selectedCards, cardId] }
    }
    return state
  }),

  deselectCard: (cardId) => set((state) => ({
    selectedCards: state.selectedCards.filter(id => id !== cardId)
  })),

  clearSelection: () => set(() => ({ selectedCards: [] })),

  getCombinedPrompt: () => {
    const state = get()
    const currentCards = state.pages[state.currentPage].cards
    const selectedCards = state.selectedCards

    if (selectedCards.length === 0) {
      return ''
    }

    return selectedCards
      .map(id => currentCards.find(card => card.id === id))
      .filter((card): card is ICard => card !== undefined)
      .map(card => card.content)
      .filter(content => content.trim())
      .join('\n')
  },

  addCard: (type, title, content) => set((state) => {
    const timestamp = Date.now()
    const newPages = [...state.pages]
    newPages[state.currentPage] = {
      ...newPages[state.currentPage],
      cards: [
        ...newPages[state.currentPage].cards,
        {
          id: timestamp.toString(),
          type,
          title,
          content,
          mode: 'edit',
          color: getCardColor(type),
          createdAt: timestamp,
          updatedAt: timestamp,
          meta: {}
        }
      ]
    }
    return { pages: newPages }
  }),

  removeCard: (id) => set((state) => {
    const newPages = [...state.pages]
    newPages[state.currentPage] = {
      ...newPages[state.currentPage],
      cards: newPages[state.currentPage].cards.filter((card) => card.id !== id)
    }
    return {
      pages: newPages,
      activeCardId: state.activeCardId === id ? null : state.activeCardId
    }
  }),

  updateCard: (id, updates) => set((state) => {
    const newPages = [...state.pages]
    newPages[state.currentPage] = {
      ...newPages[state.currentPage],
      cards: newPages[state.currentPage].cards.map((card) => {
        if (card.id === id) {
          const resolvedUpdates = typeof updates === 'function' ? updates(card) : updates
          return { ...card, ...resolvedUpdates, updatedAt: Date.now() }
        }
        return card
      })
    }
    return { pages: newPages }
  }),

  updateCards: (updatesById) => set((state) => {
    const timestamp = Date.now()
    const newPages = state.pages.map((page) => ({
      ...page,
      cards: page.cards.map((card) => {
        const updates = updatesById[card.id]
        return updates ? { ...card, ...updates, updatedAt: timestamp } : card
      })
    }))

    return { pages: newPages }
  }),

  setActiveCard: (id) => set(() => ({
    activeCardId: id
  })),

  setActivePresetCardId: (id) => set(() => ({
    activePresetCardId: id
  })),

  switchCardMode: (id, mode) => set((state) => {
    const newPages = [...state.pages]
    newPages[state.currentPage] = {
      ...newPages[state.currentPage],
      cards: newPages[state.currentPage].cards.map((card) =>
        card.id === id ? { ...card, mode, updatedAt: Date.now() } : card
      )
    }
    return { pages: newPages }
  }),

  addPage: () => set((state) => {
    const currentPageData = state.pages[state.currentPage]
    const copiedCards = currentPageData.cards
      .filter(card => card.type !== 'constraint')
      .map(card => ({
        ...card,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }))

    const newPage: IPage = {
      id: Date.now().toString(),
      cards: copiedCards
    }

    return {
      pages: [...state.pages, newPage],
      currentPage: state.pages.length
    }
  }),

  switchPage: (pageIndex) => set(() => ({
    currentPage: pageIndex
  })),

  removePage: (pageIndex) => set((state) => {
    if (state.pages.length <= 1) return state
    const newPages = state.pages.filter((_, index) => index !== pageIndex)
    return {
      pages: newPages,
      currentPage: Math.min(state.currentPage, newPages.length - 1)
    }
  }),

  restoreWorkspace: ({ pages, currentPage }) => set(() => {
    if (pages.length === 0) {
      return {
        pages: [createInitialPage()],
        currentPage: 0,
        activeCardId: null,
        activePresetCardId: null,
        selectedCards: [],
        currentSelectedCardId: null
      }
    }

    return {
      pages,
      currentPage: Math.min(Math.max(currentPage, 0), pages.length - 1),
      activeCardId: null,
      activePresetCardId: null,
      selectedCards: [],
      currentSelectedCardId: null
    }
  })
}))
