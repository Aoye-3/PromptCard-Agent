import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { GenerationHistoryPanelView } from './GenerationHistoryPanel'
import type { ImageGenerationRun } from '@/storage/storage-service-client'

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
