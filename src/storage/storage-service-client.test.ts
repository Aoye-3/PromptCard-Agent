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
          mode: 'generate', resolution: '2K', outputFormat: 'png', watermark: false,
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
    expect(JSON.stringify(page)).not.toContain('provider.example')
    expect(JSON.stringify(page)).not.toContain('raw-secret')
    expect(Reflect.has(storageServiceClient.imageGenerationRuns, 'delete')).toBe(false)
  })
})
