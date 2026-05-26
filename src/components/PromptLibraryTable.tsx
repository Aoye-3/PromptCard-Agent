import { useState } from 'react'
import { ChevronsUp } from 'lucide-react'
import type { IPreset } from '@/models/Card.model'
import { useI18n } from '@/i18n'

interface PromptLibraryTableProps {
  presets: IPreset[]
  selectedIds?: string[]
  onEdit: (preset: IPreset) => void
  onDelete: (id: string) => void
  onToggleSelect?: (id: string) => void
  onReorder?: (orderedIds: string[]) => void
  onMoveToTop?: (id: string) => void
  sortable?: boolean
}

const PromptLibraryTable = ({ presets, selectedIds = [], onEdit, onDelete, onToggleSelect, onReorder, onMoveToTop, sortable = false }: PromptLibraryTableProps) => {
  const { t, cardTypeLabel } = useI18n()
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const canSort = sortable && presets.length > 1 && Boolean(onReorder)

  const resetDragState = () => {
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDrop = (targetId: string) => {
    if (!canSort || !draggedId || draggedId === targetId) {
      resetDragState()
      return
    }

    const next = [...presets]
    const fromIndex = next.findIndex(preset => preset.id === draggedId)
    const toIndex = next.findIndex(preset => preset.id === targetId)

    if (fromIndex === -1 || toIndex === -1) {
      resetDragState()
      return
    }

    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onReorder?.(next.map(preset => preset.id))
    resetDragState()
  }

  // 获取类型对应的颜色
  const getTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      subject: 'bg-blue-100 text-blue-700',
      action: 'bg-green-100 text-green-700',
      scene: 'bg-purple-100 text-purple-700',
      style: 'bg-orange-100 text-orange-700',
      camera: 'bg-red-100 text-red-700',
      lighting: 'bg-yellow-100 text-yellow-700',
      timing: 'bg-amber-100 text-amber-700',
      audio: 'bg-teal-100 text-teal-700',
      constraint: 'bg-purple-100 text-purple-700',
      custom: 'bg-gray-100 text-gray-700'
    }
    return colorMap[type] || 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-fixed divide-y divide-gray-200">
        <colgroup>
          <col className="w-[64px]" />
          <col className="w-[86px]" />
          <col className="w-[110px]" />
          <col className="w-[220px]" />
          <col />
          <col className="w-[110px]" />
          <col className="w-[250px]" />
        </colgroup>
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Select
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              {t('sort')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              {t('type')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              {t('name')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              {t('content')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              {t('usageTimes')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              {t('actions')}
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {presets.map((preset) => (
            <tr
              key={preset.id}
              draggable={canSort}
              onDragStart={() => {
                if (canSort) setDraggedId(preset.id)
              }}
              onDragOver={(event) => {
                if (!canSort || !draggedId) return
                event.preventDefault()
                setDragOverId(preset.id)
              }}
              onDragLeave={() => {
                if (dragOverId === preset.id) setDragOverId(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDrop(preset.id)
              }}
              onDragEnd={resetDragState}
              className={`transition ${
                draggedId === preset.id
                  ? 'bg-blue-50 opacity-70'
                  : dragOverId === preset.id
                    ? 'bg-blue-50 border-t-2 border-blue-500'
                    : 'hover:bg-gray-50'
              }`}
            >
              <td className="px-4 py-4">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-black focus:ring-gray-200"
                  checked={selectedIds.includes(preset.id)}
                  onChange={() => onToggleSelect?.(preset.id)}
                />
              </td>
              <td className="px-4 py-4">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded border text-sm ${
                    canSort
                      ? 'cursor-grab border-gray-300 text-gray-500 hover:bg-gray-100 active:cursor-grabbing'
                      : 'cursor-not-allowed border-gray-200 text-gray-300'
                  }`}
                  title={canSort ? t('dragSortTitle') : t('cannotSortTitle')}
                >
                  <i className="fa fa-bars"></i>
                </span>
              </td>
              <td className="px-4 py-4">
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getTypeColor(preset.type)}`}>
                  {cardTypeLabel(preset.type)}
                </span>
              </td>
              <td className="px-4 py-4">
                <div className="truncate text-sm font-medium text-gray-900">{preset.label}</div>
              </td>
              <td className="px-4 py-4">
                <div className="line-clamp-2 text-sm leading-6 text-gray-900">
                  {preset.content}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="text-sm text-gray-500">
                  <i className="fa fa-eye mr-1"></i> {preset.usageCount}
                </div>
              </td>
              <td className="px-4 py-4 text-sm font-medium">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {canSort && (
                  <button
                    className="text-gray-600 hover:text-gray-950"
                    onClick={() => onMoveToTop?.(preset.id)}
                    disabled={presets[0]?.id === preset.id}
                    title="移动到列表顶端"
                  >
                    <ChevronsUp className="mr-1 h-4 w-4" />
                    置顶
                  </button>
                )}
                <button
                  className="text-blue-600 hover:text-blue-900"
                  onClick={() => onEdit(preset)}
                >
                  <i className="fa fa-edit mr-1"></i>{t('edit')}
                </button>
                <button
                  className="text-red-600 hover:text-red-900"
                  onClick={() => onDelete(preset.id)}
                >
                  <i className="fa fa-trash mr-1"></i>{t('delete')}
                </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {presets.length === 0 && (
        <div className="text-center py-12">
          <i className="fa fa-search text-4xl text-gray-300 mb-4"></i>
          <p className="text-gray-500 text-lg">{t('noMatchingPrompt')}</p>
        </div>
      )}
    </div>
  )
}

export default PromptLibraryTable
