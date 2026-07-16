import { History, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ImageGenerationTurnCard } from './ImageGenerationTurnCard'
import type { ImageGenerationHistoryDialogProps } from './types'

export const ImageGenerationHistoryDialog = ({
  open,
  conversations,
  initialConversationId,
  onClose,
  onContinue,
  onSelectConversation,
  onLoadMoreConversations,
  onLoadMoreRuns,
  hasMoreConversations = false,
  hasMoreRuns
}: ImageGenerationHistoryDialogProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<{ focus?: () => void } | null>(null)
  const loadedSelectionRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = typeof document !== 'undefined'
      ? document.activeElement as { focus?: () => void } | null
      : null
    setSelectedId(current => (
      conversations.some(item => item.id === current)
        ? current
        : initialConversationId || conversations[0]?.id || null
    ))
    closeRef.current?.focus()
    return () => returnFocusRef.current?.focus?.()
  }, [conversations, initialConversationId, open])

  useEffect(() => {
    if (!open) {
      loadedSelectionRef.current = null
      return
    }
    if (!selectedId || loadedSelectionRef.current === selectedId) return
    loadedSelectionRef.current = selectedId
    onSelectConversation?.(selectedId)
  }, [onSelectConversation, open, selectedId])

  if (!open) return null
  const selected = conversations.find(item => item.id === selectedId) || conversations[0]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]'
    ) || [])
    if (focusable.length < 2) return
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

  const continueConversation = () => {
    if (!selected) return
    onContinue(selected.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={true}
        aria-labelledby="image-history-title"
        className="grid max-h-[85vh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:grid-cols-[16rem_1fr]"
        onKeyDown={onKeyDown}
      >
        <aside className="border-b border-gray-200 bg-gray-50 p-3 md:border-b-0 md:border-r">
          <div className="mb-3 flex items-center gap-2">
            <History size={17} aria-hidden="true" />
            <h2 id="image-history-title" className="text-sm font-black text-gray-950">项目生成历史</h2>
          </div>
          <nav aria-label="图片生成会话" className="max-h-56 space-y-1 overflow-y-auto md:max-h-[65vh]">
            {conversations.map(conversation => (
              <button
                key={conversation.id}
                type="button"
                aria-label={`打开会话 ${conversation.title}`}
                aria-current={selected?.id === conversation.id ? 'true' : undefined}
                className={`w-full justify-start rounded-lg px-3 py-2 text-left text-sm font-bold ${
                  selected?.id === conversation.id ? 'bg-gray-950 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
                onClick={() => {
                  setSelectedId(conversation.id)
                }}
              >
                <span className="flex items-center gap-2">
                  {conversation.turns.slice().reverse().find(turn => turn.result)?.result && (
                    <img
                      src={conversation.turns.slice().reverse().find(turn => turn.result)!.result!.imageUrl}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                  )}
                  <span className="min-w-0 truncate">{conversation.title}</span>
                </span>
              </button>
            ))}
            {conversations.length === 0 && <p className="px-2 py-4 text-xs text-gray-500">该项目暂无生成会话。</p>}
            {hasMoreConversations && onLoadMoreConversations && (
              <button
                type="button"
                aria-label="加载更多图片生成会话"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700"
                onClick={onLoadMoreConversations}
              >
                加载更多
              </button>
            )}
          </nav>
        </aside>

        <section className="flex min-h-0 flex-col" aria-label="历史会话内容">
          <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-black text-gray-950">{selected?.title || '选择一个会话'}</h3>
              {selected && <p className="text-xs text-gray-500">{selected.turns.length} 次生成</p>}
            </div>
            <button ref={closeRef} type="button" aria-label="关闭历史记录" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" onClick={onClose}>
              <X size={17} aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {selected?.turns.map(turn => <ImageGenerationTurnCard key={turn.id} turn={turn} compact />)}
            {selected && selected.turns.length === 0 && <p className="py-10 text-center text-sm text-gray-500">此会话还没有生成记录。</p>}
            {selected && hasMoreRuns?.(selected.id) && onLoadMoreRuns && (
              <button
                type="button"
                aria-label="加载更多当前会话记录"
                className="mx-auto mb-4 block rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700"
                onClick={() => onLoadMoreRuns(selected.id)}
              >
                加载更多
              </button>
            )}
          </div>
          <footer className="flex justify-end border-t border-gray-200 p-3">
            <button
              type="button"
              className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-bold text-white disabled:bg-gray-300"
              disabled={!selected}
              onClick={continueConversation}
            >
              继续此会话
            </button>
          </footer>
        </section>
      </div>
    </div>
  )
}

export default ImageGenerationHistoryDialog
