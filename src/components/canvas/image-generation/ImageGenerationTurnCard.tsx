import { AlertCircle, Clock3, Image as ImageIcon } from 'lucide-react'
import type { ImageGenerationTurn, ImageGenerationTurnAction } from './types'

export interface ImageGenerationTurnCardProps {
  turn: ImageGenerationTurn
  compact?: boolean
  onAction?: (turn: ImageGenerationTurn, action: ImageGenerationTurnAction) => void
}

const WORKFLOW_LABELS: Record<ImageGenerationTurn['settings']['workflow'], string> = {
  'text-to-image': '文生图',
  'reference-generate': '参考图生成',
  'smart-edit': '智能改图',
  'region-edit': '局部修改'
}

const STATE_LABELS: Record<ImageGenerationTurn['state'], string> = {
  queued: '等待生成',
  running: '生成中',
  succeeded: '已完成',
  failed: '生成失败'
}

export const ImageGenerationTurnCard = ({ turn, compact = false, onAction }: ImageGenerationTurnCardProps) => {
  const settings = turn.settings
  return (
    <article
      data-image-generation-turn={turn.id}
      className="space-y-3 border-b border-gray-200 py-4 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-900">{turn.prompt}</p>
          <p className="mt-1 text-xs text-gray-500">
            {WORKFLOW_LABELS[settings.workflow]} · {settings.modelLabel}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-bold text-gray-700">
          {STATE_LABELS[turn.state]}
        </span>
      </div>

      <dl aria-label="本次生成设置" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        <div><dt className="sr-only">尺寸</dt><dd>{settings.resolution} · {settings.aspectRatio} · {settings.outputFormat.toUpperCase()}</dd></div>
        <div><dt className="sr-only">水印</dt><dd>{settings.watermark ? '包含水印' : '无水印'}</dd></div>
      </dl>

      {turn.inputs && turn.inputs.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="本次输入图片">
          {turn.inputs.map((input, index) => (
            <img key={`${input.referenceId}-${input.assetId}`} src={input.imageUrl} alt={`输入图 ${index + 1}`} className="h-12 w-12 rounded-md border border-gray-200 object-cover" />
          ))}
          {turn.regionCount ? <span className="self-center text-xs font-bold text-gray-500">{turn.regionCount} 个区域</span> : null}
        </div>
      )}

      {turn.state === 'running' && (
        <p role="status" className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          <Clock3 size={14} aria-hidden="true" /> 图片正在生成，请稍候
        </p>
      )}

      {turn.result && (
        <figure className={compact ? 'max-w-xs' : 'max-w-lg'}>
          <img
            src={turn.result.imageUrl}
            alt={`生成结果 ${turn.result.width} × ${turn.result.height}`}
            className="max-h-80 w-full rounded-lg border border-gray-200 bg-gray-50 object-contain"
          />
          <figcaption className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <ImageIcon size={13} aria-hidden="true" /> {turn.result.width} × {turn.result.height}
          </figcaption>
        </figure>
      )}

      {turn.error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p>{turn.error.message}</p>
            {turn.error.action && (
              <button
                type="button"
                className="mt-2 rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-bold"
                disabled={!onAction}
                onClick={() => onAction?.(turn, 'again')}
              >
                {turn.error.action}
              </button>
            )}
          </div>
        </div>
      )}
      {turn.result && onAction && !compact && (
        <div className="flex flex-wrap gap-2" aria-label="生成结果操作">
          <TurnAction label="再次生成" onClick={() => onAction(turn, 'again')} />
          <TurnAction label="重新编辑" onClick={() => onAction(turn, 'edit')} />
          <TurnAction label="作为参考图" onClick={() => onAction(turn, 'reference')} />
          <TurnAction label="放入画布" onClick={() => onAction(turn, 'place')} />
          <TurnAction label="媒体库查看" onClick={() => onAction(turn, 'media')} />
        </div>
      )}
    </article>
  )
}

const TurnAction = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="rounded-md border border-gray-200 px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-50" onClick={onClick}>
    {label}
  </button>
)

export default ImageGenerationTurnCard
