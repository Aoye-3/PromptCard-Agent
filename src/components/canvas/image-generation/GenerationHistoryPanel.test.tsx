import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
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

describe('GenerationHistoryPanelView', () => {
  it('shows permanent success/failure details and pagination without delete controls', () => {
    const onLoadMore = vi.fn()
    const markup = renderToStaticMarkup(
      <GenerationHistoryPanelView runs={[succeeded, failed]} nextCursor="cursor-2" loading={false} onLoadMore={onLoadMore} />
    )

    expect(markup).toContain('Succeeded')
    expect(markup).toContain('Failed')
    expect(markup).toContain('seedream')
    expect(markup).toContain('2K')
    expect(markup).toContain('A polished product')
    expect(markup).toContain('/storage-api/assets/asset-input.png')
    expect(markup).toContain('/storage-api/assets/asset-output.png')
    expect(markup).toContain('Provider rate limit reached')
    expect(markup).toContain('Load more')
    expect(markup).not.toContain('Delete')
  })
})

describe('GenerationHistoryPanel async isolation', () => {
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
    act(() => renderer.root.findByProps({ children: 'Load more' }).props.onClick())
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
      const onClick = renderer.root.findByProps({ children: 'Load more' }).props.onClick
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
    expect(renderer.root.findByProps({ children: 'Load more' })).toBeTruthy()
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
})
