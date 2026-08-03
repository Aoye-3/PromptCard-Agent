import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..')

describe('desktop VBS launcher', () => {
  test('keeps PowerShell hidden and skips the preliminary splash window', async () => {
    const source = await readFile(path.join(repoRoot, 'start-desktop.vbs'), 'utf8')

    expect(source).toContain('exitCode = shell.Run(command, 0, True)')
    expect(source).not.toContain('shell.Exec')
    expect(source).not.toContain('mshta.exe')
    expect(source).not.toContain('desktop-launch-splash.hta')
  })
})
