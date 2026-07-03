import { describe, expect, it } from 'vitest'
import { mapSelectionToVideoCrop } from './ScreenshotCaptureOverlay'

describe('ScreenshotCaptureOverlay', () => {
  it('maps object-contain screen preview selections into video pixels', () => {
    const crop = mapSelectionToVideoCrop(
      { x: 280, y: 170, width: 640, height: 360 },
      { width: 1200, height: 800 },
      { width: 1920, height: 1080 }
    )

    expect(crop).toEqual({ x: 448, y: 172, width: 1024, height: 576 })
  })
})
