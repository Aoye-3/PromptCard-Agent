import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const appPath = path.resolve(__dirname, '..', 'src', 'App.tsx')
const indexPath = path.resolve(__dirname, '..', 'index.html')

describe('App startup readiness gate', () => {
  test('keeps the startup screen message-driven while storage starts', async () => {
    const source = await readFile(appPath, 'utf8')

    expect(source).toContain('const AppStartupScreen = ({ message }: { message: string })')
    expect(source).toContain('<span>{message}</span>')
    expect(source).toContain("useState('正在连接本地数据服务...')")
  })

  test('waits for storage health before hydrating app data', async () => {
    const source = await readFile(appPath, 'utf8')
    const healthIndex = source.indexOf('await storage.health()')
    const projectsIndex = source.indexOf('storage.projects.getAll()')

    expect(healthIndex).toBeGreaterThan(-1)
    expect(projectsIndex).toBeGreaterThan(-1)
    expect(healthIndex).toBeLessThan(projectsIndex)
    expect(source).toContain('await wait(STORAGE_HEALTH_RETRY_MS)')
    expect(source).toContain('STORAGE_HEALTH_MAX_ATTEMPTS')
  })

  test('keeps a visible native boot screen for the main window only', async () => {
    const source = await readFile(indexPath, 'utf8')

    expect(source).toContain('document.documentElement.dataset.window')
    expect(source).toContain('.boot-screen')
    expect(source).toContain('position: fixed')
    expect(source).toContain('inset: 0')
    expect(source).toContain('正在启动工作台...')
    expect(source).toContain('html[data-window="capture-toolbar"] .boot-screen')
    expect(source).toContain('display: none')
  })
})
