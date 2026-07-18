import { Camera, Grid2X2, ListFilter, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useI18n } from '@/i18n'
import { MediaAnalysisDialog } from './MediaAnalysisDialog'
import { RecentCaptureDetailPanel } from './RecentCaptureDetailPanel'
import { RecentCaptureInbox } from './RecentCaptureInbox'
import { useRecentCaptures } from './use-recent-captures'
import { RecentCaptureRegistrationDialog } from './RecentCaptureRegistrationDialog'
import type { RecentCaptureItemViewModel } from './media-types'
import { usePresetStore } from '@/stores/preset.store'
import { storage } from '@/utils/storage'

export const MediaScreen = ({
  canPlaceOnCanvas = false,
  onPlaceOnCanvas = async () => undefined,
  referenceTarget = null,
  onPlaceAsReference = async () => undefined,
  onOpenPromptLibrary = () => undefined
}: {
  canPlaceOnCanvas?: boolean
  onPlaceOnCanvas?: (capture: RecentCaptureItemViewModel) => Promise<void>
  referenceTarget?: { id: string; title: string } | null
  onPlaceAsReference?: (capture: RecentCaptureItemViewModel, targetNodeId: string) => Promise<void>
  onOpenPromptLibrary?: (presetId?: string) => void
}) => {
  const { t } = useI18n()
  const { captures, refreshCaptures, selectedCapture, selectedCaptureId, setSelectedCaptureId } = useRecentCaptures()
  const refreshPresets = usePresetStore(state => state.refresh)
  const [analysisCaptureId, setAnalysisCaptureId] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<string[]>([])
  const [registrationCaptureIds, setRegistrationCaptureIds] = useState<string[] | null>(null)
  const [deletingCaptureId, setDeletingCaptureId] = useState<string | null>(null)
  const [captureActionError, setCaptureActionError] = useState('')
  const analysisCapture = useMemo(
    () => captures.find(capture => capture.id === analysisCaptureId) || null,
    [analysisCaptureId, captures]
  )
  const registrationCaptures = useMemo(
    () => registrationCaptureIds?.map(id => captures.find(capture => capture.id === id)).filter((capture): capture is RecentCaptureItemViewModel => Boolean(capture)) || [],
    [captures, registrationCaptureIds]
  )

  const handleSelectCapture = (captureId: string) => {
    setSelectedCaptureId(captureId)
  }

  const handleEditCapture = (captureId: string) => {
    setSelectedCaptureId(captureId)
    setAnalysisCaptureId(captureId)
  }

  const handleDeleteCapture = async (capture: RecentCaptureItemViewModel) => {
    const confirmed = window.confirm(
      `将“${capture.title}”移入文件回收站吗？\n\n恢复文件后，它会重新回到媒体分析队列。`
    )
    if (!confirmed) return

    setCaptureActionError('')
    setDeletingCaptureId(capture.id)
    try {
      await storage.storageArtifacts.trash([capture.assetId])
      if (selectedCaptureId === capture.id) setSelectedCaptureId(null)
      if (analysisCaptureId === capture.id) setAnalysisCaptureId(null)
      setSelectedCaptureIds(current => current.filter(id => id !== capture.id))
      setRegistrationCaptureIds(current => current?.filter(id => id !== capture.id) || null)
      await refreshCaptures()
    } catch (error) {
      setCaptureActionError(error instanceof Error ? `移入文件回收站失败：${error.message}` : '移入文件回收站失败，请重试。')
    } finally {
      setDeletingCaptureId(null)
    }
  }

  const toggleBatchMode = () => {
    setBatchMode(current => !current)
    setSelectedCaptureIds([])
  }

  const toggleCaptureSelection = (captureId: string) => {
    setSelectedCaptureIds(current => current.includes(captureId) ? current.filter(id => id !== captureId) : [...current, captureId])
  }

  const placeOnCanvas = async (capture: RecentCaptureItemViewModel) => {
    await onPlaceOnCanvas(capture)
    await refreshCaptures()
  }

  const placeAsReference = async (capture: RecentCaptureItemViewModel, targetNodeId: string) => {
    await onPlaceAsReference(capture, targetNodeId)
    await refreshCaptures()
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
            <Stat label={t('mediaStatRegistered')} value={captures.filter(capture => capture.registeredPromptId).length.toString()} />
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

        {captureActionError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {captureActionError}
          </div>
        )}

        {batchMode && selectedCaptureIds.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-sm font-black text-blue-900">已选择 {selectedCaptureIds.length} 项</span>
            <button type="button" onClick={() => setRegistrationCaptureIds(selectedCaptureIds)} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white">批量注册到 Prompt Library</button>
          </div>
        )}

        <div className="grid min-h-[620px] flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <RecentCaptureInbox
            captures={captures}
            selectedCaptureId={selectedCaptureId}
            selectedCaptureIds={selectedCaptureIds}
            batchMode={batchMode}
            onSelectCapture={handleSelectCapture}
            onEditCapture={handleEditCapture}
            onDeleteCapture={capture => void handleDeleteCapture(capture)}
            deletingCaptureId={deletingCaptureId}
            onToggleBatchMode={toggleBatchMode}
            onToggleCaptureSelection={toggleCaptureSelection}
          />
          <RecentCaptureDetailPanel
            capture={selectedCapture}
            canPlaceOnCanvas={canPlaceOnCanvas}
            onRegister={capture => setRegistrationCaptureIds([capture.id])}
            onPlaceOnCanvas={capture => void placeOnCanvas(capture)}
            referenceTarget={referenceTarget}
            onPlaceAsReference={(capture, targetNodeId) => void placeAsReference(capture, targetNodeId)}
            onOpenPromptLibrary={presetId => onOpenPromptLibrary(presetId)}
          />
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs font-bold text-gray-500">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          {t('mediaAgentVisibilityNotice')}
        </div>
      </div>
      <MediaAnalysisDialog capture={analysisCapture} onClose={() => setAnalysisCaptureId(null)} />
      {registrationCaptureIds && registrationCaptures.length > 0 && (
        <RecentCaptureRegistrationDialog
          captures={registrationCaptures}
          onClose={() => setRegistrationCaptureIds(null)}
          onRegistered={async () => {
            await Promise.all([refreshCaptures(), refreshPresets()])
            setRegistrationCaptureIds(null)
            setSelectedCaptureIds([])
            setBatchMode(false)
          }}
        />
      )}
    </section>
  )
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
    <div className="text-lg font-black text-gray-950">{value}</div>
    <div className="text-xs font-bold text-gray-400">{label}</div>
  </div>
)
