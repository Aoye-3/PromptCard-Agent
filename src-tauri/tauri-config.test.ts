import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import config from './tauri.conf.json'
import mainCapability from './capabilities/default.json'
import toolbarCapability from './capabilities/capture-toolbar.json'

const rustLibPath = path.resolve(__dirname, 'src', 'lib.rs')
const gitPermissionPath = path.resolve(__dirname, 'permissions', 'git-pull-source.toml')

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
      'git-pull-source'
    ])
    expect(toolbarCapability.windows).toEqual(['capture-toolbar'])
    expect(toolbarCapability.permissions).toEqual([
      'core:event:allow-emit-to',
      'core:window:allow-close',
      'core:window:allow-start-dragging'
    ])
    expect(toolbarCapability.permissions).not.toContain('git-pull-source')
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
})
