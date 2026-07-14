export interface GitPullResult {
  ok: boolean
  sourceRoot: string
  stdout: string
  stderr: string
  exitCode: number
}

export interface UpdateSourceConfig {
  repoUrl: string
  remoteName: string
  branch: string
  lastKnownRemoteCommit?: string | null
  lastCheckedAt?: number | null
}

export interface UpdateChange {
  path: string
  classification: 'source' | 'protected' | 'manual-review'
  reason: string
}

export interface UpdateResult {
  ok: boolean
  currentCommit: string
  remoteCommit: string
  branch: string
  changes: UpdateChange[]
  blockedReasons: string[]
  backupPath?: string | null
  requiresDependencyInstall: boolean
  message: string
}

export interface NativeScreenshotSelection {
  x: number
  y: number
  width: number
  height: number
  surfaceWidth: number
  surfaceHeight: number
}

export interface NativeScreenshotResult {
  dataUrl: string
  filename: string
  size: number
  width: number
  height: number
  capturedAt: number
  origin: Record<string, unknown>
}

const hasTauriInternals = () => {
  if (typeof window === 'undefined') return false
  const tauriWindow = window as unknown as { __TAURI_INTERNALS__?: unknown }
  return Boolean(tauriWindow.__TAURI_INTERNALS__)
}

const invokeDesktopCommand = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  if (!hasTauriInternals()) {
    throw new Error('Desktop shell commands are only available inside Tauri.')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export const desktopShellService = {
  isAvailable(): boolean {
    return hasTauriInternals()
  },

  async gitPullSource(): Promise<GitPullResult> {
    return invokeDesktopCommand<GitPullResult>('git_pull_source')
  },

  async getUpdateConfig(): Promise<UpdateSourceConfig> {
    return invokeDesktopCommand<UpdateSourceConfig>('update_get_config')
  },

  async saveUpdateConfig(config: UpdateSourceConfig): Promise<UpdateSourceConfig> {
    return invokeDesktopCommand<UpdateSourceConfig>('update_save_config', { config })
  },

  async checkForUpdates(): Promise<UpdateResult> {
    return invokeDesktopCommand<UpdateResult>('update_check')
  },

  async previewUpdate(): Promise<UpdateResult> {
    return invokeDesktopCommand<UpdateResult>('update_preview')
  },

  async applyUpdate(): Promise<UpdateResult> {
    return invokeDesktopCommand<UpdateResult>('update_apply')
  },

  async beginScreenshotSelection(allowCanvas: boolean): Promise<void> {
    return invokeDesktopCommand<void>('capture_begin_selection', { allowCanvas })
  },

  async activateScreenshotSelection(sessionId: string): Promise<void> {
    return invokeDesktopCommand<void>('capture_activate_selection', { sessionId })
  },

  async finishScreenshotSelection(sessionId: string, selection: NativeScreenshotSelection): Promise<NativeScreenshotResult> {
    return invokeDesktopCommand<NativeScreenshotResult>('capture_finish_selection', { sessionId, selection })
  },

  async cancelScreenshotSelection(sessionId: string): Promise<void> {
    return invokeDesktopCommand<void>('capture_cancel_selection', { sessionId })
  }
}
