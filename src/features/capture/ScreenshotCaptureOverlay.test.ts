import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { mapSelectionToNativeCrop, mapSelectionToVideoCrop } from './capture-selection'
import { ScreenshotCaptureOverlay } from './ScreenshotCaptureOverlay'

describe('ScreenshotCaptureOverlay', () => {
  it('maps object-contain screen preview selections into video pixels', () => {
    const crop = mapSelectionToVideoCrop(
      { x: 280, y: 170, width: 640, height: 360 },
      { width: 1200, height: 800 },
      { width: 1920, height: 1080 }
    )

    expect(crop).toEqual({ x: 448, y: 172, width: 1024, height: 576 })
  })

  it('maps selector coordinates to the native capture frame for mixed DPI displays', () => {
    const crop = mapSelectionToNativeCrop(
      { x: 120, y: 90, width: 960, height: 540 },
      { width: 1440, height: 810 },
      { width: 1920, height: 1080 }
    )

    expect(crop).toEqual({ x: 160, y: 120, width: 1280, height: 720 })
  })

  it('renders a visible Chinese preparing mask before native capture is activated', () => {
    const markup = renderToStaticMarkup(createElement(ScreenshotCaptureOverlay, {
      sessionId: 'capture-1',
      canPlaceOnCanvas: false,
      activateSelection: vi.fn()
    }))

    expect(markup).toContain('data-capture-status="preparing"')
    expect(markup).toContain('正在准备截图')
    expect(markup).toContain('bg-slate-950/35')
  })
})
