import { FileText, MessageSquare, ShieldCheck, Wand2, X } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/i18n'
import { agentRuntimeService } from '@/services/agent-runtime-service'
import type { RecentCaptureItemViewModel } from './media-types'
import { RecentCapturePreview } from './RecentCapturePreview'

export const MediaAnalysisDialog = ({
  capture,
  onClose
}: {
  capture: RecentCaptureItemViewModel | null
  onClose: () => void
}) => {
  const { t } = useI18n()
  const [agentInput, setAgentInput] = useState('')
  const [analysisOutput, setAnalysisOutput] = useState('')
  const [analysisError, setAnalysisError] = useState('')
  const [analysisRunning, setAnalysisRunning] = useState(false)

  if (!capture) return null
  const selectedCapture = capture

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={t('mediaAnalysisDialogAria')} data-media-analysis-dialog>
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wide text-amber-500">{t('mediaAnalysisDialogKicker')}</div>
            <h2 className="truncate text-xl font-black text-gray-950">{capture.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-950" aria-label={t('mediaAnalysisDialogCloseAria')}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto bg-[#f7f7f5] p-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
          <section className="grid min-h-[560px] gap-3 rounded-lg border border-gray-200 bg-white p-4" style={{ gridTemplateRows: '6fr 3fr 1fr' }} data-media-dossier>
            <div className="min-h-0" data-media-analysis-preview>
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">{t('mediaAnalysisPreviewLabel')}</div>
              <RecentCapturePreview capture={capture} />
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-gray-400">
                <span>{capture.contentType}</span>
                <span>{capture.sizeLabel}</span>
                {capture.dimensionsLabel ? <span>{capture.dimensionsLabel}</span> : null}
              </div>
            </div>
            <label className="min-h-0" data-media-analysis-prompt>
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">{t('mediaAnalysisPromptDraftLabel')}</span>
              <textarea readOnly value={capture.prompt} className="h-[calc(100%-24px)] min-h-[120px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-800" />
            </label>
            <label className="min-h-0" data-media-analysis-note>
              <span className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">{t('mediaAnalysisNoteLabel')}</span>
              <textarea readOnly value={capture.userNote} className="h-[calc(100%-24px)] min-h-[72px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-800" />
            </label>
          </section>

          <section className="flex min-h-[560px] flex-col rounded-lg border border-gray-200 bg-white" data-media-agent-workspace>
            <div className="border-b border-gray-100 p-4">
              <h3 className="text-sm font-black text-gray-950">{t('mediaAnalysisWorkspaceTitle')}</h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-gray-500">{t('mediaAnalysisWorkspaceDescription')}</p>
            </div>
            <div className="grid gap-3 p-4">
              <label>
                <span className="mb-2 block text-xs font-black uppercase tracking-wide text-gray-500">{t('mediaAnalysisAgentInputLabel')}</span>
                <textarea
                  value={agentInput}
                  onChange={event => setAgentInput(event.target.value)}
                  placeholder={t('mediaAnalysisAgentInputPlaceholder')}
                  className="min-h-[112px] w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-900 placeholder:text-gray-400"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-3" aria-label={t('mediaAnalysisActionsAria')}>
                <AnalysisAction icon={<Wand2 className="h-4 w-4" />} label={t('mediaAnalysisActionStyle')} disabled={analysisRunning} onClick={() => runAnalysis('style')} />
                <AnalysisAction icon={<MessageSquare className="h-4 w-4" />} label={t('mediaAnalysisActionSend')} disabled={analysisRunning || !agentInput.trim()} onClick={() => runAnalysis('freeform')} />
                <AnalysisAction icon={<FileText className="h-4 w-4" />} label={t('mediaAnalysisActionPrompt')} disabled={analysisRunning} onClick={() => runAnalysis('prompt')} />
              </div>
            </div>

            <div className="mx-4 mb-4 flex min-h-[180px] flex-1 flex-col rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4" data-media-analysis-output>
              <div className="text-xs font-black uppercase tracking-wide text-gray-500">{t('mediaAnalysisOutputTitle')}</div>
              <p className={`mt-3 max-w-xl whitespace-pre-wrap text-sm leading-6 ${analysisError ? 'text-red-600' : 'text-gray-600'}`}>
                {analysisError || analysisOutput || (analysisRunning ? 'Analyzing…' : t('mediaAnalysisOutputPlaceholder'))}
              </p>
            </div>

            <div className="mx-4 mb-4 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-700">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              {t('mediaAnalysisScopeNotice')}
            </div>
          </section>
        </div>
      </div>
    </div>
  )

  async function runAnalysis(analysisType: 'style' | 'freeform' | 'prompt') {
    setAnalysisRunning(true)
    setAnalysisError('')
    try {
      await agentRuntimeService.bootstrap()
      const result = await agentRuntimeService.analyzeMedia({
        assetId: selectedCapture.assetId,
        contentType: selectedCapture.contentType,
        analysisType,
        content: agentInput.trim()
      })
      setAnalysisOutput(result.text)
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : String(error))
    } finally {
      setAnalysisRunning(false)
    }
  }
}

const AnalysisAction = ({
  icon,
  label,
  disabled,
  onClick
}: {
  icon: JSX.Element
  label: string
  disabled: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
    data-media-analysis-action
  >
    {icon}
    {label}
  </button>
)
