import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react'
import {
  storageServiceClient,
  type ImageGenerationRun,
  type ImageGenerationRunPage
} from '@/storage/storage-service-client'

export type GenerationHistoryScope = 'node' | 'project'
export type GenerationHistoryStatusFilter = 'all' | ImageGenerationRun['state']

export interface GenerationHistoryPanelProps {
  projectId: string
  nodeId: string
  pageSize?: number
  loadPage?: (query: {
    projectId: string
    nodeId?: string
    cursor?: string | null
    limit?: number
    signal?: AbortSignal
  }) => Promise<ImageGenerationRunPage>
  onRetry?: (run: ImageGenerationRun) => void
  onSetCurrentResult?: (run: ImageGenerationRun, assetId: string) => void
  onPlaceOnCanvas?: (run: ImageGenerationRun, assetId: string) => void
}

export const GenerationHistoryPanel = ({
  projectId,
  nodeId,
  pageSize = 25,
  loadPage = storageServiceClient.imageGenerationRuns.getPage,
  onRetry,
  onSetCurrentResult,
  onPlaceOnCanvas
}: GenerationHistoryPanelProps) => {
  const [runs, setRuns] = useState<ImageGenerationRun[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<GenerationHistoryScope>('node')
  const [statusFilter, setStatusFilter] = useState<GenerationHistoryStatusFilter>('all')
  const generationRef = useRef(0)
  const requestsRef = useRef(new Map<string, AbortController>())

  const abortRequests = useCallback(() => {
    requestsRef.current.forEach(controller => controller.abort())
    requestsRef.current.clear()
  }, [])

  const fetchPage = useCallback(async (
    cursor: string | null,
    replace: boolean,
    generation: number
  ) => {
    const requestKey = cursor || '__initial__'
    if (requestsRef.current.has(requestKey)) return
    const controller = new AbortController()
    requestsRef.current.set(requestKey, controller)
    setLoading(true)
    setError(null)
    try {
      const page = await loadPage({
        projectId,
        nodeId: scope === 'node' ? nodeId : undefined,
        cursor,
        limit: pageSize,
        signal: controller.signal
      })
      if (controller.signal.aborted || generation !== generationRef.current) return
      setRuns(current => replace ? page.runs : appendUniqueRuns(current, page.runs))
      setNextCursor(page.nextCursor)
    } catch {
      if (controller.signal.aborted || generation !== generationRef.current) return
      setError('生成历史加载失败，请稍后重试。')
    } finally {
      if (requestsRef.current.get(requestKey) === controller) requestsRef.current.delete(requestKey)
      if (!controller.signal.aborted && generation === generationRef.current) {
        setLoading(requestsRef.current.size > 0)
      }
    }
  }, [loadPage, nodeId, pageSize, projectId, scope])

  useEffect(() => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    abortRequests()
    setRuns([])
    setNextCursor(null)
    void fetchPage(null, true, generation)
    return () => {
      if (generationRef.current === generation) generationRef.current += 1
      abortRequests()
    }
  }, [abortRequests, fetchPage])

  const loadMore = () => {
    if (nextCursor) void fetchPage(nextCursor, false, generationRef.current)
  }

  return (
    <GenerationHistoryPanelView
      runs={runs}
      nextCursor={nextCursor}
      loading={loading}
      error={error}
      scope={scope}
      statusFilter={statusFilter}
      onScopeChange={setScope}
      onStatusFilterChange={setStatusFilter}
      onLoadMore={loadMore}
      onRetry={onRetry}
      onSetCurrentResult={onSetCurrentResult}
      onPlaceOnCanvas={onPlaceOnCanvas}
    />
  )
}

export interface GenerationHistoryPanelViewProps {
  runs: readonly ImageGenerationRun[]
  nextCursor: string | null
  loading: boolean
  error?: string | null
  scope?: GenerationHistoryScope
  statusFilter?: GenerationHistoryStatusFilter
  onScopeChange?: (scope: GenerationHistoryScope) => void
  onStatusFilterChange?: (status: GenerationHistoryStatusFilter) => void
  onLoadMore: () => void
  onRetry?: (run: ImageGenerationRun) => void
  onSetCurrentResult?: (run: ImageGenerationRun, assetId: string) => void
  onPlaceOnCanvas?: (run: ImageGenerationRun, assetId: string) => void
}

