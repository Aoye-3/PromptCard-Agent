import { Camera, Grid2X2, ListFilter, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useI18n } from '@/i18n'
import { MediaAnalysisDialog } from './MediaAnalysisDialog'
import { RecentCaptureDetailPanel } from './RecentCaptureDetailPanel'
import { RecentCaptureInbox } from './RecentCaptureInbox'
import { useRecentCaptures } from './use-recent-captures'

export const MediaScreen = () => {
  const { t } = useI18n()
  const { captures, selectedCapture, selectedCaptureId, setSelectedCaptureId } = useRecentCaptures()
  const [analysisCaptureId, setAnalysisCaptureId] = useState<string | null>(null)
  const analysisCapture = useMemo(
    () => captures.find(capture => capture.id === analysisCaptureId) || null,
    [analysisCaptureId, captures]
  )

  const handleSelectCapture = (captureId: string) => {
    setSelectedCaptureId(captureId)
    setAnalysisCaptureId(captureId)
  }

  return (
    <section data-media-screen className="min-h-[calc(100vh-112px)] bg-[#f7f7f5] px-4 py-5 sm:px-6">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-black text-gray-500">
              <Camera className="h-4 w-4 text-amber-500" />
              {t('mediaCaptureReviewQueue')}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-gray-950">{t('mediaRecentCapturesTitle')}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              {t('mediaRecentCapturesDescription')}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-left sm:w-[420px]">
            <Stat label={t('mediaStatRecent')} value={captures.length.toString()} />
            <Stat label={t('mediaStatAnnotated')} value="0" />
            <Stat label={t('mediaStatRegistered')} value="0" />
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed">
              {t('mediaFilterAll')}
            </button>
            <button type="button" disabled className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-black text-gray-400 disabled:cursor-not-allowed">
              {t('mediaFilterScreenshots')}
            </button>
            <button type="button" disabled className="rounded-lg bg-gray-50 px-3 py-2 text-xs font-black text-gray-400 disabled:cursor-not-allowed">
              {t('mediaFilterRecordings')}
            </button>
          </div>
          <div className="flex gap-2 text-gray-300">
            <button type="button" disabled aria-label={t('mediaFilterCapturesAria')} title={t('mediaFilterCapturesTitle')} className="rounded-lg bg-gray-50 p-2 disabled:cursor-not-allowed">
              <ListFilter className="h-4 w-4" />
            </button>
            <button type="button" disabled aria-label={t('mediaGridViewAria')} title={t('mediaGridViewTitle')} className="rounded-lg bg-gray-50 p-2 disabled:cursor-not-allowed">
              <Grid2X2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-[620px] flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <RecentCaptureInbox
            captures={captures}
            selectedCaptureId={selectedCaptureId}
            onSelectCapture={handleSelectCapture}
          />
          <RecentCaptureDetailPanel capture={selectedCapture} />
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs font-bold text-gray-500">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          {t('mediaAgentVisibilityNotice')}
        </div>
      </div>
      <MediaAnalysisDialog capture={analysisCapture} onClose={() => setAnalysisCaptureId(null)} />
    </section>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
    <div className="text-lg font-black text-gray-950">{value}</div>
    <div className="text-xs font-bold text-gray-400">{label}</div>
  </div>
)
