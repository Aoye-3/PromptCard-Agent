import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import {
  ANNOTATION_GRID_MAX,
  createAnnotationHistory,
  reduceAnnotationHistory,
  type AnnotationPoint,
  type ImageAnnotation,
  type ImageAnnotationDocument
} from '@/domain/image-generation/annotations'

type AnnotationTool = ImageAnnotation['kind']

export interface AnnotationEditorSource {
  assetId: string
  imageUrl: string
  label: string
  width: number
  height: number
}

export interface AnnotationEditorDialogProps {
  source: AnnotationEditorSource
  initialDocument: ImageAnnotationDocument
  onSave: (document: ImageAnnotationDocument) => void
  onClose: () => void
}

const tools: Array<{ kind: AnnotationTool; label: string }> = [
  { kind: 'freehand', label: '自由画笔' },
  { kind: 'arrow', label: '箭头' },
  { kind: 'rect', label: '矩形' },
  { kind: 'ellipse', label: '椭圆' },
  { kind: 'text', label: '文字' }
]

export const AnnotationEditorDialog = ({
  source,
  initialDocument,
  onSave,
  onClose
}: AnnotationEditorDialogProps) => {
  const [tool, setTool] = useState<AnnotationTool>('freehand')
  const [color, setColor] = useState('#ef4444')
  const [strokeWidth, setStrokeWidth] = useState(6)
  const [text, setText] = useState('需要修改')
  const [zoom, setZoom] = useState(1)
  const [history, dispatch] = useReducer(
    reduceAnnotationHistory,
    initialDocument.annotations,
    createAnnotationHistory
  )
  const startRef = useRef<AnnotationPoint | null>(null)
  const pointsRef = useRef<AnnotationPoint[]>([])
  const dialogRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreFocusRef.current = typeof document === 'undefined'
      ? null
      : document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    return () => restoreFocusRef.current?.focus()
  }, [])

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>): AnnotationPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: grid((event.clientX - rect.left) / rect.width),
      y: grid((event.clientY - rect.top) / rect.height)
    }
  }

  const addAnnotation = (annotation: ImageAnnotation) => dispatch({ type: 'add', annotation })

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointFromEvent(event)
    startRef.current = point
    pointsRef.current = [point]
    if (tool === 'text') {
      addAnnotation({
        id: nextAnnotationId(),
        kind: 'text',
        color,
        strokeWidth,
        x: point.x,
        y: point.y,
        text,
        fontSize: 50
      })
      startRef.current = null
    }
  }

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool === 'freehand' && startRef.current) pointsRef.current.push(pointFromEvent(event))
  }

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current
    startRef.current = null
    if (!start || tool === 'text') return
    const end = pointFromEvent(event)
    if (tool === 'freehand') {
      addAnnotation({
        id: nextAnnotationId(),
        kind: 'freehand',
        color,
        strokeWidth,
        points: [...pointsRef.current, end]
      })
      return
    }
    if (tool === 'arrow') {
      addAnnotation({ id: nextAnnotationId(), kind: 'arrow', color, strokeWidth, start, end })
      return
    }
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    if (width && height) {
      addAnnotation({ id: nextAnnotationId(), kind: tool, color, strokeWidth, x, y, width, height })
    }
  }

  const save = () => onSave({
    version: 1,
    sourceAssetId: source.assetId,
    width: source.width,
    height: source.height,
    annotations: history.present
  })

  return (
    <section
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="annotation-editor-title"
      tabIndex={-1}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 outline-none"
      onKeyDown={event => {
        if (trapFocusWithinDialog(event, event.currentTarget)) return
        if (event.key === 'Escape') onClose()
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 id="annotation-editor-title" className="text-sm font-black text-gray-950">视觉标记编辑</h3>
          <p className="text-xs text-gray-500">标记会栅格化为新的派生图片，不会修改原图，也不是原生蒙版。</p>
        </div>
        <button type="button" aria-label="关闭视觉标记编辑器" className="text-xs font-bold text-gray-600" onClick={onClose}>关闭</button>
      </header>

      <div className="flex flex-wrap gap-2" aria-label="视觉标记工具">
        {tools.map(candidate => (
          <button
            key={candidate.kind}
            type="button"
            aria-label={`选择${candidate.label}工具`}
            aria-pressed={tool === candidate.kind}
            className={toolClass(tool === candidate.kind)}
            onClick={() => setTool(candidate.kind)}
          >{candidate.label}</button>
        ))}
        <button type="button" aria-label="撤销标注" className={toolClass(false)} disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}>撤销</button>
        <button type="button" aria-label="重做标注" className={toolClass(false)} disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}>重做</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-bold text-gray-600">颜色 <input aria-label="标注颜色" type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
        <label className="text-xs font-bold text-gray-600">线宽 <input aria-label="标注线宽" type="range" min="2" max="24" value={strokeWidth} onChange={event => setStrokeWidth(Number(event.target.value))} /></label>
        {tool === 'text' && <label className="text-xs font-bold text-gray-600">文字 <input aria-label="标注文字" className="rounded border border-gray-200 px-2 py-1" value={text} onChange={event => setText(event.target.value)} /></label>}
        <button type="button" aria-label="缩小标注画布" className={toolClass(false)} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}>−</button>
        <button type="button" aria-label="适应标注画布" className={toolClass(false)} onClick={() => setZoom(1)}>适应</button>
        <button type="button" aria-label="放大标注画布" className={toolClass(false)} onClick={() => setZoom(value => Math.min(3, value + 0.25))}>＋</button>
        <span data-annotation-zoom className="text-xs font-bold text-gray-600">{Math.round(zoom * 100)}%</span>
      </div>

      <div className="overflow-auto rounded-lg bg-gray-950 p-3">
        <div
          data-annotation-canvas
          className="relative mx-auto touch-none overflow-hidden"
          style={{ aspectRatio: `${source.width}/${source.height}`, transform: `scale(${zoom})` }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
        >
          <img src={source.imageUrl} alt={source.label} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
          <AnnotationOverlay annotations={history.present} />
        </div>
      </div>

      {history.present.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="已添加视觉标记">
          {history.present.map((annotation, index) => (
            <button
              key={annotation.id}
              type="button"
              aria-label={`删除标注 ${index + 1}`}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-bold text-gray-700"
              onClick={() => dispatch({ type: 'delete', annotationId: annotation.id })}
            >
              删除{toolLabel(annotation.kind)} {index + 1}
            </button>
          ))}
        </div>
      )}

      <footer className="flex justify-end gap-2">
        <button type="button" className="rounded-lg px-3 py-2 text-xs font-bold text-gray-600" onClick={onClose}>取消</button>
        <button type="button" aria-label="保存视觉标记" className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-bold text-white" onClick={save}>保存标记</button>
      </footer>
    </section>
  )
}

