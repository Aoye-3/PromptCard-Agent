export interface GitPullResult {
  ok: boolean
  sourceRoot: string
  stdout: string
  stderr: string
  exitCode: number
}

const hasTauriInternals = () => {
  if (typeof window === 'undefined') return false
  const tauriWindow = window as unknown as { __TAURI_INTERNALS__?: unknown }
  return Boolean(tauriWindow.__TAURI_INTERNALS__)
}

export const desktopShellService = {
  isAvailable(): boolean {
    return hasTauriInternals()
  },

  async gitPullSource(): Promise<GitPullResult> {
    if (!hasTauriInternals()) {
      throw new Error('Desktop shell commands are only available inside Tauri.')
    }
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<GitPullResult>('git_pull_source')
  }
}
