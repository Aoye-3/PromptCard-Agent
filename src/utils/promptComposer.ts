import type { ICard } from '@/models/Card.model'

export const PROMPT_CARD_ORDER: ICard['type'][] = [
  'timing',
  'subject',
  'action',
  'scene',
  'style',
  'camera',
  'lighting',
  'audio',
  'constraint',
  'custom'
]

const shortPhraseStopWords = new Set([
  'and',
  'or',
  'the',
  'a',
  'an',
  'with',
  'in',
  'on',
  'of',
  'to',
  'for',
  '以及',
  '并且',
  '然后',
  '同时'
])

export interface PromptSegment {
  card: ICard
  content: string
  isEmpty: boolean
}

export interface DuplicatePhrase {
  phrase: string
  normalized: string
  cardIds: string[]
  count: number
}

export interface DuplicatePhraseResult {
  duplicates: DuplicatePhrase[]
  byCardId: Record<string, string[]>
}

export interface PromptPageLike {
  cards: ICard[]
}

export const getPromptSegments = (cards: ICard[]): PromptSegment[] => {
  return [...cards]
    .sort((a, b) => {
      const indexA = PROMPT_CARD_ORDER.indexOf(a.type)
      const indexB = PROMPT_CARD_ORDER.indexOf(b.type)
      return indexA - indexB
    })
    .map(card => ({
      card,
      content: card.content,
      isEmpty: card.content.trim().length === 0
    }))
}

export const countMixedTokens = (text: string): number => {
  const matches = text.match(/[\u4e00-\u9fff]|\d+(?::\d+)+(?:-\d+(?::\d+)+)?|\d+-\d+|[A-Za-z0-9]+(?:'[A-Za-z]+)?/g)
  return matches ? matches.length : 0
}

export const countPromptSegments = (segments: PromptSegment[]): number => {
  return segments.filter(segment => !segment.isEmpty).length
}

const normalizePhrase = (phrase: string): string => {
  return phrase
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[[\]【】()（）"'“”‘’]+|[[\]【】()（）"'“”‘’]+$/g, '')
    .toLowerCase()
}

const isMeaningfulPhrase = (phrase: string): boolean => {
  const normalized = normalizePhrase(phrase)
  if (!normalized || shortPhraseStopWords.has(normalized)) return false

  const cjkCount = (normalized.match(/[\u4e00-\u9fff]/g) || []).length
  const alphaNumericCount = (normalized.match(/[a-z0-9]/g) || []).length
  return cjkCount >= 2 || alphaNumericCount >= 4
}

export const splitPromptPhrases = (content: string): string[] => {
  return content
    .split(/[,\uFF0C\u3001;；。.\n]+/)
    .map(phrase => phrase.trim())
    .filter(isMeaningfulPhrase)
}

export const findDuplicatePhrases = (cards: ICard[]): DuplicatePhraseResult => {
  const phraseMap = new Map<string, { phrase: string; count: number; cardIds: Set<string> }>()

  cards.forEach(card => {
    splitPromptPhrases(card.content).forEach(phrase => {
      const normalized = normalizePhrase(phrase)
      const existing = phraseMap.get(normalized)
      if (existing) {
        existing.count += 1
        existing.cardIds.add(card.id)
      } else {
        phraseMap.set(normalized, {
          phrase,
          count: 1,
          cardIds: new Set([card.id])
        })
      }
    })
  })

  const duplicates = Array.from(phraseMap.entries())
    .filter(([, value]) => value.count > 1)
    .map(([normalized, value]) => ({
      phrase: value.phrase,
      normalized,
      cardIds: Array.from(value.cardIds),
      count: value.count
    }))

  const byCardId = duplicates.reduce<Record<string, string[]>>((acc, duplicate) => {
    duplicate.cardIds.forEach(cardId => {
      acc[cardId] = [...(acc[cardId] || []), duplicate.phrase]
    })
    return acc
  }, {})

  return { duplicates, byCardId }
}

export const parsePromptToCardUpdates = (
  pages: PromptPageLike[],
  prompt: string
): Record<string, Partial<ICard>> => {
  const lines = prompt.split(/\r?\n/)
  const updates: Record<string, Partial<ICard>> = {}

  pages.forEach((page, pageIndex) => {
    const line = lines[pageIndex] ?? ''
    const timingCard = page.cards.find(card => card.type === 'timing')
    const timestampMatch = line.match(/^\s*\[([^\]]*)\]\s*/)
    const body = timestampMatch ? line.slice(timestampMatch[0].length).trim() : line.trim()

    if (timingCard) {
      updates[timingCard.id] = { content: timestampMatch ? timestampMatch[1].trim() : '' }
    }

    const editableCards = getPromptSegments(page.cards)
      .map(segment => segment.card)
      .filter(card => card.type !== 'timing')

    const parts = body
      ? body.split(/[,，]/).map(part => part.trim()).filter(Boolean)
      : []

    editableCards.forEach((card, index) => {
      const isLastCard = index === editableCards.length - 1
      updates[card.id] = {
        content: isLastCard
          ? parts.slice(index).join(', ')
          : parts[index] || ''
      }
    })
  })

  return updates
}
