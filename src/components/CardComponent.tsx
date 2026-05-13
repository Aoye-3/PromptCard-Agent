
import React, { useState } from 'react'
import type { ICard } from '@/models/Card.model'
import { useCardStore } from '@/stores/card.store'
import PresetSelector from './PresetSelector'
import type { IPreset } from '@/models/Card.model'
import { useI18n } from '@/i18n'

interface CardComponentProps {
  card: ICard
  activeEditMode?: 'learn' | 'creative'
  onEditModeChange?: (mode: 'learn' | 'creative') => void
  duplicatePhrases?: string[]
}

const CardComponent: React.FC<CardComponentProps> = ({ card, onEditModeChange, duplicatePhrases = [] }) => {
  const { language, t, cardTypeLabel } = useI18n()
  const { updateCard, removeCard, setActiveCard, setCurrentSelectedCard } = useCardStore()
  const [editTitle, setEditTitle] = useState(card.title)
  const [editContent, setEditContent] = useState(card.content)
  const [showPresetSelector, setShowPresetSelector] = useState(false)

  // 监听外部更新卡片内容
  React.useEffect(() => {
    setEditTitle(card.title)
    setEditContent(card.content)
  }, [card.title, card.content])

  // 点击卡片设置为当前选中卡片
  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    console.log('Card clicked:', card.id, card.type, card.title)
    setCurrentSelectedCard(card.id)
    setActiveCard(card.id)
    console.log('After setCurrentSelectedCard:', useCardStore.getState().currentSelectedCardId)
  }

  // 实时更新标题
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setEditTitle(newTitle)
    updateCard(card.id, { title: newTitle })
  }

  // 实时更新内容
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setEditContent(newContent)
    updateCard(card.id, { content: newContent })
  }

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditTitle(card.title)
    setEditContent(card.content)
    updateCard(card.id, { title: card.title, content: card.content })
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(t('deleteCardConfirm'))) {
      removeCard(card.id)
      alert(t('cardDeleted'))
    }
  }

  // 选择预制提示词
  const handlePresetSelect = (preset: IPreset) => {
    setEditTitle(preset.label)
    setEditContent(preset.content)
    updateCard(card.id, { 
      title: preset.label, 
      content: preset.content 
    })
    setShowPresetSelector(false)
  }

  // 获取卡片标签的样式类
  const getTagClass = () => {
    return 'bg-warm-sand text-charcoal-warm border border-border-warm'
  }

  // 获取卡片类型标签
  const getTypeLabel = () => {
    const englishLabelMap: Record<string, string> = {
      subject: 'Subject',
      action: 'Action',
      scene: 'Scene',
      style: 'Style',
      camera: 'Camera',
      lighting: 'Lighting',
      timing: 'Duration',
      audio: 'Audio',
      constraint: 'Constraints',
      custom: 'Custom'
    }
    const englishLabel = englishLabelMap[card.type] || 'Custom'
    if (language === 'en') {
      return englishLabel
    }
    return `${englishLabel}（${cardTypeLabel(card.type, { duration: card.type === 'timing' })}）`
  }

  // 获取当前卡片激活状态的样式
  const getCardWrapperClass = () => {
    const { activeCardId, currentSelectedCardId } = useCardStore.getState()
    const isActive = activeCardId === card.id || currentSelectedCardId === card.id
    let baseClass = 'card-component bg-ivory rounded-xl p-5 border border-border-cream shadow-sm card-hover cursor-pointer transition-all duration-200'
    if (isActive) {
      baseClass += ' ring-2 ring-terracotta scale-102 shadow-lg'
    }
    return baseClass
  }

  return (
    <div className={getCardWrapperClass()} data-type={card.type} data-mode="edit" onClick={handleCardClick}>
      <div className="flex items-center justify-between mb-3">
          <span className={`px-2 py-1 rounded text-xs font-medium ${getTagClass()}`}>
            {getTypeLabel()}
          </span>
          <div className="flex items-center gap-1">
                <span 
                  className="fa fa-times text-red-500 hover:text-red-600 cursor-pointer" 
                  title={t('restoreOriginal')}
                  onClick={handleCancelClick}
                ></span>
              </div>
      </div>
      <div className="mb-3">
        <label className="block text-xs text-stone-gray mb-1">{t('title')}</label>
        <input 
          type="text" 
          value={editTitle}
          onChange={handleTitleChange}
          onClick={handleCardClick}
          className="w-full px-2 py-1 border border-border-warm rounded text-sm font-semibold bg-parchment text-near-black"
        />
      </div>
      <div className="mb-3">
        <label className="block text-xs text-stone-gray mb-1">{t('customContent')}</label>
        <textarea 
          rows={5}
          value={editContent}
          onChange={handleContentChange}
          onClick={handleCardClick}
          className="w-full min-h-[132px] px-2 py-1 border border-border-warm rounded text-sm bg-parchment text-near-black"
        />
      </div>
      {duplicatePhrases.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="mb-1 text-xs font-medium text-amber-800">{t('duplicateDescription')}</div>
          <div className="flex flex-wrap gap-1">
            {duplicatePhrases.map(phrase => (
              <span key={phrase} className="rounded bg-amber-200 px-2 py-0.5 text-[11px] text-amber-900">
                {phrase}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button 
          className={`flex-1 py-1.5 ${getTagClass()} rounded text-sm font-medium hover:opacity-80 transition`}
          onClick={(e) => {
            e.stopPropagation()
            // 首先设置当前卡片为激活状态
            setCurrentSelectedCard(card.id)
            setActiveCard(card.id)
            // 直接切换到创意模式，而不是显示下拉菜单
            if (onEditModeChange) {
              onEditModeChange('creative')
            }
          }}
        >
          🎯 {t('selectPresetPrompt')}
        </button>
        <button 
          className="px-3 py-1.5 bg-warm-sand hover:bg-border-warm text-error-crimson rounded text-sm font-medium transition"
          onClick={handleDeleteClick}
        >
          <i className="fa fa-trash"></i>
        </button>
      </div>

      {/* 预制提示词选择器 */}
      {showPresetSelector && (
        <div className="mt-3">
          <PresetSelector
            type={card.type}
            onSelect={handlePresetSelect}
          />
        </div>
      )}

    </div>
  )
}

export default React.memo(CardComponent)
