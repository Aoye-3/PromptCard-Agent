import type { CardType, IPreset } from '@/models/Card.model'
import {
  createPromptInjectionEvent,
  filterPromptInjectionPresets,
  type PromptInjectionAction,
  type PromptInjectionEvent
} from '@/domain/prompt-injection/prompt-injection'

interface PromptInjectionPanelProps {
  title: string
  description?: string
  activeType: CardType
  availableTypes: CardType[]
  presets: IPreset[]
  actions: PromptInjectionAction[]
  selectedTargetLabel?: string | null
  searchTerm?: string
  searchPlaceholder?: string
  emptyMessage?: string
  statsLabel?: string
  getTypeLabel: (type: CardType) => string
  onTypeChange: (type: CardType) => void
  onSearchChange: (searchTerm: string) => void
  onApplyPreset: (event: PromptInjectionEvent) => void
}

export const PromptInjectionPanel = ({
  title,
  description,
  activeType,
  availableTypes,
  presets,
  actions,
  selectedTargetLabel,
  searchTerm = '',
  searchPlaceholder = 'Search name or content...',
  emptyMessage = 'No matching preset prompts found',
  statsLabel,
  getTypeLabel,
  onTypeChange,
  onSearchChange,
  onApplyPreset
}: PromptInjectionPanelProps) => {
  const filteredPresets = filterPromptInjectionPresets(presets, activeType, searchTerm)
  const activeTypeLabel = getTypeLabel(activeType)

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <h3 className="mb-1 text-lg font-semibold text-gray-800">{title}</h3>
      {description && <p className="mb-4 text-sm text-gray-500">{description}</p>}

      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-gray-700">选择卡片类型</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {availableTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeType === type
                  ? 'creative-category-active'
                  : 'creative-category-idle'
              }`}
              onClick={() => onTypeChange(type)}
            >
              {getTypeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      <div className="creative-stats mb-6 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="creative-stats-title text-sm font-medium">
            {statsLabel || `${activeTypeLabel}类统计`}
          </span>
          <span className="creative-stats-meta text-sm">
            预制提示词: {filteredPresets.length}
          </span>
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium text-gray-700">快速添加卡片</h4>
          {selectedTargetLabel && (
            <span className="text-xs text-gray-500">{selectedTargetLabel}</span>
          )}
        </div>

        <div className="relative mb-3">
          <span className="fa fa-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></span>
          <input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="max-h-[58vh] overflow-y-auto rounded-lg border border-gray-200">
          <div className="p-2">
            {filteredPresets.length > 0 ? (
              filteredPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="quick-preset-card mb-2 rounded-lg border p-3 transition-all duration-200"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h5 className="text-sm font-medium text-gray-900">{preset.label}</h5>
                    <span className="shrink-0 text-xs font-medium text-yellow-600">
                      {preset.usageCount || 0}次使用
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600">{preset.content}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="quick-action-btn quick-action-add rounded px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={action.disabled}
                        title={action.title || action.label}
                        onClick={() => onApplyPreset(createPromptInjectionEvent(preset, action.id))}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-sm text-gray-500">{emptyMessage}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
