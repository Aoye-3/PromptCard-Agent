import type { ICard, IPreset } from '@/models/Card.model'

export type PresetReorderType = ICard['type'] | 'all'

export const reorderPresetsByCategory = (
  presets: IPreset[],
  activeType: PresetReorderType,
  orderedIds: string[]
): IPreset[] => {
  if (activeType === 'all' || orderedIds.length === 0) {
    return presets
  }

  const orderedIdSet = new Set(orderedIds)
  const categoryPresets = presets.filter(preset => preset.type === activeType)
  const categoryById = new Map(categoryPresets.map(preset => [preset.id, preset]))
  const reorderedCategory = [
    ...orderedIds.map(id => categoryById.get(id)).filter((preset): preset is IPreset => Boolean(preset)),
    ...categoryPresets.filter(preset => !orderedIdSet.has(preset.id))
  ]

  let categoryIndex = 0
  return presets.map(preset => {
    if (preset.type !== activeType) {
      return preset
    }

    return reorderedCategory[categoryIndex++] || preset
  })
}
