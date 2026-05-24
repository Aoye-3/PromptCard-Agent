import { create } from 'zustand'
import { VIDPROM_EXCELLENT_EXAMPLES } from '../knowledge/vidprom-examples'

interface ExampleItem {
  id: string
  title: string
  content: string
  score: number
  reason?: string
  tags: string[]
}

interface ExampleStore {
  examples: ExampleItem[]
  init: () => void
  getByType: (type: string) => ExampleItem[]
  getTopRated: (type: string, limit: number) => ExampleItem[]
  search: (term: string, type?: string) => ExampleItem[]
}

export const useExampleStore = create<ExampleStore>((set, get) => ({
  examples: [],

  init: () => {
    const items: ExampleItem[] = VIDPROM_EXCELLENT_EXAMPLES.map(example => ({
      id: example.id,
      title: example.title,
      content: example.content,
      score: example.score,
      reason: example.reason,
      tags: example.tags || []
    }))

    set({ examples: items })
  },

  getByType: (type: string) => {
    return get().examples.filter(e => e.tags.includes(type))
  },

  getTopRated: (type: string, limit: number) => {
    return get().examples
      .filter(e => e.tags.includes(type))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  },

  search: (term: string, type?: string) => {
    let results = get().examples

    if (type) {
      results = results.filter(e => e.tags.includes(type))
    }

    if (term) {
      const lowerTerm = term.toLowerCase()
      const aliases: Record<string, string[]> = {
        '风景': ['scene', 'landscape', 'forest', 'sky'],
        '椋庢櫙': ['scene', 'landscape', 'forest', 'sky']
      }
      const terms = [lowerTerm, ...(aliases[term] || [])]
      results = results.filter(e =>
        terms.some(searchTerm =>
          e.title.toLowerCase().includes(searchTerm) ||
          e.content.toLowerCase().includes(searchTerm) ||
          e.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        )
      )
    }

    return results
  }
}))
