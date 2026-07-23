import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CompositionEvent,
  type KeyboardEvent
} from 'react'
import type { PromptDocument } from '@/models/PromptHistory.model'
import type { ConnectedImagePromptReference } from '@/domain/image-generation/prompt-compiler'
import {
  reconcilePromptDocumentEdit,
  replacePromptRangeWithReference,
  serializePromptDocument
} from './reference-prompt-document'

export interface ReferencePromptEditorHandle {
  openMentionPicker: () => void
  focus: () => void
}

export interface ReferencePromptEditorProps {
  document: PromptDocument
  references: ConnectedImagePromptReference[]
  unresolvedReferenceIds?: string[]
  maxReferences?: number
  onMoveReference?: (referenceId: string, direction: -1 | 1) => void
  onRemoveReference?: (referenceId: string) => void
  canInjectSelectedNodes?: boolean
  selectedNodeCount?: number
  onInjectSelectedNodes?: () => void
  onRequestUpload?: () => void
  onSubmitShortcut?: () => void
  onChange: (document: PromptDocument) => void
}

interface MentionTarget {
  start: number
  end: number
  activeIndex: number
}

export const ReferencePromptEditor = forwardRef<ReferencePromptEditorHandle, ReferencePromptEditorProps>(({
  document,
  references,
  unresolvedReferenceIds = [],
  maxReferences = 10,
  canInjectSelectedNodes = false,
  selectedNodeCount = 0,
  onInjectSelectedNodes,
  onRequestUpload,
  onSubmitShortcut,
  onChange
}, forwardedRef) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const pendingSelectionRef = useRef<number | null>(null)
  const [mentionTarget, setMentionTarget] = useState<MentionTarget | null>(null)
  const serialized = useMemo(() => serializePromptDocument(document), [document])
  const orderedReferences = useMemo(() => (
    [...references].sort((left, right) => left.order - right.order)
  ), [references])
  const mentionQuery = mentionTarget
    ? serialized.text.slice(mentionTarget.start + 1, mentionTarget.end)
    : ''
  const filteredReferences = useMemo(() => {
    const query = mentionQuery.trim().toLocaleLowerCase()
    if (!query) return orderedReferences
    return orderedReferences.filter((reference, index) => (
      reference.label.toLocaleLowerCase().includes(query)
      || `图${index + 1}`.includes(query)
    ))
  }, [mentionQuery, orderedReferences])

  useImperativeHandle(forwardedRef, () => ({
    openMentionPicker: () => {
      const textarea = textareaRef.current
      const selectionStart = textarea?.selectionStart ?? serialized.text.length
      const selectionEnd = textarea?.selectionEnd ?? selectionStart
      const nextText = `${serialized.text.slice(0, selectionStart)}@${serialized.text.slice(selectionEnd)}`
      onChange(reconcilePromptDocumentEdit(document, nextText))
      const caret = selectionStart + 1
      pendingSelectionRef.current = caret
      setMentionTarget({ start: selectionStart, end: caret, activeIndex: 0 })
    },
    focus: () => textareaRef.current?.focus()
  }), [document, onChange, serialized.text])

  useEffect(() => {
    const position = pendingSelectionRef.current
    if (position === null) return
    pendingSelectionRef.current = null
    textareaRef.current?.focus()
    textareaRef.current?.setSelectionRange(position, position)
  }, [serialized.text])

  const updateMentionTarget = (text: string, caret: number, nextDocument: PromptDocument) => {
    if (composingRef.current) return
    const trigger = findMentionTrigger(text, caret)
    if (trigger < 0) {
      setMentionTarget(null)
      return
    }
    const mentions = serializePromptDocument(nextDocument).mentions
    const insideExistingMention = mentions.some(mention => trigger >= mention.start && trigger < mention.end)
    setMentionTarget(insideExistingMention ? null : { start: trigger, end: caret, activeIndex: 0 })
  }

  const changeText = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = event.target.value
    const nextDocument = reconcilePromptDocumentEdit(document, nextText)
    onChange(nextDocument)
    updateMentionTarget(nextText, event.target.selectionStart, nextDocument)
  }

  const chooseReference = (reference: ConnectedImagePromptReference) => {
    if (!mentionTarget) return
    const next = replacePromptRangeWithReference(
      document,
      mentionTarget.start,
      mentionTarget.end,
      reference
    )
    const caret = mentionTarget.start + `@${reference.label}`.length
    onChange(next)
    setMentionTarget(null)
    pendingSelectionRef.current = caret
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      onSubmitShortcut?.()
      return
    }
    if (!mentionTarget) return
    if (event.key === 'Escape') {
      event.preventDefault()
      setMentionTarget(null)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const count = Math.max(1, filteredReferences.length)
      setMentionTarget(current => current
        ? { ...current, activeIndex: (current.activeIndex + direction + count) % count }
        : current)
      return
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && filteredReferences.length > 0) {
      event.preventDefault()
      chooseReference(filteredReferences[Math.min(mentionTarget.activeIndex, filteredReferences.length - 1)])
    }
  }

  const handleCompositionStart = (_event: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = true
    setMentionTarget(null)
  }

  const handleCompositionEnd = (_event: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false
  }

  return (
    <section data-reference-prompt-editor className="relative min-w-0">
      <textarea
        ref={textareaRef}
        aria-label="图片描述"
        aria-expanded={Boolean(mentionTarget)}
        aria-controls={mentionTarget ? 'image-reference-mention-list' : undefined}
        aria-activedescendant={mentionTarget && filteredReferences.length > 0
          ? `image-reference-option-${filteredReferences[Math.min(mentionTarget.activeIndex, filteredReferences.length - 1)].referenceId}`
          : undefined}
        className="nodrag block min-h-14 max-h-32 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-1.5 text-[13px] leading-5 text-[#141413] outline-none placeholder:text-[#87867f]"
        value={serialized.text}
        placeholder="描述你想生成或修改的图片，输入 @ 引用图片"
        onChange={changeText}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />

      {mentionTarget && (
        <div
          id="image-reference-mention-list"
          role="listbox"
          aria-label="选择已添加图片引用"
          className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[min(360px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_20px_55px_rgba(15,23,42,0.16)]"
        >
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="text-[11px] font-bold text-gray-500">引用已添加图片</span>
            <span className="text-[10px] text-gray-400">{references.length}/{maxReferences}</span>
          </div>
          {filteredReferences.length > 0 ? (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {filteredReferences.map((reference, index) => {
                const originalIndex = orderedReferences.findIndex(item => item.referenceId === reference.referenceId)
                const active = index === mentionTarget.activeIndex
                const used = serialized.mentions.some(mention => mention.referenceId === reference.referenceId)
                return (
                  <button
                    id={`image-reference-option-${reference.referenceId}`}
                    key={reference.referenceId}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                      active ? 'bg-cyan-50 text-cyan-950' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => chooseReference(reference)}
                  >
                    {reference.assetId ? (
                      <img
                        src={`/storage-api/assets/${encodeURIComponent(reference.assetId)}`}
                        alt=""
                        className="h-9 w-9 rounded-lg border border-gray-200 object-cover"
                      />
                    ) : (
                      <span className="h-9 w-9 rounded-lg border border-dashed border-gray-300 bg-gray-50" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{reference.label}</span>
                      <span className="mt-0.5 block text-[10px] text-gray-500">
                        图{originalIndex + 1} · {reference.role === 'source-image' ? '主图' : '参考图'}
                        {used ? ' · 已引用' : ''}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : references.length > 0 ? (
            <p className="rounded-xl bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
              没有匹配“{mentionQuery}”的图片
            </p>
          ) : (
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-bold text-gray-800">暂无可引用图片</p>
              <p className="mt-1 text-[11px] leading-5 text-gray-500">先注入画布中的图片节点，或从本地上传参考图。</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  aria-label="注入已选节点"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-gray-700 disabled:opacity-40"
                  disabled={!canInjectSelectedNodes || !onInjectSelectedNodes}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => onInjectSelectedNodes?.()}
                >
                  注入已选节点{selectedNodeCount > 0 ? `（${selectedNodeCount}）` : ''}
                </button>
                <button
                  type="button"
                  aria-label="上传图片"
                  className="rounded-lg bg-gray-950 px-3 py-2 text-[11px] font-bold text-white"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => onRequestUpload?.()}
                >
                  上传图片
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {unresolvedReferenceIds.length > 0 && (
        <div role="alert" className="mt-1 flex flex-wrap gap-1.5">
          <span className="sr-only">Resolve or remove disconnected image references before generating.</span>
          {unresolvedReferenceIds.map(referenceId => {
            const mention = serialized.mentions.find(item => item.referenceId === referenceId)
            return (
              <span
                key={referenceId}
                data-reference-id={referenceId}
                data-unresolved="true"
                className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700"
              >
                失效引用 @{mention?.label || referenceId}
              </span>
            )
          })}
        </div>
      )}
      <div className="sr-only" aria-label="Available image references">
        {orderedReferences.map(reference => (
          <span key={reference.referenceId} data-reference-id={reference.referenceId}>{reference.label}</span>
        ))}
      </div>
    </section>
  )
})

ReferencePromptEditor.displayName = 'ReferencePromptEditor'

const findMentionTrigger = (text: string, caret: number): number => {
  const beforeCaret = text.slice(0, caret)
  for (let index = beforeCaret.length - 1; index >= 0; index -= 1) {
    const character = beforeCaret[index]
    if (character === '@') return index
    if (/[\s，。！？；：,.!?;:()[\]{}<>《》"'“”]/u.test(character)) return -1
  }
  return -1
}

export default ReferencePromptEditor
