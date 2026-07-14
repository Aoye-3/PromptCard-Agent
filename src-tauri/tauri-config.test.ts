import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import config from './tauri.conf.json'
import mainCapability from './capabilities/default.json'
import toolbarCapability from './capabilities/capture-toolbar.json'
import selectionCapability from './capabilities/capture-selection.json'

const rustLibPath = path.resolve(__dirname, 'src', 'lib.rs')
const mainEntryPath = path.resolve(__dirname, '..', 'src', 'main.tsx')
const gitPermissionPath = path.resolve(__dirname, 'permissions', 'git-pull-source.toml')
const nativeScreenshotPermissionPath = path.resolve(__dirname, 'permissions', 'native-screenshot.toml')

describe('Tauri webview configuration', () => {
  test('allows HTML5 file drops to reach the React canvas on Windows', () => {
    const mainWindow = config.app.windows.find(window => window.label === 'main')
    expect(mainWindow?.dragDropEnabled).toBe(false)
  })

  test('does not create the capture toolbar as a startup window', () => {
    const toolbarWindow = config.app.windows.find(window => window.label === 'capture-toolbar')

    expect(toolbarWindow).toBeUndefined()
  })

  test('keeps toolbar permissions separate from main shell commands', () => {
    expect(mainCapability.windows).toEqual(['main'])
    expect(mainCapability.permissions).toEqual([
      'core:default',
      'core:webview:allow-create-webview-window',
      'core:window:allow-show',
      'core:window:allow-set-focus',
      'core:window:allow-close',
      'core:window:allow-is-visible',
      'git-pull-source',
      'native-screenshot-start'
    ])
    expect(toolbarCapability.windows).toEqual(['capture-toolbar'])
    expect(toolbarCapability.permissions).toEqual([
      'core:event:allow-emit-to',
      'core:event:allow-listen',
      'core:window:allow-close',
      'core:window:allow-start-dragging'
    ])
    expect(toolbarCapability.permissions).not.toContain('git-pull-source')
    expect(selectionCapability.windows).toEqual(['capture-selection'])
    expect(selectionCapability.permissions).toEqual([
      'core:event:allow-emit-to',
      'native-screenshot-selection'
    ])
    expect(selectionCapability.permissions).not.toContain('git-pull-source')
  })

  test('exits the whole desktop app when the main window closes', async () => {
    const rustLib = await readFile(rustLibPath, 'utf8')

    expect(rustLib).toContain('window.label() == "main"')
    expect(rustLib).toContain('WindowEvent::CloseRequested')
    expect(rustLib).toContain('shutdown_promptcard_services()')
    expect(rustLib).toContain('window.app_handle().exit(0)')
  })

  test('shuts down dynamic runtime ports without showing a PowerShell console', async () => {
    const rustLib = await readFile(rustLibPath, 'utf8')

    expect(rustLib).toContain('CREATE_NO_WINDOW')
    expect(rustLib).toContain('command.creation_flags(CREATE_NO_WINDOW)')
    expect(rustLib).toContain('PROMPTCARD_DEV_RUNTIME_MANIFEST')
    expect(rustLib).toContain("logs\\dev-runtime.json")
    expect(rustLib).toContain('$runtime.ports.frontend')
    expect(rustLib).toContain('$runtime.ports.agent')
    expect(rustLib).toContain('$runtime.ports.storage')
  })

  test('allows the guarded update command set only on the main shell permission', async () => {
    const permission = await readFile(gitPermissionPath, 'utf8')

    expect(permission).toContain('update_get_config')
    expect(permission).toContain('update_save_config')
    expect(permission).toContain('update_check')
    expect(permission).toContain('update_preview')
    expect(permission).toContain('update_apply')
    expect(permission).toContain('git_pull_source')
    expect(toolbarCapability.permissions).not.toContain('git-pull-source')
  })

  test('keeps native screenshot commands split between main and the temporary selector', async () => {
    const permission = await readFile(nativeScreenshotPermissionPath, 'utf8')

    expect(permission).toContain('capture_begin_selection')
    expect(permission).toContain('capture_activate_selection')
    expect(permission).toContain('capture_finish_selection')
    expect(permission).toContain('capture_cancel_selection')
    expect(mainCapability.permissions).toContain('native-screenshot-start')
    expect(selectionCapability.permissions).toContain('native-screenshot-selection')
  })

  test('preloads the selector hidden and activates capture off the async runtime thread', async () => {
    const rustLib = await readFile(rustLibPath, 'utf8')

    expect(rustLib).toContain('.visible(false)')
    expect(rustLib).toContain('async fn capture_activate_selection')
    expect(rustLib).toContain('tauri::async_runtime::spawn_blocking')
    expect(rustLib).toContain('CAPTURE_START_TIMEOUT')
  })

  test('scopes transparent CSS to both capture windows', async () => {
    const mainEntry = await readFile(mainEntryPath, 'utf8')

    expect(mainEntry).toContain('document.documentElement.dataset.window')
    expect(mainEntry).toContain("'capture-selection'")
  })
})
