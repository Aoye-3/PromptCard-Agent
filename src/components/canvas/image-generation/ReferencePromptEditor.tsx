import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent
} from 'react'
import { ImageOff } from 'lucide-react'
import type { PromptDocument } from '@/models/PromptHistory.model'
import type { ConnectedImagePromptReference } from '@/domain/image-generation/prompt-compiler'
import {
  serializePromptDocument
} from './reference-prompt-document'
import {
  promptDocumentEditorText,
  promptDocumentFromEditorUnits,
  promptEditorUnitAt,
  replacePromptEditorRangeWithReference,
  replacePromptEditorRangeWithText,
  type PromptEditorUnit
} from './reference-prompt-editor-model'

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

interface EditorSelection {
  start: number
  end: number
}

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

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
  const editorRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const pendingSelectionRef = useRef<number | null>(null)
  const lastSelectionRef = useRef<number | null>(null)
  const [mentionTarget, setMentionTarget] = useState<MentionTarget | null>(null)
  const serialized = useMemo(() => serializePromptDocument(document), [document])
  const editorText = useMemo(() => promptDocumentEditorText(document), [document])
  const editorProjectionKey = useMemo(() => JSON.stringify(document.segments), [document.segments])
  const orderedReferences = useMemo(() => (
    [...references].sort((left, right) => left.order - right.order)
  ), [references])
  const mentionQuery = mentionTarget
    ? editorText.slice(mentionTarget.start + 1, mentionTarget.end)
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
      const editor = editorRef.current
      const selection = editor
        ? readEditorSelection(editor) ?? { start: editorText.length, end: editorText.length }
        : { start: editorText.length, end: editorText.length }
      onChange(replacePromptEditorRangeWithText(document, selection.start, selection.end, '@'))
      const selectionStart = selection.start
      const caret = selectionStart + 1
      pendingSelectionRef.current = caret
      lastSelectionRef.current = caret
      setMentionTarget({ start: selectionStart, end: caret, activeIndex: 0 })
    },
    focus: () => editorRef.current?.focus()
  }), [document, editorText.length, onChange])

  useClientLayoutEffect(() => {
    const editor = editorRef.current
    const position = pendingSelectionRef.current
      ?? (
        typeof globalThis.document !== 'undefined'
        && globalThis.document.activeElement === editor
          ? lastSelectionRef.current
          : null
      )
    if (position === null) return
    pendingSelectionRef.current = null
    if (!editor) return
    editor.focus()
    restoreEditorSelection(editor, position)
  }, [editorProjectionKey, editorText])

  const updateMentionTarget = (text: string, caret: number) => {
    if (composingRef.current) return
    const trigger = findMentionTrigger(text, caret)
    if (trigger < 0) {
      setMentionTarget(null)
      return
    }
    setMentionTarget({ start: trigger, end: caret, activeIndex: 0 })
  }

  const commitEditor = (editor: HTMLDivElement) => {
    if (composingRef.current) return
    const nextDocument = promptDocumentFromEditor(editor)
    const nextText = promptDocumentEditorText(nextDocument)
    const selection = readEditorSelection(editor)
    const caret = selection?.end ?? nextText.length
    pendingSelectionRef.current = caret
    lastSelectionRef.current = caret
    onChange(nextDocument)
    updateMentionTarget(nextText, caret)
  }

  const changeEditor = (event: FormEvent<HTMLDivElement>) => {
    commitEditor(event.currentTarget)
  }

  const chooseReference = (reference: ConnectedImagePromptReference) => {
    if (!mentionTarget) return
    const next = replacePromptEditorRangeWithReference(
      document,
      mentionTarget.start,
      mentionTarget.end,
      reference
    )
    const caret = mentionTarget.start + 1
    onChange(next)
    setMentionTarget(null)
    pendingSelectionRef.current = caret
    lastSelectionRef.current = caret
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      onSubmitShortcut?.()
      return
    }
    if (mentionTarget) {
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
        return
      }
    }
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    const selection = readEditorSelection(event.currentTarget)
    if (!selection || selection.start !== selection.end) return
    const unitIndex = event.key === 'Backspace' ? selection.start - 1 : selection.start
    if (promptEditorUnitAt(document, unitIndex)?.type !== 'reference') return
    event.preventDefault()
    onChange(replacePromptEditorRangeWithText(document, unitIndex, unitIndex + 1, ''))
    pendingSelectionRef.current = unitIndex
    lastSelectionRef.current = unitIndex
    setMentionTarget(null)
  }

  const handleCompositionStart = (_event: CompositionEvent<HTMLDivElement>) => {
    composingRef.current = true
    setMentionTarget(null)
  }

  const handleCompositionEnd = (event: CompositionEvent<HTMLDivElement>) => {
    composingRef.current = false
    commitEditor(event.currentTarget)
  }

  const pastePlainText = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    const selection = readEditorSelection(event.currentTarget)
      ?? { start: editorText.length, end: editorText.length }
    const nextDocument = replacePromptEditorRangeWithText(
      document,
      selection.start,
      selection.end,
      text
    )
    onChange(nextDocument)
    const caret = selection.start + text.length
    pendingSelectionRef.current = caret
    lastSelectionRef.current = caret
    updateMentionTarget(promptDocumentEditorText(nextDocument), caret)
  }

  const rememberEditorSelection = () => {
    const editor = editorRef.current
    if (!editor) return
    const selection = readEditorSelection(editor)
    if (selection) lastSelectionRef.current = selection.end
  }

  return (
    <section data-reference-prompt-editor className="relative min-h-0 min-w-0 flex-1">
      {editorText.length === 0 && (
        <span className="pointer-events-none absolute left-1 top-1.5 text-[13px] leading-5 text-[#87867f]">
          描述你想生成或修改的图片，输入 @ 引用图片
        </span>
      )}
      <div
        key={editorProjectionKey}
        ref={editorRef}
        role="textbox"
        aria-label="图片描述"
        aria-multiline="true"
        aria-expanded={Boolean(mentionTarget)}
        aria-controls={mentionTarget ? 'image-reference-mention-list' : undefined}
        aria-activedescendant={mentionTarget && filteredReferences.length > 0
          ? `image-reference-option-${filteredReferences[Math.min(mentionTarget.activeIndex, filteredReferences.length - 1)].referenceId}`
          : undefined}
        contentEditable
        suppressContentEditableWarning
        className="nodrag block h-full min-h-14 w-full overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent px-1 py-1.5 text-[13px] leading-6 text-[#141413] outline-none"
        onInput={changeEditor}
        onKeyDown={handleKeyDown}
        onKeyUp={rememberEditorSelection}
        onMouseUp={rememberEditorSelection}
        onFocus={rememberEditorSelection}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onPaste={pastePlainText}
      >
        {document.segments.map((segment, segmentIndex) => {
          if (segment.type === 'text') {
            return (
              <span key={`text-${segmentIndex}`} data-prompt-text>
                {segment.text}
              </span>
            )
          }
          const referenceIndex = orderedReferences.findIndex(
            reference => reference.referenceId === segment.referenceId
          )
          const reference = referenceIndex >= 0 ? orderedReferences[referenceIndex] : null
          const unresolved = unresolvedReferenceIds.includes(segment.referenceId) || !reference
          const roleLabel = reference?.role === 'source-image' ? '主图' : '参考图'
          const accessibleLabel = unresolved
            ? `失效图片引用：${segment.label}`
            : `引用图片：${segment.label}，图${referenceIndex + 1}，${roleLabel}`
          return (
            <span
              key={`reference-${segmentIndex}-${segment.referenceId}`}
              data-reference-token="true"
              data-reference-id={segment.referenceId}
              data-reference-label={segment.label}
              contentEditable={false}
              role="img"
              aria-label={accessibleLabel}
              title={accessibleLabel}
              className={`relative mx-0.5 inline-flex h-6 w-6 select-none items-center justify-center overflow-hidden rounded-md border align-middle ${
                unresolved
                  ? 'border-red-300 bg-red-50 text-red-600'
                  : 'border-[#c96442] bg-[#f9fafb] shadow-[0_0_0_1px_rgba(201,100,66,0.12)]'
              }`}
            >
              {reference?.assetId && !unresolved ? (
                <img
                  src={`/storage-api/assets/${encodeURIComponent(reference.assetId)}`}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageOff size={13} aria-hidden="true" />
              )}
              {!unresolved && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 rounded-tl bg-black/75 px-0.5 text-[7px] font-bold leading-3 text-white"
                >
                  {referenceIndex + 1}
                </span>
              )}
            </span>
          )
        })}
        {document.segments.length === 0 && <br data-empty-editor />}
      </div>

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

