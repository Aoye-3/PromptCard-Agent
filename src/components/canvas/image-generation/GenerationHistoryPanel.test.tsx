import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenerationHistoryPanel, GenerationHistoryPanelView } from './GenerationHistoryPanel'
import type { ImageGenerationRun, ImageGenerationRunPage } from '@/storage/storage-service-client'

const succeeded: ImageGenerationRun = {
  id: 'run-success', projectId: 'project-1', nodeId: 'node-1', connectionId: 'ark-primary',
  providerId: 'volcengine', modelId: 'seedream', state: 'succeeded', createdAt: 100,
  finishedAt: 200, outputAssetIds: ['asset-output.png'],
  requestSnapshot: {
    mode: 'generate', resolution: '2K', outputFormat: 'png', watermark: false,
    promptDocument: { version: 1, segments: [{ type: 'text', text: 'A polished product' }] },
    inputAssets: [{ referenceId: 'product', assetId: 'asset-input.png', order: 0 }],
    regions: []
  }
}

const failed: ImageGenerationRun = {
  ...succeeded,
  id: 'run-failed',
  state: 'failed',
  outputAssetIds: [],
  error: { code: 'rate_limited', message: 'Provider rate limit reached', retryable: true }
}

const page = (runs: ImageGenerationRun[], nextCursor: string | null = null): ImageGenerationRunPage => ({
  runs,
  nextCursor
})

const runFor = (id: string, projectId: string, nodeId: string): ImageGenerationRun => ({
  ...succeeded,
  id,
  projectId,
  nodeId,
  outputAssetIds: [`${id}.png`]
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const mountedRunIds = (renderer: ReactTestRenderer): string[] => renderer.root
  .findAll(node => typeof node.props['data-generation-run'] === 'string')
  .map(node => node.props['data-generation-run'] as string)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GenerationHistoryPanelView', () => {
  it('shows permanent success/failure details and pagination without delete controls', () => {
    const onLoadMore = vi.fn()
    const markup = renderToStaticMarkup(
      <GenerationHistoryPanelView runs={[succeeded, failed]} nextCursor="cursor-2" loading={false} onLoadMore={onLoadMore} />
    )

    expect(markup).toContain('已完成')
    expect(markup).toContain('失败')
    expect(markup).toContain('seedream')
    expect(markup).toContain('2K')
    expect(markup).toContain('A polished product')
    expect(markup).toContain('/storage-api/assets/asset-input.png')
    expect(markup).toContain('/storage-api/assets/asset-output.png')
    expect(markup).toContain('Provider rate limit reached')
    expect(markup).toContain('加载更多')
    expect(markup).not.toContain('Delete')
  })

  it('filters statuses and exposes retry and successful result actions through callbacks', () => {
    const onRetry = vi.fn()
    const onSetCurrentResult = vi.fn()
    const onPlaceOnCanvas = vi.fn()
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(
        <GenerationHistoryPanelView
          runs={[succeeded, failed]}
          nextCursor={null}
          loading={false}
          statusFilter="failed"
          onStatusFilterChange={vi.fn()}
          onLoadMore={vi.fn()}
          onRetry={onRetry}
          onSetCurrentResult={onSetCurrentResult}
          onPlaceOnCanvas={onPlaceOnCanvas}
        />
      )
    })

    expect(mountedRunIds(renderer)).toEqual(['run-failed'])
    act(() => renderer.root.findByProps({ children: '重试' }).props.onClick())
    expect(onRetry).toHaveBeenCalledWith(failed)

    act(() => renderer.update(
      <GenerationHistoryPanelView
        runs={[succeeded, failed]}
        nextCursor={null}
        loading={false}
        statusFilter="succeeded"
        onStatusFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={onRetry}
        onSetCurrentResult={onSetCurrentResult}
        onPlaceOnCanvas={onPlaceOnCanvas}
      />
    ))
    act(() => renderer.root.findByProps({ children: '设为当前结果' }).props.onClick())
    act(() => renderer.root.findByProps({ children: '放入画布' }).props.onClick())
    expect(onSetCurrentResult).toHaveBeenCalledWith(succeeded, 'asset-output.png')
    expect(onPlaceOnCanvas).toHaveBeenCalledWith(succeeded, 'asset-output.png')
  })
})

