import type {
  IFreeCanvasCropRect,
  IFreeCanvasImageAnnotation,
  IFreeCanvasImageNode
} from '@/models/PromptHistory.model'

export interface VisibleImageFrame {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
}

export interface VisibleImageRasterCanvas {
  width: number
  height: number
  getContext: (contextId: '2d') => CanvasRenderingContext2D | null
  toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void
}

export const visibleImageFrame = (
  sourceWidth: number,
  sourceHeight: number,
  crop?: IFreeCanvasCropRect | null
): VisibleImageFrame => {
  const normalized = crop || { x: 0, y: 0, width: 1, height: 1 }
  const sourceX = Math.round(normalized.x * sourceWidth)
  const sourceY = Math.round(normalized.y * sourceHeight)
  const sourceCropWidth = Math.max(1, Math.round(normalized.width * sourceWidth))
  const sourceCropHeight = Math.max(1, Math.round(normalized.height * sourceHeight))
  return {
    sourceX,
    sourceY,
    sourceWidth: sourceCropWidth,
    sourceHeight: sourceCropHeight,
    outputWidth: sourceCropWidth,
    outputHeight: sourceCropHeight
  }
}

export const renderVisibleImage = async (
  image: HTMLImageElement,
  node: Pick<IFreeCanvasImageNode, 'crop' | 'annotations' | 'meta'>,
  options: {
    format?: 'image/png' | 'image/jpeg'
    quality?: number
    canvasFactory?: () => VisibleImageRasterCanvas
  } = {}
): Promise<Blob> => {
  const frame = visibleImageFrame(image.naturalWidth, image.naturalHeight, node.crop)
  const canvas = (options.canvasFactory || defaultCanvasFactory)()
  canvas.width = frame.outputWidth
  canvas.height = frame.outputHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')

  const presentation = imagePresentation(node.meta)
  context.save()
  if (presentation.flipX || presentation.flipY) {
    context.translate(presentation.flipX ? frame.outputWidth : 0, presentation.flipY ? frame.outputHeight : 0)
    context.scale(presentation.flipX ? -1 : 1, presentation.flipY ? -1 : 1)
  }
  context.drawImage(
    image,
    frame.sourceX,
    frame.sourceY,
    frame.sourceWidth,
    frame.sourceHeight,
    0,
    0,
    frame.outputWidth,
    frame.outputHeight
  )
  context.restore()

  node.annotations.forEach(annotation => renderCanvasAnnotation(context, annotation, frame, image))

  const format = options.format || 'image/png'
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Visible image rasterization failed')),
      format,
      options.quality
    )
  })
}

export const hasVisibleImageEffects = (
  node: Pick<IFreeCanvasImageNode, 'crop' | 'annotations' | 'meta'>
): boolean => {
  const presentation = imagePresentation(node.meta)
  return Boolean(node.crop || node.annotations.length > 0 || presentation.flipX || presentation.flipY)
}

const renderCanvasAnnotation = (
  context: CanvasRenderingContext2D,
  annotation: IFreeCanvasImageAnnotation,
  frame: VisibleImageFrame,
  image: HTMLImageElement
) => {
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  const x = annotation.x * sourceWidth - frame.sourceX
  const y = annotation.y * sourceHeight - frame.sourceY
  const width = annotation.width * sourceWidth
  const height = annotation.height * sourceHeight
  context.save()
  context.strokeStyle = annotation.color
  context.fillStyle = annotation.color
  context.lineWidth = Math.max(1, annotation.strokeWidth || 3)
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (annotation.kind === 'rect') {
    if (annotation.fill) {
      context.fillStyle = annotation.fill
      context.fillRect(x, y, width, height)
    }
    context.strokeRect(x, y, width, height)
  } else if (annotation.kind === 'freehand') {
    const [first, ...rest] = annotation.points || []
    if (first) {
      context.beginPath()
      context.moveTo(x + first.x * width, y + first.y * height)
      rest.forEach(point => context.lineTo(x + point.x * width, y + point.y * height))
      context.stroke()
    }
  } else if (annotation.kind === 'arrow') {
    drawArrow(context, x, y + height / 2, x + width, y + height / 2)
  } else {
    const text = annotation.text || ''
    const fontSize = Math.max(12, annotation.kind === 'shotNumber' ? height * 0.58 : height * 0.7)
    if (annotation.kind === 'shotNumber' && annotation.fill) {
      context.fillStyle = annotation.fill
      context.fillRect(x, y, width, height)
      context.fillStyle = annotation.color
    }
    context.font = `700 ${fontSize}px sans-serif`
    context.textAlign = annotation.kind === 'shotNumber' ? 'center' : 'left'
    context.textBaseline = 'middle'
    context.fillText(text, annotation.kind === 'shotNumber' ? x + width / 2 : x, y + height / 2)
  }
  context.restore()
}

const drawArrow = (
  context: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number
) => {
  context.beginPath()
  context.moveTo(startX, startY)
  context.lineTo(endX, endY)
  context.stroke()
  const angle = Math.atan2(endY - startY, endX - startX)
  const size = Math.max(10, context.lineWidth * 3)
  context.beginPath()
  context.moveTo(endX, endY)
  context.lineTo(endX - size * Math.cos(angle - Math.PI / 6), endY - size * Math.sin(angle - Math.PI / 6))
  context.lineTo(endX - size * Math.cos(angle + Math.PI / 6), endY - size * Math.sin(angle + Math.PI / 6))
  context.closePath()
  context.fill()
}

const imagePresentation = (meta: Record<string, unknown>): { flipX: boolean; flipY: boolean } => {
  const value = meta.presentation
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { flipX: record.flipX === true, flipY: record.flipY === true }
}

const defaultCanvasFactory = (): VisibleImageRasterCanvas => document.createElement('canvas')