const AnnotationOverlay = ({ annotations }: { annotations: ImageAnnotation[] }) => (
  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${ANNOTATION_GRID_MAX} ${ANNOTATION_GRID_MAX}`} preserveAspectRatio="none" aria-hidden="true">
    {annotations.map(annotation => {
      if (annotation.kind === 'freehand') {
        return <polyline key={annotation.id} points={annotation.points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={annotation.color} strokeWidth={annotation.strokeWidth} />
      }
      if (annotation.kind === 'arrow') {
        return <line key={annotation.id} x1={annotation.start.x} y1={annotation.start.y} x2={annotation.end.x} y2={annotation.end.y} stroke={annotation.color} strokeWidth={annotation.strokeWidth} />
      }
      if (annotation.kind === 'rect') {
        return <rect key={annotation.id} x={annotation.x} y={annotation.y} width={annotation.width} height={annotation.height} fill="none" stroke={annotation.color} strokeWidth={annotation.strokeWidth} />
      }
      if (annotation.kind === 'ellipse') {
        return <ellipse key={annotation.id} cx={annotation.x + annotation.width / 2} cy={annotation.y + annotation.height / 2} rx={annotation.width / 2} ry={annotation.height / 2} fill="none" stroke={annotation.color} strokeWidth={annotation.strokeWidth} />
      }
      if (annotation.kind === 'text') {
        return <text key={annotation.id} x={annotation.x} y={annotation.y} fill={annotation.color} fontSize={annotation.fontSize}>{annotation.text}</text>
      }
      return null
    })}
  </svg>
)

const grid = (value: number) => Math.min(ANNOTATION_GRID_MAX, Math.max(0, Math.round(value * ANNOTATION_GRID_MAX)))
const nextAnnotationId = () => `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const toolClass = (active: boolean) => `rounded-lg border px-2.5 py-1.5 text-xs font-bold ${active ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700'}`
const toolLabel = (kind: AnnotationTool) => tools.find(tool => tool.kind === kind)?.label || '标注'

const trapFocusWithinDialog = (
  event: ReactKeyboardEvent<HTMLElement>,
  container: HTMLElement
): boolean => {
  if (event.key !== 'Tab') return false
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
  ))
  if (focusable.length < 2) return false
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

export default AnnotationEditorDialog
