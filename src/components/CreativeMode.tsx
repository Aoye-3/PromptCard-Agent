import React, { useEffect, useMemo, useState } from 'react'
import { usePresetStore } from '../stores/preset.store'
import { useCardStore } from '../stores/card.store'
import PresetSelector from './PresetSelector'
import type { CardType, IPreset } from '../models/Card.model'
import { useI18n } from '@/i18n'
import { PromptPresetPreviewDialog } from './prompt-media/PromptPresetPreviewDialog'

interface CreativeModeProps {
  onPresetSelect: (preset: IPreset) => void
  initialType?: string
}

const cardTypeValues: CardType[] = ['subject', 'action', 'scene', 'style', 'camera', 'lighting', 'timing', 'audio', 'constraint', 'custom']

const CreativeMode: React.FC<CreativeModeProps> = ({ onPresetSelect, initialType }) => {
  const { t, cardTypeLabel } = useI18n()
  const presets = usePresetStore(state => state.presets)
  const { currentSelectedCardId, updateCard, pages, currentPage } = useCardStore()

  const [selectedType, setSelectedType] = useState<CardType>((initialType as CardType) || 'subject')
  const [showPresetSelector, setShowPresetSelector] = useState(false)
  const [quickSearch, setQuickSearch] = useState('')
  const [previewPreset, setPreviewPreset] = useState<IPreset | null>(null)

  const currentCards = pages[currentPage]?.cards || []
  const selectedCard = currentSelectedCardId
    ? currentCards.find(card => card.id === currentSelectedCardId) || null
    : null
  const presetsByType = useMemo(
    () => presets.filter(preset => preset.type === selectedType),
    [presets, selectedType]
  )
  const filteredPresets = useMemo(() => {
    const keyword = quickSearch.trim().toLowerCase()
    if (!keyword) return presetsByType

    return presetsByType.filter(preset => {
      return (
        preset.label.toLowerCase().includes(keyword) ||
        preset.content.toLowerCase().includes(keyword)
      )
    })
  }, [presetsByType, quickSearch])

  useEffect(() => {
    if (selectedCard) {
      setSelectedType(selectedCard.type)
    }
  }, [selectedCard])

  const handlePresetSelect = (preset: IPreset) => {
    onPresetSelect(preset)
    setShowPresetSelector(false)
  }

  const handleCopyPreset = async (preset: IPreset) => {
    try {
      await navigator.clipboard.writeText(preset.content)
      alert(t('copiedPreset', { label: preset.label }))
    } catch (error) {
      console.error('复制失败:', error)
      alert(t('copyFailed'))
    }
  }

  const handleAddPresetToCard = (preset: IPreset) => {
    if (!selectedCard) {
      alert(t('selectCardFirst'))
      return
    }

    updateCard(selectedCard.id, (prevCard) => ({
      content: prevCard.content ? `${prevCard.content}\n${preset.content}` : preset.content
    }))
  }

  const handleReplaceSelectedCard = (preset: IPreset) => {
    if (!selectedCard) {
      alert(t('selectCardFirst'))
      return
    }

    updateCard(selectedCard.id, { content: preset.content })
    alert(t('replacedSelectedCard', { title: selectedCard.title }))
  }

  const handleAddNewCard = (preset: IPreset) => {
    onPresetSelect(preset)
  }

  return (
    <div className="p-6 overflow-y-auto flex-1">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('creativeMode')}</h3>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">{t('selectCardType')}</span>
          <div className="flex gap-2">
            <button
              className="creative-action-btn creative-action-preset px-3 py-1.5 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setShowPresetSelector(!showPresetSelector)}
              disabled={showPresetSelector}
            >
              <span className="fa fa-bullseye mr-1"></span>{t('selectPresetPrompt')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {cardTypeValues.map((type) => (
            <button
              key={type}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                selectedType === type
                  ? 'creative-category-active'
                  : 'creative-category-idle'
              }`}
              onClick={() => {
                setSelectedType(type)
                setShowPresetSelector(false)
              }}
            >
              {cardTypeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {showPresetSelector && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">{t('selectPresetPrompt')}</h4>
          <PresetSelector
            type={selectedType}
            onSelect={handlePresetSelect}
          />
        </div>
      )}

      <div className="creative-stats mb-6 p-4 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="creative-stats-title text-sm font-medium">
            {t('categoryStats', { label: cardTypeLabel(selectedType) })}
          </span>
          <span className="creative-stats-meta text-sm">
            {t('presetCount', { count: presetsByType.length })}
          </span>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium text-gray-700">{t('quickAddCard')}</h4>
          <span className="text-xs text-gray-500">
            {selectedCard
              ? t('applyToSelectedCard', { title: selectedCard.title })
              : t('selectLeftCardFirst')}
          </span>
        </div>

        <div className="relative mb-3">
          <span className="fa fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></span>
          <input
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
            placeholder={t('searchNameOrContent')}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="max-h-[58vh] overflow-y-auto border border-gray-200 rounded-lg">
          <div className="p-2">
            {filteredPresets.length > 0 ? (
              filteredPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="quick-preset-card p-3 mb-2 border rounded-lg transition-all duration-200"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-sm font-medium text-gray-900">
                      {preset.label}
                    </h5>
                    <span className="shrink-0 text-xs font-medium text-yellow-600">
                      {t('usageCount', { count: preset.usageCount || 0 })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {preset.content}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      className="quick-action-btn px-2 py-1 text-xs rounded transition-colors"
                      onClick={() => setPreviewPreset(preset)}
                      title="预览"
                    >
                      <i className="fas fa-eye"></i> 预览
                    </button>

                    <button
                      className="quick-action-btn quick-action-copy px-2 py-1 text-xs rounded transition-colors"
                      onClick={() => handleCopyPreset(preset)}
                      title={t('copyAllPrompt')}
                    >
                      <i className="fas fa-copy"></i> {t('copy')}
                    </button>

                    <button
                      className="quick-action-btn quick-action-add px-2 py-1 text-xs rounded transition-colors disabled:cursor-not-allowed"
                      onClick={() => handleAddPresetToCard(preset)}
                      disabled={!selectedCard}
                      title={selectedCard ? t('addToCurrentCard') : t('selectCardFirst')}
                    >
                      <i className="fas fa-plus"></i> {t('addToCurrentCard')}
                    </button>

                    <button
                      className="quick-action-btn quick-action-replace px-2 py-1 text-xs rounded transition-colors disabled:cursor-not-allowed"
                      onClick={() => handleReplaceSelectedCard(preset)}
                      disabled={!selectedCard}
                      title={selectedCard ? t('replaceSelectedTitle') : t('selectCardFirst')}
                    >
                      <i className="fas fa-repeat"></i> {t('replace')}
                    </button>

                    <button
                      className="quick-action-btn quick-action-new px-2 py-1 text-xs rounded transition-colors"
                      onClick={() => handleAddNewCard(preset)}
                      title={t('addAsNewCard')}
                    >
                      <i className="fas fa-file-plus"></i> {t('newCard')}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-sm text-gray-500">
                {t('noMatchingPreset')}
              </div>
            )}
          </div>
        </div>
      </div>

      {previewPreset && <PromptPresetPreviewDialog preset={previewPreset} onClose={() => setPreviewPreset(null)} />}
    </div>
  )
}

export default CreativeMode
