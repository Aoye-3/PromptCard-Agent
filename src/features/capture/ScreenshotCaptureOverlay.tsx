import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, Clipboard, Download, ImagePlus, X } from 'lucide-react'
import { storage } from '@/utils/storage'
import type { RecentCaptureItem } from '@/storage/storage-service-client'
import { createScreenshotCaptureDraft, notifyRecentCapturesChanged } from '@/features/media/recent-capture-normalization'

interface ScreenshotCaptureOverlayProps {
  onClose: () => void
  onCaptureCreated?: (capture: RecentCaptureItem) => void
  canPlaceOnCanvas?: boolean
  onPlaceOnCanvas?: (capture: RecentCaptureItem) => void
  startScreenCapture?: () => Promise<MediaStream>
  uploadFile?: typeof storage.assets.upload
  createCapture?: typeof storage.recentCaptures.create
}

type SelectionRect = { x: number; y: number; width: number; height: number }
type CaptureStatus = 'starting' | 'selecting' | 'saving' | 'saved' | 'error'

export const ScreenshotCaptureOverlay = ({
  onClose,
  onCaptureCreated,
  canPlaceOnCanvas = false,
  onPlaceOnCanvas,
  startScreenCapture = defaultStartScreenCapture,
  uploadFile = storage.assets.upload,
  createCapture = storage.recentCaptures.create
}: ScreenshotCaptureOverlayProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<CaptureStatus>('starting')
  const [errorMessage, setErrorMessage] = useState('')
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [selection, setSelection] = useState<SelectionRect | null>(null)
  const [lastBlob, setLastBlob] = useState<Blob | null>(null)
  const [lastCapture, setLastCapture] = useState<RecentCaptureItem | null>(null)

  useEffect(() => {
    let cancelled = false
    startScreenCapture()
      .then(nextStream => {
        if (cancelled) {
          stopStream(nextStream)
          return
        }
        setStream(nextStream)
        setStatus('selecting')
      })
      .catch(error => {
        console.error('Failed to start screenshot capture:', error)
        setErrorMessage('Screen capture permission was denied or is unavailable.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [startScreenCapture])

  useEffect(() => {
    if (!videoRef.current || !stream) return
    videoRef.current.srcObject = stream
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [stream])

  useEffect(() => () => {
    if (stream) stopStream(stream)
  }, [stream])

  const normalizedSelection = useMemo(() => {
    if (!selection) return null
    return normalizeSelection(selection)
  }, [selection])

  const updateSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart || !frameRef.current) return
    const point = pointerInFrame(event, frameRef.current)
    setSelection({
      x: dragStart.x,
      y: dragStart.y,
      width: point.x - dragStart.x,
      height: point.y - dragStart.y
    })
  }

  const finishSelection = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart || !frameRef.current || !videoRef.current) return
    updateSelection(event)
    setDragStart(null)
    const rect = normalizeSelection({
      x: dragStart.x,
      y: dragStart.y,
      width: pointerInFrame(event, frameRef.current).x - dragStart.x,
      height: pointerInFrame(event, frameRef.current).y - dragStart.y
    })
    if (rect.width < 8 || rect.height < 8) return
    await saveSelection(videoRef.current, frameRef.current, rect)
  }

  const saveSelection = async (video: HTMLVideoElement, frame: HTMLDivElement, rect: SelectionRect) => {
    try {
      setStatus('saving')
      const crop = mapSelectionToVideoCrop(rect, {
        width: frame.clientWidth,
        height: frame.clientHeight
      }, {
        width: video.videoWidth,
        height: video.videoHeight
      })
      const blob = await captureVideoCrop(video, crop)
      const capturedAt = Date.now()
      const filename = `screenshot-${new Date(capturedAt).toISOString().replace(/[:.]/g, '-')}.png`
      const file = new File([blob], filename, { type: 'image/png' })
      const asset = await uploadFile(file)
      const capture = await createCapture(createScreenshotCaptureDraft({
        assetId: asset.id,
        filename,
        size: asset.size,
        width: crop.width,
        height: crop.height,
        capturedAt,
        selection: crop
      }))
      setLastBlob(blob)
      setLastCapture(capture)
      setStatus('saved')
      notifyRecentCapturesChanged()
      onCaptureCreated?.(capture)
      if (stream) stopStream(stream)
    } catch (error) {
      console.error('Failed to save screenshot capture:', error)
      setErrorMessage('Screenshot could not be saved.')
      setStatus('error')
    }
  }

  const copyLastCapture = async () => {
    if (!lastBlob || !('ClipboardItem' in window)) return
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': lastBlob })])
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

  return (
    <div className="fixed inset-0 z-[120] bg-gray-950 text-white" data-screenshot-capture-overlay>
      <div ref={frameRef} className="relative h-full w-full overflow-hidden" onPointerMove={updateSelection} onPointerUp={finishSelection}>
        {stream ? (
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full select-none object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-white/70">
            {status === 'error' ? errorMessage : 'Starting screen capture...'}
          </div>
        )}
        {status === 'selecting' && (
          <button
            type="button"
            className="absolute inset-0 cursor-crosshair border-0 bg-transparent p-0"
            aria-label="Select screenshot region"
            onPointerDown={event => {
              if (!frameRef.current) return
              const point = pointerInFrame(event, frameRef.current)
              setDragStart(point)
              setSelection({ x: point.x, y: point.y, width: 0, height: 0 })
            }}
          />
        )}
        {normalizedSelection && (
          <div
            className="pointer-events-none absolute border-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]"
            style={{
              left: normalizedSelection.x,
              top: normalizedSelection.y,
              width: normalizedSelection.width,
              height: normalizedSelection.height
            }}
          />
        )}
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-gray-950/80 px-3 py-2 text-xs font-bold text-white shadow-lg">
          {status === 'saved' ? <Check className="h-4 w-4 text-emerald-300" /> : null}
          {status === 'saved' ? 'Saved to Recent Captures' : status === 'saving' ? 'Saving screenshot...' : 'Drag to select a screenshot region'}
        </div>
        <button
          type="button"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-950/80 text-white shadow-lg hover:bg-gray-900"
          aria-label="Close screenshot capture"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        {status === 'saved' && lastCapture && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-white px-3 py-2 text-gray-950 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
            <CaptureAction icon={<Clipboard className="h-4 w-4" />} label="Copy" onClick={copyLastCapture} disabled={!lastBlob || !('ClipboardItem' in window)} />
            <CaptureAction icon={<Download className="h-4 w-4" />} label="Save local" onClick={saveLastCaptureLocally} disabled={!lastBlob} />
            <CaptureAction icon={<ImagePlus className="h-4 w-4" />} label="Canvas" onClick={() => onPlaceOnCanvas?.(lastCapture)} disabled={!canPlaceOnCanvas || !onPlaceOnCanvas} />
            <CaptureAction icon={<Check className="h-4 w-4" />} label="Done" onClick={onClose} />
          </div>
        )}
      </div>
    </div>
  )
}

export const mapSelectionToVideoCrop = (
  selection: SelectionRect,
  frame: { width: number; height: number },
  video: { width: number; height: number }
): SelectionRect => {
  const scale = Math.min(frame.width / video.width, frame.height / video.height)
  const renderedWidth = video.width * scale
  const renderedHeight = video.height * scale
  const offsetX = (frame.width - renderedWidth) / 2
  const offsetY = (frame.height - renderedHeight) / 2
  const x = clamp((selection.x - offsetX) / renderedWidth, 0, 1) * video.width
  const y = clamp((selection.y - offsetY) / renderedHeight, 0, 1) * video.height
  const right = clamp((selection.x + selection.width - offsetX) / renderedWidth, 0, 1) * video.width
  const bottom = clamp((selection.y + selection.height - offsetY) / renderedHeight, 0, 1) * video.height
  return {
    x: Math.round(Math.min(x, right)),
    y: Math.round(Math.min(y, bottom)),
    width: Math.max(1, Math.round(Math.abs(right - x))),
    height: Math.max(1, Math.round(Math.abs(bottom - y)))
  }
}

const defaultStartScreenCapture = () => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return Promise.reject(new Error('getDisplayMedia is unavailable'))
  }
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
}

const captureVideoCrop = (video: HTMLVideoElement, crop: SelectionRect): Promise<Blob> => {
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Canvas 2D context is unavailable'))
  context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to encode screenshot PNG'))
    }, 'image/png')
  })
}

const pointerInFrame = (event: ReactPointerEvent, frame: HTMLDivElement) => {
  const rect = frame.getBoundingClientRect()
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height)
  }
}

const normalizeSelection = (selection: SelectionRect): SelectionRect => ({
  x: Math.min(selection.x, selection.x + selection.width),
  y: Math.min(selection.y, selection.y + selection.height),
  width: Math.abs(selection.width),
  height: Math.abs(selection.height)
})

const stopStream = (stream: MediaStream) => {
  stream.getTracks().forEach(track => track.stop())
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

const CaptureAction = ({
  icon,
  label,
  disabled = false,
  onClick
}: {
  icon: JSX.Element
  label: string
  disabled?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    disabled={disabled}
    className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-black text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
    onClick={onClick}
  >
    {icon}
    {label}
  </button>
)
