import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, Clipboard, Download, ImagePlus, X } from 'lucide-react'
import { emitTo } from '@tauri-apps/api/event'
import { storage } from '@/utils/storage'
import type { RecentCaptureItem } from '@/storage/storage-service-client'
import { notifyRecentCapturesChanged } from '@/features/media/recent-capture-normalization'
import { desktopShellService, type NativeScreenshotSelection } from '@/services/desktop-shell-service'
import { clamp, type SelectionRect } from './capture-selection'
import { importImageCapture } from './image-capture-import'

interface ScreenshotCaptureOverlayProps {
  sessionId: string
  canPlaceOnCanvas: boolean
  activateSelection?: typeof desktopShellService.activateScreenshotSelection
  finishSelection?: typeof desktopShellService.finishScreenshotSelection
  cancelSelection?: typeof desktopShellService.cancelScreenshotSelection
  uploadFile?: typeof storage.assets.upload
  createCapture?: typeof storage.recentCaptures.create
}

type CaptureStatus = 'preparing' | 'selecting' | 'saving' | 'saved' | 'error'

export const ScreenshotCaptureOverlay = ({
  sessionId,
  canPlaceOnCanvas,
  activateSelection = desktopShellService.activateScreenshotSelection,
  finishSelection = desktopShellService.finishScreenshotSelection,
  cancelSelection = desktopShellService.cancelScreenshotSelection,
  uploadFile = storage.assets.upload,
  createCapture = storage.recentCaptures.create
}: ScreenshotCaptureOverlayProps) => {
  const frameRef = useRef<HTMLDivElement>(null)
  const activationStartedRef = useRef(false)
  const [status, setStatus] = useState<CaptureStatus>('preparing')
  const [errorMessage, setErrorMessage] = useState('')
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [lastBlob, setLastBlob] = useState<Blob | null>(null)
  const [lastCapture, setLastCapture] = useState<RecentCaptureItem | null>(null)

  const normalizedSelection = useMemo(() => selection ? normalizeSelection(selection) : null, [selection])

  useEffect(() => {
    if (activationStartedRef.current) return
    activationStartedRef.current = true
    void activateSelection(sessionId)
      .then(() => setStatus('selecting'))
      .catch(async error => {
        setErrorMessage(error instanceof Error ? error.message : '无法启动截图，请重试。')
        setStatus('error')
        try {
          await cancelSelection(sessionId)
        } catch {
          // Native activation already performs best-effort cleanup.
        }
      })
  }, [activateSelection, cancelSelection, sessionId])

  const closeSelection = async () => {
    try {
      await cancelSelection(sessionId)
    } catch {
      setErrorMessage('无法关闭截图选择。')
      setStatus('error')
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void closeSelection()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const updateSelection = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart || !frameRef.current) return
    const point = pointerInFrame(event, frameRef.current)
    setSelection({ x: dragStart.x, y: dragStart.y, width: point.x - dragStart.x, height: point.y - dragStart.y })
  }

  const finishDrag = async (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragStart || !frameRef.current) return
    const point = pointerInFrame(event, frameRef.current)
    const rect = normalizeSelection({ x: dragStart.x, y: dragStart.y, width: point.x - dragStart.x, height: point.y - dragStart.y })
    setDragStart(null)
    setSelection(rect)
    if (rect.width < 8 || rect.height < 8) {
      setErrorMessage('请拖拽一个更大的截图区域。')
      await closeSelection()
      return
    }
    await saveSelection(rect)
  }

  const saveSelection = async (rect: SelectionRect) => {
    if (!frameRef.current) return
    try {
      setStatus('saving')
      setErrorMessage('')
      const nativeSelection: NativeScreenshotSelection = {
        ...rect,
        surfaceWidth: frameRef.current.clientWidth,
        surfaceHeight: frameRef.current.clientHeight
      }
      const result = await finishSelection(sessionId, nativeSelection)
      const blob = await dataUrlToBlob(result.dataUrl)
      const file = new File([blob], result.filename, { type: 'image/png' })
      const capture = await importImageCapture({
        file,
        kind: 'screenshot',
        sourcePlatform: 'Floating toolbar',
        width: result.width,
        height: result.height,
        capturedAt: result.capturedAt,
        origin: result.origin
      }, {
        upload: uploadFile,
        create: createCapture,
        dimensions: async () => ({ width: result.width, height: result.height }),
        notify: notifyRecentCapturesChanged
      })
      setLastBlob(blob)
      setLastCapture(capture)
      setStatus('saved')
      await emitTo('main', 'capture:created', { capture })
    } catch {
      setErrorMessage('截图无法保存。')
      setStatus('error')
    }
  }

  const copyLastCapture = async () => {
    if (!lastBlob || !('ClipboardItem' in window)) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': lastBlob })])
    } catch {
      setErrorMessage('截图无法复制。')
      setStatus('error')
    }
  }

  const saveLastCaptureLocally = () => {
    if (!lastBlob) return
    const url = URL.createObjectURL(lastBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = lastCapture?.title ? `${lastCapture.title}.png` : 'screenshot.png'
    link.click()
    URL.revokeObjectURL(url)
  }

  const placeLastCaptureOnCanvas = async () => {
    if (!lastCapture || !canPlaceOnCanvas) return
    await emitTo('main', 'capture:place-on-canvas', { capture: lastCapture })
  }

  const completeSelection = async () => {
    if (lastCapture) await emitTo('main', 'capture:completed', { capture: lastCapture })
    await closeSelection()
  }

  return (
    <div ref={frameRef} className="fixed inset-0 overflow-hidden bg-transparent text-white" data-screenshot-capture-overlay data-capture-status={status}>
      {status === 'preparing' && <div className="absolute inset-0 z-0 bg-slate-950/35" />}
      {status === 'selecting' && (
        <button
          type="button"
          className="absolute inset-0 z-0 cursor-crosshair border-0 bg-slate-950/35 p-0"
          aria-label="Select screenshot region"
          onPointerDown={event => {
            if (!frameRef.current) return
            event.currentTarget.setPointerCapture(event.pointerId)
            const point = pointerInFrame(event, frameRef.current)
            setDragStart(point)
            setSelection({ x: point.x, y: point.y, width: 0, height: 0 })
          }}
          onPointerMove={updateSelection}
          onPointerUp={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
            void finishDrag(event)
          }}
        />
      )}
      {normalizedSelection && (
        <div
          className="pointer-events-none absolute z-10 border-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]"
          style={{ left: normalizedSelection.x, top: normalizedSelection.y, width: normalizedSelection.width, height: normalizedSelection.height }}
        />
      )}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-lg bg-gray-950/80 px-3 py-2 text-xs font-bold text-white shadow-lg">
        {status === 'saved' ? <Check className="h-4 w-4 text-emerald-300" /> : null}
        {status === 'saved'
          ? '已保存到近期捕获'
          : status === 'saving'
            ? '正在保存截图…'
            : status === 'preparing'
              ? '正在准备截图…'
              : status === 'error'
                ? errorMessage
                : '按住鼠标拖拽，选择截图区域；按 Esc 取消'}
      </div>
      <button
        type="button"
        className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-950/80 text-white shadow-lg hover:bg-gray-900"
        aria-label="Close screenshot capture"
        onClick={() => void closeSelection()}
      >
        <X className="h-4 w-4" />
      </button>
      {status === 'saved' && lastCapture && (
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-white px-3 py-2 text-gray-950 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <CaptureAction icon={<Clipboard className="h-4 w-4" />} label="Copy" onClick={() => void copyLastCapture()} disabled={!lastBlob || !('ClipboardItem' in window)} />
          <CaptureAction icon={<Download className="h-4 w-4" />} label="Save local" onClick={saveLastCaptureLocally} disabled={!lastBlob} />
          <CaptureAction icon={<ImagePlus className="h-4 w-4" />} label="Canvas" onClick={() => void placeLastCaptureOnCanvas()} disabled={!canPlaceOnCanvas} />
          <CaptureAction icon={<Check className="h-4 w-4" />} label="Done" onClick={() => void completeSelection()} />
        </div>
      )}
    </div>
  )
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error('Native screenshot payload is invalid.')
  return response.blob()
}

const pointerInFrame = (event: ReactPointerEvent, frame: HTMLDivElement) => {
  const rect = frame.getBoundingClientRect()
  return { x: clamp(event.clientX - rect.left, 0, rect.width), y: clamp(event.clientY - rect.top, 0, rect.height) }
}

const normalizeSelection = (selection: SelectionRect): SelectionRect => ({
  x: Math.min(selection.x, selection.x + selection.width),
  y: Math.min(selection.y, selection.y + selection.height),
  width: Math.abs(selection.width),
  height: Math.abs(selection.height)
})

const CaptureAction = ({ icon, label, disabled = false, onClick }: { icon: JSX.Element; label: string; disabled?: boolean; onClick: () => void }) => (
  <button type="button" disabled={disabled} className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-black text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300" onClick={onClick}>
    {icon}
    {label}
  </button>
)
