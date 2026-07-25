import { describe, expect, it } from 'vitest'
import { hasVisibleImageEffects, visibleImageFrame } from './render-visible-image'

describe('visible image renderer', () => {
  it('calculates a deterministic raster frame from a normalized crop', () => {
    expect(visibleImageFrame(1200, 800, { x: 0.25, y: 0.1, width: 0.5, height: 0.75 }))
      .toEqual({
        sourceX: 300,
        sourceY: 80,
        sourceWidth: 600,
        sourceHeight: 600,
        outputWidth: 600,
        outputHeight: 600
      })
  })

  it('detects crop, annotations, and presentation transforms independently', () => {
    expect(hasVisibleImageEffects({ crop: null, annotations: [], meta: {} })).toBe(false)
    expect(hasVisibleImageEffects({
      crop: null,
      annotations: [],
      meta: { presentation: { flipY: true } }
    })).toBe(true)
    expect(hasVisibleImageEffects({
      crop: { x: 0, y: 0, width: 0.5, height: 1 },
      annotations: [],
      meta: {}
    })).toBe(true)
  })
})
