import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..')

describe('desktop launch splash', () => {
  test('start-desktop.vbs keeps the script host responsive while the launcher runs', async () => {
    const source = await readFile(path.join(repoRoot, 'start-desktop.vbs'), 'utf8')

    expect(source).toContain('desktop-launch-splash.hta')
    expect(source).toContain('shell.Exec("mshta.exe " & Quote(splashPath))')
    expect(source).toContain('Set launcher = shell.Exec(command)')
    expect(source).toContain('Do While launcher.Status = 0')
    expect(source).toContain('WScript.Sleep 100')
    expect(source).toContain('exitCode = launcher.ExitCode')
    expect(source).not.toContain('shell.Run(command, 0, True)')
    expect(source).toContain('splash.Terminate')
  })

  test('splash contains a visible loading animation', async () => {
    const source = await readFile(path.join(repoRoot, 'scripts', 'desktop-launch-splash.hta'), 'utf8')

    expect(source).toContain('PromptCard Manager')
    expect(source).toContain('class="spinner"')
    expect(source).toContain('border="none"')
    expect(source).toContain('caption="no"')
    expect(source).toContain('sysmenu="no"')
    expect(source).toContain('@keyframes spin')
    expect(source).toContain('@keyframes progress')
  })
})
