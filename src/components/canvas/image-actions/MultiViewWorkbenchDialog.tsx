import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent
} from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Box,
  Check,
  Circle,
  Loader2,
  Sparkles,
  X
} from 'lucide-react'
import type { ImageOperationDraft } from '@/domain/image-actions/image-operation-draft'
import {
  cameraDirectionViewIds,
  defaultMultiViewSelectionIds,
  defaultMultiViewSpecs,
  modelThreeViewIds,
  type MultiViewSpec
} from '@/domain/image-actions/multi-view-recipe'

export interface MultiViewWorkbenchDialogProps {
  initialDraft: ImageOperationDraft
  initialSelectedViewIds?: readonly string[]
  modelLabel: string
  externalBlockingIssues?: readonly string[]
  onCancel: () => void
  onGenerate: (draft: ImageOperationDraft, selectedViewIds: string[]) => Promise<void>
}

export const MultiViewWorkbenchDialog = ({
  initialDraft,
  initialSelectedViewIds,
  modelLabel,
  externalBlockingIssues = [],
  onCancel,
  onGenerate
}: MultiViewWorkbenchDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState<ImageOperationDraft>(() => cloneDraft(initialDraft))
  const [selectedViewIds, setSelectedViewIds] = useState<string[]>(() => (
    initialSelectedViewIds?.length
      ? defaultMultiViewSpecs.filter(view => initialSelectedViewIds.includes(view.id)).map(view => view.id)
      : [...defaultMultiViewSelectionIds]
  ))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const issues = [
    ...externalBlockingIssues,
    ...(!draft.prompt.trim() ? ['请描述需要保持的主体身份、材质或背景要求。'] : []),
    ...(selectedViewIds.length === 0 ? ['请至少选择一个视角。'] : [])
  ]

  useEffect(() => {
    if (typeof document === 'undefined') return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLElement>('textarea, button:not(:disabled), select')?.focus()
    return () => previousFocusRef.current?.focus()
  }, [])

  const update = (patch: Partial<ImageOperationDraft>) => {
    setDraft(current => ({ ...current, ...patch }))
  }

  const toggleView = (viewId: string) => {
    setSelectedViewIds(current => current.includes(viewId)
      ? current.filter(candidate => candidate !== viewId)
      : defaultMultiViewSpecs
          .filter(view => current.includes(view.id) || view.id === viewId)
          .map(view => view.id))
  }

  const cameraDirectionSpecs = cameraDirectionViewIds.flatMap(viewId => {
    const view = defaultMultiViewSpecs.find(candidate => candidate.id === viewId)
    return view ? [view] : []
  })
  const supplementalSpecs = defaultMultiViewSpecs.filter(view => (
    view.id === 'front-three-quarter' || view.id === 'rear'
  ))

  const submit = async () => {
    if (issues.length > 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onGenerate(cloneDraft(draft), [...selectedViewIds])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '多角度请求提交失败。')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm sm:p-8"
      data-image-operation-workbench="multi-view"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !submitting) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="multi-view-workbench-title"
        className="flex max-h-[min(900px,calc(100vh-32px))] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/15 bg-[#f7f7f5] shadow-[0_36px_120px_rgba(15,23,42,0.38)]"
        onKeyDown={event => handleDialogKeys(event, submitting ? undefined : onCancel)}
      >
        <header className="flex items-start justify-between gap-6 border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#c96442]">
              <Sparkles className="h-4 w-4" />
              图片二次创作
            </div>
            <h2 id="multi-view-workbench-title" className="mt-1 text-xl font-black text-gray-950">多角度工作台</h2>
            <p className="mt-1 text-sm text-gray-500">从同一主体生成若干独立视角结果，每个视角对应一次请求。</p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-950 disabled:opacity-40"
            disabled={submitting}
            onClick={onCancel}
            aria-label="关闭多角度工作台"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <section className="border-b border-gray-200 p-6 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-gray-950">主体输入</h3>
                <p className="text-xs text-gray-500">以当前画布所见图片对应的持久化模型输入为准。</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-600 shadow-sm">{modelLabel}</span>
            </div>
            <div className="flex min-h-[360px] items-center justify-center overflow-hidden rounded-[22px] border border-gray-200 bg-white">
              <img
                src={draft.source.previewUrl}
                alt="多角度主体源图"
                className="max-h-[560px] w-full object-contain"
                draggable={false}
              />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
              <TraceBadge label="原始资产" value={draft.source.originalAssetId} />
              <TraceBadge label="画布资产" value={draft.source.canvasAssetId} />
              <TraceBadge label="模型输入" value={draft.source.providerAssetId} />
            </div>
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
              AI 会根据单张图片推断未见部分；这是视角变体，不是精确 3D 重建。文字、标志、背面结构和遮挡区域可能发生变化。
            </p>
          </section>

          <section className="space-y-5 p-6">
            <fieldset>
              <legend className="sr-only">摄像机方位</legend>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-xs font-black text-gray-700" aria-hidden="true">摄像机方位</div>
                <button
                  type="button"
                  aria-label="选择模型三视图（正视、左视、俯视）"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 transition hover:border-[#c96442] hover:text-[#8f3f29] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c96442]/35"
                  onClick={() => setSelectedViewIds([...modelThreeViewIds])}
                >
                  <Box className="h-3.5 w-3.5" aria-hidden="true" />
                  模型三视图
                </button>
              </div>
              <div data-camera-direction-grid className="grid grid-cols-3 gap-2">
                {cameraDirectionSpecs.map(view => {
                  const selected = selectedViewIds.includes(view.id)
                  return (
                    <button
                      key={view.id}
                      type="button"
                      aria-label={`选择方位 ${view.label}`}
                      aria-pressed={selected}
                      title={view.instruction}
                      className={`relative flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c96442]/35 ${
                        selected
                          ? 'border-[#c96442] bg-[#fff7f3] text-[#8f3f29]'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                      onClick={() => toggleView(view.id)}
                    >
                      <CameraDirectionIcon viewId={view.id} />
                      <span className="text-xs font-black">{view.label}</span>
                      {selected && <Check className="absolute right-1.5 top-1.5 h-3 w-3" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-bold text-gray-500">补充视角</div>
                <div className="grid grid-cols-2 gap-2">
                  {supplementalSpecs.map(view => {
                    const selected = selectedViewIds.includes(view.id)
                    return (
                      <button
                        key={view.id}
                        type="button"
                        aria-label={`选择补充视角 ${view.label}`}
                        aria-pressed={selected}
                        title={view.instruction}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c96442]/35 ${
                          selected
                            ? 'border-[#c96442] bg-[#fff7f3] text-[#8f3f29]'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                        onClick={() => toggleView(view.id)}
                      >
                        <span className="text-xs font-black">{view.label}</span>
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                          selected ? 'border-[#c96442] bg-[#c96442] text-white' : 'border-gray-300'
                        }`}>
                          {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-2 block text-xs font-black text-gray-700">身份与场景要求</span>
              <textarea
                className="min-h-32 w-full resize-y rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none transition focus:border-[#c96442] focus:ring-2 focus:ring-[#c96442]/15"
                value={draft.prompt}
                onChange={event => update({ prompt: event.target.value })}
                placeholder="例如：保持同一把椅子的轮廓、木材颜色和软包材质；纯白背景，视角间光照一致。"
                maxLength={4000}
              />
            </label>

            <div>
              <div className="mb-2 text-xs font-black text-gray-700">尽量保留</div>
              <div className="flex flex-wrap gap-2">
                {['主体身份', '比例结构', '材质与颜色', '背景与光照'].map(option => {
                  const active = draft.preservationIntents.includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                        active ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-600'
                      }`}
                      onClick={() => update({
                        preservationIntents: active
                          ? draft.preservationIntents.filter(value => value !== option)
                          : [...draft.preservationIntents, option]
                      })}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="mb-2 block text-xs font-black text-gray-700">清晰度</span>
                <select className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" value={draft.resolution} onChange={event => update({ resolution: event.target.value })}>
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                </select>
              </label>
              <label>
                <span className="mb-2 block text-xs font-black text-gray-700">画面比例</span>
                <select className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" value={draft.aspectRatio} onChange={event => update({ aspectRatio: event.target.value })}>
                  {['smart', '1:1', '4:3', '3:4', '16:9', '9:16'].map(value => <option key={value} value={value}>{value === 'smart' ? '智能' : value}</option>)}
                </select>
              </label>
            </div>

            {(issues.length > 0 || error) && (
              <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <div className="mb-1 flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" />提交前检查</div>
                {issues.map(issue => <div key={issue}>· {issue}</div>)}
                {error && <div>· {error}</div>}
              </div>
            )}
          </section>
        </div>

        <footer className="flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-5 text-gray-500">
            本次确认将发起 <strong data-multi-view-request-count className="text-gray-950">{selectedViewIds.length}</strong> 个独立请求。
            每个结果都有独立状态，可出现部分成功。
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-full px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40" disabled={submitting} onClick={onCancel}>取消</button>
            <button
              type="button"
              aria-label={`Generate ${selectedViewIds.length}`}
              className="flex items-center gap-2 rounded-full bg-gray-950 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              disabled={issues.length > 0 || submitting}
              onClick={() => void submit()}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate {selectedViewIds.length}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

const TraceBadge = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-xl bg-white px-3 py-2 shadow-sm">
    <div className="font-black text-gray-700">{label}</div>
    <div className="truncate" title={value}>{value}</div>
  </div>
)

const CameraDirectionIcon = ({ viewId }: { viewId: MultiViewSpec['id'] }) => {
  const className = 'h-3.5 w-3.5 opacity-55'
  if (viewId === 'upper-left') return <ArrowDownRight className={className} aria-hidden="true" />
  if (viewId === 'top') return <ArrowDown className={className} aria-hidden="true" />
  if (viewId === 'upper-right') return <ArrowDownLeft className={className} aria-hidden="true" />
  if (viewId === 'left') return <ArrowRight className={className} aria-hidden="true" />
  if (viewId === 'front') return <Circle className="h-1.5 w-1.5 fill-current opacity-55" aria-hidden="true" />
  if (viewId === 'right') return <ArrowLeft className={className} aria-hidden="true" />
  if (viewId === 'lower-left') return <ArrowUpRight className={className} aria-hidden="true" />
  if (viewId === 'low') return <ArrowUp className={className} aria-hidden="true" />
  return <ArrowUpLeft className={className} aria-hidden="true" />
}

const cloneDraft = (draft: ImageOperationDraft): ImageOperationDraft => ({
  ...draft,
  source: { ...draft.source },
  preservationIntents: [...draft.preservationIntents],
  references: draft.references.map(reference => ({ ...reference }))
})

const handleDialogKeys = (
  event: KeyboardEvent<HTMLDivElement>,
  onCancel?: () => void
) => {
  if (event.key === 'Escape' && onCancel) {
    event.preventDefault()
    onCancel()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not(:disabled), textarea:not(:disabled), select:not(:disabled)'
  ))
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
