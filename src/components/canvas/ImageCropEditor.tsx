import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, X } from 'lucide-react'
import type { FreeCanvasCropLines, FreeCanvasMediaNode } from '@/domain/free-canvas/free-canvas'

interface ImageCropEditorProps {
  media: FreeCanvasMediaNode
  imageUrl: string
  onCancel: () => void
  onConfirm: (lines: FreeCanvasCropLines) => void
}

type ActiveLine = { axis: 'horizontal' | 'vertical'; index: number }

export const ImageCropEditor = ({ media, imageUrl, onCancel, onConfirm }: ImageCropEditorProps) => {
  const imageFrameRef = useRef<HTMLDivElement>(null)
  const [horizontal, setHorizontal] = useState<number[]>([])
  const [vertical, setVertical] = useState<number[]>([])
  const [activeLine, setActiveLine] = useState<ActiveLine | null>(null)

  useEffect(() => {
    if (!activeLine) return
    const handleMove = (event: PointerEvent) => updateActiveLine(event.clientX, event.clientY)
    const handleUp = (event: PointerEvent) => {
      const value = pointerValue(activeLine.axis, event.clientX, event.clientY)
      if (value <= 0.015 || value >= 0.985) removeLine(activeLine.axis, activeLine.index)
      setActiveLine(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  })

  const pointerValue = (axis: ActiveLine['axis'], clientX: number, clientY: number): number => {
    const rect = imageFrameRef.current?.getBoundingClientRect()
    if (!rect) return 0.5
    const raw = axis === 'horizontal'
      ? (clientY - rect.top) / rect.height
      : (clientX - rect.left) / rect.width
    return Math.min(1, Math.max(0, raw))
  }

  const updateActiveLine = (clientX: number, clientY: number) => {
    if (!activeLine) return
    const value = pointerValue(activeLine.axis, clientX, clientY)
    if (activeLine.axis === 'horizontal') {
      setHorizontal(lines => lines.map((line, index) => index === activeLine.index ? value : line))
    } else {
      setVertical(lines => lines.map((line, index) => index === activeLine.index ? value : line))
    }
  }

  const startNewLine = (axis: ActiveLine['axis'], event: ReactPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const value = pointerValue(axis, event.clientX, event.clientY)
    if (axis === 'horizontal') {
      setHorizontal(lines => {
        setActiveLine({ axis, index: lines.length })
        return [...lines, value]
      })
    } else {
      setVertical(lines => {
        setActiveLine({ axis, index: lines.length })
        return [...lines, value]
      })
    }
  }

  const startExistingLine = (axis: ActiveLine['axis'], index: number, event: ReactPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setActiveLine({ axis, index })
  }

  const removeLine = (axis: ActiveLine['axis'], index: number) => {
    if (axis === 'horizontal') setHorizontal(lines => lines.filter((_, candidate) => candidate !== index))
    else setVertical(lines => lines.filter((_, candidate) => candidate !== index))
  }

  const hasLines = horizontal.length > 0 || vertical.length > 0

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/55 p-8 backdrop-blur-sm" data-image-crop-editor>
      <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/15 bg-[#f7f7f5] shadow-[0_32px_100px_rgba(15,23,42,0.35)]">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-black text-gray-950">裁切图片</h2>
            <p className="mt-0.5 text-xs text-gray-500">从四边标尺拖出裁切线。双击线，或把线拖回边缘即可删除。</p>
          </div>
          <button type="button" className="rounded-full p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-950" onClick={onCancel} title="取消裁切">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-8">
          <div className="mx-auto grid w-fit grid-cols-[18px_minmax(320px,820px)_18px] grid-rows-[18px_minmax(260px,620px)_18px]">
            <div />
            <CropRuler axis="vertical" onPointerDown={startNewLine} />
            <div />
            <CropRuler axis="horizontal" onPointerDown={startNewLine} />
            <div
              ref={imageFrameRef}
              className="relative flex max-h-[620px] max-w-[820px] items-center justify-center overflow-hidden bg-white shadow-[0_10px_35px_rgba(15,23,42,0.14)]"
              style={{ aspectRatio: `${media.width} / ${media.height}`, width: 'min(72vw, 820px)' }}
            >
              <img src={imageUrl} alt="待裁切图片" className="h-full w-full select-none object-contain" draggable={false} />
              {horizontal.map((line, index) => (
                <button
                  key={`h-${index}`}
                  type="button"
                  className="absolute left-0 z-10 h-3 w-full -translate-y-1/2 cursor-row-resize border-0 bg-transparent p-0 before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:bg-[#c96442] after:absolute after:left-1/2 after:top-1/2 after:h-3 after:w-8 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border after:border-[#c96442] after:bg-white"
                  style={{ top: `${line * 100}%` }}
                  onPointerDown={event => startExistingLine('horizontal', index, event)}
                  onDoubleClick={() => removeLine('horizontal', index)}
                  aria-label={`水平裁切线 ${index + 1}`}
                />
              ))}
              {vertical.map((line, index) => (
                <button
                  key={`v-${index}`}
                  type="button"
                  className="absolute top-0 z-10 h-full w-3 -translate-x-1/2 cursor-col-resize border-0 bg-transparent p-0 before:absolute before:bottom-0 before:left-1/2 before:top-0 before:w-px before:bg-[#c96442] after:absolute after:left-1/2 after:top-1/2 after:h-8 after:w-3 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:border after:border-[#c96442] after:bg-white"
                  style={{ left: `${line * 100}%` }}
                  onPointerDown={event => startExistingLine('vertical', index, event)}
                  onDoubleClick={() => removeLine('vertical', index)}
                  aria-label={`垂直裁切线 ${index + 1}`}
                />
              ))}
            </div>
            <CropRuler axis="horizontal" onPointerDown={startNewLine} />
            <div />
            <CropRuler axis="vertical" onPointerDown={startNewLine} />
            <div />
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
          <span className="text-xs font-semibold text-gray-500">将生成 {(horizontal.length + 1) * (vertical.length + 1)} 个图片节点</span>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-full px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200" onClick={onCancel}>取消</button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-gray-950 px-4 py-2 text-sm font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-300"
              disabled={!hasLines}
              onClick={() => onConfirm({ horizontal, vertical })}
            >
              <Check className="h-4 w-4" />
              确认裁切
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

const CropRuler = ({
  axis,
  onPointerDown
}: {
  axis: 'horizontal' | 'vertical'
  onPointerDown: (axis: 'horizontal' | 'vertical', event: ReactPointerEvent) => void
}) => (
  <div
    className={`relative bg-[repeating-linear-gradient(90deg,#cbd5e1_0,#cbd5e1_1px,transparent_1px,transparent_8px)] ${axis === 'horizontal' ? 'cursor-row-resize bg-[repeating-linear-gradient(0deg,#cbd5e1_0,#cbd5e1_1px,transparent_1px,transparent_8px)]' : 'cursor-col-resize'}`}
    onPointerDown={event => onPointerDown(axis, event)}
    aria-label={axis === 'horizontal' ? '水平裁切标尺' : '垂直裁切标尺'}
  />
)
