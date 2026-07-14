import type { CardType } from '@/models/Card.model'
import type { RecentCaptureRegistrationRequest } from '@/storage/storage-service-client'
import type { RecentCaptureItemViewModel, RecentCaptureRole } from './media-types'

export interface RegistrationPromptFields {
  label: string
  content: string
  type: CardType
}

export const defaultPromptTypeForRole = (role?: RecentCaptureRole): CardType => {
  if (role === 'character' || role === 'prop') return 'subject'
  if (role === 'scene') return 'scene'
  if (role === 'composition') return 'camera'
  if (role === 'lighting') return 'lighting'
  if (role === 'color' || role === 'style' || role === 'mood') return 'style'
  return 'custom'
}

export const defaultMergedPromptType = (captures: RecentCaptureItemViewModel[]): CardType => {
  const types = new Set(captures.map(capture => defaultPromptTypeForRole(capture.role)))
  return types.size === 1 ? Array.from(types)[0] : 'custom'
}

export const buildRecentCaptureRegistrationRequest = (
  captures: RecentCaptureItemViewModel[],
  mode: 'separate' | 'merged',
  separatePrompts: RegistrationPromptFields[],
  mergedPrompt?: RegistrationPromptFields
): RecentCaptureRegistrationRequest => {
  if (captures.length === 0) throw new Error('请选择至少一项近期捕获。')
  if (captures.some(capture => capture.registeredPromptId)) throw new Error('所选素材中有项目已经注册。')

  if (mode === 'separate') {
    if (separatePrompts.length !== captures.length) throw new Error('每项素材都需要确认 Prompt。')
    separatePrompts.forEach(assertPromptFields)
    return {
      mode,
      captures: captures.map((capture, index) => ({
        id: capture.id,
        revision: capture.revision,
        ...trimPromptFields(separatePrompts[index])
      }))
    }
  }

  if (!mergedPrompt) throw new Error('请确认合并后的 Prompt。')
  assertPromptFields(mergedPrompt)
  return {
    mode,
    captures: captures.map(capture => ({ id: capture.id, revision: capture.revision })),
    prompt: trimPromptFields(mergedPrompt)
  }
}

const assertPromptFields = (fields: RegistrationPromptFields) => {
  if (!fields.label.trim() || !fields.content.trim()) throw new Error('名称和 Prompt 内容不能为空。')
}

const trimPromptFields = (fields: RegistrationPromptFields): RegistrationPromptFields => ({
  ...fields,
  label: fields.label.trim(),
  content: fields.content.trim()
})
