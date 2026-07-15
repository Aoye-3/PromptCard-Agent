import { defineConfig, devices } from '@playwright/test'

const service = (name: 'storage' | 'runtime' | 'frontend', port: number) => ({
  command: `powershell -ExecutionPolicy Bypass -File tests/fixtures/start_image_generation_e2e_service.ps1 -Service ${name}`,
  url: `http://127.0.0.1:${port}/${name === 'frontend' ? '' : 'health'}`,
  reuseExistingServer: false,
  timeout: 120_000
})

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'image-generation-node.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:38100',
    trace: 'on-first-retry'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [service('storage', 38102), service('runtime', 38101), service('frontend', 38100)]
})
