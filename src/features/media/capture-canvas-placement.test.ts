import { describe, expect, it } from 'vitest'
import type { RecentCaptureItem } from '@/storage/storage-service-client'
import { createCaptureCanvasMediaNode, createCaptureCanvasUpdates } from './capture-canvas-placement'

const capture = (registeredPromptId: string | null = null): RecentCaptureItem => ({
  id: 'capture-1', assetId: 'asset-shared.png', kind: 'screenshot', status: registeredPromptId ? 'registeredToPromptLibrary' : 'recent',
  purpose: 'inspirationReference', role: 'scene', title: 'Scene', prompt: 'Scene prompt', userNote: '', sourcePlatform: 'Clipboard', sourceUrl: '',
  contentType: 'image/png', size: 100, width: 1200, height: 800, capturedAt: 1, origin: {}, createdAt: 1, updatedAt: 1, revision: 2,
  registeredPromptId
})

describe('capture Canvas placement', () => {
  it('creates unique Canvas nodes that keep the capture asset id', () => {
    const first = createCaptureCanvasMediaNode(capture(), 100)
    const second = createCaptureCanvasMediaNode(capture(), 101)
    expect(first.id).not.toBe(second.id)
    expect(first.assetId).toBe('asset-shared.png')
    expect(first.width).toBe(360)
    expect(first.height).toBe(240)
  })

  it('preserves registered status while writing independent Canvas links', () => {
    expect(createCaptureCanvasUpdates(capture('preset-1'), 'project-1', 'node-1')).toEqual({
      status: 'registeredToPromptLibrary', linkedProjectId: 'project-1', linkedCanvasNodeId: 'node-1'
    })
    expect(createCaptureCanvasUpdates(capture(), 'project-1', 'node-2').status).toBe('placedOnCanvas')
  })
})
