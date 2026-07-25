import { describe, expect, it, vi } from 'vitest'
import type { IFreeCanvasImageNode } from '@/models/PromptHistory.model'
import { planCanvasImageInput, resolveCanvasImageInput } from './canvas-image-input'

const node = (overrides: Partial<IFreeCanvasImageNode> = {}): IFreeCanvasImageNode => ({
  id: 'image-node',
  kind: 'image',
  title: 'Source',
  position: { x: 0, y: 0 },
  width: 320,
  height: 240,
  assetId: 'asset-canvas',
  annotations: [],
  meta: { originalAssetId: 'asset-original' },
  ...overrides
})

describe('canvas image provider input', () => {
  it('uses a plain ready asset without creating a derivative', async () => {
    const renderVisible = vi.fn()
    const persistProviderInput = vi.fn()
    const result = await resolveCanvasImageInput(node(), {
      renderVisible,
      persistProviderInput,
      assetUrl: id => `/assets/${id}`
    })

    expect(result).toMatchObject({
      originalAssetId: 'asset-original',
      canvasAssetId: 'asset-canvas',
      providerAssetId: 'asset-canvas',
      requiresVisibleRaster: false
    })
    expect(renderVisible).not.toHaveBeenCalled()
    expect(persistProviderInput).not.toHaveBeenCalled()
  })

  it('persists the exact visible crop, presentation, and annotation input', async () => {
    const source = node({
      crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
      annotations: [{
        id: 'annotation-1',
        kind: 'rect',
        x: 0.2,
        y: 0.2,
        width: 0.2,
        height: 0.2,
        color: '#111827',
        createdAt: 1,
        updatedAt: 1,
        meta: {}
      }],
      meta: { originalAssetId: 'asset-original', presentation: { flipX: true } }
    })
    const blob = new Blob(['visible'], { type: 'image/png' })
    const persistProviderInput = vi.fn().mockResolvedValue({
      providerAssetId: 'asset-visible-provider',
      previewUrl: '/assets/asset-visible-provider'
    })

    const result = await resolveCanvasImageInput(source, {
      renderVisible: vi.fn().mockResolvedValue(blob),
      persistProviderInput,
      assetUrl: id => `/assets/${id}`
    })

    expect(result).toMatchObject({
      originalAssetId: 'asset-original',
      providerAssetId: 'asset-visible-provider',
      includesCrop: true,
      includesAnnotations: true,
      includesPresentation: true
    })
    expect(persistProviderInput).toHaveBeenCalledWith(blob, expect.objectContaining({
      sourceAssetId: 'asset-original',
      derivationKind: 'annotation-flattened',
      transform: expect.objectContaining({
        kind: 'canvas-visible-input',
        annotationIds: ['annotation-1']
      })
    }))
  })

  it('rejects running, failed, and document-like image targets before persistence', () => {
    expect(planCanvasImageInput(node({ assetId: null, meta: { generationState: 'running' } }))).toBeNull()
    expect(planCanvasImageInput(node({ meta: { generationState: 'failed' } }))).toBeNull()
  })
})
