import { useEffect, useMemo, useState } from 'react'
import CardComponent from './components/CardComponent'
import EvaluationPanel from './components/EvaluationPanel'
import CreativeMode from './components/CreativeMode'
import PromptComposer from './components/PromptComposer'
import PromptLibrary from './components/PromptLibrary' // 新增
import { useCardStore } from './stores/card.store'
import { usePresetStore } from './stores/preset.store'
import { assemblePrompt, getCardDefaultTitle } from './utils/promptParser'
import { LEARNING_CONTENT } from './data/learningContent'
import type { LearningContent } from './data/learningContent'
import type { OptimizationSuggestion } from './services/evaluation-service'
import type { IPreset } from './models/Card.model'
import { findDuplicatePhrases, parsePromptToCardUpdates } from './utils/promptComposer'
import { useI18n } from './i18n'

function App() {
  const { language, setLanguage, t, cardTypeLabel } = useI18n()
  const { pages, currentPage, addCard, updateCard, updateCards, activeCardId, activePresetCardId, setActivePresetCardId, addPage, switchPage, removePage, selectedCards, getCombinedPrompt, clearSelection } = useCardStore()
  const { init: initPresets, getByType: getPresetsByType, incrementUsage } = usePresetStore()
  
  // 新增页面状态
  const [activePage, setActivePage] = useState<'home' | 'library'>('home')
  const [activeTab, setActiveTab] = useState<'edit' | 'evaluate'>('edit')
  const [selectedLearningCard, setSelectedLearningCard] = useState<LearningContent>(LEARNING_CONTENT[0])
  const [activeEditMode, setActiveEditMode] = useState<'learn' | 'creative'>('learn')
  const [duplicateMode, setDuplicateMode] = useState(false)
  const currentCards = pages[currentPage]?.cards || []
  const currentPrompt = assemblePrompt(pages)
  const allCards = useMemo(() => pages.flatMap(page => page.cards), [pages])
  const duplicateResult = useMemo(() => findDuplicatePhrases(allCards), [allCards])

  // 预制弹窗相关
  const activePresetCard = activePresetCardId ? currentCards.find(c => c.id === activePresetCardId) : null
  const presetsForActiveCard = activePresetCard ? getPresetsByType(activePresetCard.type) : []

  // 监听激活卡片变化，自动切换学习模式内容
  useEffect(() => {
    if (activeCardId) {
      const activeCard = currentCards.find(card => card.id === activeCardId)
      if (activeCard) {
        // 类型映射对齐基准
        const typeMap: Record<string, string> = {
          timing: 'duration',
          constraint: 'constraints'
        }
        const targetType = typeMap[activeCard.type] || activeCard.type
        const learningContent = LEARNING_CONTENT.find(content => content.cardType === targetType)
        if (learningContent) {
          setSelectedLearningCard(learningContent)
        }
      }
    }
  }, [activeCardId, currentCards])

  useEffect(() => {
    // 初始化预制数据
    initPresets()
  }, [initPresets])

  // 应用优化建议
  const handleApplySuggestion = (suggestion: OptimizationSuggestion) => {
    if (suggestion.type === 'add' && suggestion.cardType) {
      // 添加新卡片
      const title = getCardDefaultTitle(suggestion.cardType as any)
      addCard(suggestion.cardType as any, title, suggestion.applyContent || '')
      alert(t('suggestionAdded', { title }))
    } else if (suggestion.type === 'modify') {
      // 修改现有卡片（目前默认修改第一个对应类型的卡片）
      if (suggestion.cardType) {
        const targetCard = currentCards.find(c => c.type === suggestion.cardType)
        if (targetCard && suggestion.applyContent) {
          const newContent = suggestion.applyContent.replace('{原有内容}', targetCard.content)
          updateCard(targetCard.id, { content: newContent })
          alert(t('suggestionUpdated', { title: getCardDefaultTitle(suggestion.cardType as any) }))
        } else {
          alert(t('targetCardMissing'))
          const title = getCardDefaultTitle(suggestion.cardType as any)
          addCard(suggestion.cardType as any, title, suggestion.applyContent || '')
        }
      }
    } else if (suggestion.type === 'delete' && suggestion.targetCardId) {
      // 删除卡片（目前未实现删除功能，暂不处理）
      alert(t('deleteFeatureInProgress'))
    }
  }

  // 复制Prompt到剪贴板
  const handleCopyPrompt = async () => {
    if (!currentPrompt.trim()) {
      alert(t('noPromptToCopy'))
      return
    }
    try {
      await navigator.clipboard.writeText(currentPrompt)
      alert(t('promptCopied'))
    } catch (err) {
      console.error('复制失败:', err)
      alert(t('copyFailed'))
    }
  }

  const handleCopySelectedCards = async () => {
    const combined = getCombinedPrompt()
    await navigator.clipboard.writeText(combined)
    alert(t('selectedCardsCopied', { count: selectedCards.length }))
  }

  const handlePromptChange = (prompt: string) => {
    updateCards(parsePromptToCardUpdates(pages, prompt))
  }

  // 保存当前卡片组合
  const handleSave = async () => {
    try {
      // TODO: 实现保存到模板功能
      alert(t('saveSuccess'))
    } catch (err) {
      console.error('保存失败:', err)
      alert(t('saveFailed'))
    }
  }

  // 新增卡片相关
  const [showAddCardModal, setShowAddCardModal] = useState(false)

  // 处理创意模式中预制提示词选择
  const handleCreativePresetSelect = (preset: IPreset) => {
    const title = preset.label
    addCard(preset.type as any, title, preset.content)
    alert(t('cardAdded', { title }))
  }

  const cardTypes = [
    { type: 'subject', label: cardTypeLabel('subject'), color: 'bg-blue-100 text-blue-700' },
    { type: 'action', label: cardTypeLabel('action'), color: 'bg-green-100 text-green-700' },
    { type: 'scene', label: cardTypeLabel('scene'), color: 'bg-purple-100 text-purple-700' },
    { type: 'style', label: cardTypeLabel('style'), color: 'bg-orange-100 text-orange-700' },
    { type: 'camera', label: cardTypeLabel('camera'), color: 'bg-red-100 text-red-700' },
    { type: 'lighting', label: cardTypeLabel('lighting'), color: 'bg-yellow-100 text-yellow-700' },
    { type: 'timing', label: cardTypeLabel('timing'), color: 'bg-amber-100 text-amber-700' },
    { type: 'audio', label: cardTypeLabel('audio'), color: 'bg-teal-100 text-teal-700' },
    { type: 'constraint', label: cardTypeLabel('constraint'), color: 'bg-purple-100 text-purple-700' },
    { type: 'custom', label: cardTypeLabel('custom'), color: 'bg-gray-100 text-gray-700' },
  ] as const

  const handleAddNewCard = (type: any) => {
    const title = getCardDefaultTitle(type)
    addCard(type, title, '')
    setShowAddCardModal(false)
    alert(t('cardAdded', { title }))
  }

  // 如果是 Prompt 库页面，直接渲染并传递返回方法
  if (activePage === 'library') {
    return <PromptLibrary onBackToHome={() => setActivePage('home')} />
  }

  // 首页渲染
  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">PromptCard<span className="text-indigo-600">-Agent</span></h1>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Agent 分支</span>
          </div>
          <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-2 py-1 text-sm text-gray-700">
                <span className="text-xs font-medium">{t('languageLabel')}</span>
                <button
                  className={`rounded px-2 py-1 font-medium transition ${language === 'zh' ? 'bg-white text-blue-600 shadow-sm' : 'hover:bg-gray-200'}`}
                  onClick={() => setLanguage('zh')}
                >
                  {t('chinese')}
                </button>
                <button
                  className={`rounded px-2 py-1 font-medium transition ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'hover:bg-gray-200'}`}
                  onClick={() => setLanguage('en')}
                >
                  {t('english')}
                </button>
              </div>
              <button 
                className={`px-4 py-2 rounded-lg text-white font-medium transition ${
                  activePage === 'home' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActivePage('home')}
              >
                <span className="fa fa-home mr-2"></span>{t('home')}
              </button>
              <button 
                className={`px-4 py-2 rounded-lg text-white font-medium transition ${
                  (activePage as string) === 'library' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActivePage('library')}
              >
                <span className="fa fa-database mr-2"></span>{t('promptLibrary')}
              </button>
              <button className="px-4 py-2 rounded-lg text-white font-medium transition primary-btn" onClick={handleSave}>
                <span className="fa fa-save mr-2"></span>{t('save')}
              </button>
            </div>
        </div>
      </header>

      <PromptComposer
        pages={pages}
        currentPrompt={currentPrompt}
        selectedCardsCount={selectedCards.length}
        duplicateMode={duplicateMode}
        duplicateCount={duplicateMode ? duplicateResult.duplicates.length : 0}
        onPromptChange={handlePromptChange}
        onCopyPrompt={handleCopyPrompt}
        onCopySelected={handleCopySelectedCards}
        onClearSelection={clearSelection}
        onToggleDuplicates={() => setDuplicateMode(value => !value)}
      />

      {/* 顶部Prompt预览区 */}
      <div className="hidden">
        <div className="mb-2 text-sm text-stone-gray font-medium">{t('currentPrompt')}</div>
        <div className="p-4 bg-parchment rounded-generous border border-border-cream text-near-black min-h-[100px]">
          {currentPrompt || <span className="text-stone-gray">{t('promptEmpty')}</span>}
        </div>
        <div className="flex gap-3 mt-3 flex-wrap">
                <button className="px-4 py-2 rounded-comfort text-white font-medium transition primary-btn" onClick={handleCopyPrompt}>
                  <span className="fa fa-copy mr-2"></span>{t('copyAllPrompt')}
                </button>
                {selectedCards.length > 0 && (
                  <>
                    <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-comfort font-medium transition" onClick={async () => {
                      const combined = getCombinedPrompt()
                      await navigator.clipboard.writeText(combined)
                      alert(t('selectedCardsCopied', { count: selectedCards.length }))
                    }}>
                      <span className="fa fa-copy mr-2"></span>{t('copySelected', { count: selectedCards.length })}
                    </button>
                    <button className="px-4 py-2 secondary-btn font-medium transition" onClick={clearSelection}>
                      <span className="fa fa-times mr-2"></span>{t('clearSelection')}
                    </button>
                  </>
                )}
                <button className="px-4 py-2 secondary-btn font-medium transition" onClick={() => alert(t('favoriteInProgress'))}>
                  <span className="fa fa-star mr-2"></span>{t('favorite')}
                </button>
                <button className="px-4 py-2 secondary-btn font-medium transition" onClick={() => alert(t('shareInProgress'))}>
                  <span className="fa fa-share-alt mr-2"></span>{t('share')}
                </button>
              </div>
      </div>

      {/* 主体内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧九宫格卡片区 */}
        <div className="w-2/3 p-6 overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <h2 className="text-xl font-serif font-medium text-near-black">{t('cardLibrary')}</h2>
                <div className="flex items-center gap-2">
                  {pages.map((_, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <button
                        className={`px-3 py-1 rounded-comfort text-sm font-medium transition ${
                          currentPage === index
                            ? 'bg-terracotta text-ivory'
                            : 'bg-warm-sand text-charcoal-warm hover:bg-border-warm'
                        }`}
                        onClick={() => switchPage(index)}
                      >
                        {index + 1}
                      </button>
                      {pages.length > 1 && (
                        <button
                          className="px-2 py-1 bg-red-100 hover:bg-red-200 rounded-comfort text-sm text-red-600 transition"
                          onClick={() => {
                            if (confirm(t('deletePageConfirm'))) {
                              removePage(index)
                            }
                          }}
                          title={t('deletePageTitle')}
                        >
                          <i className="fa fa-times"></i>
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="px-3 py-1 bg-warm-sand hover:bg-border-warm rounded-comfort text-sm text-charcoal-warm transition"
                    onClick={addPage}
                  >
                    <i className="fa fa-plus"></i>
                  </button>
                </div>
              </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 bg-warm-sand hover:bg-border-warm rounded-comfort text-sm text-charcoal-warm transition">
                <i className="fa fa-th-large mr-1"></i>{t('grid')}
              </button>
              <button className="px-3 py-1.5 bg-warm-sand hover:bg-border-warm rounded-comfort text-sm text-charcoal-warm transition">
                <i className="fa fa-list mr-1"></i>{t('list')}
              </button>
            </div>
          </div>
          {/* 九宫格卡片（9种核心组件） */}
          <div className="grid grid-cols-3 gap-5">
            {currentCards.map(card => (
              <CardComponent 
                key={card.id} 
                card={card}
                activeEditMode={activeEditMode}
                onEditModeChange={setActiveEditMode}
                duplicatePhrases={duplicateMode ? duplicateResult.byCardId[card.id] || [] : []}
              />
            ))}
            {/* 新增卡片按钮 */}
            <div 
              id="add-card-btn" 
              className="bg-gray-50 rounded-xl p-5 border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500 cursor-pointer hover:bg-gray-100 transition"
              onClick={() => setShowAddCardModal(true)}
            >
              <span className="fa fa-plus-circle text-2xl mb-2"></span>
              <p className="text-sm font-medium">{t('addCard')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('supportedCardTypes')}</p>
            </div>
          </div>
        </div>
        {/* 右侧面板 */}
        <div className="w-1/3 bg-ivory border-l border-border-warm flex flex-col">
          {/* 一级标签导航：编辑/评估 */}
          <div className="border-b border-border-warm bg-parchment">
            <div className="flex">
              <button 
                className={`flex-1 py-3 px-4 font-medium text-sm transition ${
                  activeTab === 'edit' 
                    ? 'text-terracotta border-b-2 border-terracotta bg-ivory font-medium' 
                    : 'text-stone-gray hover:bg-warm-sand'
                }`}
                onClick={() => setActiveTab('edit')}
              >
                ✏️ {t('editMode')}
              </button>
              <button 
                className={`flex-1 py-3 px-4 font-medium text-sm transition ${
                  activeTab === 'evaluate' 
                    ? 'text-terracotta border-b-2 border-terracotta bg-ivory font-medium' 
                    : 'text-stone-gray hover:bg-warm-sand'
                }`}
                onClick={() => setActiveTab('evaluate')}
              >
                📊 {t('smartEvaluation')}
              </button>
            </div>
          </div>

          {/* 编辑模式内容 */}
          {activeTab === 'edit' && (
            <div className="flex flex-col flex-1">
              {/* 二级标签导航：学习/创意 */}
              <div className="border-b border-gray-200">
                <div className="flex">
                  <button 
                    className={`tab-btn flex-1 py-3 px-4 font-medium text-sm transition ${
                      activeEditMode === 'learn' 
                        ? 'text-blue-600 border-b-2 border-blue-500' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    data-tab="learn"
                    onClick={() => setActiveEditMode('learn')}
                  >
                    <i className="fa fa-book mr-1"></i>{t('learningMode')}
                  </button>
                  <button 
                    className={`tab-btn flex-1 py-3 px-4 font-medium text-sm transition ${
                      activeEditMode === 'creative' 
                        ? 'text-blue-600 border-b-2 border-blue-500' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    data-tab="creative"
                    onClick={() => setActiveEditMode('creative')}
                  >
                    <i className="fa fa-lightbulb-o mr-1"></i>{t('creativeMode')}
                  </button>
                </div>
              </div>

              {/* 学习模式内容 */}
              <div 
                id="learn-tab" 
                className={`tab-content p-6 overflow-y-auto flex-1 ${activeEditMode === 'learn' ? '' : 'hidden'}`}
              >
                {/* 新增下拉选择器 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('selectLearningCardType')}</label>
                  <select 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedLearningCard.cardType}
                    onChange={(e) => {
                      const card = LEARNING_CONTENT.find(c => c.cardType === e.target.value)
                      if (card) setSelectedLearningCard(card)
                    }}
                  >
                    {LEARNING_CONTENT.map(card => (
                      <option key={card.cardType} value={card.cardType}>
                        {card.cardName}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-sm text-gray-500">{selectedLearningCard.core}</p>
                </div>

                <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('caseComparison')}</h3>
                {/* 好/差示例对比 */}
                <div className="mb-6">
                  <div className="flex gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">{t('badExample')}</span>
                        <span className="text-xs text-gray-500">{t('simpleDescription')}</span>
                      </div>
                      <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-gray-700 whitespace-pre-line">
                        {selectedLearningCard.badExample}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">{t('goodExample')}</span>
                        <span className="text-xs text-gray-500">{t('richDetails')}</span>
                      </div>
                      <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-gray-700 whitespace-pre-line">
                        {selectedLearningCard.goodExample}
                      </div>
                    </div>
                  </div>
                  {/* 学习要点 */}
                  <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <div className="text-sm font-medium text-blue-800 mb-2">{t('learningPoints')}</div>
                    <ul className="text-sm text-blue-700 space-y-1">
                      {selectedLearningCard.points.map((point, index) => (
                        <li key={index}>• {point}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {/* 展开过程演示 */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">{t('expansionDemo')}</h4>
                    <span className="text-xs text-gray-500">{t('clickToExpand')}</span>
                  </div>
                  <div className="space-y-3">
                    {selectedLearningCard.steps.map((step, index) => (
                      <div key={index} className={`p-3 border rounded-lg ${index === selectedLearningCard.steps.length - 1 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-medium ${index === selectedLearningCard.steps.length - 1 ? 'text-blue-700' : 'text-gray-600'}`}>{step.name}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${index === selectedLearningCard.steps.length - 1 ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>{step.score}</span>
                        </div>
                        <p className={`text-sm ${index === selectedLearningCard.steps.length - 1 ? 'text-blue-800' : 'text-gray-700'} whitespace-pre-line`}>{step.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 创意模式内容 */}
              <div 
                id="creative-tab" 
                className={`tab-content overflow-y-auto flex-1 ${activeEditMode === 'creative' ? '' : 'hidden'}`}
              >
                <CreativeMode 
                  onPresetSelect={handleCreativePresetSelect}
                  initialType={activeCardId ? pages[currentPage]?.cards.find(c => c.id === activeCardId)?.type : 'subject'}
                />
              </div>
            </div>
          )}

          {/* 评估模式内容 */}
          {activeTab === 'evaluate' && (
            <div className="flex-1 overflow-y-auto">
              <EvaluationPanel onApplySuggestion={handleApplySuggestion} />
            </div>
          )}
        </div>
      </div>

      {/* 新增卡片弹窗 */}
      {showAddCardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddCardModal(false)}>
          <div className="bg-white rounded-xl p-6 w-[600px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-800">{t('selectCardType')}</h3>
              <span 
                className="fa fa-times text-gray-400 hover:text-gray-600 cursor-pointer text-xl"
                onClick={() => setShowAddCardModal(false)}
              ></span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {cardTypes.map(item => (
                <div
                  key={item.type}
                  className={`p-4 rounded-lg border border-gray-200 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition flex items-center gap-3`}
                  onClick={() => handleAddNewCard(item.type)}
                >
                  <span className={`${item.color} px-3 py-1 rounded text-sm font-medium`}>
                    {item.label}
                  </span>
                  <span className="text-sm text-gray-600">{getCardDefaultTitle(item.type)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 全局预制选择弹窗 */}
      {activePresetCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 cursor-pointer" onClick={() => setActivePresetCardId(null)}>
          <div className="bg-white rounded-xl p-5 w-[500px] max-h-[70vh] overflow-y-auto cursor-default" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t('selectPresetPrompt')}</h3>
              <i 
                className="fa fa-times text-gray-400 hover:text-gray-600 cursor-pointer"
                onClick={() => setActivePresetCardId(null)}
              ></i>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              {presetsForActiveCard.length > 0 ? (
                presetsForActiveCard.map(preset => (
                  <div 
                    key={preset.id}
                    className="p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition"
                    onClick={async () => {
                      updateCard(activePresetCard.id, { 
                        title: preset.label,
                        content: preset.content 
                      })
                      await incrementUsage(preset.id)
                      setActivePresetCardId(null)
                    }}
                  >
                    <div className="font-medium text-sm mb-1">{preset.label}</div>
                    <div className="text-xs text-gray-500 line-clamp-2">{preset.content}</div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {t('noPresetForType')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
