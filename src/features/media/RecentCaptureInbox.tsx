import { Camera, CheckSquare, Search } from 'lucide-react'
import { useI18n } from '@/i18n'
import type { RecentCaptureItemViewModel } from './media-types'

export const RecentCaptureInbox = ({
  captures,
  selectedCaptureId,
  onSelectCapture
}: {
  captures: RecentCaptureItemViewModel[]
  selectedCaptureId: string | null
  onSelectCapture: (captureId: string) => void
}) => {
  const { t } = useI18n()

  return (
  <section className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white" aria-label={t('mediaInboxAria')}>
    <div className="shrink-0 border-b border-gray-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-gray-950">{t('mediaInboxTitle')}</h2>
          <p className="mt-1 text-xs font-semibold text-gray-400">{t('mediaRecentItems', { count: captures.length })}</p>
        </div>
        <button
          type="button"
          disabled
          title={t('mediaBatchSelectTitle')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-300 disabled:cursor-not-allowed"
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
          {captures.map(capture => (
            <button
              type="button"
              key={capture.id}
              onClick={() => onSelectCapture(capture.id)}
              className={`rounded-lg border p-3 text-left transition ${
                selectedCaptureId === capture.id
                  ? 'border-gray-950 bg-gray-50'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              }`}
            >
              <div className="text-sm font-black text-gray-950">{capture.title}</div>
              <div className="mt-2 text-xs font-semibold text-gray-400">{capture.capturedAtLabel}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
  )
}
