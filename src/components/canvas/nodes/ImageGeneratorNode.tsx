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
  const status = data.status || imageGeneratorStatus(node)
  const resultThumbnailUrl = data.resultThumbnailUrl || imageGeneratorResultUrl(node)
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
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-600">Image generator</p>
            <h3 className="mt-1 truncate text-sm font-black text-gray-950">{node.title}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-700">
            {status}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-[1fr_112px] gap-3 p-4">
        <dl className="min-w-0 space-y-3 text-xs">
          <div>
            <dt className="font-semibold text-gray-400">Model</dt>
            <dd className="mt-1 break-all font-bold text-gray-900">{node.binding.modelId || 'Not configured'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-400">Size</dt>
            <dd className="mt-1 font-bold text-gray-900">{size}</dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-400">Mode</dt>
            <dd className="mt-1 font-bold capitalize text-gray-900">{node.mode}</dd>
          </div>
        </dl>

        <div className="flex min-h-[112px] items-center justify-center overflow-hidden rounded-[6px] border border-gray-200 bg-gray-50">
          {resultThumbnailUrl ? (
            <img src={resultThumbnailUrl} alt={`${node.title} result`} className="h-full w-full object-cover" />
          ) : (
            <span className="px-3 text-center text-[10px] font-semibold text-gray-400">No result yet</span>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <span className="text-[10px] font-semibold text-gray-400">{node.binding.connectionId || 'No connection'}</span>
        <button
          type="button"
          className="nodrag rounded-[6px] px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100"
          onClick={event => {
            event.stopPropagation()
            data.onOpenHistory?.(node.id)
          }}
        >
          History
        </button>
      </footer>

      <Handle
        id="image-output"
        type="source"
        position={Position.Right}
        aria-label="Image output"
        className="!h-3 !w-3 !border-2 !border-white !bg-sky-600"
      />
    </article>
  )
}

export const imageGeneratorStatus = (node: IFreeCanvasImageGeneratorNode): string => {
  const persistedStatus = node.meta.status
  if (typeof persistedStatus === 'string' && persistedStatus.trim()) return persistedStatus
  if (node.activeRunId) return 'Running'
  if (node.primaryAssetId) return 'Completed'
  return 'Ready'
}

export const imageGeneratorResultUrl = (node: IFreeCanvasImageGeneratorNode): string => {
  const resultUrl = node.meta.resultThumbnailUrl
  return typeof resultUrl === 'string' ? resultUrl : ''
}

const imageInputRole = (value: string | null): ImageInputRole | null => {
  if (value === 'prompt' || value === 'source-image' || value === 'reference-image') return value
  return null
}
