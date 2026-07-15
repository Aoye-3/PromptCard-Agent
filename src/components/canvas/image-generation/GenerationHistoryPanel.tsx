import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react'
import {
  storageServiceClient,
  type ImageGenerationRun,
  type ImageGenerationRunPage
} from '@/storage/storage-service-client'

export interface GenerationHistoryPanelProps {
  projectId: string
  nodeId: string
  pageSize?: number
  loadPage?: (query: {
    projectId: string
    nodeId: string
    cursor?: string | null
    limit?: number
    signal?: AbortSignal
  }) => Promise<ImageGenerationRunPage>
}

export const GenerationHistoryPanel = ({
  projectId,
  nodeId,
  pageSize = 25,
  loadPage = storageServiceClient.imageGenerationRuns.getPage
}: GenerationHistoryPanelProps) => {
  const [runs, setRuns] = useState<ImageGenerationRun[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
        nodeId,
        cursor,
        limit: pageSize,
        signal: controller.signal
      })
      if (controller.signal.aborted || generation !== generationRef.current) return
      setRuns(current => replace ? page.runs : appendUniqueRuns(current, page.runs))
      setNextCursor(page.nextCursor)
    } catch {
      if (controller.signal.aborted || generation !== generationRef.current) return
      setError('Generation history could not be loaded')
    } finally {
      if (requestsRef.current.get(requestKey) === controller) {
        requestsRef.current.delete(requestKey)
      }
      if (!controller.signal.aborted && generation === generationRef.current) {
        setLoading(requestsRef.current.size > 0)
      }
    }
  }, [loadPage, nodeId, pageSize, projectId])

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
      onLoadMore={loadMore}
    />
  )
}

export interface GenerationHistoryPanelViewProps {
  runs: readonly ImageGenerationRun[]
  nextCursor: string | null
  loading: boolean
  error?: string | null
  onLoadMore: () => void
}

export const GenerationHistoryPanelView = ({
  runs,
  nextCursor,
  loading,
  error = null,
  onLoadMore
}: GenerationHistoryPanelViewProps) => {
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    if (nextCursor && !loading && target.scrollHeight - target.scrollTop - target.clientHeight < 40) {
      onLoadMore()
    }
  }
  return (
    <section aria-label="Generation history" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-950">Generation history</h3>
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Permanent</span>
      </div>
      {error && <div role="alert" className="text-xs font-bold text-red-700">{error}</div>}
      <div className="max-h-96 space-y-2 overflow-y-auto" onScroll={handleScroll}>
        {runs.map(run => <GenerationRunCard key={run.id} run={run} />)}
        {!loading && runs.length === 0 && <p className="text-xs font-semibold text-gray-500">No generation history yet.</p>}
      </div>
      {loading && <p className="text-xs font-bold text-gray-500">Loading history…</p>}
      {nextCursor && (
        <button type="button" className="rounded-[6px] border px-3 py-2 text-xs font-bold" disabled={loading} onClick={onLoadMore}>
          Load more
        </button>
      )}
    </section>
  )
}

const GenerationRunCard = ({ run }: { run: ImageGenerationRun }) => {
  const prompt = run.requestSnapshot.promptDocument.segments.map(segment => (
    segment.type === 'text' ? segment.text : `@${segment.label}`
  )).join('')
  const timestamp = run.finishedAt ?? run.startedAt ?? run.createdAt
  return (
    <article className="space-y-2 rounded-[8px] border border-gray-200 p-3" data-generation-run={run.id}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black text-gray-900">{stateLabel(run.state)}</span>
        <time dateTime={new Date(timestamp).toISOString()} className="text-[10px] font-semibold text-gray-500">
          {new Date(timestamp).toLocaleString()}
        </time>
      </div>
      <p className="text-[11px] font-bold text-gray-600">{run.modelId} · {run.requestSnapshot.resolution}</p>
      <p className="whitespace-pre-wrap text-xs text-gray-800">{prompt}</p>
      {run.requestSnapshot.inputAssets.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Input images">
          {run.requestSnapshot.inputAssets.map(input => (
            <img
              key={`${input.referenceId}-${input.order}`}
              src={assetUrl(input.assetId)}
              alt={input.referenceId}
              className="h-12 w-12 rounded object-cover"
            />
          ))}
        </div>
      )}
      {run.outputAssetIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Generated outputs">
          {run.outputAssetIds.map(assetId => (
            <img
              key={assetId}
              src={assetUrl(assetId)}
              alt="Generated output"
              className="h-16 w-16 rounded object-cover"
            />
          ))}
        </div>
      )}
      {run.error && (
        <div role="alert" className="text-xs font-bold text-red-700">
          {run.error.message} {run.error.retryable ? '(retryable)' : ''}
        </div>
      )}
    </article>
  )
}

const assetUrl = (assetId: string): string => `/storage-api/assets/${encodeURIComponent(assetId)}`
const stateLabel = (state: ImageGenerationRun['state']): string => state.charAt(0).toUpperCase() + state.slice(1)
const appendUniqueRuns = (
  current: readonly ImageGenerationRun[],
  incoming: readonly ImageGenerationRun[]
): ImageGenerationRun[] => {
  const ids = new Set(current.map(run => run.id))
  return [...current, ...incoming.filter(run => !ids.has(run.id) && ids.add(run.id))]
}

export default GenerationHistoryPanel
