import { describe, expect, test, vi } from 'vitest'
import { subscribeCanvasClipboard } from './useCanvasImageInteractions'

describe('canvas image interaction listeners', () => {
  test('removes copy and paste listeners during cleanup', () => {
    const windowTarget = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    const documentTarget = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    const copy = vi.fn()
    const paste = vi.fn()

    const cleanup = subscribeCanvasClipboard(windowTarget, documentTarget, copy, paste)
    cleanup()

    expect(windowTarget.addEventListener).toHaveBeenCalledWith('keydown', copy)
    expect(documentTarget.addEventListener).toHaveBeenCalledWith('paste', paste)
    expect(windowTarget.removeEventListener).toHaveBeenCalledWith('keydown', copy)
    expect(documentTarget.removeEventListener).toHaveBeenCalledWith('paste', paste)
  })
})
