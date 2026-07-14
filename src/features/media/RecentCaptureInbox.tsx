import { Camera, CheckSquare, Pencil, Search, Trash2 } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { RecentCaptureItemViewModel } from './media-types'

export const RecentCaptureInbox = ({
  captures,
  selectedCaptureId,
  selectedCaptureIds = [],
  batchMode = false,
  onSelectCapture,
  onEditCapture = () => undefined,
  onDeleteCapture = () => undefined,
  deletingCaptureId = null,
  onToggleBatchMode = () => undefined,
  onToggleCaptureSelection = () => undefined
}: {
  captures: RecentCaptureItemViewModel[]
  selectedCaptureId: string | null
  selectedCaptureIds?: string[]
  batchMode?: boolean
  onSelectCapture: (captureId: string) => void
  onEditCapture?: (captureId: string) => void
  onDeleteCapture?: (capture: RecentCaptureItemViewModel) => void
  deletingCaptureId?: string | null
  onToggleBatchMode?: () => void
  onToggleCaptureSelection?: (captureId: string) => void
}) => {
  const { t } = useI18n()

  return (
  <section data-batch-mode={batchMode} className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white" aria-label={t('mediaInboxAria')}>
    <div className="shrink-0 border-b border-gray-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-gray-950">{t('mediaInboxTitle')}</h2>
          <p className="mt-1 text-xs font-semibold text-gray-400">{t('mediaRecentItems', { count: captures.length })}</p>
        </div>
        <button
          type="button"
          title={batchMode ? '退出批量选择' : '批量选择'}
          onClick={onToggleBatchMode}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${batchMode ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-500'}`}
          aria-label={t('mediaBatchSelectAria')}
        >
          <CheckSquare className="h-4 w-4" />
        </button>
      </div>
      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
        <input
          type="search"
          disabled
          placeholder={t('mediaSearchPlaceholder')}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm font-semibold text-gray-500 placeholder:text-gray-400"
        />
      </label>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {captures.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white text-amber-400 shadow-sm">
            <Camera className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-base font-black text-gray-950">{t('mediaEmptyTitle')}</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
            {t('mediaEmptyDescription')}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {captures.map(capture => {
            const registered = Boolean(capture.registeredPromptId)
            const checked = selectedCaptureIds.includes(capture.id)
            return (
              <div key={capture.id} className={`flex items-center gap-3 rounded-lg border p-3 ${selectedCaptureId === capture.id ? 'border-gray-950 bg-gray-50' : 'border-gray-100 bg-white'}`}>
                {batchMode && (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={registered}
                    onChange={() => onToggleCaptureSelection(capture.id)}
                    aria-label={`选择 ${capture.title}`}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                )}
                <button type="button" onClick={() => onSelectCapture(capture.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-black text-gray-950">{capture.title}</div>
                  <div className="mt-2 text-xs font-semibold text-gray-400">{capture.capturedAtLabel}</div>
                </button>
                {registered && <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-600">已注册</span>}
                <button
                  type="button"
                  data-capture-action="edit"
                  onClick={() => onEditCapture(capture.id)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  编辑
                </button>
                <button
                  type="button"
                  data-capture-action="delete"
                  disabled={deletingCaptureId === capture.id}
                  onClick={() => onDeleteCapture(capture)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-black text-red-600 transition hover:border-red-200 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deletingCaptureId === capture.id ? '移除中…' : '移除记录'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  </section>
  )
}
