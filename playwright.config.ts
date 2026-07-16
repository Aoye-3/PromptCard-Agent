import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:38100',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'powershell -ExecutionPolicy Bypass -File tests/fixtures/start_image_generation_e2e_service.ps1 -Service storage',
      url: 'http://127.0.0.1:38102/health',
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: 'powershell -ExecutionPolicy Bypass -File tests/fixtures/start_image_generation_e2e_service.ps1 -Service runtime',
      url: 'http://127.0.0.1:38101/health',
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: 'powershell -ExecutionPolicy Bypass -File tests/fixtures/start_image_generation_e2e_service.ps1 -Service frontend',
      url: 'http://127.0.0.1:38100',
      reuseExistingServer: false,
      timeout: 120_000
    }
  ]
})