describe('GenerationHistoryPanel async isolation', () => {
  it('switches between current node and current project without sending a node id for project scope', async () => {
    const loadPage = vi.fn(() => Promise.resolve(page([])))
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(<GenerationHistoryPanel projectId="project-1" nodeId="node-1" loadPage={loadPage} />)
    })

    act(() => renderer.root.findByProps({ children: '当前项目' }).props.onClick())
    await act(async () => {})

    expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: 'project-1', nodeId: undefined, cursor: null, limit: 25
    }))
    expect(renderer.root.findByProps({ children: '当前项目' }).props['aria-pressed']).toBe(true)
  })

  it('ignores an old project response that resolves after the new project', async () => {
    const oldRequest = deferred<ImageGenerationRunPage>()
    const newRequest = deferred<ImageGenerationRunPage>()
    const loadPage = vi.fn(({ projectId }: { projectId: string }) => (
      projectId === 'project-old' ? oldRequest.promise : newRequest.promise
    ))
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<GenerationHistoryPanel projectId="project-old" nodeId="node-1" loadPage={loadPage} />)
    })

    act(() => renderer.update(
      <GenerationHistoryPanel projectId="project-new" nodeId="node-2" loadPage={loadPage} />
    ))
    await act(async () => { newRequest.resolve(page([runFor('run-new', 'project-new', 'node-2')])) })
    expect(mountedRunIds(renderer)).toEqual(['run-new'])

    await act(async () => { oldRequest.resolve(page([runFor('run-old', 'project-old', 'node-1')])) })
    expect(mountedRunIds(renderer)).toEqual(['run-new'])
  })

  it('does not append a pending old load-more page after identity switches', async () => {
    const oldLoadMore = deferred<ImageGenerationRunPage>()
    const newInitial = deferred<ImageGenerationRunPage>()
    const loadPage = vi.fn((query: { projectId: string; cursor?: string | null }) => {
      if (query.projectId === 'project-old' && !query.cursor) {
        return Promise.resolve(page([runFor('run-old-1', 'project-old', 'node-1')], 'old-cursor'))
      }
      if (query.projectId === 'project-old') return oldLoadMore.promise
      return newInitial.promise
    })
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(<GenerationHistoryPanel projectId="project-old" nodeId="node-1" loadPage={loadPage} />)
    })
    act(() => renderer.root.findByProps({ children: '加载更多' }).props.onClick())
    act(() => renderer.update(
      <GenerationHistoryPanel projectId="project-new" nodeId="node-2" loadPage={loadPage} />
    ))

    await act(async () => { newInitial.resolve(page([runFor('run-new', 'project-new', 'node-2')])) })
    await act(async () => { oldLoadMore.resolve(page([runFor('run-old-2', 'project-old', 'node-1')])) })

    expect(mountedRunIds(renderer)).toEqual(['run-new'])
  })

  it('loads the next cursor once through the mounted Load more handler', async () => {
    const secondPage = deferred<ImageGenerationRunPage>()
    const loadPage = vi.fn((query: { cursor?: string | null }) => query.cursor
      ? secondPage.promise
      : Promise.resolve(page([runFor('run-1', 'project-1', 'node-1')], 'cursor-2')))
    let renderer!: ReactTestRenderer
    await act(async () => {
      renderer = create(<GenerationHistoryPanel projectId="project-1" nodeId="node-1" loadPage={loadPage} />)
    })

    act(() => {
      const onClick = renderer.root.findByProps({ children: '加载更多' }).props.onClick
      onClick()
      onClick()
    })

    expect(loadPage).toHaveBeenCalledTimes(2)
    expect(loadPage).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: 'project-1', nodeId: 'node-1', cursor: 'cursor-2', limit: 25
    }))
    await act(async () => {
      secondPage.resolve(page([
        runFor('run-1', 'project-1', 'node-1'),
        runFor('run-2', 'project-1', 'node-1')
      ], 'cursor-3'))
    })
    expect(mountedRunIds(renderer)).toEqual(['run-1', 'run-2'])
    expect(renderer.root.findByProps({ children: '加载更多' })).toBeTruthy()
  })

  it('aborts the pending request and performs no render after unmount', async () => {
    const pending = deferred<ImageGenerationRunPage>()
    let signal: AbortSignal | undefined
    const loadPage = vi.fn((query: { signal?: AbortSignal }) => {
      signal = query.signal
      return pending.promise
    })
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<GenerationHistoryPanel projectId="project-1" nodeId="node-1" loadPage={loadPage} />)
    })

    act(() => renderer.unmount())
    expect(signal?.aborted).toBe(true)
    await act(async () => { pending.resolve(page([runFor('run-late', 'project-1', 'node-1')])) })
    expect(renderer.toJSON()).toBeNull()
  })

  it('aborts the real Storage fetch on identity switch and unmount', async () => {
    const fetchSignals: AbortSignal[] = []
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) throw new Error('Expected a fetch signal')
      fetchSignals.push(signal)
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    let renderer!: ReactTestRenderer
    act(() => {
      renderer = create(<GenerationHistoryPanel projectId="project-old" nodeId="node-1" />)
    })

    await act(async () => {
      renderer.update(<GenerationHistoryPanel projectId="project-new" nodeId="node-2" />)
    })
    expect(fetchSignals).toHaveLength(2)
    expect(fetchSignals[0].aborted).toBe(true)
    expect(fetchSignals[1].aborted).toBe(false)

    await act(async () => { renderer.unmount() })
    expect(fetchSignals[1].aborted).toBe(true)
  })
})
