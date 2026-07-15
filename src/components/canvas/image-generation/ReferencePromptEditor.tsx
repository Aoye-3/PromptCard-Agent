import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { PromptDocument, PromptSegment } from '@/models/PromptHistory.model'
import type { ConnectedImagePromptReference } from '@/domain/image-generation/prompt-compiler'

export interface ReferencePromptEditorProps {
  document: PromptDocument
  references: ConnectedImagePromptReference[]
  unresolvedReferenceIds?: string[]
  maxReferences?: number
  onMoveReference?: (referenceId: string, direction: -1 | 1) => void
  onRemoveReference?: (referenceId: string) => void
  onChange: (document: PromptDocument) => void
}

export const insertPromptReference = (
  document: PromptDocument,
  reference: Pick<ConnectedImagePromptReference, 'referenceId' | 'label'>
): PromptDocument => ({
  version: 1,
  segments: [
    ...cloneSegments(document.segments),
    { type: 'reference', referenceId: reference.referenceId, label: reference.label }
  ]
})

export const replacePromptTextSegment = (
  document: PromptDocument,
  segmentIndex: number,
  text: string
): PromptDocument => ({
  version: 1,
  segments: document.segments.map((segment, index) => index === segmentIndex && segment.type === 'text'
    ? { type: 'text', text }
    : cloneSegment(segment))
})

export const insertPromptReferenceAtTextCursor = (
  document: PromptDocument,
  segmentIndex: number,
  cursor: number,
  reference: Pick<ConnectedImagePromptReference, 'referenceId' | 'label'>
): PromptDocument => {
  const segment = document.segments[segmentIndex]
  if (!segment || segment.type !== 'text') return insertPromptReference(document, reference)
  const before = segment.text.slice(0, Math.max(0, cursor - 1))
  const after = segment.text.slice(cursor)
  return {
    version: 1,
    segments: [
      ...cloneSegments(document.segments.slice(0, segmentIndex)),
      ...(before ? [{ type: 'text' as const, text: before }] : []),
      { type: 'reference', referenceId: reference.referenceId, label: reference.label },
      ...(after ? [{ type: 'text' as const, text: after }] : []),
      ...cloneSegments(document.segments.slice(segmentIndex + 1))
    ]
  }
}

