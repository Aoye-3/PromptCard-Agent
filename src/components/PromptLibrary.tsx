import { useEffect, useState } from 'react'
import { usePresetStore } from '@/stores/preset.store'
import PromptLibraryTable from './PromptLibraryTable'
import PromptLibraryForm from './PromptLibraryForm'
import type { CardType, IPreset } from '@/models/Card.model'
import { useI18n } from '@/i18n'

interface PromptLibraryProps {
  onBackToHome: () => void
}

const PromptLibrary = ({ onBackToHome }: PromptLibraryProps) => {
  const { language, setLanguage, t, cardTypeLabel } = useI18n()
  const { presets, init, addPreset, updatePreset, deletePreset, reorderPresets } = usePresetStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<IPreset | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')

  useEffect(() => {
    init()
  }, [init])

  // 卡片类型选项
  const cardTypes = [
    { type: 'subject', label: cardTypeLabel('subject') },
    { type: 'action', label: cardTypeLabel('action') },
    { type: 'scene', label: cardTypeLabel('scene') },
    { type: 'style', label: cardTypeLabel('style') },
    { type: 'camera', label: cardTypeLabel('camera') },
    { type: 'lighting', label: cardTypeLabel('lighting') },
    { type: 'timing', label: cardTypeLabel('timing') },
    { type: 'audio', label: cardTypeLabel('audio') },
    { type: 'constraint', label: cardTypeLabel('constraint') },
    { type: 'custom', label: cardTypeLabel('custom') }
  ]

  // 过滤搜索结果
  const filteredPresets = presets.filter(preset => {
    const matchesSearch = preset.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         preset.content.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = activeCategory === 'all' || preset.type === activeCategory
    return matchesSearch && matchesCategory
  })
  const isSearchActive = searchTerm.trim().length > 0
  const canReorder = activeCategory !== 'all' && !isSearchActive && filteredPresets.length > 1

  // 计算各类型的数量
  const categoryCounts = cardTypes.reduce((counts, type) => {
    counts[type.type] = presets.filter(preset => preset.type === type.type).length
    return counts
  }, {} as Record<string, number>)

  // 处理新增/编辑
  const handleSavePreset = async (presetData: Omit<IPreset, 'id' | 'usageCount' | 'meta'>) => {
    if (editingPreset) {
      // 编辑模式
      await updatePreset(editingPreset.id, presetData)
    } else {
      // 新增模式
      await addPreset(presetData)
    }
    setIsFormOpen(false)
    setEditingPreset(null)
  }

  // 处理编辑
  const handleEditPreset = (preset: IPreset) => {
    setEditingPreset(preset)
    setIsFormOpen(true)
  }

  // 处理删除
  const handleDeletePreset = async (id: string) => {
    if (confirm(t('deletePresetConfirm'))) {
      await deletePreset(id)
    }
  }

  const handleReorderPresets = async (orderedIds: string[]) => {
    if (activeCategory === 'all' || isSearchActive) return
    await reorderPresets(activeCategory as CardType, orderedIds)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition flex items-center gap-2"
                onClick={onBackToHome}
              >
                <span className="fa fa-arrow-left mr-2"></span>{t('backToHome')}
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t('promptLibrary')}</h1>
                <p className="text-sm text-gray-600">{t('managePresetPrompts')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
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
              <div className="relative">
                <input
                  type="text"
                  placeholder={t('searchPrompt')}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <i className="fa fa-search"></i>
                </div>
              </div>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                onClick={() => setIsFormOpen(true)}
              >
                <i className="fa fa-plus"></i>
                {t('addPrompt')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 分类标签 */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="fa fa-filter text-gray-600 text-lg"></span>
            <h3 className="text-lg font-semibold text-gray-900">{t('categoryFilter')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                activeCategory === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setActiveCategory('all')}
            >
              {t('all')} <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                {presets.length}
              </span>
            </button>
            {cardTypes.map(type => (
              <button
                key={type.type}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  activeCategory === type.type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActiveCategory(type.type)}
              >
                {type.label} <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                  {categoryCounts[type.type]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-500 p-3 rounded-lg">
                <i className="fa fa-database text-white text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('totalCount')}</p>
                <p className="text-2xl font-bold text-gray-900">{presets.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-500 p-3 rounded-lg">
                <i className="fa fa-puzzle-piece text-white text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('cardTypeCount')}</p>
                <p className="text-2xl font-bold text-gray-900">{cardTypes.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-500 p-3 rounded-lg">
                <i className="fa fa-search text-white text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  {activeCategory === 'all' ? t('searchResult') : t('typeResult', { type: cardTypeLabel(activeCategory) })}
                </p>
                <p className="text-2xl font-bold text-gray-900">{filteredPresets.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-yellow-500 p-3 rounded-lg">
                <i className="fa fa-star text-white text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('frequentlyUsedPrompt')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {presets.filter(p => p.usageCount > 0).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Prompt 表格 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50 text-sm text-gray-600">
            {activeCategory === 'all'
              ? t('selectCategoryToSort')
              : isSearchActive
                ? t('searchSortPaused')
                : canReorder
                  ? t('dragToSort')
                  : t('notEnoughToSort')}
          </div>
          <PromptLibraryTable
            presets={filteredPresets}
            onEdit={handleEditPreset}
            onDelete={handleDeletePreset}
            onReorder={handleReorderPresets}
            sortable={canReorder}
          />
        </div>
      </div>

      {/* 新增/编辑表单 */}
      {isFormOpen && (
        <PromptLibraryForm
          editingPreset={editingPreset}
          cardTypes={cardTypes}
          onSave={handleSavePreset}
          onCancel={() => {
            setIsFormOpen(false)
            setEditingPreset(null)
          }}
        />
      )}
    </div>
  )
}

export default PromptLibrary
