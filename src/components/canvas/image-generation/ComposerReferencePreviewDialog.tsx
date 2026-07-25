import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { trapFocusWithinDialog } from './dialog-focus'

interface ComposerReferencePreviewDialogProps {
  imageUrl: string
  label: string
  imageNumber: number
  onClose: () => void
}

export const ComposerReferencePreviewDialog = ({
  imageUrl,
  label,
  imageNumber,
  onClose
}: ComposerReferencePreviewDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previousFocusRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/65 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={true}
        aria-labelledby="composer-reference-preview-title"
        className="flex max-h-[calc(100vh-32px)] w-full max-w-5xl flex-col overflow-hidden rounded-[20px] border border-white/15 bg-[#141413] shadow-[0_32px_100px_rgba(0,0,0,0.48)]"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
            return
          }
          trapFocusWithinDialog(event, event.currentTarget)
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">图{imageNumber}</p>
            <h2 id="composer-reference-preview-title" className="truncate text-sm font-bold">{label}</h2>
          </div>
          <button
            type="button"
            aria-label={`关闭${label}预览`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center p-3">
          <img
            src={imageUrl}
            alt={`${label}完整预览`}
            className="max-h-[calc(100vh-116px)] max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  )
}
