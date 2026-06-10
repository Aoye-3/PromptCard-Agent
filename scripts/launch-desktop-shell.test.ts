import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const scriptPath = path.resolve(__dirname, 'launch-desktop-shell.ps1')
const rustMainPath = path.resolve(__dirname, '..', 'src-tauri', 'src', 'main.rs')

describe('launch-desktop-shell.ps1', () => {
  test('uses a current desktop executable as the fast launch path', async () => {
    const script = await readFile(scriptPath, 'utf8')

    expect(script).toContain('Test-DesktopShellCurrent')
    expect(script).toContain('Starting current desktop shell directly')
    expect(script).toContain('$DesktopShellExecutable')
  })

  test('waits for frontend readiness and falls back to tauri dev when the shell is stale', async () => {
    const script = await readFile(scriptPath, 'utf8')

    expect(script).toContain('Wait-HttpHealthy')
    expect(script).toContain('Desktop shell requires rebuild; starting tauri dev')
    expect(script).toContain('Wait-DesktopShellProcess')
  })

  test('builds the Windows desktop shell without an extra console window', async () => {
    const rustMain = await readFile(rustMainPath, 'utf8')

    expect(rustMain).toContain('#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]')
  })
})
