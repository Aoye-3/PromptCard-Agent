import { describe, expect, it, vi } from 'vitest'
import {
  createAnnotationHistory,
  rasterizeAnnotationDocument,
  reduceAnnotationHistory,
  renderAnnotationDocument,
  type ImageAnnotationDocument,
  type RasterCanvas
} from './annotations'

const document: ImageAnnotationDocument = {
  version: 1,
  sourceAssetId: 'asset-source',
  width: 1000,
  height: 500,
  annotations: [
    {
      id: 'stroke',
      kind: 'freehand',
      color: '#ff0000',
      strokeWidth: 10,
      points: [{ x: 100, y: 100 }, { x: 200, y: 300 }]
    },
    {
      id: 'arrow',
      kind: 'arrow',
      color: '#00ff00',
      strokeWidth: 8,
      start: { x: 200, y: 200 },
      end: { x: 800, y: 700 }
    },
    {
      id: 'rect',
      kind: 'rect',
      color: '#0000ff',
      strokeWidth: 6,
      x: 100,
      y: 200,
      width: 300,
      height: 400
    },
    {
      id: 'ellipse',
      kind: 'ellipse',
      color: '#ff00ff',
      strokeWidth: 4,
      x: 500,
      y: 100,
      width: 300,
      height: 500
    },
    {
      id: 'text',
      kind: 'text',
      color: '#111111',
      strokeWidth: 3,
      x: 250,
      y: 500,
      text: 'Replace this',
      fontSize: 50
    }
  ]
}

const createContext = () => ({
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  strokeRect: vi.fn(),
  ellipse: vi.fn(),
  fillText: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  set lineWidth(_value: number) {},
  set strokeStyle(_value: string) {},
  set fillStyle(_value: string) {},
  set font(_value: string) {},
  set lineCap(_value: CanvasLineCap) {},
  set lineJoin(_value: CanvasLineJoin) {}
})

describe('image annotation documents', () => {
  it('supports immutable add, delete, undo, and redo history', () => {
    const annotation = document.annotations[0]
    let history = createAnnotationHistory([])
    history = reduceAnnotationHistory(history, { type: 'add', annotation })
    history = reduceAnnotationHistory(history, { type: 'delete', annotationId: annotation.id })
    expect(history.present).toEqual([])
    history = reduceAnnotationHistory(history, { type: 'undo' })
    expect(history.present).toEqual([annotation])
    history = reduceAnnotationHistory(history, { type: 'redo' })
    expect(history.present).toEqual([])
  })

  it('renders freehand, arrow, rectangle, ellipse, and text in source-image coordinates', () => {
    const context = createContext()

    renderAnnotationDocument(context as unknown as CanvasRenderingContext2D, document)

    expect(context.strokeRect).toHaveBeenCalledWith(100, 100, 300, 200)
    expect(context.ellipse).toHaveBeenCalledWith(650, 175, 150, 125, 0, 0, Math.PI * 2)
    expect(context.fillText).toHaveBeenCalledWith('Replace this', 250, 250)
    expect(context.lineTo).toHaveBeenCalledWith(200, 150)
    expect(context.lineTo).toHaveBeenCalledWith(800, 350)
  })

  it('rasterizes without mutating the original asset and returns a PNG blob', async () => {
    const context = createContext()
    const blob = new Blob(['png'], { type: 'image/png' })
    const canvas: RasterCanvas = {
      width: 0,
      height: 0,
      getContext: () => context as unknown as CanvasRenderingContext2D,
      toBlob: callback => callback(blob)
    }
    const image = { naturalWidth: 1000, naturalHeight: 500 } as HTMLImageElement

    await expect(rasterizeAnnotationDocument(image, document, () => canvas)).resolves.toBe(blob)
    expect(canvas.width).toBe(1000)
    expect(canvas.height).toBe(500)
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 1000, 500)
    expect(document.sourceAssetId).toBe('asset-source')
  })
})
