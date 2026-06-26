import { describe, expect, it } from 'vitest'
// @ts-expect-error Vite raw imports are available in Vitest but this project does not include vite/client globals.
import threeStageBuilderSource from './ThreeStageBuilder.tsx?raw'
// @ts-expect-error Vite raw imports are available in Vitest but this project does not include vite/client globals.
import freeCanvasBuilderSource from './canvas/FreeCanvasBuilderScreen.tsx?raw'
import {
  MAX_THREE_STAGE_RAIL_ZOOM,
  MIN_THREE_STAGE_RAIL_ZOOM,
  getNextThreeStageRailZoom
} from './ThreeStageBuilder'

describe('three-stage rail zoom', () => {
  it('zooms in and out from Ctrl wheel deltas', () => {
    expect(getNextThreeStageRailZoom(1, -100)).toBe(1.1)
    expect(getNextThreeStageRailZoom(1, 100)).toBe(0.9)
  })

  it('renders video prompt shot keywords as shot slots with preset preview support', () => {
    expect(threeStageBuilderSource).toContain("slotMode={form.type === 'videoPrompt' && field.id === 'shotKeywords'}")
    expect(threeStageBuilderSource).toContain('shotNumbersForRange(range).map')
    expect(threeStageBuilderSource).toContain('range.shots?.[shotNumber]')
    expect(threeStageBuilderSource).toContain('setPreviewPreset(preset)')
    expect(threeStageBuilderSource).toContain('PromptPresetPreviewDialog')
  })

  it('limits form reordering drag to the explicit drag handle', () => {
    expect(threeStageBuilderSource).toContain('draggable={false}')
    expect(threeStageBuilderSource).toContain('draggable={draggable}')
    expect(threeStageBuilderSource).toContain('onDragStart={(event) =>')
  })

  it('highlights the active shot editor and separates bottom controls', () => {
    expect(threeStageBuilderSource).toContain('activeShotTarget={activeShotRangeByField[`${form.id}:${field.id}`]}')
    expect(threeStageBuilderSource).toContain('activeTarget?.rangeId === range.id && activeTarget?.shotNumber === shotNumber')
    expect(threeStageBuilderSource).toContain('bottom-32 left-0 right-0 z-30')
    expect(threeStageBuilderSource).toContain('bottom-20 left-1/2 z-40')
  })

  it('keeps zoom inside the supported range', () => {
    expect(getNextThreeStageRailZoom(MAX_THREE_STAGE_RAIL_ZOOM, -100)).toBe(MAX_THREE_STAGE_RAIL_ZOOM)
    expect(getNextThreeStageRailZoom(MIN_THREE_STAGE_RAIL_ZOOM, 100)).toBe(MIN_THREE_STAGE_RAIL_ZOOM)
  })

  it('ignores neutral wheel movement', () => {
    expect(getNextThreeStageRailZoom(1.08, 0)).toBe(1.08)
  })
})

describe('three-stage independent UI guards', () => {
  it('does not expose legacy story/prompt binding paths in the standard builder', () => {
    expect(threeStageBuilderSource).not.toContain('pairedStoryboardForm')
    expect(threeStageBuilderSource).not.toContain('buildStoryboardInjectionForVideo')
    expect(threeStageBuilderSource).not.toContain('const StageFormCard =')
  })

  it('keeps free canvas on the standalone canvas surface', () => {
    expect(freeCanvasBuilderSource).toContain('data-free-canvas-screen')
    expect(freeCanvasBuilderSource).toContain('data-free-canvas-toolbar')
    expect(freeCanvasBuilderSource).toContain('free-canvas-workspace')
  })
})
