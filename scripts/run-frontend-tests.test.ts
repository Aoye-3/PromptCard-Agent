import { describe, expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..')

describe('frontend test runner', () => {
  test('uses bounded sequential shards and propagates failures', async () => {
    const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
    const source = await readFile(path.join(repoRoot, 'scripts', 'run-frontend-tests.ps1'), 'utf8')

    expect(packageJson.scripts['test:frontend']).toContain('run-frontend-tests.ps1')
    expect(source).toContain('[int]$ShardCount = 4')
    expect(source).toContain('[int]$MaxWorkers = 2')
    expect(source).toContain("Join-Path $repoRoot '.tmp\\frontend-tests'")
    expect(source).toContain('"--shard=$shard"')
    expect(source).toContain('*> $logPath')
    expect(source).toContain("$ErrorActionPreference = 'Continue'")
    expect(source).toContain('exit $exitCode')
    expect(source).not.toMatch(/[A-Z]:\\/i)
  })
})
