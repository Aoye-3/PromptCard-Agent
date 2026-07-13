import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { desktopShellService, type UpdateSourceConfig } from './desktop-shell-service'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

const setTauriAvailable = () => {
  Object.defineProperty(globalThis.window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {}
  })
}

beforeEach(() => {
  vi.stubGlobal('window', {})
})

afterEach(() => {
  delete (globalThis.window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  vi.mocked(invoke).mockReset()
  vi.unstubAllGlobals()
})

describe('desktopShellService update commands', () => {
  it('reports unavailable outside Tauri', () => {
    expect(desktopShellService.isAvailable()).toBe(false)
  })

  it('loads update config through Tauri', async () => {
    setTauriAvailable()
    vi.mocked(invoke).mockResolvedValueOnce({ repoUrl: 'https://github.com/example/repo.git' })

    await desktopShellService.getUpdateConfig()

    expect(invoke).toHaveBeenCalledWith('update_get_config', undefined)
  })

  it('saves update config through Tauri', async () => {
    setTauriAvailable()
    const config: UpdateSourceConfig = {
      repoUrl: 'https://github.com/example/repo.git',
      remoteName: 'origin',
      branch: 'main',
      lastKnownRemoteCommit: null,
      lastCheckedAt: null
    }
    vi.mocked(invoke).mockResolvedValueOnce(config)

    await desktopShellService.saveUpdateConfig(config)

    expect(invoke).toHaveBeenCalledWith('update_save_config', { config })
  })

  it('checks, previews, and applies updates through dedicated commands', async () => {
    setTauriAvailable()
    vi.mocked(invoke).mockResolvedValue({ ok: true, changes: [], blockedReasons: [] })

    await desktopShellService.checkForUpdates()
    await desktopShellService.previewUpdate()
    await desktopShellService.applyUpdate()

    expect(invoke).toHaveBeenNthCalledWith(1, 'update_check', undefined)
    expect(invoke).toHaveBeenNthCalledWith(2, 'update_preview', undefined)
    expect(invoke).toHaveBeenNthCalledWith(3, 'update_apply', undefined)
  })
})
