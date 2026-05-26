import type { CardType, IPreset } from '@/models/Card.model'

export type PromptInjectionActionId = 'copy' | 'append' | 'replace' | 'create-card'

export interface PromptInjectionAction {
  id: PromptInjectionActionId
  label: string
  title?: string
  requiresTarget?: boolean
  disabled?: boolean
}

export interface PromptInjectionEvent {
  preset: IPreset
  actionId: PromptInjectionActionId
}

export const promptInjectionCardTypes: CardType[] = [
  'subject',
  'action',
  'scene',
  'style',
  'camera',
  'lighting',
  'timing',
  'audio',
  'constraint',
  'custom'
]

export const getDefaultPromptInjectionTypes = (): CardType[] => [...promptInjectionCardTypes]

export const filterPromptInjectionPresets = (
  presets: IPreset[],
  activeType: CardType,
  searchTerm = ''
): IPreset[] => {
  const keyword = searchTerm.trim().toLowerCase()
  return presets.filter((preset) => {
    if (preset.type !== activeType) return false
    if (!keyword) return true

    return (
      preset.label.toLowerCase().includes(keyword) ||
      preset.content.toLowerCase().includes(keyword)
    )
  })
}

export const createPromptInjectionEvent = (
  preset: IPreset,
  actionId: PromptInjectionActionId
): PromptInjectionEvent => ({
  preset,
  actionId
})
