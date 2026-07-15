import { Handle, Position } from '@xyflow/react'
import type {
  IFreeCanvasImageGeneratorNode,
  IFreeCanvasProject,
  ImageInputRole
} from '@/models/PromptHistory.model'
import { validateImageGeneratorConnection } from '@/domain/free-canvas/image-generator-connections'

export interface ImageGeneratorNodeData extends Record<string, unknown> {
  canvasNode: IFreeCanvasImageGeneratorNode
  status?: string
  resultThumbnailUrl?: string
  onOpenHistory?: (nodeId: string) => void
  onConfigure?: (nodeId: string) => void
  onContinueCreation?: (nodeId: string) => void
  inputSummary?: {
    promptConnected: boolean
    sourceConnected: boolean
    referenceCount: number
  }
}

export interface ImageGeneratorNodeProps {
  data: ImageGeneratorNodeData
  selected?: boolean
}

export interface ImageGeneratorConnection {
  source: string | null
  target: string | null
  sourceHandle: string | null
  targetHandle: string | null
}

const INPUT_HANDLES: Array<{ id: ImageInputRole; label: string; top: string }> = [
  { id: 'prompt', label: 'Prompt', top: '29%' },
  { id: 'source-image', label: 'Source image', top: '46%' },
  { id: 'reference-image', label: 'Reference images', top: '63%' }
]

export const applyImageGeneratorConnection = (
  project: IFreeCanvasProject,
  connection: ImageGeneratorConnection,
  timestamp = Date.now()
): IFreeCanvasProject => {
  const { source, target } = connection
  const targetHandle = imageInputRole(connection.targetHandle)
  if (!source || !target || source === target || !targetHandle) return project

  const validationErrors = validateImageGeneratorConnection(project, {
    source,
    target,
    targetHandle
  })
  if (validationErrors.length > 0) return project

  const duplicate = project.edges.some(edge => (
    edge.source === source
    && edge.target === target
    && edge.targetHandle === targetHandle
  ))
  if (duplicate) return project

  const edgeId = `free-edge-${source}-${target}-${targetHandle}-${timestamp}`
  const referenceInputOrder = project.edges.filter(edge => (
    edge.target === target && edge.targetHandle === 'reference-image'
  )).length

  return {
    ...project,
    edges: [
      ...project.edges,
      {
        id: edgeId,
        source,
        target,
        ...(connection.sourceHandle ? { sourceHandle: connection.sourceHandle } : {}),
        targetHandle,
        ...(targetHandle === 'reference-image'
          ? {
              inputOrder: referenceInputOrder,
              referenceId: `reference-${edgeId}`
            }
          : {}),
        createdAt: timestamp
      }
    ]
  }
}

