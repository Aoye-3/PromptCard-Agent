import { useState } from 'react'
import { Image as ImageIcon, Library, X } from 'lucide-react'
import type { CardType } from '@/models/Card.model'
import type { RecentCaptureRegistrationResult } from '@/storage/storage-service-client'
import { storage } from '@/utils/storage'
import type { RecentCaptureItemViewModel } from './media-types'
import {
  buildRecentCaptureRegistrationRequest,
  defaultMergedPromptType,
  defaultPromptTypeForRole,
  type RegistrationPromptFields
} from './recent-capture-registration'

interface RecentCaptureRegistrationDialogProps {
  captures: RecentCaptureItemViewModel[]
  onClose: () => void
  onRegistered: (result: RecentCaptureRegistrationResult) => void | Promise<void>
}

const promptTypes: CardType[] = ['subject', 'action', 'scene', 'style', 'camera', 'lighting', 'timing', 'audio', 'constraint', 'custom']

export const RecentCaptureRegistrationDialog = ({ captures, onClose, onRegistered }: RecentCaptureRegistrationDialogProps) => {
  const [mode, setMode] = useState<'separate' | 'merged'>('separate')
  const [separatePrompts, setSeparatePrompts] = useState<RegistrationPromptFields[]>(() => captures.map(capture => ({
    label: capture.title,
    content: capture.prompt,
    type: defaultPromptTypeForRole(capture.role)
  })))
  const [mergedPrompt, setMergedPrompt] = useState<RegistrationPromptFields>({
    label: `素材组（${captures.length} 项）`,
    content: '',
    type: defaultMergedPromptType(captures)
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const updateSeparatePrompt = (index: number, updates: Partial<RegistrationPromptFields>) => {
    setSeparatePrompts(current => current.map((fields, candidate) => candidate === index ? { ...fields, ...updates } : fields))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const request = buildRecentCaptureRegistrationRequest(captures, mode, separatePrompts, mergedPrompt)
      setSubmitting(true)
      await onRegistered(await storage.recentCaptures.registerToPromptLibrary(request))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '注册失败。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 px-4 py-6" data-recent-capture-registration>
      <form onSubmit={submit} className="flex max-h-[calc(100vh-48px)] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-gray-400"><Library className="h-4 w-4" /> Prompt Library</div>
            <h2 className="mt-1 text-xl font-black text-gray-950">注册近期捕获</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">最终写入 {captures.length} 个媒体；资产文件不会重复上传。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭注册窗口" className="rounded-full bg-gray-100 p-2 text-gray-500"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {captures.length > 1 && (
            <div className="mb-5 grid gap-2 sm:grid-cols-2">
              <ModeButton active={mode === 'separate'} label="每项一个 Prompt" description={`创建 ${captures.length} 个 Prompt`} onClick={() => setMode('separate')} />
              <ModeButton active={mode === 'merged'} label="合并为一个 Prompt" description="全部媒体写入同一个 Prompt" onClick={() => setMode('merged')} />
            </div>
          )}

          <div className="grid gap-4">
            {mode === 'separate' ? captures.map((capture, index) => (
              <PromptEditor
                key={capture.id}
                capture={capture}
                fields={separatePrompts[index]}
                onChange={updates => updateSeparatePrompt(index, updates)}
              />
            )) : (
              <div className="grid gap-4 rounded-lg border border-gray-200 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <CaptureStrip captures={captures} />
                <Fields fields={mergedPrompt} onChange={updates => setMergedPrompt(current => ({ ...current, ...updates }))} />
              </div>
            )}
          </div>
          {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-red-700" role="alert">{error}</p>}
        </div>

        <footer className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-5 py-2.5 text-sm font-black text-gray-700">取消</button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-black text-white disabled:bg-gray-300">
            {submitting ? '注册中...' : '注册到 Prompt Library'}
          </button>
        </footer>
      </form>
    </div>
  )
}

const PromptEditor = ({ capture, fields, onChange }: { capture: RecentCaptureItemViewModel; fields: RegistrationPromptFields; onChange: (updates: Partial<RegistrationPromptFields>) => void }) => (
  <div className="grid gap-4 rounded-lg border border-gray-200 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <CaptureCard capture={capture} />
    <Fields fields={fields} onChange={onChange} />
  </div>
)

const CaptureStrip = ({ captures }: { captures: RecentCaptureItemViewModel[] }) => (
  <div className="grid grid-cols-2 gap-2">
    {captures.map(capture => <CaptureCard key={capture.id} capture={capture} compact />)}
  </div>
)

const CaptureCard = ({ capture, compact = false }: { capture: RecentCaptureItemViewModel; compact?: boolean }) => (
  <figure className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
    {capture.kind === 'screenRecording' ? (
      <video src={storage.assets.url(capture.assetId)} controls className={`${compact ? 'h-24' : 'h-36'} w-full bg-gray-950 object-contain`} />
    ) : (
      <img src={storage.assets.url(capture.assetId)} alt={capture.title} className={`${compact ? 'h-24' : 'h-36'} w-full bg-gray-950 object-contain`} />
    )}
    <figcaption className="flex items-center gap-2 px-3 py-2 text-xs font-black text-gray-700"><ImageIcon className="h-3.5 w-3.5" /><span className="truncate">{capture.title}</span></figcaption>
  </figure>
)

const Fields = ({ fields, onChange }: { fields: RegistrationPromptFields; onChange: (updates: Partial<RegistrationPromptFields>) => void }) => (
  <div className="grid gap-3">
    <label className="text-xs font-black text-gray-600">名称<input required value={fields.label} onChange={event => onChange({ label: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-950" /></label>
    <label className="text-xs font-black text-gray-600">类型<select value={fields.type} onChange={event => onChange({ type: event.target.value as CardType })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-950">{promptTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
    <label className="text-xs font-black text-gray-600">Prompt 内容<textarea required rows={4} value={fields.content} onChange={event => onChange({ content: event.target.value })} className="mt-1 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm leading-6 text-gray-950" /></label>
  </div>
)

const ModeButton = ({ active, label, description, onClick }: { active: boolean; label: string; description: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={`rounded-lg border p-4 text-left ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
    <div className="text-sm font-black text-gray-950">{label}</div><div className="mt-1 text-xs font-semibold text-gray-500">{description}</div>
  </button>
)
