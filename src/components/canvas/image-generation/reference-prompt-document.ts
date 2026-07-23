import type { ConnectedImagePromptReference } from '@/domain/image-generation/prompt-compiler'
import type { PromptDocument, PromptSegment } from '@/models/PromptHistory.model'

export interface PromptMentionRange {
  start: number
  end: number
  referenceId: string
  label: string
}

export interface SerializedPromptDocument {
  text: string
  mentions: PromptMentionRange[]
}

export const serializePromptDocument = (document: PromptDocument): SerializedPromptDocument => {
  let text = ''
  const mentions: PromptMentionRange[] = []
  document.segments.forEach(segment => {
    if (segment.type === 'text') {
      text += segment.text
      return
    }
    const token = `@${segment.label}`
    mentions.push({
      start: text.length,
      end: text.length + token.length,
      referenceId: segment.referenceId,
      label: segment.label
    })
    text += token
  })
  return { text, mentions }
}

export const promptDocumentFromText = (
  text: string,
  mentions: readonly PromptMentionRange[]
): PromptDocument => {
  const segments: PromptSegment[] = []
  let cursor = 0
  const validMentions: PromptMentionRange[] = []
  let mentionCursor = 0
  ;[...mentions]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .forEach(mention => {
      if (
        mention.start < 0
        || mention.end <= mention.start
        || mention.start < mentionCursor
        || text.slice(mention.start, mention.end) !== `@${mention.label}`
      ) return
      validMentions.push(mention)
      mentionCursor = mention.end
    })

  validMentions.forEach(mention => {
    if (mention.start > cursor) appendTextSegment(segments, text.slice(cursor, mention.start))
    segments.push({
      type: 'reference',
      referenceId: mention.referenceId,
      label: mention.label
    })
    cursor = mention.end
  })
  if (cursor < text.length) appendTextSegment(segments, text.slice(cursor))
  if (segments.length === 0) segments.push({ type: 'text', text })
  return { version: 1, segments }
}

export const reconcilePromptDocumentEdit = (
  document: PromptDocument,
  nextText: string
): PromptDocument => {
  const previous = serializePromptDocument(document)
  if (previous.text === nextText) return clonePromptDocument(document)

  const prefixLength = commonPrefixLength(previous.text, nextText)
  const suffixLength = commonSuffixLength(previous.text, nextText, prefixLength)
  const previousEditEnd = previous.text.length - suffixLength
  const nextEditEnd = nextText.length - suffixLength
  const delta = nextEditEnd - previousEditEnd
  const mentions = previous.mentions.flatMap(mention => {
    if (mention.end <= prefixLength) return [{ ...mention }]
    if (mention.start >= previousEditEnd) {
      return [{
        ...mention,
        start: mention.start + delta,
        end: mention.end + delta
      }]
    }
    return []
  })
  return promptDocumentFromText(nextText, mentions)
}

export const replacePromptRangeWithReference = (
  document: PromptDocument,
  start: number,
  end: number,
  reference: Pick<ConnectedImagePromptReference, 'referenceId' | 'label'>
): PromptDocument => {
  const serialized = serializePromptDocument(document)
  const safeStart = clamp(start, 0, serialized.text.length)
  const safeEnd = clamp(end, safeStart, serialized.text.length)
  const token = `@${reference.label}`
  const nextText = `${serialized.text.slice(0, safeStart)}${token}${serialized.text.slice(safeEnd)}`
  const delta = token.length - (safeEnd - safeStart)
  const mentions = serialized.mentions.flatMap(mention => {
    if (mention.end <= safeStart) return [{ ...mention }]
    if (mention.start >= safeEnd) {
      return [{
        ...mention,
        start: mention.start + delta,
        end: mention.end + delta
      }]
    }
    return []
  })
  mentions.push({
    start: safeStart,
    end: safeStart + token.length,
    referenceId: reference.referenceId,
    label: reference.label
  })
  return promptDocumentFromText(nextText, mentions)
}

export const insertPromptReference = (
  document: PromptDocument,
  reference: Pick<ConnectedImagePromptReference, 'referenceId' | 'label'>
): PromptDocument => {
  const { text } = serializePromptDocument(document)
  return replacePromptRangeWithReference(document, text.length, text.length, reference)
}

export const replacePromptTextSegment = (
  document: PromptDocument,
  segmentIndex: number,
  text: string
): PromptDocument => ({
  version: 1,
  segments: document.segments.map((segment, index) => index === segmentIndex && segment.type === 'text'
    ? { type: 'text', text }
    : clonePromptSegment(segment))
})

export const insertPromptReferenceAtTextCursor = (
  document: PromptDocument,
  segmentIndex: number,
  cursor: number,
  reference: Pick<ConnectedImagePromptReference, 'referenceId' | 'label'>
): PromptDocument => {
  const segment = document.segments[segmentIndex]
  if (!segment || segment.type !== 'text') return insertPromptReference(document, reference)
  const offset = document.segments.slice(0, segmentIndex).reduce((total, current) => (
    total + (current.type === 'text' ? current.text.length : `@${current.label}`.length)
  ), 0)
  return replacePromptRangeWithReference(document, offset + Math.max(0, cursor - 1), offset + cursor, reference)
}

const appendTextSegment = (segments: PromptSegment[], text: string) => {
  if (!text) return
  const last = segments[segments.length - 1]
  if (last?.type === 'text') last.text += text
  else segments.push({ type: 'text', text })
}

const clonePromptDocument = (document: PromptDocument): PromptDocument => ({
  version: 1,
  segments: document.segments.map(clonePromptSegment)
})

const clonePromptSegment = (segment: PromptSegment): PromptSegment => segment.type === 'text'
  ? { type: 'text', text: segment.text }
  : { type: 'reference', referenceId: segment.referenceId, label: segment.label }

const commonPrefixLength = (left: string, right: string): number => {
  const limit = Math.min(left.length, right.length)
  let index = 0
  while (index < limit && left[index] === right[index]) index += 1
  return index
}

const commonSuffixLength = (left: string, right: string, prefixLength: number): number => {
  const limit = Math.min(left.length, right.length) - prefixLength
  let index = 0
  while (
    index < limit
    && left[left.length - 1 - index] === right[right.length - 1 - index]
  ) index += 1
  return index
}

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
)
