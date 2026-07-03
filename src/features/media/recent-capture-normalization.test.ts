import { describe, expect, it } from 'vitest'
import type { RecentCaptureItem } from '@/storage/storage-service-client'
import { createRecentCaptureViewModel, createScreenshotCaptureDraft } from './recent-capture-normalization'

describe('recent capture normalization', () => {
  it('maps persisted screenshot captures to media view models', () => {
    const now = Date.now()
    const viewModel = createRecentCaptureViewModel({
      id: 'capture-1',
      assetId: 'asset-1.png',
      kind: 'screenshot',
      status: 'recent',
      purpose: 'inspirationReference',
      role: 'style',
      title: 'Reference frame',
      prompt: '',
      userNote: '',
      sourcePlatform: 'Floating toolbar',
      sourceUrl: '',
      contentType: 'image/png',
      size: 1536,
      width: 640,
      height: 360,
      capturedAt: now,
      origin: { type: 'floating-toolbar' },
      createdAt: now,
      updatedAt: now,
      revision: 1
    } satisfies RecentCaptureItem)

    expect(viewModel).toMatchObject({
      id: 'capture-1',
      assetId: 'asset-1.png',
      kind: 'screenshot',
      contentType: 'image/png',
      sizeLabel: '1.5 KB',
      dimensionsLabel: '640 x 360'
    })
  })

  it('creates screenshot capture drafts with required metadata', () => {
    const draft = createScreenshotCaptureDraft({
      assetId: 'asset-1.png',
      filename: 'screenshot.png',
      size: 2048,
      width: 800,
      height: 450,
      capturedAt: 1234,
      selection: { x: 1, y: 2, width: 3, height: 4 }
    })

    expect(draft).toMatchObject({
      id: 'capture-1234',
      assetId: 'asset-1.png',
      kind: 'screenshot',
      status: 'recent',
      contentType: 'image/png',
      capturedAt: 1234,
      width: 800,
      height: 450,
      origin: { type: 'floating-toolbar', selection: { x: 1, y: 2, width: 3, height: 4 } }
    })
  })
})