const promptDocumentFromEditor = (root: HTMLElement): PromptDocument => {
  const units: PromptEditorUnit[] = []
  const appendText = (text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      units.push({ type: 'text', text: text[index] })
    }
  }
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      appendText(node.textContent || '')
      return
    }
    if (node.nodeType !== 1) return
    const element = node as HTMLElement
    if (element.dataset?.referenceToken === 'true') {
      units.push({
        type: 'reference',
        referenceId: element.dataset.referenceId || '',
        label: element.dataset.referenceLabel || element.dataset.referenceId || ''
      })
      return
    }
    if (element.tagName === 'BR') {
      appendText('\n')
      return
    }
    const block = element.tagName === 'DIV' || element.tagName === 'P'
    const lastUnit = units[units.length - 1]
    if (block && units.length > 0 && (lastUnit.type !== 'text' || lastUnit.text !== '\n')) {
      appendText('\n')
    }
    Array.from(element.childNodes).forEach(visit)
  }
  Array.from(root.childNodes).forEach(visit)
  return promptDocumentFromEditorUnits(units)
}

const readEditorSelection = (root: HTMLElement): EditorSelection | null => {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return null
  const selection = window.getSelection()
  if (!selection?.anchorNode || !selection.focusNode) return null
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null
  const anchor = editorOffsetForDomPoint(root, selection.anchorNode, selection.anchorOffset)
  const focus = editorOffsetForDomPoint(root, selection.focusNode, selection.focusOffset)
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) }
}