export const ImageGeneratorNode = ({ data, selected = false }: ImageGeneratorNodeProps) => {
  const node = data.canvasNode
  const resultThumbnailUrl = data.resultThumbnailUrl || imageGeneratorResultUrl(node)
  const inputSummary = data.inputSummary || { promptConnected: false, sourceConnected: false, referenceCount: 0 }
  const size = node.settings.aspectRatio === 'custom' && node.settings.width && node.settings.height
    ? `${node.settings.width} × ${node.settings.height}`
    : `${node.settings.resolution} · ${node.settings.aspectRatio}`

  return (
    <article
      data-image-generator-node
      className={`group relative overflow-hidden rounded-[8px] border bg-white shadow-[0_16px_44px_rgba(15,23,42,0.14)] ${
        selected ? 'border-sky-500 ring-2 ring-sky-200' : 'border-gray-200'
      }`}
      style={{ width: node.width }}
    >
      {INPUT_HANDLES.map(handle => (
        <div key={handle.id} className="absolute left-0 z-10" style={{ top: handle.top }}>
          <Handle
            id={handle.id}
            type="target"
            isConnectable={false}
            position={Position.Left}
            aria-label={`${handle.label} input`}
            className="!h-3 !w-3 !border-2 !border-white !bg-gray-950"
          />
          <span className="pointer-events-none ml-3 whitespace-nowrap rounded-r bg-white/95 px-2 py-1 text-[10px] font-bold text-gray-500">
            {handle.label}
          </span>
        </div>
      ))}

      <header className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-600">旧图片生成节点</p>
            <h3 className="mt-1 truncate text-sm font-black text-gray-950">{node.title}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-700">
            只读
          </span>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_112px] gap-3 p-4">
        <dl className="min-w-0 space-y-3 text-xs">
          <div>
            <dt className="font-semibold text-gray-400">模型</dt>
            <dd className="mt-1 break-all font-bold text-gray-900">{node.binding.modelId || '尚未配置图片生成模型'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-400">尺寸</dt>
            <dd className="mt-1 font-bold text-gray-900">{size}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-400">模式</dt>
            <dd className="mt-1 font-bold capitalize text-gray-900">{node.mode}</dd>
          </div>
        </dl>

        <div className="flex min-h-[112px] items-center justify-center overflow-hidden rounded-[6px] border border-gray-200 bg-gray-50">
          {resultThumbnailUrl ? (
            <img src={resultThumbnailUrl} alt={`${node.title} result`} className="h-full w-full object-cover" />
          ) : (
            <span className="px-3 text-center text-[10px] font-semibold text-gray-400">尚无生成结果</span>
          )}
        </div>
      </div>

      {!resultThumbnailUrl && (
        <p className="border-t border-gray-100 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">
          旧配置
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-2 text-[10px] font-bold text-gray-500">
        <span>提示词 {inputSummary.promptConnected ? '已连接' : '未连接'}</span>
        <span>主图 {inputSummary.sourceConnected ? '已连接' : '未连接'}</span>
        <span>参考图 {inputSummary.referenceCount}/{inputSummary.sourceConnected ? 9 : 10}</span>
      </div>

      <footer className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <span className="text-[10px] font-semibold text-gray-400">{node.binding.connectionId || '未连接模型服务'}</span>
        {data.onContinueCreation && (
          <button
            type="button"
            aria-label={`${resultThumbnailUrl ? '继续创作' : '打开图片生成'} ${node.title}`}
            className="nodrag rounded-[6px] bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800 hover:bg-sky-100"
            onClick={event => {
              event.stopPropagation()
              data.onContinueCreation?.(node.id)
            }}
          >
            {resultThumbnailUrl ? '继续创作' : '打开图片生成'}
          </button>
        )}
      </footer>

      <Handle
        id="image-output"
        type="source"
        isConnectable={false}
        position={Position.Right}
        aria-label="Image output"
        className="!h-3 !w-3 !border-2 !border-white !bg-sky-600"
      />
    </article>
  )
}

export const imageGeneratorStatusLabel = (status: string, configured = true): string => {
  if (!configured) return '待配置'
  if (status === 'validating') return '校验中'
  if (status === 'running') return '生成中'
  if (status === 'succeeded' || status === 'Completed') return '已完成'
  if (status === 'failed') return '失败'
  return '可生成'
}

export const imageGeneratorStatus = (node: IFreeCanvasImageGeneratorNode): string => {
  const persistedStatus = node.meta.status
  if (
    persistedStatus === 'idle'
    || persistedStatus === 'validating'
    || persistedStatus === 'running'
    || persistedStatus === 'succeeded'
    || persistedStatus === 'failed'
  ) return persistedStatus
  if (node.primaryAssetId) return 'succeeded'
  return 'idle'
}

export const imageGeneratorResultUrl = (node: IFreeCanvasImageGeneratorNode): string => {
  const resultUrl = node.meta.resultThumbnailUrl
  return typeof resultUrl === 'string' ? resultUrl : ''
}

const imageInputRole = (value: string | null): ImageInputRole | null => {
  if (value === 'prompt' || value === 'source-image' || value === 'reference-image') return value
  return null
}
