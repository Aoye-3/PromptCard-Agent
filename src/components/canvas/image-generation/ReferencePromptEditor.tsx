import type { ChangeEvent } from 'react'
import type { PromptDocument, PromptSegment } from '@/models/PromptHistory.model'
import type { ConnectedImagePromptReference } from '@/domain/image-generation/prompt-compiler'

export interface ReferencePromptEditorProps {
  document: PromptDocument
  references: ConnectedImagePromptReference[]
  unresolvedReferenceIds?: string[]
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

export const ReferencePromptEditor = ({
  document,
  references,
  unresolvedReferenceIds = [],
  onChange
}: ReferencePromptEditorProps) => {
  const unresolved = new Set(unresolvedReferenceIds)
  const referenceById = new Map(references.map(reference => [reference.referenceId, reference]))

  const addReference = (event: ChangeEvent<HTMLSelectElement>) => {
    const reference = referenceById.get(event.target.value)
    if (reference) onChange(insertPromptReference(document, reference))
    event.target.value = ''
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

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="text-xs font-bold text-gray-700">
          <span className="sr-only">Add connected image reference</span>
          <select
            className="nodrag w-full rounded-[6px] border border-gray-200 bg-white px-3 py-2 text-xs"
            defaultValue=""
            onChange={addReference}
          >
            <option value="">@ Add connected image…</option>
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
