import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const configPath = path.resolve(__dirname, 'vite.config.ts')

describe('vite storage proxy', () => {
  test('routes storage health to the storage root health endpoint', async () => {
    const source = await readFile(configPath, 'utf8')
    const healthProxyIndex = source.indexOf("'/storage-api/health'")
    const apiProxyIndex = source.indexOf("'/storage-api':")

    expect(healthProxyIndex).toBeGreaterThan(-1)
    expect(apiProxyIndex).toBeGreaterThan(-1)
    expect(healthProxyIndex).toBeLessThan(apiProxyIndex)
    expect(source).toContain('target: storageUrl')
    expect(source).toContain("rewrite: () => '/health'")
    expect(source).toContain('target: `${storageUrl}/api`')
  })
})
