import { describe, expect, it } from 'vitest'
import { CAPTURE_TOOLBAR_WINDOW_OPTIONS } from './capture-toolbar-window'

describe('capture toolbar window options', () => {
  it('creates a transparent undecorated toolbar window without a native frame', async () => {
    expect(CAPTURE_TOOLBAR_WINDOW_OPTIONS.decorations).toBe(false)
    expect(CAPTURE_TOOLBAR_WINDOW_OPTIONS.transparent).toBe(true)
    expect(CAPTURE_TOOLBAR_WINDOW_OPTIONS.shadow).toBe(false)
    expect(CAPTURE_TOOLBAR_WINDOW_OPTIONS.backgroundColor).toEqual([0, 0, 0, 0])
  })
})
