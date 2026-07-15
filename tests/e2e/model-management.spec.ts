import { expect, test, type Page, type Route } from '@playwright/test'

test.setTimeout(90_000)

const secret = 'task15-super-secret'
const catalog = {
  providers: [{ id: 'ark', displayName: 'Volcengine Ark', defaultApiBase: 'https://ark.example.test/api/v3' }],
  models: [{
    id: 'doubao-seedream-5-0-pro-260628',
    providerId: 'ark',
    displayName: 'Seedream 5 Pro',
    modality: 'image',
    capabilities: {
      modes: ['generate', 'edit', 'region-edit'],
      maxReferenceImages: 10,
      regionInputs: ['point', 'bbox'],
      resolutions: ['1K', '2K']
    }
  }]
}

test('creates a credential-backed image connection and assigns image.primary without echoing the secret', async ({ page }) => {
  const connections: Array<Record<string, unknown>> = []
  const assignments: Array<Record<string, string>> = []
  let createBody: Record<string, unknown> | null = null
  let assignmentBody: Record<string, unknown> | null = null

  await routeAppStorage(page)
  await routeAgentBootstrap(page)
  await page.route('**/agent-api/promptcard/runtime/model-catalog', route => route.fulfill({ json: catalog }))
  await page.route('**/agent-api/promptcard/runtime/model-connections', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { connections } })
      return
    }
    createBody = route.request().postDataJSON() as Record<string, unknown>
    const connection = {
      id: 'ark-task15',
      providerId: createBody.providerId,
      displayName: createBody.displayName,
      apiBase: createBody.apiBase,
      enabled: createBody.enabled,
      credentialConfigured: true,
      credentialMask: '****cret',
      createdAt: 1,
      updatedAt: 1
    }
    connections.push(connection)
    await route.fulfill({ json: connection })
  })
  await page.route('**/agent-api/promptcard/runtime/model-assignments', route => route.fulfill({ json: { assignments } }))
  await page.route('**/agent-api/promptcard/runtime/model-assignments/image.primary', async route => {
    assignmentBody = route.request().postDataJSON() as Record<string, unknown>
    const assignment = { slot: 'image.primary', ...assignmentBody } as Record<string, string>
    assignments.push(assignment)
    await route.fulfill({ json: assignment })
  })
  await page.goto('/', { waitUntil: 'commit' })
  await page.locator('[data-app-nav-tab="agents"]').click()

  const panel = page.locator('[data-model-management-panel]')
  await expect(panel).toBeVisible()
  await panel.locator('input').nth(0).fill('Task15 Ark')
  await panel.locator('input').nth(1).fill('https://ark.example.test/api/v3')
  await panel.locator('input[type="password"]').fill(secret)
  await panel.locator('[data-model-connection-save]').click()

  await expect(panel.getByText('Task15 Ark', { exact: true }).first()).toBeVisible()
  expect(createBody).toMatchObject({
    providerId: 'ark',
    displayName: 'Task15 Ark',
    apiBase: 'https://ark.example.test/api/v3',
    enabled: true,
    credential: secret
  })
  await expect(panel.locator('input[type="password"]')).toHaveValue('')
  await expect(page.locator('body')).not.toContainText(secret)

  const imageAssignment = panel.locator('label').filter({ hasText: 'image.primary' }).locator('select')
  await imageAssignment.selectOption('ark-task15::doubao-seedream-5-0-pro-260628')
  await expect(imageAssignment).toHaveValue('ark-task15::doubao-seedream-5-0-pro-260628')
  expect(assignmentBody).toEqual({
    connectionId: 'ark-task15',
    modelId: 'doubao-seedream-5-0-pro-260628'
  })
})

async function routeAppStorage(page: Page) {
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 204, body: '' }))
  await page.route('**/storage-api/health', route => route.fulfill({ json: { ok: true } }))
  await page.route('**/storage-api/projects', route => route.fulfill({ json: { projects: [] } }))
  await page.route('**/storage-api/projects/trash', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/storage-api/presets', route => route.fulfill({ json: { presets: [] } }))
  await page.route('**/storage-api/presets/trash', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/storage-api/migrations/browser-cache', route => route.fulfill({ json: { projects: 0, presets: 0 } }))
}

async function routeAgentBootstrap(page: Page) {
  await page.route('**/agent-api/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/health')) {
      await route.fulfill({ json: { ok: true } })
      return
    }
    if (path.endsWith('/bootstrap')) {
      await route.fulfill({ json: { user: { id: 'task15', email: 'task15@example.test' } } })
      return
    }
    if (path.endsWith('/me')) {
      await route.fulfill({ json: { id: 'task15', email: 'task15@example.test' } })
      return
    }
    if (path.endsWith('/catalog')) {
      await route.fulfill({ json: { models: [], skills: [], tools: [], builtinTools: [] } })
      return
    }
    if (path.endsWith('/model-config')) {
      await route.fulfill({ json: { modelName: '', apiKeyConfigured: false, availableModels: [] } })
      return
    }
    await route.fulfill({ status: 404, json: { detail: 'unmocked agent route' } })
  })
}
