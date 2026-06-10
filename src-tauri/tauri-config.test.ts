import { describe, expect, test } from 'vitest'
import config from './tauri.conf.json'

describe('Tauri webview configuration', () => {
  test('allows HTML5 file drops to reach the React canvas on Windows', () => {
    expect(config.app.windows[0].dragDropEnabled).toBe(false)
  })
})
