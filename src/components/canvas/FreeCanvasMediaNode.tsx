import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Image, MousePointer2, Scissors } from 'lucide-react'
import type { FreeCanvasNodeData } from '@/domain/free-canvas/free-canvas'
import { canvasImageAssetUrl } from './canvas-image-assets'

export const FreeCanvasMediaNode = ({ data, selected }: NodeProps<Node<FreeCanvasNodeData>>) => {
  const media = data.mediaNode
  if (media?.kind === 'textOverlay') {
    return (
      <div className={`relative min-w-[180px] max-w-[360px] rounded-md p-1 ${selected ? 'ring-2 ring-violet-500' : ''}`}>
        <Handle type="target" position={Position.Left} className="!bg-violet-500" />
        <textarea
          className="nodrag nowheel block min-h-[42px] w-full resize-none bg-transparent text-base font-semibold leading-6 text-gray-950 outline-none placeholder:text-gray-400"
          value={media.text || ''}
          placeholder="文字标注"
          onChange={(event) => data.onUpdateMediaText?.(media.id, event.target.value)}
        />
        <Handle type="source" position={Position.Right} className="!bg-violet-500" />
      </div>
    )
  }

  if (media?.kind === 'imageAsset') {
    const imageUrl = media.assetId ? canvasImageAssetUrl(media.assetId) : media.imageUrl
    const crop = media.crop
    const imageStyle = crop ? {
      width: `${100 / crop.width}%`,
      height: `${100 / crop.height}%`,
      left: `${-crop.x / crop.width * 100}%`,
      top: `${-crop.y / crop.height * 100}%`
    } : undefined
    return (
      <div
        className={`group relative overflow-visible rounded-[10px] border bg-white p-2 shadow-[0_10px_28px_rgba(15,23,42,0.08)] ${selected ? 'border-[#c96442] ring-1 ring-[#c96442]/20' : 'border-gray-200'}`}
        style={{ width: media.width, height: media.height }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          if (media.assetId && !media.crop) data.onStartImageCrop?.(media.id)
        }}
        data-image-node
      >
        <Handle type="target" position={Position.Left} className="!bg-gray-950 !opacity-0 transition group-hover:!opacity-100" />
        <div className="relative h-full w-full overflow-hidden rounded-[6px] bg-gray-50">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={media.title}
              className={`pointer-events-none select-none ${crop ? 'absolute max-w-none' : 'h-full w-full object-contain'}`}
              style={imageStyle}
              draggable={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs font-semibold text-gray-400">拖入图片</div>
          )}
        </div>
        {selected && media.assetId && !media.crop && (
          <button
            type="button"
            className="nodrag absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition hover:bg-gray-950 hover:text-white active:scale-[0.98]"
            onClick={(event) => {
              event.stopPropagation()
              data.onStartImageCrop?.(media.id)
            }}
            title="裁切图片"
            aria-label="裁切图片"
          >
            <Scissors className="h-3.5 w-3.5" />
          </button>
        )}
        <Handle type="source" position={Position.Right} className="!bg-gray-950 !opacity-0 transition group-hover:!opacity-100" />
      </div>
    )
  }

  return (
    <div className={`relative w-[280px] rounded-[18px] border bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ${selected ? 'border-violet-500' : 'border-gray-200'}`}>
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          {media?.kind === 'arrowAnnotation' ? <MousePointer2 className="h-4 w-4" /> : <Image className="h-4 w-4" />}
        </span>
        <div>
          <div className="text-sm font-black text-gray-950">{data.title}</div>
          <div className="text-[11px] font-bold text-gray-400">{media?.kind}</div>
        </div>
      </div>
      {media?.imageUrl ? (
        <img src={media.imageUrl} alt="" className="h-28 w-full rounded-xl object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-xs font-bold text-gray-400">
          {data.subtitle}
        </div>
      )}
      {media?.text && <p className="mt-3 text-sm font-semibold text-gray-700">{media.text}</p>}
      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
    </div>
  )
}