export const ReferencePromptEditor = ({
  document,
  references,
  unresolvedReferenceIds = [],
  maxReferences = 10,
  onMoveReference,
  onRemoveReference,
  onChange
}: ReferencePromptEditorProps) => {
  const [mentionTarget, setMentionTarget] = useState<{ segmentIndex: number; cursor: number } | null>(null)
  const unresolved = new Set(unresolvedReferenceIds)
  const referenceById = new Map(references.map(reference => [reference.referenceId, reference]))

  const addReference = (event: ChangeEvent<HTMLSelectElement>) => {
    const reference = referenceById.get(event.target.value)
    if (reference) {
      onChange(mentionTarget
        ? insertPromptReferenceAtTextCursor(document, mentionTarget.segmentIndex, mentionTarget.cursor, reference)
        : insertPromptReference(document, reference))
    }
    setMentionTarget(null)
    event.target.value = ''
  }

  const watchMention = (segmentIndex: number, event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== '@') return
    setMentionTarget({ segmentIndex, cursor: event.currentTarget.selectionStart + 1 })
  }

  const removeSegment = (segmentIndex: number) => {
    onChange({
      version: 1,
      segments: document.segments
        .filter((_segment, index) => index !== segmentIndex)
        .map(cloneSegment)
    })
  }

  const addTextSegment = () => onChange({
    version: 1,
    segments: [...cloneSegments(document.segments), { type: 'text', text: '' }]
  })

  return (
    <section data-reference-prompt-editor className="space-y-3">
      <div className="space-y-2" aria-label="Structured prompt segments">
        {document.segments.length === 0 && (
          <textarea
            aria-label="Prompt text"
            className="nodrag min-h-20 w-full resize-y rounded-[6px] border border-gray-200 px-3 py-2 text-sm leading-5 outline-none focus:border-sky-500"
            value=""
            placeholder="Describe the image"
            onChange={event => onChange({
              version: 1,
              segments: [{ type: 'text', text: event.target.value }]
            })}
          />
        )}

        {document.segments.map((segment, segmentIndex) => segment.type === 'text' ? (
          <textarea
            key={`text-${segmentIndex}`}
            aria-label={`Prompt text ${segmentIndex + 1}`}
            className="nodrag min-h-16 w-full resize-y rounded-[6px] border border-gray-200 px-3 py-2 text-sm leading-5 outline-none focus:border-sky-500"
            value={segment.text}
            onChange={event => onChange(replacePromptTextSegment(document, segmentIndex, event.target.value))}
            onKeyDown={event => watchMention(segmentIndex, event)}
          />
        ) : (
          <div
            key={`reference-${segmentIndex}`}
            data-reference-id={segment.referenceId}
            data-unresolved={unresolved.has(segment.referenceId)}
            className={`flex items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-xs font-bold ${
              unresolved.has(segment.referenceId)
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-sky-200 bg-sky-50 text-sky-800'
            }`}
          >
            <span>@{referenceById.get(segment.referenceId)?.label || segment.label}</span>
            <button
              type="button"
              className="rounded px-1 text-current hover:bg-black/5"
              aria-label={`Remove ${segment.label} reference`}
              onClick={() => removeSegment(segmentIndex)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {unresolvedReferenceIds.length > 0 && (
        <p role="alert" className="text-xs font-semibold text-red-700">
          Resolve or remove disconnected image references before generating.
        </p>
      )}

      {references.length > 0 && (
        <div className="space-y-2 rounded-[6px] border border-gray-200 p-2" aria-label="参考图列表">
          <p className="text-xs font-black text-gray-800">参考图 {references.length}/{maxReferences}</p>
          {references.map((reference, index) => {
            const used = document.segments.some(segment => segment.type === 'reference' && segment.referenceId === reference.referenceId)
            return (
              <div key={reference.referenceId} data-reference-list-id={reference.referenceId} className="flex items-center gap-2 text-xs">
                <span className="font-black text-gray-950">图{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-gray-700">{reference.label}</span>
                <span className="text-[10px] text-gray-500">{used ? '已在提示词中使用' : '未使用'}</span>
                <button type="button" aria-label={`上移 ${reference.label}`} disabled={index === 0 || !onMoveReference} onClick={() => onMoveReference?.(reference.referenceId, -1)}>↑</button>
                <button type="button" aria-label={`下移 ${reference.label}`} disabled={index === references.length - 1 || !onMoveReference} onClick={() => onMoveReference?.(reference.referenceId, 1)}>↓</button>
                <button type="button" aria-label={`删除 ${reference.label}`} disabled={!onRemoveReference} onClick={() => onRemoveReference?.(reference.referenceId)}>删除</button>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="text-xs font-bold text-gray-700">
          <span className="sr-only">Add connected image reference</span>
          <select
            className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-3 py-2 text-xs"
            defaultValue=""
            onChange={addReference}
          >
            <option value="">{mentionTarget ? '@ 选择参考图' : '@ Add connected image…'}</option>
            {references.map(reference => (
              <option key={reference.referenceId} value={reference.referenceId} disabled={!reference.assetId}>
                {reference.label} · {reference.role}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded-[6px] border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
          onClick={addTextSegment}
        >
          Add text
        </button>
      </div>
    </section>
  )
}

const cloneSegments = (segments: PromptSegment[]): PromptSegment[] => segments.map(cloneSegment)

const cloneSegment = (segment: PromptSegment): PromptSegment => segment.type === 'text'
  ? { type: 'text', text: segment.text }
  : { type: 'reference', referenceId: segment.referenceId, label: segment.label }

export default ReferencePromptEditor
