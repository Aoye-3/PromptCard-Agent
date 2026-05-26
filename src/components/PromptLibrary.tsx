import { useEffect, useState } from 'react'
import { ArchiveRestore, Plus, Search, Trash2, X } from 'lucide-react'
import { usePresetStore } from '@/stores/preset.store'
import PromptLibraryTable from './PromptLibraryTable'
import PromptLibraryForm from './PromptLibraryForm'
import type { CardType, IPreset } from '@/models/Card.model'
import { useI18n } from '@/i18n'
import { storage } from '@/utils/storage'
import type { TrashEntry } from '@/storage/storage-service-client'

interface PromptLibraryProps {
  embedded?: boolean
}

const PromptLibrary = ({ embedded = false }: PromptLibraryProps) => {
  const { t, cardTypeLabel } = useI18n()
  const { presets, init, refresh, addPreset, updatePreset, deletePreset, trashPresets, restorePresets, deletePresetsForever, reorderPresets } = usePresetStore()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<IPreset | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedTrashIds, setSelectedTrashIds] = useState<string[]>([])
  const [showTrash, setShowTrash] = useState(false)
  const [trashItems, setTrashItems] = useState<TrashEntry<IPreset>[]>([])

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    storage.presets.getTrash().then(setTrashItems).catch(error => {
      console.error('Failed to load preset trash:', error)
    })
  }, [presets.length, showTrash])

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

  const visiblePresets = showTrash ? trashItems.map(item => item.payload) : presets
  const filteredPresets = visiblePresets.filter(preset => {
    const matchesSearch = preset.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      preset.content.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = activeCategory === 'all' || preset.type === activeCategory
    return matchesSearch && matchesCategory
  })
  const isSearchActive = searchTerm.trim().length > 0
  const canReorder = activeCategory !== 'all' && !isSearchActive && filteredPresets.length > 1

  const categoryCounts = cardTypes.reduce((counts, type) => {
    counts[type.type] = visiblePresets.filter(preset => preset.type === type.type).length
    return counts
  }, {} as Record<string, number>)

  const handleSavePreset = async (presetData: Omit<IPreset, 'id' | 'usageCount' | 'meta'>) => {
    try {
      if (editingPreset) {
        await updatePreset(editingPreset.id, presetData)
      } else {
        await addPreset(presetData)
      }
      setIsFormOpen(false)
      setEditingPreset(null)
    } catch (error) {
      console.error('Failed to save preset:', error)
      alert('Prompt 保存失败，请重试。')
    }
  }

  const handleEditPreset = (preset: IPreset) => {
    setEditingPreset(preset)
    setIsFormOpen(true)
  }

  const handleDeletePreset = async (id: string) => {
    if (confirm(t('deletePresetConfirm'))) {
      await deletePreset(id)
      setSelectedIds(ids => ids.filter(selectedId => selectedId !== id))
    }
  }

  const handleReorderPresets = async (orderedIds: string[]) => {
    if (activeCategory === 'all' || isSearchActive) return
    try {
      await reorderPresets(activeCategory as CardType, orderedIds)
    } catch (error) {
      console.error('Failed to reorder presets:', error)
      alert('Prompt 排序保存失败，列表已恢复。请刷新后重试。')
    }
  }

  const handleMovePresetToTop = (id: string) => {
    if (!canReorder || filteredPresets[0]?.id === id) return
    const orderedIds = [
      id,
      ...filteredPresets.filter(preset => preset.id !== id).map(preset => preset.id)
    ]
    void handleReorderPresets(orderedIds)
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(selectedId => selectedId !== id) : [...ids, id])
  }

  const toggleTrashSelected = (id: string) => {
    setSelectedTrashIds(ids => ids.includes(id) ? ids.filter(selectedId => selectedId !== id) : [...ids, id])
  }

  const handleTrashSelected = async () => {
    if (selectedIds.length === 0) return
    await trashPresets(selectedIds)
    setSelectedIds([])
    setTrashItems(await storage.presets.getTrash())
  }

  const handleRestoreSelected = async () => {
    if (selectedTrashIds.length === 0) return
    await restorePresets(selectedTrashIds)
    setSelectedTrashIds([])
    setTrashItems(await storage.presets.getTrash())
  }

  const handleDeleteSelectedForever = async () => {
    if (selectedTrashIds.length === 0) return
    if (!confirm(`Permanently delete ${selectedTrashIds.length} preset(s)?`)) return
    await deletePresetsForever(selectedTrashIds)
    setSelectedTrashIds([])
    setTrashItems(await storage.presets.getTrash())
    await refresh()
  }

  return (
    <div className={embedded ? 'bg-white' : 'min-h-screen bg-white'}>
      <div className="px-6 pt-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('promptLibrary')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('managePresetPrompts')}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
              onClick={() => setIsFormOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t('addPrompt')}
            </button>
            <button
              className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
              onClick={() => {
                setShowTrash(value => !value)
                setSelectedIds([])
                setSelectedTrashIds([])
              }}
            >
              <Trash2 className="h-4 w-4" />
              {showTrash ? 'Active' : `Trash ${trashItems.length}`}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 pb-28 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="fa fa-filter text-gray-500 text-lg"></span>
              <h3 className="text-base font-semibold text-gray-900">{t('categoryFilter')}</h3>
            </div>
            <label className="relative block lg:w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('searchPrompt')}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeCategory === 'all'
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setActiveCategory('all')}
            >
              {t('all')} <span className="ml-1 text-xs opacity-70">{visiblePresets.length}</span>
            </button>
            {cardTypes.map(type => (
              <button
                key={type.type}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeCategory === type.type
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActiveCategory(type.type)}
              >
                {type.label} <span className="ml-1 text-xs opacity-70">{categoryCounts[type.type]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <LibraryStat icon="fa-database" label={t('totalCount')} value={visiblePresets.length} />
          <LibraryStat icon="fa-puzzle-piece" label={t('cardTypeCount')} value={cardTypes.length} />
          <LibraryStat
            icon="fa-search"
            label={activeCategory === 'all' ? t('searchResult') : t('typeResult', { type: cardTypeLabel(activeCategory) })}
            value={filteredPresets.length}
          />
          <LibraryStat icon="fa-star" label={t('frequentlyUsedPrompt')} value={visiblePresets.filter(p => p.usageCount > 0).length} />
        </div>

        {!showTrash && selectedIds.length > 0 && (
          <BulkBar
            count={selectedIds.length}
            onSelectAll={() => setSelectedIds(filteredPresets.map(preset => preset.id))}
            onClear={() => setSelectedIds([])}
            actions={[{ label: 'Move to trash', icon: <Trash2 className="h-4 w-4" />, onClick: handleTrashSelected, tone: 'danger' }]}
          />
        )}

        {showTrash && selectedTrashIds.length > 0 && (
          <BulkBar
            count={selectedTrashIds.length}
            onSelectAll={() => setSelectedTrashIds(filteredPresets.map(preset => preset.id))}
            onClear={() => setSelectedTrashIds([])}
            actions={[
              { label: 'Restore', icon: <ArchiveRestore className="h-4 w-4" />, onClick: handleRestoreSelected },
              { label: 'Delete forever', icon: <Trash2 className="h-4 w-4" />, onClick: handleDeleteSelectedForever, tone: 'danger' }
            ]}
          />
        )}

        <div className="overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
          <div className="border-b border-gray-100 bg-gray-50 px-6 py-3 text-sm text-gray-600">
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
            selectedIds={showTrash ? selectedTrashIds : selectedIds}
            onEdit={handleEditPreset}
            onDelete={handleDeletePreset}
            onToggleSelect={showTrash ? toggleTrashSelected : toggleSelected}
            onReorder={handleReorderPresets}
            onMoveToTop={handleMovePresetToTop}
            sortable={!showTrash && canReorder}
          />
        </div>
      </div>

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

const LibraryStat = ({ icon, label, value }: { icon: string; label: string; value: number }) => (
  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
    <div className="flex items-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
        <i className={`fa ${icon}`}></i>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  </div>
)

const BulkBar = ({
  count,
  actions,
  onSelectAll,
  onClear
}: {
  count: number
  actions: Array<{ label: string; icon: JSX.Element; onClick: () => void; tone?: 'danger' }>
  onSelectAll: () => void
  onClear: () => void
}) => (
  <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
    <span className="font-medium text-gray-700">{count} selected</span>
    <div className="flex flex-wrap gap-2">
      <button className="rounded-full px-3 py-2 text-gray-600 transition hover:bg-white" onClick={onSelectAll}>Select all</button>
      {actions.map(action => (
        <button
          key={action.label}
          className={`rounded-full px-3 py-2 font-semibold transition ${
            action.tone === 'danger' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
          onClick={action.onClick}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
      <button className="rounded-full px-3 py-2 text-gray-500 transition hover:bg-white" onClick={onClear}>
        <X className="h-4 w-4" />
        Clear
      </button>
    </div>
  </div>
)

export default PromptLibrary
