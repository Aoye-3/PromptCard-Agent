import { afterEach, describe, expect, test } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const repoRoot = path.resolve(__dirname, '..')
const scriptPath = path.join(repoRoot, 'scripts', 'start-dev-with-agent.ps1')
const powershell = 'powershell'
const servers: Server[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        })
    )
  )
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

function startHealthyServer() {
  const server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{"ok":true,"serviceVersion":"2.0.0","schemaVersion":1,"capabilities":{"assets":true,"sqlite":true}}')
  })

  return new Promise<string>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }
      resolve(`http://127.0.0.1:${address.port}/health`)
    })
  })
}

function startHealthyFrontendServer() {
  const server = createServer((request, response) => {
    if (request.url === '/src/main.tsx') {
      response.writeHead(200, { 'content-type': 'application/javascript' })
      response.end('import React from "/node_modules/.vite/deps/react.js?v=test"')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<script type="module" src="/src/main.tsx"></script>')
  })

  return new Promise<string>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Expected a TCP server address')
      resolve(`http://127.0.0.1:${address.port}/`)
    })
  })
}

async function makeMarkerCommand(markerName: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'promptcard-startup-test-'))
  tempDirs.push(dir)
  const markerPath = path.join(dir, markerName)
  const escapedMarkerPath = markerPath.replace(/'/g, "''")

  return {
    markerPath,
    command: `Set-Content -LiteralPath '${escapedMarkerPath}' -Value 'started'`
  }
}

function runPowerShell(args: string[]) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(powershell, args, { cwd: repoRoot, windowsHide: true })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ stdout, stderr, code })
    })
  })
}

async function expectScriptSupportsTestParameters() {
  const script = await readFile(scriptPath, 'utf8')
  expect(script).toContain('param(')
  expect(script).toContain('$StorageHealthUrl')
  expect(script).toContain('$AgentHealthUrl')
  expect(script).toContain('$FrontendUrl')
  expect(script).toContain('$FrontendCommand')
  expect(script).toContain('$payload.capabilities.sqlite')
  expect(script).toContain('Stop-StaleStorageListener')
  expect(script).toContain('Stop-StaleFrontendListener')
  expect(script).toContain('unoptimized CommonJS React modules')
  expect(script).toContain('refusing to stop it')
}

describe('start-dev-with-agent.ps1', () => {
  test('parses as valid PowerShell', async () => {
    const command = [
      '$errors = $null',
      `[System.Management.Automation.PSParser]::Tokenize((Get-Content -LiteralPath '${scriptPath.replace(/'/g, "''")}' -Raw), [ref]$errors) | Out-Null`,
      'if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }'
    ].join('; ')

    const result = await runPowerShell(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command])

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
  })

  test('exits without running frontend command when all services are healthy', async () => {
    await expectScriptSupportsTestParameters()
    const [storageUrl, agentUrl, frontendUrl] = await Promise.all([
      startHealthyServer(),
      startHealthyServer(),
      startHealthyFrontendServer()
    ])
    const marker = await makeMarkerCommand('frontend-started.txt')

    const result = await runPowerShell([
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-StorageHealthUrl',
      storageUrl,
      '-AgentHealthUrl',
      agentUrl,
      '-FrontendUrl',
      frontendUrl,
      '-FrontendCommand',
      marker.command,
      '-HealthTimeoutSeconds',
      '2'
    ])

    await expect(readFile(marker.markerPath, 'utf8')).rejects.toThrow()
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Vite frontend is already healthy')
  })

  test('runs frontend command when storage and agent are healthy but frontend is unavailable', async () => {
    await expectScriptSupportsTestParameters()
    const [storageUrl, agentUrl] = await Promise.all([startHealthyServer(), startHealthyServer()])
    const marker = await makeMarkerCommand('frontend-started.txt')

    const result = await runPowerShell([
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-StorageHealthUrl',
      storageUrl,
      '-AgentHealthUrl',
      agentUrl,
      '-FrontendUrl',
      'http://127.0.0.1:1/',
      '-FrontendCommand',
      marker.command,
      '-HealthTimeoutSeconds',
      '2'
    ])

    await expect(readFile(marker.markerPath, 'utf8')).resolves.toBe('started\r\n')
    expect(result.code).toBe(0)
  }, 15_000)
})
