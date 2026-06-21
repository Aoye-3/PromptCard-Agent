import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ArchiveRestore, Check, Copy, Database, Grid2X2, Image, ListChecks, PlaySquare, Plus, Search, Trash2, X } from 'lucide-react'
import { usePresetStore } from '@/stores/preset.store'
import PromptLibraryTable from './PromptLibraryTable'
import PromptLibraryForm, { type PromptLibraryFormSave } from './PromptLibraryForm'
import { PromptLibraryAgentPanel } from './PromptLibraryAgentPanel'
import { createCategoryCounts, filterPromptLibraryPresets } from './PromptLibraryPreviewMode'
import { PromptPresetPreviewDialog } from './prompt-media/PromptPresetPreviewDialog'
import type { CardType, IPreset } from '@/models/Card.model'
import { useI18n } from '@/i18n'
import { storage } from '@/utils/storage'
import type { TrashEntry } from '@/storage/storage-service-client'
import { getPresetMedia } from '@/domain/prompt-media/prompt-media'

interface PromptLibraryProps {
  embedded?: boolean
}

type PromptLibraryMode = 'preview' | 'edit'

const PromptLibrary = ({ embedded = false }: PromptLibraryProps) => {
  const { t, cardTypeLabel } = useI18n()
  const {
    presets,
    init,
    refresh,
    addPreset,
    updatePreset,
    deletePreset,
    trashPresets,
    restorePresets,
    deletePresetsForever,
    reorderPresets
  } = usePresetStore()
  const [mode, setMode] = useState<PromptLibraryMode>('preview')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<IPreset | null>(null)
  const [previewPreset, setPreviewPreset] = useState<IPreset | null>(null)
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

  const cardTypes = useMemo(() => [
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
  ], [cardTypeLabel])

  const visiblePresets = showTrash && mode === 'edit' ? trashItems.map(item => item.payload) : presets
  const filteredPresets = filterPromptLibraryPresets(visiblePresets, searchTerm, activeCategory)
  const isSearchActive = searchTerm.trim().length > 0
  const canReorder = activeCategory !== 'all' && !isSearchActive && filteredPresets.length > 1

  const categoryCounts = createCategoryCounts(cardTypes, visiblePresets)
  const mediaCount = visiblePresets.reduce((count, preset) => count + getPresetMedia(preset).length, 0)

  const handleSavePreset = async (presetData: PromptLibraryFormSave) => {
    if (editingPreset) {
      await updatePreset(editingPreset.id, presetData)
    } else {
      await addPreset(presetData)
    }
    setIsFormOpen(false)
    setEditingPreset(null)
  }

  const handleEditPreset = (preset: IPreset) => {
    setEditingPreset(preset)
    setIsFormOpen(true)
    setMode('edit')
  }

  const handleDeletePreset = async (id: string) => {
    if (confirm(t('deletePresetConfirm'))) {
      await deletePreset(id)
      setSelectedIds(ids => ids.filter(selectedId => selectedId !== id))
    }
  }

  const handleReorderPresets = async (orderedIds: string[]) => {
    if (activeCategory === 'all' || isSearchActive) return
    await reorderPresets(activeCategory as CardType, orderedIds)
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
    <div className={embedded ? 'flex h-full flex-col overflow-hidden bg-white' : 'flex h-screen flex-col overflow-hidden bg-white'}>
      <div className="shrink-0 px-6 pt-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('promptLibrary')}</h1>
            <p className="mt-1 text-sm text-gray-500">{mode === 'preview' ? '快速查找、预览提示词和参考媒体' : t('managePresetPrompts')}</p>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1">
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'preview' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                onClick={() => {
                  setMode('preview')
                  setShowTrash(false)
                  setSelectedIds([])
                  setSelectedTrashIds([])
                }}
              >
                <Grid2X2 className="h-4 w-4" />
                预览
              </button>
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'edit' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                onClick={() => setMode('edit')}
              >
                <ListChecks className="h-4 w-4" />
                编辑
              </button>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('searchPrompt')}
                className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-gray-300 focus:ring-2 focus:ring-gray-100 sm:w-80"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
            {mode === 'edit' && (
              <>
                <button
                  className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
                  onClick={() => setIsFormOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  {t('addPrompt')}
                </button>
                <button
                  className="rounded-full bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
                  onClick={() => {
                    setShowTrash(value => !value)
                    setSelectedIds([])
                    setSelectedTrashIds([])
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {showTrash ? 'Active' : `Trash ${trashItems.length}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
        {mode === 'preview' ? (
          <PromptLibraryPreviewMode
            presets={filteredPresets}
            activeCategory={activeCategory}
            visibleCount={visiblePresets.length}
            mediaCount={mediaCount}
            cardTypes={cardTypes}
            categoryCounts={categoryCounts}
            onCategoryChange={setActiveCategory}
            onPreview={setPreviewPreset}
          />
        ) : (
          <div className="mx-auto grid h-full max-w-[1900px] gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(500px,0.82fr)]">
            <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
              <CategoryFilter
                cardTypes={cardTypes}
                activeCategory={activeCategory}
                visibleCount={visiblePresets.length}
                categoryCounts={categoryCounts}
                onCategoryChange={setActiveCategory}
              />

              <div className="mb-4 grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3">
                <LibraryStat icon={<Database className="h-4 w-4" />} label={t('totalCount')} value={visiblePresets.length} />
                <LibraryStat icon={<ListChecks className="h-4 w-4" />} label={t('cardTypeCount')} value={cardTypes.length} />
                <LibraryStat icon={<Image className="h-4 w-4" />} label="媒体条目" value={mediaCount} />
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

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
                <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-5 py-3 text-sm text-gray-600">
                  {activeCategory === 'all'
                    ? t('selectCategoryToSort')
                    : isSearchActive
                      ? t('searchSortPaused')
                      : canReorder
                        ? t('dragToSort')
                        : t('notEnoughToSort')}
                </div>
                <div data-testid="prompt-library-list-scroll" className="min-h-0 flex-1 overflow-y-auto">
                  <PromptLibraryTable
                    presets={filteredPresets}
                    selectedIds={showTrash ? selectedTrashIds : selectedIds}
                    onEdit={handleEditPreset}
                    onDelete={handleDeletePreset}
                    onPreview={setPreviewPreset}
                    onToggleSelect={showTrash ? toggleTrashSelected : toggleSelected}
                    onReorder={handleReorderPresets}
                    sortable={!showTrash && canReorder}
                  />
                </div>
              </div>
            </div>
            <PromptLibraryAgentPanel />
          </div>
        )}
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

      {previewPreset && (
        <PromptPresetPreviewDialog preset={previewPreset} onClose={() => setPreviewPreset(null)} />
      )}
    </div>
  )
}

const CategoryFilter = ({
  cardTypes,
  activeCategory,
  visibleCount,
  categoryCounts,
  onCategoryChange
}: {
  cardTypes: { type: string; label: string }[]
  activeCategory: string
  visibleCount: number
  categoryCounts: Record<string, number>
  onCategoryChange: (type: string) => void
}) => {
  const { t } = useI18n()
  return (
    <div className="mb-4 shrink-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="fa fa-filter text-gray-500 text-base"></span>
        <h3 className="text-sm font-semibold text-gray-900">{t('categoryFilter')}</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${activeCategory === 'all' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          onClick={() => onCategoryChange('all')}
        >
          {t('all')} <span className="ml-1 text-xs opacity-70">{visibleCount}</span>
        </button>
        {cardTypes.map(type => (
          <button
            key={type.type}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${activeCategory === type.type ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            onClick={() => onCategoryChange(type.type)}
          >
            {type.label} <span className="ml-1 text-xs opacity-70">{categoryCounts[type.type]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const PromptLibraryPreviewMode = ({
  presets,
  activeCategory,
  visibleCount,
  mediaCount,
  cardTypes,
  categoryCounts,
  onCategoryChange,
  onPreview
}: {
  presets: IPreset[]
  activeCategory: string
  visibleCount: number
  mediaCount: number
  cardTypes: { type: string; label: string }[]
  categoryCounts: Record<string, number>
  onCategoryChange: (type: string) => void
  onPreview: (preset: IPreset) => void
}) => (
  <div className="mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden">
    <CategoryFilter
      cardTypes={cardTypes}
      activeCategory={activeCategory}
      visibleCount={visibleCount}
      categoryCounts={categoryCounts}
      onCategoryChange={onCategoryChange}
    />
    <div className="mb-4 grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3">
      <LibraryStat icon={<Database className="h-4 w-4" />} label="可浏览 Prompt" value={visibleCount} />
      <LibraryStat icon={<Image className="h-4 w-4" />} label="媒体条目" value={mediaCount} />
      <LibraryStat icon={<Search className="h-4 w-4" />} label="当前结果" value={presets.length} />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
      <div className="space-y-2">
        {presets.map(preset => (
          <PromptPreviewCard key={preset.id} preset={preset} onPreview={() => onPreview(preset)} />
        ))}
      </div>
      {presets.length === 0 && (
        <div className="py-16 text-center text-sm text-gray-400">没有匹配的提示词</div>
      )}
    </div>
  </div>
)

const PromptPreviewCard = ({ preset, onPreview }: { preset: IPreset; onPreview: () => void }) => {
  const { cardTypeLabel } = useI18n()
  const [copied, setCopied] = useState(false)
  const media = getPresetMedia(preset)
  const imageCount = media.filter(item => item.kind === 'image').length
  const videoCount = media.filter(item => item.kind === 'video').length
  const copyPresetContent = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    await navigator.clipboard.writeText(preset.content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onPreview()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="group grid w-full grid-cols-[72px_minmax(150px,220px)_minmax(0,1fr)_110px_40px] items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:shadow-md max-lg:grid-cols-[56px_minmax(120px,180px)_minmax(0,1fr)_40px] max-sm:grid-cols-[48px_minmax(0,1fr)_40px]"
      onClick={onPreview}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-black leading-4 text-gray-700">
          {cardTypeLabel(preset.type).slice(0, 2)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-gray-400">{preset.type}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{cardTypeLabel(preset.type)}</span>
        </div>
        <h3 className="mt-1 line-clamp-2 text-base font-black leading-5 text-gray-950">{preset.label}</h3>
      </div>
      <p className="line-clamp-2 text-sm leading-6 text-gray-600 max-sm:hidden">{preset.content}</p>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-950 hover:text-white"
        title={copied ? '已复制' : '复制'}
        aria-label={copied ? '已复制' : '复制'}
        onClick={copyPresetContent}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-gray-500 max-lg:col-start-3 max-lg:row-start-1 max-sm:col-span-2 max-sm:col-start-auto max-sm:row-start-auto max-sm:justify-start">
        {imageCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1"><Image className="h-3 w-3" />{imageCount}</span>}
        {videoCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1"><PlaySquare className="h-3 w-3" />{videoCount}</span>}
        {media.length === 0 && <span className="rounded-full bg-gray-50 px-2 py-1 text-gray-400">纯文本</span>}
      </div>
    </div>
  )
}

const LibraryStat = ({ icon, label, value }: { icon: JSX.Element; label: string; value: number }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.04)]">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
        {icon}
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
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
    <span className="font-medium text-gray-700">{count} selected</span>
    <div className="flex flex-wrap gap-2">
      <button className="rounded-full px-3 py-2 text-gray-600 transition hover:bg-white" onClick={onSelectAll}>Select all</button>
      {actions.map(action => (
        <button
          key={action.label}
          className={`rounded-full px-3 py-2 font-semibold transition ${action.tone === 'danger' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
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
