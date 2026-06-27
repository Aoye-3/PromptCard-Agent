import type { ICard, IPreset } from '@/models/Card.model'
import { QUICK_MESSAGE_CATEGORY, isQuickMessagePreset } from '@/domain/prompt-library/quick-messages'

export type PresetReorderType = ICard['type'] | typeof QUICK_MESSAGE_CATEGORY | 'all'

export const reorderPresetsByCategory = (
  presets: IPreset[],
  activeType: PresetReorderType,
  orderedIds: string[]
): IPreset[] => {
  if (activeType === 'all' || orderedIds.length === 0) {
    return presets
  }

  const orderedIdSet = new Set(orderedIds)
  const categoryPresets = presets.filter(preset => presetMatchesReorderCategory(preset, activeType))
  const categoryById = new Map(categoryPresets.map(preset => [preset.id, preset]))
  const reorderedCategory = [
    ...orderedIds.map(id => categoryById.get(id)).filter((preset): preset is IPreset => Boolean(preset)),
    ...categoryPresets.filter(preset => !orderedIdSet.has(preset.id))
  ]

  let categoryIndex = 0
  return presets.map(preset => {
    if (!presetMatchesReorderCategory(preset, activeType)) {
      return preset
    }

    return reorderedCategory[categoryIndex++] || preset
  })
}

const presetMatchesReorderCategory = (preset: IPreset, activeType: Exclude<PresetReorderType, 'all'>): boolean => {
  if (activeType === QUICK_MESSAGE_CATEGORY) return isQuickMessagePreset(preset)
  if (activeType === 'custom') return preset.type === 'custom' && !isQuickMessagePreset(preset)
  return preset.type === activeType
}
