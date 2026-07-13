import { Camera, GripHorizontal, Video, X } from 'lucide-react'
import { emitTo } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export const FloatingCaptureToolbar = () => {
  const handleDrag = async () => {
    try {
      await getCurrentWindow().startDragging()
    } catch (error) {
      console.error('Failed to drag capture toolbar:', error)
    }
  }

  const handleScreenshot = async () => {
    try {
      await emitTo('main', 'capture:screenshot-requested', { source: 'capture-toolbar', requestedAt: Date.now() })
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
          className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-950 text-white transition hover:bg-gray-800 active:scale-[0.98]"
          aria-label="Screenshot"
          title="Screenshot"
          onClick={handleScreenshot}
        >
          <Camera className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled
          className="flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-md bg-gray-100 text-gray-300"
          aria-label="Record coming next"
          title="Record coming next"
        >
          <Video className="h-4 w-4" />
        </button>
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
