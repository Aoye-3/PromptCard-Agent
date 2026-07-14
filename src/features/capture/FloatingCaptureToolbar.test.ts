import { describe, expect, it, vi } from 'vitest'
import { requestScreenshot } from './floating-capture-toolbar-request'

describe('FloatingCaptureToolbar', () => {
  it('keeps the toolbar visible while it sends the screenshot intent', async () => {
    const emitIntent = vi.fn().mockResolvedValue(undefined)
    const hideToolbar = vi.fn()
    const setPreparing = vi.fn()

    await requestScreenshot({ emitIntent, setPreparing })

    expect(setPreparing).toHaveBeenCalledWith(true)
    expect(emitIntent).toHaveBeenCalledTimes(1)
    expect(hideToolbar).not.toHaveBeenCalled()
  })

  it('leaves preparing state when the screenshot intent cannot be sent', async () => {
    const error = new Error('main unavailable')
    const setPreparing = vi.fn()

    await expect(requestScreenshot({
      emitIntent: vi.fn().mockRejectedValue(error),
      setPreparing
    })).rejects.toBe(error)

    expect(setPreparing).toHaveBeenNthCalledWith(1, true)
    expect(setPreparing).toHaveBeenNthCalledWith(2, false)
  })
})
