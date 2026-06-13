import { describe, expect, it } from 'vitest'
import {
  MAX_THREE_STAGE_RAIL_ZOOM,
  MIN_THREE_STAGE_RAIL_ZOOM,
  getNextThreeStageRailZoom
} from './ThreeStageBuilder'

describe('three-stage rail zoom', () => {
  it('zooms in and out from Ctrl wheel deltas', () => {
    expect(getNextThreeStageRailZoom(1, -100)).toBe(1.08)
    expect(getNextThreeStageRailZoom(1, 100)).toBe(0.92)
  })

  it('keeps zoom inside the supported range', () => {
    expect(getNextThreeStageRailZoom(MAX_THREE_STAGE_RAIL_ZOOM, -100)).toBe(MAX_THREE_STAGE_RAIL_ZOOM)
    expect(getNextThreeStageRailZoom(MIN_THREE_STAGE_RAIL_ZOOM, 100)).toBe(MIN_THREE_STAGE_RAIL_ZOOM)
  })

  it('ignores neutral wheel movement', () => {
    expect(getNextThreeStageRailZoom(1.08, 0)).toBe(1.08)
  })
})
