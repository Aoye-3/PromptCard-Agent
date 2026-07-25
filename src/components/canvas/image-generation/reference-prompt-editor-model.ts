import type { ConnectedImagePromptReference } from '@/domain/image-generation/prompt-compiler'
import type { PromptDocument } from '@/models/PromptHistory.model'

export type PromptEditorUnit =
  | { type: 'text'; text: string }
  | { type: 'reference'; referenceId: string; label: string }

const referenceUnit = '\uFFFC'

export const promptDocumentEditorText = (promptDocument: PromptDocument): string => (
  promptDocument.segments.map(segment => segment.type === 'text' ? segment.text : referenceUnit).join('')
)

export const replacePromptEditorRangeWithText = (
  promptDocument: PromptDocument,
  start: number,
  end: number,
  text: string
): PromptDocument => replacePromptEditorUnits(
  promptDocument,
  start,
  end,
  Array.from(text, character => ({ type: 'text', text: character }))
)

export const replacePromptEditorRangeWithReference = (
  promptDocument: PromptDocument,
  start: number,
  end: number,
  reference: Pick<ConnectedImagePromptReference, 'referenceId' | 'label'>
): PromptDocument => replacePromptEditorUnits(promptDocument, start, end, [{
  type: 'reference',
  referenceId: reference.referenceId,
  label: reference.label
}])

export const promptEditorUnitAt = (
  promptDocument: PromptDocument,
  index: number
): PromptEditorUnit | null => {
  if (index < 0) return null
  return promptDocumentToEditorUnits(promptDocument)[index] || null
}

export const promptDocumentFromEditorUnits = (units: PromptEditorUnit[]): PromptDocument => {
  const segments: PromptDocument['segments'] = []
  units.forEach(unit => {
    if (unit.type === 'reference') {
      segments.push({ ...unit })
      return
    }
    const last = segments[segments.length - 1]
    if (last?.type === 'text') {
      last.text += unit.text
    } else {
      segments.push({ type: 'text', text: unit.text })
    }
  })
  return { version: 1, segments }
}

const replacePromptEditorUnits = (
  promptDocument: PromptDocument,
  start: number,
  end: number,
  inserted: PromptEditorUnit[]
): PromptDocument => {
  const units = promptDocumentToEditorUnits(promptDocument)
  const safeStart = Math.max(0, Math.min(start, units.length))
  const safeEnd = Math.max(safeStart, Math.min(end, units.length))
  units.splice(safeStart, safeEnd - safeStart, ...inserted)
  return promptDocumentFromEditorUnits(units)
}

const promptDocumentToEditorUnits = (promptDocument: PromptDocument): PromptEditorUnit[] => {
  const units: PromptEditorUnit[] = []
  promptDocument.segments.forEach(segment => {
    if (segment.type === 'reference') {
      units.push({ ...segment })
      return
    }
    for (const character of segment.text) {
      units.push({ type: 'text', text: character })
    }
  })
  return units
}
