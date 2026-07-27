import { defineConfig, devices } from '@playwright/test'
import { delimiter, resolve } from 'node:path'

const repoRoot = resolve('.')
const backendRoot = resolve('agent-runtime/backend')
const python = resolve(backendRoot, '.venv/Scripts/python.exe')
const pythonPath = [repoRoot, backendRoot].join(delimiter)

const webServer = [
  {
    command: `"${python}" -m promptcard_storage`,
    url: 'http://127.0.0.1:38102/health',
    env: {
      PYTHONPATH: pythonPath,
      PROMPTCARD_STORAGE_DATA_DIR: resolve('tests/.runtime/image-generation-storage'),
      PROMPTCARD_STORAGE_PORT: '38102'
    },
    reuseExistingServer: false,
    timeout: 120_000
  },
  {
    command: `"${python}" "${resolve('tests/fixtures/image_generation_runtime.py')}"`,
    url: 'http://127.0.0.1:38101/health',
    env: {
      PYTHONPATH: pythonPath,
      PROMPTCARD_STORAGE_URL: 'http://127.0.0.1:38102',
      PORT: '38101'
    },
    reuseExistingServer: false,
    timeout: 120_000
  },
  {
    command: `"${process.execPath}" "${resolve('node_modules/vite/bin/vite.js')}" --host 127.0.0.1 --port 38100 --strictPort`,
    url: 'http://127.0.0.1:38100',
    env: {
      PROMPTCARD_AGENT_URL: 'http://127.0.0.1:38101',
      PROMPTCARD_STORAGE_URL: 'http://127.0.0.1:38102',
      PROMPTCARD_DESKTOP_DEV: '1'
    },
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
