import { describe, expect, test } from 'vitest'
import config from './tauri.conf.json'
import mainCapability from './capabilities/default.json'
import toolbarCapability from './capabilities/capture-toolbar.json'

describe('Tauri webview configuration', () => {
  test('allows HTML5 file drops to reach the React canvas on Windows', () => {
    const mainWindow = config.app.windows.find(window => window.label === 'main')
    expect(mainWindow?.dragDropEnabled).toBe(false)
  })

  test('declares a compact always-on-top capture toolbar window', () => {
    const toolbarWindow = config.app.windows.find(window => window.label === 'capture-toolbar')

    expect(toolbarWindow).toMatchObject({
      url: '/?window=capture-toolbar',
      width: 228,
      height: 64,
      resizable: false,
      fullscreen: false,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true
    })
  })

  test('keeps toolbar permissions separate from main shell commands', () => {
    expect(mainCapability.windows).toEqual(['main'])
    expect(toolbarCapability.windows).toEqual(['capture-toolbar'])
    expect(toolbarCapability.permissions).toEqual([
      'core:event:allow-emit-to',
      'core:window:allow-hide',
      'core:window:allow-start-dragging'
    ])
    expect(toolbarCapability.permissions).not.toContain('git-pull-source')
  })
})
