import { describe, expect, it } from 'vitest'
import {
  bboxFromDisplayDrag,
  createRegionHistory,
  displayToRegionPoint,
  moveBoundImageRegion,
  reduceRegionHistory,
  regionToDisplayPoint,
  restoreBoundImageRegions,
  serializeBoundImageRegions,
  validateBoundImageRegions,
  type BoundImageRegion,
  type ImageDisplayMetrics
} from './regions'

const landscape: ImageDisplayMetrics = {
  viewportWidth: 800,
  viewportHeight: 800,
  imageWidth: 1600,
  imageHeight: 900,
  devicePixelRatio: 1
}

const pointRegion: BoundImageRegion = {
  id: 'region-point',
  referenceId: 'reference-source',
  type: 'point',
  x: 250,
  y: 750
}

describe('image region coordinates', () => {
  it('maps a letterboxed landscape image to the integer 0..999 grid', () => {
    expect(displayToRegionPoint({ x: 400, y: 400 }, landscape)).toEqual({ x: 500, y: 500 })
    expect(displayToRegionPoint({ x: 0, y: 175 }, landscape)).toEqual({ x: 0, y: 0 })
    expect(displayToRegionPoint({ x: 800, y: 625 }, landscape)).toEqual({ x: 999, y: 999 })
  })

  it('maps a pillarboxed portrait image and clamps display points outside the image', () => {
    const portrait: ImageDisplayMetrics = {
      viewportWidth: 800,
      viewportHeight: 400,
      imageWidth: 900,
      imageHeight: 1600,
      devicePixelRatio: 2
    }

    expect(displayToRegionPoint({ x: 400, y: 200 }, portrait)).toEqual({ x: 500, y: 500 })
    expect(displayToRegionPoint({ x: 0, y: -100 }, portrait)).toEqual({ x: 0, y: 0 })
    expect(displayToRegionPoint({ x: 900, y: 500 }, portrait)).toEqual({ x: 999, y: 999 })
  })

  it('is independent of display scale and device pixel ratio', () => {
    const scaled = {
      ...landscape,
      viewportWidth: 400,
      viewportHeight: 400,
      devicePixelRatio: 3
    }

    expect(displayToRegionPoint({ x: 200, y: 200 }, scaled)).toEqual({ x: 500, y: 500 })
  })

  it('round-trips grid coordinates with at most one grid-unit error', () => {
    const original = { x: 137, y: 862 }
    const display = regionToDisplayPoint(original, landscape)
    const roundTrip = displayToRegionPoint(display, landscape)

    expect(Math.abs(roundTrip.x - original.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(roundTrip.y - original.y)).toBeLessThanOrEqual(1)
  })

  it('orders a reverse drag and rejects a zero-size bbox', () => {
    const metrics: ImageDisplayMetrics = {
      viewportWidth: 1000,
      viewportHeight: 1000,
      imageWidth: 1000,
      imageHeight: 1000
    }

    expect(bboxFromDisplayDrag(
      'region-box',
      'reference-source',
      { x: 800, y: 900 },
      { x: 200, y: 100 },
      metrics
    )).toEqual({
      id: 'region-box',
      referenceId: 'reference-source',
      type: 'bbox',
      x: 200,
      y: 100,
      width: 599,
      height: 799
    })
    expect(bboxFromDisplayDrag(
      'region-empty',
      'reference-source',
      { x: 400, y: 400 },
      { x: 400, y: 800 },
      metrics
    )).toBeNull()
  })
})

describe('bound image regions', () => {
  it('moves points and boxes without crossing grid boundaries', () => {
    expect(moveBoundImageRegion(pointRegion, -500, 500)).toEqual({
      ...pointRegion,
      x: 0,
      y: 999
    })
    expect(moveBoundImageRegion({
      id: 'region-box',
      referenceId: 'reference-source',
      type: 'bbox',
      x: 800,
      y: 800,
      width: 150,
      height: 100
    }, 500, 500)).toMatchObject({ x: 849, y: 899, width: 150, height: 100 })
  })

  it('supports add, move, delete, undo, and redo without changing region identity', () => {
    let history = createRegionHistory([])
    history = reduceRegionHistory(history, { type: 'add', region: pointRegion })
    history = reduceRegionHistory(history, { type: 'move', regionId: pointRegion.id, dx: 10, dy: -20 })
    expect(history.present).toEqual([{ ...pointRegion, x: 260, y: 730 }])

    history = reduceRegionHistory(history, { type: 'delete', regionId: pointRegion.id })
    expect(history.present).toEqual([])
    history = reduceRegionHistory(history, { type: 'undo' })
    expect(history.present[0]).toEqual({ ...pointRegion, x: 260, y: 730 })
    history = reduceRegionHistory(history, { type: 'redo' })
    expect(history.present).toEqual([])
  })

  it('serializes only integer geometry plus stable reference bindings', () => {
    const box: BoundImageRegion = {
      id: 'region-box',
      referenceId: 'reference-product',
      type: 'bbox',
      x: 100,
      y: 200,
      width: 300,
      height: 400
    }
    const serialized = serializeBoundImageRegions([pointRegion, box])

    expect(serialized.regions).toEqual([
      { type: 'point', x: 250, y: 750 },
      { type: 'bbox', x: 100, y: 200, width: 300, height: 400 }
    ])
    expect(JSON.stringify(serialized)).not.toContain('imageUrl')
    expect(JSON.stringify(serialized)).not.toContain('imageWidth')
    expect(restoreBoundImageRegions(serialized.regions, serialized.bindings)).toEqual([pointRegion, box])
  })

  it('blocks generation for disconnected or stale source bindings', () => {
    expect(validateBoundImageRegions(
      [pointRegion],
      'reference-source',
      ['reference-source']
    )).toEqual({ validationErrors: [], canGenerate: true })

    expect(validateBoundImageRegions(
      [pointRegion],
      'reference-new-source',
      ['reference-source', 'reference-new-source']
    )).toEqual({
      validationErrors: [{
        code: 'stale_region_reference',
        regionId: pointRegion.id,
        referenceId: pointRegion.referenceId
      }],
      canGenerate: false
    })

    expect(validateBoundImageRegions(
      [pointRegion],
      'reference-source',
      []
    )).toEqual({
      validationErrors: [{
        code: 'unresolved_region_reference',
        regionId: pointRegion.id,
        referenceId: pointRegion.referenceId
      }],
      canGenerate: false
    })
  })
})
