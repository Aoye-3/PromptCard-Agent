import React, { useState } from 'react'
import { usePresetStore } from '../stores/preset.store'
import type { IPreset } from '../models/Card.model'
import { useI18n } from '@/i18n'
import { PromptPresetPreviewDialog } from './prompt-media/PromptPresetPreviewDialog'

interface PresetSelectorProps {
  type: string
  onSelect: (preset: IPreset) => void
  selectedPreset?: IPreset | null
}

const PresetSelector: React.FC<PresetSelectorProps> = ({ 
  type, 
  onSelect, 
  selectedPreset 
}) => {
  const { t } = useI18n()
  const presets = usePresetStore(state => state.presets)
  const [isOpen, setIsOpen] = useState(false)
  const [previewPreset, setPreviewPreset] = useState<IPreset | null>(null)
  const presetsForType = presets.filter(preset => preset.type === type)

  const handlePresetSelect = (preset: IPreset) => {
    onSelect(preset)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors duration-200 ${
          selectedPreset 
            ? 'bg-blue-50 border-blue-200 text-blue-800'
            : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        {selectedPreset ? selectedPreset.label : t('choosePresetPrompt')}
      </button>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {presetsForType.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-sm">
              {t('noPreset')}
            </div>
          ) : (
            presetsForType.map((preset) => (
              <div
                key={preset.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-200 ${
                  selectedPreset?.id === preset.id 
                    ? 'bg-blue-100 text-blue-800'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => handlePresetSelect(preset)}>
                  {preset.label}
                </button>
                <button className="shrink-0 rounded-full bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-200" onClick={() => setPreviewPreset(preset)}>
                  预览
                </button>
                {selectedPreset?.id === preset.id && <span className="shrink-0 text-xs text-blue-600">{t('selected')}</span>}
              </div>
            ))
          )}
        </div>
      )}

      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
      {previewPreset && <PromptPresetPreviewDialog preset={previewPreset} onClose={() => setPreviewPreset(null)} />}
    </div>
  )
}

export default PresetSelector
