import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Sparkles,
  X
} from 'lucide-react'
import {
  imageOperationBlockingIssues,
  requiresRegion,
  type ImageOperationDraft,
  type ImageOperationReference,
  type ImageReferenceRole
} from '@/domain/image-actions/image-operation-draft'
import type { ImageProductOperation } from '@/domain/image-actions/image-operations'

export interface ImageOperationWorkbenchDialogProps {
  initialDraft: ImageOperationDraft
  modelLabel: string
  maximumInputs: number
  externalBlockingIssues?: readonly string[]
  onImportReferences?: (files: File[]) => Promise<ImageOperationReference[]>
  onCancel: () => void
  onGenerate: (draft: ImageOperationDraft) => Promise<void>
}

const referenceRoles: readonly { value: ImageReferenceRole; label: string }[] = [
  { value: 'identity', label: '身份' },
  { value: 'style', label: '风格' },
  { value: 'material', label: '材质' },
  { value: 'layout', label: '布局' },
  { value: 'content', label: '内容' }
]

export const ImageOperationWorkbenchDialog = ({
  initialDraft,
  modelLabel,
  maximumInputs,
  externalBlockingIssues = [],
  onImportReferences,
  onCancel,
  onGenerate
}: ImageOperationWorkbenchDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState<ImageOperationDraft>(() => cloneDraft(initialDraft))
  const [submitting, setSubmitting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const issues = [
    ...externalBlockingIssues,
    ...imageOperationBlockingIssues(draft, maximumInputs)
  ]
  const config = operationWorkbenchConfig(draft.operation)
  const canAddReferences = maximumInputs > 1
    && draft.references.length + 1 < maximumInputs
    && Boolean(onImportReferences)

  useEffect(() => {
    if (typeof document === 'undefined') return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLElement>('textarea, button:not(:disabled), select')?.focus()
    return () => previousFocusRef.current?.focus()
  }, [])

  const update = (patch: Partial<ImageOperationDraft>) => setDraft(current => ({ ...current, ...patch }))

  const importReferences = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!onImportReferences || files.length === 0) return
    setImporting(true)
    setError(null)
    try {
      const imported = await onImportReferences(files)
      setDraft(current => ({
        ...current,
        references: [...current.references, ...imported]
          .slice(0, Math.max(0, maximumInputs - 1))
          .map((reference, order) => ({ ...reference, order }))
      }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '参考图导入失败。')
    } finally {
      setImporting(false)
    }
  }

  const submit = async () => {
    if (issues.length > 0 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onGenerate(cloneDraft(draft))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '生成提交失败。')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm sm:p-8"
      data-image-operation-workbench={draft.operation}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !submitting) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-operation-title"
        className="flex max-h-[min(900px,calc(100vh-32px))] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/15 bg-[#f7f7f5] shadow-[0_36px_120px_rgba(15,23,42,0.38)]"
        onKeyDown={event => handleDialogKeys(event, submitting ? undefined : onCancel)}
      >
        <header className="flex items-start justify-between gap-6 border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#c96442]">
              <Sparkles className="h-4 w-4" />
              图片二次创作
            </div>
            <h2 id="image-operation-title" className="mt-1 text-xl font-black text-gray-950">{config.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{config.description}</p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-950 disabled:opacity-40"
            disabled={submitting}
            onClick={onCancel}
            aria-label="关闭图片工作台"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <section className="border-b border-gray-200 p-6 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-gray-950">实际输入预览</h3>
                <p className="text-xs text-gray-500">此预览对应将发送给模型的持久化本地资产。</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-600 shadow-sm">{modelLabel}</span>
            </div>
            <button
              type="button"
              className={`relative flex min-h-[340px] w-full items-center justify-center overflow-hidden rounded-[22px] border bg-white ${
                requiresRegion(draft.operation) ? 'cursor-crosshair border-dashed border-[#c96442]' : 'border-gray-200'
              }`}
              onClick={requiresRegion(draft.operation) ? event => selectPoint(event, update) : undefined}
              aria-label={requiresRegion(draft.operation) ? '在图片上选择编辑位置' : '源图片预览'}
            >
              <img
                src={draft.source.previewUrl}
                alt="图片操作源输入"
                className="max-h-[560px] w-full object-contain"
                draggable={false}
              />
              {draft.region?.type === 'point' && (
                <span
                  className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#c96442] shadow-[0_0_0_2px_rgba(201,100,66,0.45)]"
                  style={{ left: `${draft.region.x / 9.99}%`, top: `${draft.region.y / 9.99}%` }}
                />
              )}
            </button>
            <div className="mt-3 grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
              <TraceBadge label="原始资产" value={draft.source.originalAssetId} />
              <TraceBadge label="画布资产" value={draft.source.canvasAssetId} />
              <TraceBadge label="模型输入" value={draft.source.providerAssetId} />
            </div>
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
              {config.limitation}
            </p>
          </section>

          <section className="space-y-5 p-6">
            <Field label="效果类型">
              <div className="grid grid-cols-2 gap-2">
                {config.presets.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-left text-sm font-bold transition ${
                      draft.presetId === preset.id
                        ? 'border-[#c96442] bg-[#fff7f3] text-[#9b452c]'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                    onClick={() => update({ presetId: preset.id })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={config.promptLabel}>
              <textarea
                className="min-h-28 w-full resize-y rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none transition focus:border-[#c96442] focus:ring-2 focus:ring-[#c96442]/15"
                value={draft.prompt}
                onChange={event => update({ prompt: event.target.value })}
                placeholder={config.placeholder}
                maxLength={4000}
              />
            </Field>

            <Field label="尽量保留">
              <div className="flex flex-wrap gap-2">
                {config.preservationOptions.map(option => {
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
            </Field>

            <Field label={`辅助参考图（${draft.references.length}/${Math.max(0, maximumInputs - 1)}）`}>
              {draft.references.length > 0 && (
                <div className="space-y-2">
                  {draft.references.map((reference, index) => (
                    <div key={reference.referenceId} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-700">{reference.label}</span>
                      <select
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
                        aria-label={`${reference.label} 用途`}
                        value={reference.role}
                        onChange={event => replaceReference(draft, index, {
                          ...reference,
                          role: event.target.value as ImageReferenceRole
                        }, update)}
                      >
                        {referenceRoles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                      </select>
                      <button type="button" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" disabled={index === 0} onClick={() => moveReference(draft, index, -1, update)} aria-label="参考图前移"><ArrowLeft className="h-3.5 w-3.5" /></button>
                      <button type="button" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" disabled={index === draft.references.length - 1} onClick={() => moveReference(draft, index, 1, update)} aria-label="参考图后移"><ArrowRight className="h-3.5 w-3.5" /></button>
                      <button type="button" className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => update({ references: draft.references.filter((_, candidate) => candidate !== index).map((item, order) => ({ ...item, order })) })} aria-label="移除参考图"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              {maximumInputs <= 1 ? (
                <p className="rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-500">当前模型目录只允许单图输入，因此不显示无效的添加入口。</p>
              ) : (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={importReferences} />
                  <button
                    type="button"
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canAddReferences || importing}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    添加参考图
                  </button>
                </>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="清晰度">
                <select className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" value={draft.resolution} onChange={event => update({ resolution: event.target.value })}>
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                </select>
              </Field>
              <Field label="画面比例">
                <select className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm" value={draft.aspectRatio} onChange={event => update({ aspectRatio: event.target.value })}>
                  {['smart', '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'].map(value => <option key={value} value={value}>{value === 'smart' ? '智能' : value}</option>)}
                </select>
              </Field>
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
          <div className="text-xs text-gray-500">
            本次确认将发起 <strong className="text-gray-900">1</strong> 个独立请求；生成结果会作为新节点放在画布上。
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-full px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40" disabled={submitting} onClick={onCancel}>取消</button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-gray-950 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              disabled={issues.length > 0 || submitting}
              onClick={() => void submit()}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-2 block text-xs font-black text-gray-700">{label}</span>
    {children}
  </label>
)

const TraceBadge = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-xl bg-white px-3 py-2 shadow-sm">
    <div className="font-black text-gray-700">{label}</div>
    <div className="truncate" title={value}>{value}</div>
  </div>
)

const selectPoint = (
  event: MouseEvent<HTMLButtonElement>,
  update: (patch: Partial<ImageOperationDraft>) => void
) => {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = Math.max(0, Math.min(999, Math.round(((event.clientX - rect.left) / rect.width) * 999)))
  const y = Math.max(0, Math.min(999, Math.round(((event.clientY - rect.top) / rect.height) * 999)))
  update({ region: { type: 'point', x, y } })
}

const replaceReference = (
  draft: ImageOperationDraft,
  index: number,
  reference: ImageOperationReference,
  update: (patch: Partial<ImageOperationDraft>) => void
) => update({ references: draft.references.map((item, candidate) => candidate === index ? reference : item) })

const moveReference = (
  draft: ImageOperationDraft,
  index: number,
  delta: number,
  update: (patch: Partial<ImageOperationDraft>) => void
) => {
  const next = [...draft.references]
  const target = index + delta
  if (!next[index] || target < 0 || target >= next.length) return
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  update({ references: next.map((reference, order) => ({ ...reference, order })) })
}

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
    'button:not(:disabled), textarea:not(:disabled), select:not(:disabled), input:not(:disabled)'
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

const cloneDraft = (draft: ImageOperationDraft): ImageOperationDraft => ({
  ...draft,
  source: { ...draft.source },
  preservationIntents: [...draft.preservationIntents],
  references: draft.references.map(reference => ({ ...reference })),
  ...(draft.region ? { region: { ...draft.region } } : {})
})

const operationWorkbenchConfig = (operation: ImageProductOperation) => {
  if (operation === 'effect-render') return {
    title: '效果图工作台',
    description: '把草图、平面图或参考图转成新的效果图。',
    promptLabel: '效果说明',
    placeholder: '例如：转为暖色棚拍产品效果图，柔和侧光，浅灰背景。',
    limitation: '效果图是模型推断结果；轮廓、文字、Logo 与精确尺寸可能变化。',
    presets: [
      { id: 'product-sketch', label: '产品草图' },
      { id: 'interior-plan', label: '室内平面图' },
      { id: 'industrial-design', label: '工业设计' },
      { id: 'general-render', label: '通用效果图' }
    ],
    preservationOptions: ['主体轮廓', '材质颜色', '构图布局', 'Logo 与文字']
  }
  if (operation === 'outpaint') return {
    title: '扩图工作台',
    description: '调整目标比例并让模型补全画面边界。',
    promptLabel: '扩展要求',
    placeholder: '例如：向左右延展环境，保持主体居中和原有光照。',
    limitation: '扩图会生成新画面内容，不是对源图边缘的确定性恢复。',
    presets: [{ id: 'balanced', label: '自然延展' }, { id: 'scene-context', label: '补充环境' }],
    preservationOptions: ['主体身份', '构图中心', '光照方向', '画面风格']
  }
  if (operation === 'erase') return {
    title: '消除工作台',
    description: '点选目标，并让模型重绘周围背景。',
    promptLabel: '移除内容',
    placeholder: '例如：移除桌面上的水杯，保持桌面纹理连续。',
    limitation: '模型根据上下文重绘背景；复杂遮挡可能需要重试。',
    presets: [{ id: 'context-fill', label: '上下文补全' }],
    preservationOptions: ['区域外内容', '背景纹理', '光照方向']
  }
  if (operation === 'region-redraw') return {
    title: '局部编辑工作台',
    description: '点选要修改的位置，只对目标区域提出指令。',
    promptLabel: '局部修改说明',
    placeholder: '例如：把这里的椅子改成深棕色皮革。',
    limitation: '点选是空间提示，不是像素级硬蒙版；边界可能外溢。',
    presets: [{ id: 'point-guided', label: '点选修改' }],
    preservationOptions: ['区域外内容', '主体身份', '透视关系']
  }
  if (operation === 'text-edit') return {
    title: '图片文字修改',
    description: '点选文字区域并输入准确替换内容。',
    promptLabel: '替换文字',
    placeholder: '例如：将“SUMMER”替换为“盛夏”，保持原排版。',
    limitation: '文字正确性和排版保持尚属实验能力，提交后请人工核对。',
    presets: [{ id: 'layout-preserving', label: '尽量保持排版' }],
    preservationOptions: ['字体风格', '字号比例', '颜色材质', '周围图形']
  }
  if (operation === 'upscale') return {
    title: '画质增强工作台',
    description: '使用生成式高分辨率重绘提升细节。',
    promptLabel: '细节要求',
    placeholder: '例如：增强产品材质和边缘细节，避免改变造型。',
    limitation: '当前是生成式重绘，不是确定性的原生像素放大，细节可能发生变化。',
    presets: [{ id: 'generative-redraw', label: '生成式高清重绘' }],
    preservationOptions: ['主体造型', '构图布局', '材质颜色', '文字 Logo']
  }
  if (operation === 'subject-extract') return {
    title: '主体提取效果图',
    description: '生成主体清晰、背景干净的新图片。',
    promptLabel: '主体说明',
    placeholder: '例如：保留人物和手持产品，背景重绘为纯白。',
    limitation: '当前能力生成纯色背景效果图，不等同于透明通道抠图。',
    presets: [{ id: 'white-background', label: '纯白背景' }, { id: 'neutral-background', label: '中性背景' }],
    preservationOptions: ['主体身份', '轮廓边缘', '服装配饰', '产品细节']
  }
  return {
    title: '参考图创作',
    description: '以当前图片为参考，生成新的创作结果。',
    promptLabel: '生成说明',
    placeholder: '描述希望生成的内容以及需要参考的特征。',
    limitation: '参考意图会写入提示词，但不构成精确身份、Logo、文字或几何保证。',
    presets: [{ id: 'reference-variation', label: '参考变体' }],
    preservationOptions: ['主体身份', '画面风格', '材质颜色', '构图布局']
  }
}
