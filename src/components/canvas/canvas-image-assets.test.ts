import { describe, expect, test, vi } from 'vitest'
import {
  fitImageNode,
  getClipboardImageFiles,
  isSupportedImageFile,
  uploadFreeCanvasImageFiles
} from './canvas-image-assets'

describe('canvas image assets', () => {
  test('recognizes supported image MIME types and extensions', () => {
    expect(isSupportedImageFile(new File(['png'], 'board.bin', { type: 'image/png' }))).toBe(true)
    expect(isSupportedImageFile(new File(['jpg'], 'board.JPG'))).toBe(true)
    expect(isSupportedImageFile(new File(['gif'], 'board.gif', { type: 'image/gif' }))).toBe(false)
  })

  test('fits the longest image edge to the canvas maximum', () => {
    expect(fitImageNode(720, 360)).toEqual({ width: 360, height: 180 })
  })

  test('uploads files and builds image nodes through the asset gateway', async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce({ id: 'a.png' })
      .mockResolvedValueOnce({ id: 'b.png' })
    const dimensions = vi.fn()
      .mockResolvedValueOnce({ width: 720, height: 360 })
      .mockResolvedValueOnce({ width: 360, height: 720 })

    const nodes = await uploadFreeCanvasImageFiles(
      [new File(['a'], 'a.png'), new File(['b'], 'b.png')],
      { x: 10, y: 20 },
      { upload, url: id => `/assets/${id}`, dimensions }
    )

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({
      title: 'a.png',
      position: { x: 10, y: 20 },
      width: 360,
      height: 180,
      assetId: 'a.png',
      imageUrl: '/assets/a.png'
    })
    expect(nodes[1]).toMatchObject({
      position: { x: 38, y: 48 },
      width: 180,
      height: 360,
      assetId: 'b.png'
    })
  })

  test('rejects the batch when any upload fails', async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce({ id: 'a.png' })
      .mockRejectedValueOnce(new Error('upload failed'))

    await expect(uploadFreeCanvasImageFiles(
      [new File(['a'], 'a.png'), new File(['b'], 'b.png')],
      { x: 0, y: 0 },
      {
        upload,
        url: id => `/assets/${id}`,
        dimensions: vi.fn().mockResolvedValue({ width: 10, height: 10 })
      }
    )).rejects.toThrow('upload failed')
  })

  test('ignores clipboard content without supported images', () => {
    const clipboard = {
      files: [new File(['text'], 'notes.txt', { type: 'text/plain' })],
      items: []
    } as unknown as DataTransfer

    expect(getClipboardImageFiles(clipboard)).toEqual([])
  })
})
