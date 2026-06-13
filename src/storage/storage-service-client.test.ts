import { afterEach, describe, expect, test, vi } from 'vitest'
import { storageServiceClient } from './storage-service-client'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('storageServiceClient', () => {
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

  test('rejects unsupported upload files before sending a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(storageServiceClient.assets.upload(new File(['gif'], 'board.gif', { type: 'image/gif' })))
      .rejects.toMatchObject({ code: 'invalid_asset', status: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
