export const ANNOTATION_GRID_MAX = 999

export interface AnnotationPoint {
  x: number
  y: number
}

interface ImageAnnotationBase {
  id: string
  color: string
  strokeWidth: number
}

export interface FreehandImageAnnotation extends ImageAnnotationBase {
  kind: 'freehand'
  points: AnnotationPoint[]
}

export interface ArrowImageAnnotation extends ImageAnnotationBase {
  kind: 'arrow'
  start: AnnotationPoint
  end: AnnotationPoint
}

export interface ShapeImageAnnotation extends ImageAnnotationBase {
  kind: 'rect' | 'ellipse'
  x: number
  y: number
  width: number
  height: number
}

export interface TextImageAnnotation extends ImageAnnotationBase {
  kind: 'text'
  x: number
  y: number
  text: string
  fontSize: number
}

export type ImageAnnotation =
  | FreehandImageAnnotation
  | ArrowImageAnnotation
  | ShapeImageAnnotation
  | TextImageAnnotation

export interface ImageAnnotationDocument {
  version: 1
  sourceAssetId: string
  width: number
  height: number
  annotations: ImageAnnotation[]
}

export interface AnnotationHistory {
  past: ImageAnnotation[][]
  present: ImageAnnotation[]
  future: ImageAnnotation[][]
}

export type AnnotationHistoryAction =
  | { type: 'reset'; annotations: readonly ImageAnnotation[] }
  | { type: 'add'; annotation: ImageAnnotation }
  | { type: 'delete'; annotationId: string }
  | { type: 'undo' }
  | { type: 'redo' }

export interface RasterCanvas {
  width: number
  height: number
  getContext: (contextId: '2d') => CanvasRenderingContext2D | null
  toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void
}

export const createAnnotationHistory = (
  annotations: readonly ImageAnnotation[]
): AnnotationHistory => ({
  past: [],
  present: cloneAnnotations(annotations),
  future: []
})

export const reduceAnnotationHistory = (
  history: AnnotationHistory,
  action: AnnotationHistoryAction
): AnnotationHistory => {
  if (action.type === 'reset') return createAnnotationHistory(action.annotations)
  if (action.type === 'undo') {
    const previous = history.past[history.past.length - 1]
    return previous
      ? {
          past: history.past.slice(0, -1),
          present: cloneAnnotations(previous),
          future: [cloneAnnotations(history.present), ...history.future]
        }
      : history
  }
  if (action.type === 'redo') {
    const next = history.future[0]
    return next
      ? {
          past: [...history.past, cloneAnnotations(history.present)],
          present: cloneAnnotations(next),
          future: history.future.slice(1)
        }
      : history
  }
  const present = action.type === 'add'
    ? [...cloneAnnotations(history.present), cloneAnnotation(action.annotation)]
    : history.present.filter(annotation => annotation.id !== action.annotationId).map(cloneAnnotation)
  return {
    past: [...history.past, cloneAnnotations(history.present)],
    present,
    future: []
  }
}

export const renderAnnotationDocument = (
  context: CanvasRenderingContext2D,
  document: ImageAnnotationDocument
): void => {
  document.annotations.forEach(annotation => {
    context.save()
    context.strokeStyle = annotation.color
    context.fillStyle = annotation.color
    context.lineWidth = annotation.strokeWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (annotation.kind === 'freehand') renderFreehand(context, annotation, document)
    if (annotation.kind === 'arrow') renderArrow(context, annotation, document)
    if (annotation.kind === 'rect') {
      context.strokeRect(
        scaleX(annotation.x, document),
        scaleY(annotation.y, document),
        scaleX(annotation.width, document),
        scaleY(annotation.height, document)
      )
    }
    if (annotation.kind === 'ellipse') renderEllipse(context, annotation, document)
    if (annotation.kind === 'text') {
      context.font = `bold ${Math.max(8, scaleY(annotation.fontSize, document))}px sans-serif`
      context.fillText(annotation.text, scaleX(annotation.x, document), scaleY(annotation.y, document))
    }
    context.restore()
  })
}

export const rasterizeAnnotationDocument = async (
  image: HTMLImageElement,
  document: ImageAnnotationDocument,
  canvasFactory: () => RasterCanvas = defaultCanvasFactory
): Promise<Blob> => {
  const canvas = canvasFactory()
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  renderAnnotationDocument(context, { ...document, width: canvas.width, height: canvas.height })
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Annotation rasterization failed')), 'image/png')
  })
}

const renderFreehand = (
  context: CanvasRenderingContext2D,
  annotation: FreehandImageAnnotation,
  document: ImageAnnotationDocument
) => {
  const [first, ...rest] = annotation.points
  if (!first) return
  context.beginPath()
  context.moveTo(scaleX(first.x, document), scaleY(first.y, document))
  rest.forEach(point => context.lineTo(scaleX(point.x, document), scaleY(point.y, document)))
  context.stroke()
}

const renderArrow = (
  context: CanvasRenderingContext2D,
  annotation: ArrowImageAnnotation,
  document: ImageAnnotationDocument
) => {
  const start = { x: scaleX(annotation.start.x, document), y: scaleY(annotation.start.y, document) }
  const end = { x: scaleX(annotation.end.x, document), y: scaleY(annotation.end.y, document) }
  context.beginPath()
  context.moveTo(start.x, start.y)
  context.lineTo(end.x, end.y)
  context.stroke()
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const size = Math.max(10, annotation.strokeWidth * 3)
  context.beginPath()
  context.moveTo(end.x, end.y)
  context.lineTo(end.x - size * Math.cos(angle - Math.PI / 6), end.y - size * Math.sin(angle - Math.PI / 6))
  context.lineTo(end.x - size * Math.cos(angle + Math.PI / 6), end.y - size * Math.sin(angle + Math.PI / 6))
  context.closePath()
  context.fill()
}

const renderEllipse = (
  context: CanvasRenderingContext2D,
  annotation: ShapeImageAnnotation,
  document: ImageAnnotationDocument
) => {
  const x = scaleX(annotation.x, document)
  const y = scaleY(annotation.y, document)
  const width = scaleX(annotation.width, document)
  const height = scaleY(annotation.height, document)
  context.beginPath()
  context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
  context.stroke()
}

const scaleX = (value: number, document: ImageAnnotationDocument): number => (
  Math.floor((value / ANNOTATION_GRID_MAX) * document.width)
)
const scaleY = (value: number, document: ImageAnnotationDocument): number => (
  Math.floor((value / ANNOTATION_GRID_MAX) * document.height)
)
const cloneAnnotations = (annotations: readonly ImageAnnotation[]) => annotations.map(cloneAnnotation)
const cloneAnnotation = <T extends ImageAnnotation>(annotation: T): T => (
  structuredClone(annotation)
)
const defaultCanvasFactory = (): RasterCanvas => document.createElement('canvas')
