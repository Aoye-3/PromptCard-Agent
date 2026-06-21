import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Check, Copy, Database, Image, PlaySquare, Search } from 'lucide-react'
import { useI18n } from '@/i18n'
import { getPresetMedia, getPresetMediaSearchText } from '@/domain/prompt-media/prompt-media'
import type { IPreset } from '@/models/Card.model'

export interface PromptLibraryPreviewModeProps {
  presets: IPreset[]
  activeCategory: string
  visibleCount: number
  mediaCount: number
  searchTerm: string
  cardTypes: { type: string; label: string }[]
  categoryCounts: Record<string, number>
  onCategoryChange: (type: string) => void
  onSearchChange: (searchTerm: string) => void
  onPreview: (preset: IPreset) => void
  compact?: boolean
}

export interface PromptLibraryPreviewPanelProps {
  presets: IPreset[]
  cardTypes: { type: string; label: string }[]
  compact?: boolean
  onPreview: (preset: IPreset) => void
}

export const PromptLibraryPreviewPanel = ({
  presets,
  cardTypes,
  compact = false,
  onPreview
}: PromptLibraryPreviewPanelProps) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const filteredPresets = useMemo(
    () => filterPromptLibraryPresets(presets, searchTerm, activeCategory),
    [activeCategory, presets, searchTerm]
  )
  const categoryCounts = useMemo(
    () => createCategoryCounts(cardTypes, presets),
    [cardTypes, presets]
  )
  const mediaCount = useMemo(
    () => presets.reduce((count, preset) => count + getPresetMedia(preset).length, 0),
    [presets]
  )

  return (
    <PromptLibraryPreviewMode
      presets={filteredPresets}
      activeCategory={activeCategory}
      visibleCount={presets.length}
      mediaCount={mediaCount}
      searchTerm={searchTerm}
      cardTypes={cardTypes}
      categoryCounts={categoryCounts}
      onCategoryChange={setActiveCategory}
      onSearchChange={setSearchTerm}
      onPreview={onPreview}
      compact={compact}
    />
  )
}

export const PromptLibraryPreviewMode = ({
  presets,
  activeCategory,
  visibleCount,
  mediaCount,
  searchTerm,
  cardTypes,
  categoryCounts,
  onCategoryChange,
  onSearchChange,
  onPreview,
  compact = false
}: PromptLibraryPreviewModeProps) => {
  const { t } = useI18n()

  return (
    <div className={`mx-auto flex h-full flex-col overflow-hidden ${compact ? 'max-w-none' : 'max-w-[1600px]'}`} data-prompt-library-preview-mode>
      <div className={compact ? 'mb-3 space-y-3' : 'mb-4 space-y-4'}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchPrompt')}
            className={`w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-gray-300 focus:ring-2 focus:ring-gray-100 ${compact ? '' : 'sm:w-80'}`}
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <CategoryFilter
          cardTypes={cardTypes}
          activeCategory={activeCategory}
          visibleCount={visibleCount}
          categoryCounts={categoryCounts}
          onCategoryChange={onCategoryChange}
          compact={compact}
        />
        {!compact && (
          <div className="grid shrink-0 grid-cols-1 gap-3 md:grid-cols-3">
            <LibraryStat icon={<Database className="h-4 w-4" />} label="可浏览 Prompt" value={visibleCount} />
            <LibraryStat icon={<Image className="h-4 w-4" />} label="媒体条目" value={mediaCount} />
            <LibraryStat icon={<Search className="h-4 w-4" />} label="当前结果" value={presets.length} />
          </div>
        )}
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto border border-gray-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)] ${compact ? 'rounded-xl p-2' : 'rounded-2xl p-3'}`}>
        <div className="space-y-2">
          {presets.map(preset => (
            <PromptPreviewCard key={preset.id} preset={preset} compact={compact} onPreview={() => onPreview(preset)} />
          ))}
        </div>
        {presets.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-400">没有匹配的提示词</div>
        )}
      </div>
    </div>
  )
}

export const filterPromptLibraryPresets = (
  presets: IPreset[],
  searchTerm: string,
  activeCategory: string
) => presets.filter(preset => {
  const keyword = searchTerm.trim().toLowerCase()
  const matchesSearch = !keyword ||
    preset.label.toLowerCase().includes(keyword) ||
    preset.content.toLowerCase().includes(keyword) ||
    preset.category.toLowerCase().includes(keyword) ||
    getPresetMediaSearchText(preset).toLowerCase().includes(keyword)
  const matchesCategory = activeCategory === 'all' || preset.type === activeCategory
  return matchesSearch && matchesCategory
})

export const createCategoryCounts = (
  cardTypes: { type: string }[],
  presets: IPreset[]
) => cardTypes.reduce((counts, type) => {
  counts[type.type] = presets.filter(preset => preset.type === type.type).length
  return counts
}, {} as Record<string, number>)

const CategoryFilter = ({
  cardTypes,
  activeCategory,
  visibleCount,
  categoryCounts,
  onCategoryChange,
  compact
}: {
  cardTypes: { type: string; label: string }[]
  activeCategory: string
  visibleCount: number
  categoryCounts: Record<string, number>
  onCategoryChange: (type: string) => void
  compact: boolean
}) => {
  const { t } = useI18n()
  return (
    <div className={`shrink-0 border border-gray-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.04)] ${compact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}>
      <div className={`${compact ? 'mb-2' : 'mb-3'} flex items-center gap-2`}>
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

const PromptPreviewCard = ({
  preset,
  compact,
  onPreview
}: {
  preset: IPreset
  compact: boolean
  onPreview: () => void
}) => {
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
      className={`group grid w-full items-center rounded-xl border border-gray-100 bg-white text-left shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:shadow-md ${
        compact
          ? 'grid-cols-[44px_minmax(0,1fr)_40px] gap-3 px-3 py-3'
          : 'grid-cols-[72px_minmax(150px,220px)_minmax(0,1fr)_150px] gap-4 px-4 py-3 max-lg:grid-cols-[56px_minmax(120px,180px)_minmax(0,1fr)] max-sm:grid-cols-[48px_minmax(0,1fr)]'
      }`}
      onClick={onPreview}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-2">
        <span className={`flex shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-black leading-4 text-gray-700 ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}>
          {cardTypeLabel(preset.type).slice(0, 2)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-gray-400">{preset.type}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{cardTypeLabel(preset.type)}</span>
        </div>
        <h3 className={`${compact ? 'text-sm' : 'text-base'} mt-1 line-clamp-2 font-black leading-5 text-gray-950`}>{preset.label}</h3>
        {compact && <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">{preset.content}</p>}
      </div>
      {!compact && <p className="line-clamp-2 text-sm leading-6 text-gray-600 max-sm:hidden">{preset.content}</p>}
      <div className={`flex flex-wrap items-center gap-2 text-xs text-gray-500 ${compact ? 'justify-end' : 'justify-end max-lg:col-start-3 max-lg:row-start-1 max-sm:col-span-2 max-sm:col-start-auto max-sm:row-start-auto max-sm:justify-start'}`}>
        {!compact && imageCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1"><Image className="h-3 w-3" />{imageCount}</span>}
        {!compact && videoCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1"><PlaySquare className="h-3 w-3" />{videoCount}</span>}
        {!compact && media.length === 0 && <span className="rounded-full bg-gray-50 px-2 py-1 text-gray-400">纯文本</span>}
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-950 hover:text-white"
          title={copied ? '已复制' : '复制'}
          aria-label={copied ? '已复制' : '复制'}
          onClick={copyPresetContent}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
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
