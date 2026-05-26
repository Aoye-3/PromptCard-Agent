import React, { useEffect, useState } from 'react'
import { usePresetStore } from '../stores/preset.store'
import { useCardStore } from '../stores/card.store'
import type { CardType, IPreset } from '../models/Card.model'
import { useI18n } from '@/i18n'
import { PromptInjectionPanel } from './prompt-injection/PromptInjectionPanel'
import {
  promptInjectionCardTypes,
  type PromptInjectionAction,
  type PromptInjectionEvent
} from '@/domain/prompt-injection/prompt-injection'

interface CreativeModeProps {
  onPresetSelect: (preset: IPreset) => void
  initialType?: string
}

const CreativeMode: React.FC<CreativeModeProps> = ({ onPresetSelect, initialType }) => {
  const { t, cardTypeLabel } = useI18n()
  const presets = usePresetStore(state => state.presets)
  const { currentSelectedCardId, updateCard, pages, currentPage } = useCardStore()

  const [selectedType, setSelectedType] = useState<CardType>((initialType as CardType) || 'subject')
  const [quickSearch, setQuickSearch] = useState('')

  const currentCards = pages[currentPage]?.cards || []
  const selectedCard = currentSelectedCardId
    ? currentCards.find(card => card.id === currentSelectedCardId) || null
    : null
  useEffect(() => {
    if (selectedCard) {
      setSelectedType(selectedCard.type)
    }
  }, [selectedCard])

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

  const actions: PromptInjectionAction[] = [
    { id: 'copy', label: t('copy'), title: t('copyAllPrompt') },
    {
      id: 'append',
      label: t('addToCurrentCard'),
      title: selectedCard ? t('addToCurrentCard') : t('selectCardFirst'),
      requiresTarget: true,
      disabled: !selectedCard
    },
    {
      id: 'replace',
      label: t('replace'),
      title: selectedCard ? t('replaceSelectedTitle') : t('selectCardFirst'),
      requiresTarget: true,
      disabled: !selectedCard
    },
    { id: 'create-card', label: t('newCard'), title: t('addAsNewCard') }
  ]

  const handleApplyPreset = ({ preset, actionId }: PromptInjectionEvent) => {
    if (actionId === 'copy') {
      void handleCopyPreset(preset)
      return
    }
    if (actionId === 'append') {
      handleAddPresetToCard(preset)
      return
    }
    if (actionId === 'replace') {
      handleReplaceSelectedCard(preset)
      return
    }
    handleAddNewCard(preset)
  }

  return (
    <PromptInjectionPanel
      title={t('creativeMode')}
      activeType={selectedType}
      availableTypes={promptInjectionCardTypes}
      presets={presets}
      actions={actions}
      selectedTargetLabel={
        selectedCard
          ? t('applyToSelectedCard', { title: selectedCard.title })
          : t('selectLeftCardFirst')
      }
      searchTerm={quickSearch}
      searchPlaceholder={t('searchNameOrContent')}
      emptyMessage={t('noMatchingPreset')}
      statsLabel={t('categoryStats', { label: cardTypeLabel(selectedType) })}
      getTypeLabel={(type) => cardTypeLabel(type)}
      onTypeChange={setSelectedType}
      onSearchChange={setQuickSearch}
      onApplyPreset={handleApplyPreset}
    />
  )
}

export default CreativeMode
