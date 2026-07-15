export interface ImageResultIdentity {
  runId: string
  assetId: string
}

export interface ResultActionsProps extends ImageResultIdentity {
  onView?: (result: ImageResultIdentity) => void
  onSmartEdit?: (result: ImageResultIdentity) => void
  onPlaceAsImage?: (result: ImageResultIdentity) => void
  onConnectToGenerator?: (result: ImageResultIdentity) => void
  onViewHistory?: (result: ImageResultIdentity) => void
  onViewInMedia?: (result: ImageResultIdentity) => void
}

export const ResultActions = ({ runId, assetId, ...callbacks }: ResultActionsProps) => {
  const result = { runId, assetId }
  const actions = [
    ['查看大图', callbacks.onView],
    ['智能改图', callbacks.onSmartEdit],
    ['作为图片放入画布', callbacks.onPlaceAsImage],
    ['连接到新图片生成节点', callbacks.onConnectToGenerator],
    ['查看本次历史', callbacks.onViewHistory],
    ['在媒体库中查看', callbacks.onViewInMedia]
  ] as const

  return (
    <div aria-label="生成结果操作" className="flex flex-wrap gap-2">
      {actions.map(([label, callback]) => callback && (
        <button key={label} type="button" className="rounded-[6px] border border-gray-200 px-2 py-1 text-xs font-bold text-gray-800" onClick={() => callback(result)}>{label}</button>
      ))}
    </div>
  )
}

export default ResultActions
