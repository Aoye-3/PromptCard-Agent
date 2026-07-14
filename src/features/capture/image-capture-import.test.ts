import { describe, expect, it, vi } from 'vitest'
import { StorageHttpError } from '@/storage/storage-service-client'
import { importImageCapture, readClipboardImageFiles } from './image-capture-import'

describe('image capture import', () => {
  it('materializes image bytes before reading dimensions and uploading', async () => {
    const source = new File([new Uint8Array([1, 2, 3, 4])], 'wechat-shot.png', {
      type: 'image/png',
      lastModified: 1234
    })
    const dimensions = vi.fn().mockResolvedValue({ width: 640, height: 360 })
    const upload = vi.fn().mockImplementation(async file => ({
      id: 'asset-materialized', filename: file.name, contentType: file.type, size: file.size
    }))

    await importImageCapture({
      file: source,
      kind: 'pastedMedia',
      sourcePlatform: 'Clipboard'
    }, {
      upload,
      create: vi.fn().mockImplementation(async draft => ({
        ...draft, createdAt: 1234, updatedAt: 1234, revision: 1
      })),
      dimensions,
      notify: vi.fn()
    })

    const materialized = upload.mock.calls[0][0] as File
    expect(materialized).not.toBe(source)
    expect(dimensions).toHaveBeenCalledWith(materialized)
    expect(materialized.name).toBe(source.name)
    expect(materialized.type).toBe(source.type)
    expect(materialized.lastModified).toBe(source.lastModified)
    expect(new Uint8Array(await materialized.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('stops before dimensions, upload, and create when image bytes cannot be read', async () => {
    const source = new File(['pixels'], 'qq-shot.png', { type: 'image/png' })
    Object.defineProperty(source, 'arrayBuffer', {
      value: vi.fn().mockRejectedValue(new Error('clipboard blob unavailable'))
    })
    const dimensions = vi.fn()
    const upload = vi.fn()
    const create = vi.fn()
    const notify = vi.fn()

    await expect(importImageCapture({
      file: source,
      kind: 'pastedMedia',
      sourcePlatform: 'Clipboard'
    }, { upload, create, dimensions, notify })).rejects.toThrow('无法读取图片数据。')

    expect(dimensions).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('uploads a clipboard image and creates one Recent Capture with the same asset id', async () => {
    const file = new File(['pixels'], 'wechat-shot.png', { type: 'image/png' })
    const upload = vi.fn().mockResolvedValue({
      id: 'asset-1', filename: file.name, contentType: file.type, size: file.size
    })
    const create = vi.fn().mockImplementation(async draft => ({
      ...draft, createdAt: 1234, updatedAt: 1234, revision: 1
    }))

    const capture = await importImageCapture({
      file,
      kind: 'pastedMedia',
      sourcePlatform: 'Clipboard',
      capturedAt: 1234,
      origin: { type: 'clipboard' }
    }, {
      upload,
      create,
      dimensions: vi.fn().mockResolvedValue({ width: 640, height: 360 }),
      notify: vi.fn()
    })

    expect(upload).toHaveBeenCalledWith(file)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      assetId: 'asset-1',
      kind: 'pastedMedia',
      originalFilename: 'wechat-shot.png',
      contentType: 'image/png',
      width: 640,
      height: 360,
      origin: { type: 'clipboard', originalMimeType: 'image/png', importedAt: 1234 }
    }))
    expect(capture.assetId).toBe('asset-1')
  })

  it('rejects non-image clipboard content before upload', async () => {
    const upload = vi.fn()
    await expect(importImageCapture({
      file: new File(['text'], 'note.txt', { type: 'text/plain' }),
      kind: 'pastedMedia',
      sourcePlatform: 'Clipboard'
    }, {
      upload,
      create: vi.fn(),
      dimensions: vi.fn(),
      notify: vi.fn()
    })).rejects.toThrow('PNG、JPEG 或 WebP')
    expect(upload).not.toHaveBeenCalled()
  })

  it('reads every supported image from ClipboardItem values and ignores text', async () => {
    const png = new Blob(['png'], { type: 'image/png' })
    const webp = new Blob(['webp'], { type: 'image/webp' })
    const files = await readClipboardImageFiles({
      read: vi.fn().mockResolvedValue([
        { types: ['text/plain'], getType: vi.fn() },
        { types: ['image/png', 'image/webp'], getType: vi.fn(type => type === 'image/png' ? png : webp) }
      ])
    })

    expect(files.map(file => file.type)).toEqual(['image/png', 'image/webp'])
    expect(files.every(file => file.name.startsWith('clipboard-'))).toBe(true)
  })

  it('returns an empty list for an empty or text-only clipboard', async () => {
    await expect(readClipboardImageFiles({ read: vi.fn().mockResolvedValue([]) })).resolves.toEqual([])
    await expect(readClipboardImageFiles({
      read: vi.fn().mockResolvedValue([{ types: ['text/plain'], getType: vi.fn() }])
    })).resolves.toEqual([])
  })

  it.each([
    [new StorageHttpError(0, 'timeout', 'Storage request timed out.'), '素材上传超时，请重试。'],
    [new StorageHttpError(0, 'service_unavailable', 'Storage service is unavailable.'), 'Storage Service 不可用，请确认桌面服务正在运行。'],
    [new Error('disk full'), '素材上传失败：disk full']
  ])('reports the upload stage error for %s', async (uploadError, expectedMessage) => {
    const create = vi.fn()
    const notify = vi.fn()

    await expect(importImageCapture({
      file: new File(['pixels'], 'wechat.png', { type: 'image/png' }),
      kind: 'pastedMedia',
      sourcePlatform: 'Clipboard'
    }, {
      upload: vi.fn().mockRejectedValue(uploadError),
      create,
      dimensions: vi.fn().mockResolvedValue({ width: 10, height: 10 }),
      notify
    })).rejects.toThrow(expectedMessage)

    expect(create).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('does not report success when Recent Capture creation fails', async () => {
    const notify = vi.fn()
    await expect(importImageCapture({
      file: new File(['pixels'], 'qq.jpg', { type: 'image/jpeg' }),
      kind: 'pastedMedia',
      sourcePlatform: 'Clipboard'
    }, {
      upload: vi.fn().mockResolvedValue({ id: 'asset-orphan', filename: 'qq.jpg', contentType: 'image/jpeg', size: 6 }),
      create: vi.fn().mockRejectedValue(new Error('create failed')),
      dimensions: vi.fn().mockResolvedValue({ width: 10, height: 10 }),
      notify
    })).rejects.toThrow('近期捕获入库失败：create failed')
    expect(notify).not.toHaveBeenCalled()
  })
})
