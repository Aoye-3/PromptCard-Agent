import type { CardType, IPreset } from '@/models/Card.model'

export const QUICK_MESSAGE_CATEGORY = 'quick-message'
export const QUICK_MESSAGE_LABEL = '快捷消息'
export const LEGACY_QUICK_MESSAGE_SETTINGS_KEY = 'freeCanvasQuickTextPresets'

export interface QuickMessageDraft {
  name: string
  body: string
}

export interface LegacyQuickMessage extends QuickMessageDraft {
  id: string
  note: string
  createdAt: number
}

export type QuickMessagePresetInput = Omit<IPreset, 'id' | 'usageCount'>

export const isQuickMessagePreset = (preset: Pick<IPreset, 'category' | 'meta'>): boolean =>
  preset.category === QUICK_MESSAGE_CATEGORY || preset.meta?.quickMessage?.kind === QUICK_MESSAGE_CATEGORY

export const getQuickMessageLegacyId = (preset: Pick<IPreset, 'meta'>): string | null => {
  const legacyId = preset.meta?.quickMessage?.legacyId
  return typeof legacyId === 'string' && legacyId ? legacyId : null
}

export const normalizeLegacyQuickMessage = (value: unknown): LegacyQuickMessage | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id) return null

  if (typeof record.body === 'string' && typeof record.name === 'string') {
    const name = record.name.trim()
    const body = record.body.trim()
    if (!name || !body) return null
    return {
      id: record.id,
      name,
      note: typeof record.note === 'string' ? record.note.trim() : '',
      body,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now()
    }
  }

  if (typeof record.text === 'string') {
    const body = record.text.trim()
    if (!body) return null
    return {
      id: record.id,
      name: body.slice(0, 20),
      note: '',
      body,
      createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now()
    }
  }

  return null
}

export const createQuickMessagePresetInput = (
  draft: QuickMessageDraft,
  options: { legacyId?: string; createdAt?: number; meta?: Record<string, unknown> } = {}
): QuickMessagePresetInput => {
  const baseMeta = options.meta || {}
  const existingQuickMessage = baseMeta.quickMessage && typeof baseMeta.quickMessage === 'object'
    ? baseMeta.quickMessage as Record<string, unknown>
    : {}
  const quickMessageWithoutNote = Object.fromEntries(
    Object.entries(existingQuickMessage).filter(([key]) => key !== 'note')
  )
  const legacyId = options.legacyId ?? (
    typeof existingQuickMessage.legacyId === 'string' ? existingQuickMessage.legacyId : undefined
  )
  const input: QuickMessagePresetInput = {
    type: 'custom' satisfies CardType,
    category: QUICK_MESSAGE_CATEGORY,
    label: draft.name.trim(),
    content: draft.body.trim(),
    meta: {
      ...baseMeta,
      quickMessage: {
        ...quickMessageWithoutNote,
        kind: QUICK_MESSAGE_CATEGORY,
        legacyId
      }
    }
  }
  if (typeof options.createdAt === 'number') input.createdAt = options.createdAt
  return input
}

export const quickMessagePresetToDraft = (preset: Pick<IPreset, 'label' | 'content'>): QuickMessageDraft => ({
  name: preset.label,
  body: preset.content
})

export const quickMessageSearchText = (preset: Pick<IPreset, 'label' | 'content' | 'category'>): string =>
  [preset.label, preset.content, preset.category].join(' ')
