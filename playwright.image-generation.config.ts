import { defineConfig, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { delimiter, resolve } from 'node:path'

const repoRoot = resolve('.')
const backendRoot = resolve('agent-runtime/backend')
const python = resolve(backendRoot, '.venv/Scripts/python.exe')
const pythonPath = [repoRoot, backendRoot].join(delimiter)
const serviceLogRoot = resolve('.tmp/e2e-services')
mkdirSync(serviceLogRoot, { recursive: true })

const captureServiceOutput = (name: string, command: string) =>
  `${command} > "${resolve(serviceLogRoot, `${name}.log`)}" 2>&1`

const webServer = [
  {
    command: captureServiceOutput('storage', `"${python}" -m promptcard_storage`),
    url: 'http://127.0.0.1:38102/health',
    env: {
      PYTHONPATH: pythonPath,
      PROMPTCARD_STORAGE_DATA_DIR: resolve('tests/.runtime/image-generation-storage'),
      PROMPTCARD_STORAGE_PORT: '38102'
    },
    stdout: 'ignore' as const,
    stderr: 'ignore' as const,
    reuseExistingServer: false,
    timeout: 120_000
  },
  {
    command: captureServiceOutput('runtime', `"${python}" "${resolve('tests/fixtures/image_generation_runtime.py')}"`),
    url: 'http://127.0.0.1:38101/health',
    env: {
      PYTHONPATH: pythonPath,
      PROMPTCARD_STORAGE_URL: 'http://127.0.0.1:38102',
      PORT: '38101'
    },
    stdout: 'ignore' as const,
    stderr: 'ignore' as const,
    reuseExistingServer: false,
    timeout: 120_000
  },
  {
    command: captureServiceOutput('frontend', `"${process.execPath}" "${resolve('node_modules/vite/bin/vite.js')}" --host 127.0.0.1 --port 38100 --strictPort`),
    url: 'http://127.0.0.1:38100',
    env: {
      PROMPTCARD_AGENT_URL: 'http://127.0.0.1:38101',
      PROMPTCARD_STORAGE_URL: 'http://127.0.0.1:38102',
      PROMPTCARD_DESKTOP_DEV: '1'
    },
    stdout: 'ignore' as const,
    stderr: 'ignore' as const,
    reuseExistingServer: false,
    timeout: 120_000
  }
]

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['image-generation-node.spec.ts', 'free-canvas-multi-view.spec.ts'],
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:38100',
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer
})
