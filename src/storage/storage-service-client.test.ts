import { afterEach, describe, expect, test, vi } from 'vitest'
import { storageServiceClient } from './storage-service-client'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('storageServiceClient', () => {
  test('reports storage health without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(storageServiceClient.health()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/storage-api/health', expect.objectContaining({
      cache: 'no-cache',
      headers: { Accept: 'application/json' }
    }))
  })

  test('returns false when storage health is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    await expect(storageServiceClient.health()).resolves.toBe(false)
  })

  test('maps structured HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { code: 'invalid_asset', message: 'Bad image', detail: { reason: 'signature' } }
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })))

    await expect(storageServiceClient.assets.diagnostics()).rejects.toMatchObject({
      name: 'StorageHttpError',
      status: 400,
      code: 'invalid_asset',
      message: 'Bad image',
      detail: { reason: 'signature' }
    })
  })

  test('maps revision conflicts with the current record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { code: 'revision_conflict', message: 'Conflict', current: { id: 'p1', revision: 2 } }
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })))

    await expect(storageServiceClient.projects.update('p1', 1, { title: 'Stale' }))
      .rejects.toEqual(expect.objectContaining({
        name: 'StorageRevisionConflict',
        current: { id: 'p1', revision: 2 }
      }))
  })

  test('returns null for a missing project', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { code: 'not_found', message: 'Missing' }
    }), { status: 404, headers: { 'Content-Type': 'application/json' } })))

    await expect(storageServiceClient.projects.getById('missing')).resolves.toBeNull()
  })

  test('reports request timeouts', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))

    const request = expect(storageServiceClient.projects.getAll()).rejects.toEqual(expect.objectContaining({
      name: 'StorageHttpError',
      code: 'timeout',
      status: 0
    }))
    await vi.advanceTimersByTimeAsync(10_000)

    await request
  })

  test('infers image upload content type from the filename', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'asset.webp',
      filename: 'board.webp',
      contentType: 'image/webp',
      size: 3
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File([new Uint8Array([1, 2, 3])], 'board.webp')

    await storageServiceClient.assets.upload(file)

    expect(fetchMock).toHaveBeenCalledWith('/storage-api/assets', expect.objectContaining({
      method: 'POST',
      body: file,
      headers: expect.objectContaining({
        'Content-Type': 'image/webp',
        'X-File-Name': 'board.webp'
      })
    }))
  })

  test('allows asset uploads 30 seconds before timing out', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchMock)

    const request = expect(storageServiceClient.assets.upload(
      new File([new Uint8Array([1, 2, 3])], 'board.png', { type: 'image/png' })
    )).rejects.toMatchObject({ code: 'timeout', status: 0 })

    await vi.advanceTimersByTimeAsync(10_000)
    const signal = fetchMock.mock.calls[0][1]?.signal
    expect(signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(20_000)
    await request
  })

  test('combines an external abort signal and removes its listener and timeout after success', async () => {
    vi.useFakeTimers()
    const external = new AbortController()
    const addListener = vi.spyOn(external.signal, 'addEventListener')
    const removeListener = vi.spyOn(external.signal, 'removeEventListener')
    let fetchSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      fetchSignal = init?.signal || undefined
      return Promise.resolve(new Response(JSON.stringify({ runs: [], nextCursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }))
    }))

    await storageServiceClient.imageGenerationRuns.getPage({
      projectId: 'project-1', nodeId: 'node-1', signal: external.signal
    })

    expect(addListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true })
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
    external.abort()
    expect(fetchSignal?.aborted).toBe(false)
  })

  test('keeps the 10 second timeout active while composing an external signal', async () => {
    vi.useFakeTimers()
    const external = new AbortController()
    const addListener = vi.spyOn(external.signal, 'addEventListener')
    const removeListener = vi.spyOn(external.signal, 'removeEventListener')
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))

    const pending = expect(storageServiceClient.imageGenerationRuns.getPage({
      projectId: 'project-1', nodeId: 'node-1', signal: external.signal
    })).rejects.toMatchObject({ code: 'timeout', status: 0 })
    await vi.advanceTimersByTimeAsync(10_000)

    await pending
    expect(external.signal.aborted).toBe(false)
    expect(addListener).toHaveBeenCalled()
    expect(removeListener).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('rejects unsupported upload files before sending a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(storageServiceClient.assets.upload(new File(['gif'], 'board.gif', { type: 'image/gif' })))
      .rejects.toMatchObject({ code: 'invalid_asset', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('sends one atomic Recent Capture registration request', async () => {
    const payload = { presets: [{ id: 'preset-1' }], captures: [{ id: 'capture-1' }] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(storageServiceClient.recentCaptures.registerToPromptLibrary({
      mode: 'separate',
      captures: [{ id: 'capture-1', revision: 2, label: 'Hero', content: 'A hero', type: 'subject' }]
    })).resolves.toEqual(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      '/storage-api/recent-captures/register-to-prompt-library',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          mode: 'separate',
          captures: [{ id: 'capture-1', revision: 2, label: 'Hero', content: 'A hero', type: 'subject' }]
        })
      })
    )
  })

  test('deletes one Recent Capture with optimistic revision checking', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    }))
    vi.stubGlobal('fetch', fetchMock)

    const deleteCapture = Reflect.get(storageServiceClient.recentCaptures, 'delete') as
      | ((id: string, revision: number) => Promise<void>)
      | undefined
    expect(deleteCapture).toBeTypeOf('function')
    if (!deleteCapture) return

    await deleteCapture('capture/one', 3)

    expect(fetchMock).toHaveBeenCalledWith(
      '/storage-api/recent-captures/capture%2Fone',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ revision: 3 })
      })
    )
  })

  test('pages permanent image generation history by project and node without a delete API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      runs: [{
        id: 'run-1', projectId: 'project/1', nodeId: 'node 1', connectionId: 'connection-1',
        providerId: 'volcengine', modelId: 'seedream', state: 'failed', createdAt: 1,
        requestSnapshot: {
          mode: 'generate', resolution: '2K', aspectRatio: '16:9', width: 2048, height: 1152,
          outputFormat: 'png', watermark: false,
          promptDocument: { version: 1, segments: [{ type: 'text', text: 'Prompt' }] },
          inputAssets: [], regions: [], remoteUrl: 'https://provider.example/output'
        },
        outputAssetIds: [],
        error: { code: 'failed', message: 'Safe failure', retryable: false },
        secret: 'raw-secret'
      }],
      nextCursor: 'next-page'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await storageServiceClient.imageGenerationRuns.getPage({
      projectId: 'project/1', nodeId: 'node 1', cursor: 'cursor/1', limit: 25
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/storage-api/image-generation-runs?projectId=project%2F1&nodeId=node+1&cursor=cursor%2F1&limit=25',
      expect.any(Object)
    )
    expect(page.nextCursor).toBe('next-page')
    expect(page.runs[0].requestSnapshot).toMatchObject({
      aspectRatio: '16:9', width: 2048, height: 1152
    })
    expect(JSON.stringify(page)).not.toContain('provider.example')
    expect(JSON.stringify(page)).not.toContain('raw-secret')
    expect(Reflect.has(storageServiceClient.imageGenerationRuns, 'delete')).toBe(false)
  })

  test('supports unfiltered and singly filtered image generation history queries', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      runs: [], nextCursor: null
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)

    await storageServiceClient.imageGenerationRuns.getPage({ limit: 10 })
    await storageServiceClient.imageGenerationRuns.getPage({ projectId: 'project/1' })
    await storageServiceClient.imageGenerationRuns.getPage({ nodeId: 'node 1' })
    await storageServiceClient.imageGenerationRuns.getPage({ conversationId: 'conversation 1' })

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/storage-api/image-generation-runs?limit=10',
      '/storage-api/image-generation-runs?projectId=project%2F1',
      '/storage-api/image-generation-runs?nodeId=node+1',
      '/storage-api/image-generation-runs?conversationId=conversation+1'
    ])
  })

  test('pages project-scoped image generation conversations without exposing delete', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      conversations: [{
        id: 'conversation-1', projectId: 'project/1', title: '玻璃灯塔', createdAt: 1, updatedAt: 2,
        latestRunId: 'run-1', latestState: 'succeeded', previewAssetId: 'asset-1', turnCount: 1,
        secret: 'must-not-survive'
      }],
      nextCursor: 'next/page'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const page = await storageServiceClient.imageGenerationConversations.getPage({
      projectId: 'project/1', cursor: 'cursor/1', limit: 20
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/storage-api/image-generation-conversations?projectId=project%2F1&cursor=cursor%2F1&limit=20',
      expect.any(Object)
    )
    expect(page).toEqual({
      conversations: [{
        id: 'conversation-1', projectId: 'project/1', title: '玻璃灯塔', createdAt: 1, updatedAt: 2,
        latestRunId: 'run-1', latestState: 'succeeded', previewAssetId: 'asset-1', turnCount: 1
      }],
      nextCursor: 'next/page'
    })
    expect(Reflect.has(storageServiceClient.imageGenerationConversations, 'delete')).toBe(false)
  })

  test('loads one conversation and its project-scoped chronological runs', async () => {
    const conversation = {
      id: 'conversation-1', projectId: 'project-1', title: '产品渲染', createdAt: 1, updatedAt: 2, turnCount: 1
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(conversation), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ runs: [], nextCursor: null }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(storageServiceClient.imageGenerationConversations.getById('conversation/1', 'project/1'))
      .resolves.toMatchObject({ id: 'conversation-1', projectId: 'project-1' })
    await expect(storageServiceClient.imageGenerationConversations.getRuns({
      conversationId: 'conversation/1', projectId: 'project/1', limit: 25
    })).resolves.toEqual({ runs: [], nextCursor: null })

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/storage-api/image-generation-conversations/conversation%2F1?projectId=project%2F1',
      '/storage-api/image-generation-conversations/conversation%2F1/runs?projectId=project%2F1&limit=25'
    ])
  })

  test('lists pending canvas placements and marks one placed without a delete API', async () => {
    const placement = {
      runId: 'run-1', projectId: 'project/1', conversationId: 'conversation-1', assetId: 'asset-1',
      state: 'pending', createdAt: 1, updatedAt: 1
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ placements: [placement] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...placement, state: 'placed', canvasNodeId: 'image-node-1', updatedAt: 2
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(storageServiceClient.imageGenerationPlacements.getPending('project/1'))
      .resolves.toEqual([placement])
    await expect(storageServiceClient.imageGenerationPlacements.markPlaced('run/1', 'image-node-1'))
      .resolves.toMatchObject({ state: 'placed', canvasNodeId: 'image-node-1' })

    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/storage-api/image-generation-placements?projectId=project%2F1&state=pending',
      '/storage-api/image-generation-placements/run%2F1'
    ])
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PATCH', body: JSON.stringify({ state: 'placed', canvasNodeId: 'image-node-1' })
    })
    expect(Reflect.has(storageServiceClient.imageGenerationPlacements, 'delete')).toBe(false)
  })

  test('loads one permanent image generation run by id and returns null when missing', async () => {
    const run = {
      id: 'run-1', projectId: 'project-1', nodeId: 'node-1', connectionId: 'connection-1',
      providerId: 'volcengine', modelId: 'seedream', state: 'succeeded', createdAt: 1,
      requestSnapshot: {
        mode: 'generate', resolution: '1K', aspectRatio: '1:1', outputFormat: 'png', watermark: false,
        promptDocument: { version: 1, segments: [] }, inputAssets: [], regions: []
      },
      outputAssetIds: ['asset-1']
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(run), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: { code: 'not_found' } }), {
        status: 404, headers: { 'Content-Type': 'application/json' }
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(storageServiceClient.imageGenerationRuns.getById('run/1')).resolves.toMatchObject({ id: 'run-1' })
    await expect(storageServiceClient.imageGenerationRuns.getById('missing')).resolves.toBeNull()
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/storage-api/image-generation-runs/run%2F1',
      '/storage-api/image-generation-runs/missing'
    ])
  })
})
