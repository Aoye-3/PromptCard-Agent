import { useEffect, useState } from 'react'
import { Camera, GripHorizontal, Loader2, Video, X } from 'lucide-react'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { requestScreenshot } from './floating-capture-toolbar-request'

export const FloatingCaptureToolbar = () => {
  const [isPreparing, setIsPreparing] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | null = null
    void listen('capture:toolbar-restored', () => setIsPreparing(false))
      .then(dispose => { unlisten = dispose })
      .catch(error => console.error('Failed to listen for capture toolbar state:', error))
    return () => unlisten?.()
  }, [])

  const handleDrag = async () => {
    try {
      await getCurrentWindow().startDragging()
    } catch (error) {
      console.error('Failed to drag capture toolbar:', error)
    }
  }

  const handleScreenshot = async () => {
    try {
      await requestScreenshot({
        setPreparing: setIsPreparing,
        emitIntent: () => emitTo('main', 'capture:screenshot-requested', { source: 'capture-toolbar', requestedAt: Date.now() })
      })
    } catch (error) {
      console.error('Failed to emit screenshot intent:', error)
    }
  }

  const handleClose = async () => {
    try {
      await emitTo('main', 'capture:toolbar-closed', { source: 'capture-toolbar', closedAt: Date.now() })
      await getCurrentWindow().close()
    } catch (error) {
      console.error('Failed to close capture toolbar:', error)
    }
  }

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-transparent" data-floating-capture-toolbar>
      <div className="flex h-12 items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
        <button
          type="button"
          className="flex h-9 w-8 cursor-grab items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Drag capture toolbar"
          title="Drag"
          onPointerDown={handleDrag}
        >
          <GripHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={isPreparing}
          className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-950 text-white transition hover:bg-gray-800 active:scale-[0.98]"
          aria-label={isPreparing ? 'Preparing screenshot' : 'Screenshot'}
          title={isPreparing ? '正在准备截图' : '截图'}
          onClick={handleScreenshot}
        >
          {isPreparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </button>
        {isPreparing ? <span className="whitespace-nowrap px-1 text-xs font-bold text-gray-700">正在准备截图…</span> : null}
        {!isPreparing && (
          <button
            type="button"
            disabled
            className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-md bg-gray-100 text-gray-300"
            aria-label="Record coming next"
            title="Record coming next"
          >
            <Video className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 active:scale-[0.98]"
          aria-label="Close toolbar"
          title="Close"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </main>
  )
}