export const GenerationHistoryPanelView = ({
  runs,
  nextCursor,
  loading,
  error = null,
  scope = 'node',
  statusFilter = 'all',
  onScopeChange,
  onStatusFilterChange,
  onLoadMore,
  onRetry,
  onSetCurrentResult,
  onPlaceOnCanvas
}: GenerationHistoryPanelViewProps) => {
  const visibleRuns = statusFilter === 'all' ? runs : runs.filter(run => run.state === statusFilter)
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    if (nextCursor && !loading && target.scrollHeight - target.scrollTop - target.clientHeight < 40) onLoadMore()
  }
  return (
    <section aria-label="生成历史" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-950">生成历史</h3>
        <span className="text-[10px] font-bold tracking-wide text-gray-500">永久保留</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div aria-label="历史范围" className="flex rounded-[6px] border border-gray-200 p-0.5">
          <button type="button" aria-pressed={scope === 'node'} className="rounded px-2 py-1 text-xs font-bold" onClick={() => onScopeChange?.('node')}>当前节点</button>
          <button type="button" aria-pressed={scope === 'project'} className="rounded px-2 py-1 text-xs font-bold" onClick={() => onScopeChange?.('project')}>当前项目</button>
        </div>
        <label className="text-xs font-bold text-gray-600">
          状态
          <select
            aria-label="筛选生成状态"
            className="ml-2 rounded-[6px] border border-gray-200 px-2 py-1 text-xs"
            value={statusFilter}
            onChange={event => onStatusFilterChange?.(event.target.value as GenerationHistoryStatusFilter)}
          >
            <option value="all">全部</option>
            <option value="queued">排队中</option>
            <option value="running">生成中</option>
            <option value="succeeded">已完成</option>
            <option value="failed">失败</option>
          </select>
        </label>
      </div>
      {error && <div role="alert" className="text-xs font-bold text-red-700">{error}</div>}
      <div className="max-h-96 space-y-2 overflow-y-auto" onScroll={handleScroll}>
        {visibleRuns.map(run => (
          <GenerationRunCard key={run.id} run={run} onRetry={onRetry} onSetCurrentResult={onSetCurrentResult} onPlaceOnCanvas={onPlaceOnCanvas} />
        ))}
        {!loading && visibleRuns.length === 0 && <p className="text-xs font-semibold text-gray-500">暂无符合条件的生成历史。</p>}
      </div>
      {loading && <p role="status" className="text-xs font-bold text-gray-500">正在加载历史…</p>}
      {nextCursor && (
        <button type="button" className="rounded-[6px] border px-3 py-2 text-xs font-bold" disabled={loading} onClick={onLoadMore}>加载更多</button>
      )}
    </section>
  )
}

interface GenerationRunCardProps {
  run: ImageGenerationRun
  onRetry?: (run: ImageGenerationRun) => void
  onSetCurrentResult?: (run: ImageGenerationRun, assetId: string) => void
  onPlaceOnCanvas?: (run: ImageGenerationRun, assetId: string) => void
}

const GenerationRunCard = ({ run, onRetry, onSetCurrentResult, onPlaceOnCanvas }: GenerationRunCardProps) => {
  const prompt = run.requestSnapshot.promptDocument.segments.map(segment => (
    segment.type === 'text' ? segment.text : `@${segment.label}`
  )).join('')
  const timestamp = run.finishedAt ?? run.startedAt ?? run.createdAt
  const outputAssetId = run.outputAssetIds[0]
  return (
    <article className="space-y-2 rounded-[8px] border border-gray-200 p-3" data-generation-run={run.id}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black text-gray-900">{stateLabel(run.state)}</span>
        <time dateTime={new Date(timestamp).toISOString()} className="text-[10px] font-semibold text-gray-500">{new Date(timestamp).toLocaleString()}</time>
      </div>
      <p className="text-[11px] font-bold text-gray-600">{run.modelId} · {run.requestSnapshot.resolution}</p>
      <p className="whitespace-pre-wrap text-xs text-gray-800">{prompt}</p>
      {run.requestSnapshot.inputAssets.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="输入图片">
          {run.requestSnapshot.inputAssets.map(input => <img key={`${input.referenceId}-${input.order}`} src={assetUrl(input.assetId)} alt={input.referenceId} className="h-12 w-12 rounded object-cover" />)}
        </div>
      )}
      {run.outputAssetIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="生成结果">
          {run.outputAssetIds.map(assetId => <img key={assetId} src={assetUrl(assetId)} alt="生成结果" className="h-16 w-16 rounded object-cover" />)}
        </div>
      )}
      {run.error && <div role="alert" className="text-xs font-bold text-red-700">{run.error.message} {run.error.retryable ? '（可重试）' : ''}</div>}
      {run.state === 'failed' && run.error?.retryable && onRetry && (
        <button type="button" className="rounded-[6px] border px-2 py-1 text-xs font-bold" onClick={() => onRetry(run)}>重试</button>
      )}
      {run.state === 'succeeded' && outputAssetId && (
        <div className="flex flex-wrap gap-2">
          {onSetCurrentResult && <button type="button" className="rounded-[6px] border px-2 py-1 text-xs font-bold" onClick={() => onSetCurrentResult(run, outputAssetId)}>设为当前结果</button>}
          {onPlaceOnCanvas && <button type="button" className="rounded-[6px] border px-2 py-1 text-xs font-bold" onClick={() => onPlaceOnCanvas(run, outputAssetId)}>放入画布</button>}
        </div>
      )}
    </article>
  )
}

const assetUrl = (assetId: string): string => `/storage-api/assets/${encodeURIComponent(assetId)}`
const stateLabel = (state: ImageGenerationRun['state']): string => ({ queued: '排队中', running: '生成中', succeeded: '已完成', failed: '失败' })[state]
const appendUniqueRuns = (current: readonly ImageGenerationRun[], incoming: readonly ImageGenerationRun[]): ImageGenerationRun[] => {
  const ids = new Set(current.map(run => run.id))
  return [...current, ...incoming.filter(run => !ids.has(run.id) && ids.add(run.id))]
}

export default GenerationHistoryPanel
