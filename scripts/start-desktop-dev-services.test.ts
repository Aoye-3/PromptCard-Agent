import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(repoRoot, 'scripts', 'start-desktop-dev-services.ps1')

describe('start-desktop-dev-services.ps1 protected profile boundary', () => {
  test('defaults desktop data to an ignored repository-local profile', async () => {
    const source = await readFile(scriptPath, 'utf8')

    expect(source).toContain('logs\\desktop-profile')
    expect(source).toContain('$env:PROMPTCARD_DESKTOP_PROFILE_ROOT = Join-Path $RepoRoot "logs\\desktop-profile"')
    expect(source).toContain('$DataDir = Join-Path $ProfileRoot "data"')
    expect(source).toContain('$RuntimeStateDir = Join-Path $ProfileRoot "agent-runtime\\.deer-flow"')
    expect(source).toContain('$LogsDir = Join-Path $ProfileRoot "logs"')
    expect(source).toContain('$BackupsDir = Join-Path $ProfileRoot "backups"')
    expect(source).toContain('$ConfigDir = Join-Path $ProfileRoot "config"')
  })

  test('derives service environment variables from the protected profile', async () => {
    const source = await readFile(scriptPath, 'utf8')

    expect(source).toContain('$env:PROMPTCARD_STORAGE_DATA_DIR = $DataDir')
    expect(source).toContain('$env:PROMPTCARD_LOGS_DIR = $LogsDir')
    expect(source).toContain('$env:DEER_FLOW_HOME = $RuntimeStateDir')
    expect(source).toContain('$env:PROMPTCARD_LIBRARY_FILE = Join-Path $DataDir "prompt-library-presets.json"')
  })

  test('keeps legacy repository data as a non-destructive migration source', async () => {
    const source = await readFile(scriptPath, 'utf8')

    expect(source).toContain('function Copy-MissingProfileFiles')
    expect(source).toContain('$LegacyDataDir = Join-Path $RepoRoot "data"')
    expect(source).toContain('$LegacyRuntimeStateDir = Join-Path $RepoRoot "agent-runtime\\.deer-flow"')
    expect(source).toContain('if (Test-Path -LiteralPath $target) { return }')
    expect(source).toContain('Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse')
    expect(source).not.toContain('Remove-Item')
    expect(source).not.toContain('Move-Item')
  })
})