const editorOffsetForDomPoint = (root: HTMLElement, target: Node, targetOffset: number): number => {
  let total = 0
  let found = false
  const visit = (node: Node) => {
    if (found) return
    if (node === target) {
      if (node.nodeType === 3) {
        total += Math.min(targetOffset, node.textContent?.length || 0)
      } else {
        Array.from(node.childNodes).slice(0, targetOffset).forEach(child => {
          total += editorNodeLength(child)
        })
      }
      found = true
      return
    }
    if (node.nodeType === 3) {
      total += node.textContent?.length || 0
      return
    }
    if (node.nodeType !== 1) return
    const element = node as HTMLElement
    if (element.dataset?.referenceToken === 'true' || element.tagName === 'BR') {
      total += 1
      return
    }
    Array.from(node.childNodes).forEach(visit)
  }
  Array.from(root.childNodes).forEach(visit)
  return total
}

const editorNodeLength = (node: Node): number => {
  if (node.nodeType === 3) return node.textContent?.length || 0
  if (node.nodeType !== 1) return 0
  const element = node as HTMLElement
  if (element.dataset?.referenceToken === 'true' || element.tagName === 'BR') return 1
  return Array.from(node.childNodes).reduce((total, child) => total + editorNodeLength(child), 0)
}

const restoreEditorSelection = (root: HTMLElement, requestedOffset: number) => {
  if (
    typeof window === 'undefined'
    || typeof window.getSelection !== 'function'
    || typeof globalThis.document === 'undefined'
    || typeof globalThis.document.createRange !== 'function'
  ) return
  const selection = window.getSelection()
  if (!selection) return
  const target = editorDomPointForOffset(root, requestedOffset)
  const range = globalThis.document.createRange()
  range.setStart(target.node, target.offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

const editorDomPointForOffset = (
  root: HTMLElement,
  requestedOffset: number
): { node: Node; offset: number } => {
  let remaining = Math.max(0, requestedOffset)
  let result: { node: Node; offset: number } | null = null
  const visit = (node: Node) => {
    if (result) return
    if (node.nodeType === 3) {
      const length = node.textContent?.length || 0
      if (remaining <= length) {
        result = { node, offset: remaining }
      } else {
        remaining -= length
      }
      return
    }
    if (node.nodeType !== 1) return
    const element = node as HTMLElement
    if (element.dataset?.referenceToken === 'true' || element.tagName === 'BR') {
      const parent = node.parentNode
      if (!parent) return
      const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
      if (remaining === 0) {
        result = { node: parent, offset: index }
      } else if (remaining === 1) {
        result = { node: parent, offset: index + 1 }
      } else {
        remaining -= 1
      }
      return
    }
    Array.from(node.childNodes).forEach(visit)
  }
  Array.from(root.childNodes).forEach(visit)
  return result || { node: root, offset: root.childNodes.length }
}

export default ReferencePromptEditor
