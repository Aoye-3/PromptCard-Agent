import type { ICard } from '@/models/Card.model'
import { PROMPT_CARD_LABELS, PROMPT_CARD_ORDER, PROMPT_PAGE_SEPARATOR } from './promptParser'

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

const PROMPT_LABEL_TYPES = Object.entries(PROMPT_CARD_LABELS).reduce<Record<string, ICard['type']>>(
  (acc, [type, label]) => {
    acc[label] = type as ICard['type']
    return acc
  },
  {}
)

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
  const updates: Record<string, Partial<ICard>> = {}
  const pageBlocks = splitPromptIntoPageBlocks(prompt, pages.length)

  pages.forEach((page, pageIndex) => {
    const block = pageBlocks[pageIndex] ?? ''
    const labeledUpdates = parseLabeledPageBlock(page, block)
    if (labeledUpdates) {
      Object.assign(updates, labeledUpdates)
      return
    }

    const line = block.split(/\r?\n/).find(item => item.trim()) ?? ''
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

const splitPromptIntoPageBlocks = (prompt: string, pageCount: number): string[] => {
  const lines = prompt.split(/\r?\n/)
  const hasPageSeparators = lines.some(line => line.trim() === PROMPT_PAGE_SEPARATOR)

  if (!hasPageSeparators) {
    const nonEmptyLines = lines.filter(line => line.trim())
    const isLegacyLinePerPage = pageCount > 1 && nonEmptyLines.every(line => /^\s*\[[^\]]*\]/.test(line))
    return isLegacyLinePerPage ? nonEmptyLines : [prompt]
  }

  const blocks: string[] = ['']
  lines.forEach(line => {
    if (line.trim() === PROMPT_PAGE_SEPARATOR) {
      blocks.push('')
      return
    }
    blocks[blocks.length - 1] = blocks[blocks.length - 1]
      ? `${blocks[blocks.length - 1]}\n${line}`
      : line
  })

  return blocks
}

const parseLabeledPageBlock = (
  page: PromptPageLike,
  block: string
): Record<string, Partial<ICard>> | null => {
  const lines = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const labeledLines = lines
    .map(line => line.match(/^([^:：]+)\s*[:：]\s*(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match && PROMPT_LABEL_TYPES[match[1].trim()]))

  if (labeledLines.length === 0) return null

  const cardsByType = getPromptSegments(page.cards).reduce<Record<ICard['type'], ICard[]>>((acc, segment) => {
    acc[segment.card.type] = [...(acc[segment.card.type] || []), segment.card]
    return acc
  }, {
    timing: [],
    subject: [],
    action: [],
    scene: [],
    style: [],
    camera: [],
    lighting: [],
    audio: [],
    constraint: [],
    custom: []
  })

  const typeOffsets = PROMPT_CARD_ORDER.reduce<Record<ICard['type'], number>>((acc, type) => {
    acc[type] = 0
    return acc
  }, {
    timing: 0,
    subject: 0,
    action: 0,
    scene: 0,
    style: 0,
    camera: 0,
    lighting: 0,
    audio: 0,
    constraint: 0,
    custom: 0
  })

  const updates = page.cards.reduce<Record<string, Partial<ICard>>>((acc, card) => {
    acc[card.id] = { content: '' }
    return acc
  }, {})

  labeledLines.forEach(match => {
    const type = PROMPT_LABEL_TYPES[match[1].trim()]
    const card = cardsByType[type][typeOffsets[type]]
    if (!card) return

    updates[card.id] = { content: match[2].trim() }
    typeOffsets[type] += 1
  })

  return updates
}
