import { expect, test, type Page } from '@playwright/test'

test.setTimeout(120_000)

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
)
const modelId = 'doubao-seedream-5-0-pro-260628'
const projectId = 'task15-image-project'
const generatorId = 'task15-generator'

test('generates, retries, persists history, and reuses a local generated result', async ({ page }) => {
  const state = createRouteState()
  await routeExternalStyles(page)
  await routeAgent(page)
  await routeStorage(page, state)
  await routeGeneration(page, state)
  await enableImageGenerationFeature(page)

  await openFixtureProject(page)
  const inspector = page.locator('[data-image-generator-inspector]')
  await expect(inspector).toBeVisible()

  await inspector.getByLabel('Prompt text').fill('Keep the subject and add cinematic rain')
  const references = inspector.locator('[data-reference-prompt-editor] select')
  await references.selectOption('source-ref')
  await references.selectOption('style-ref')
  await expect(inspector.getByText('@Source image', { exact: true })).toBeVisible()
  await expect(inspector.getByText('@Style image', { exact: true })).toBeVisible()
  await inspector.getByLabel('Resolution').selectOption('2K')
  await inspector.getByLabel('Aspect ratio').selectOption('16:9')
  await inspector.locator('label').filter({ hasText: 'Generation mode' }).locator('select').selectOption('region-edit')

  await inspector.getByText('Edit image regions').click()
  await expect(inspector.getByLabel('Select point region')).toBeVisible()
  await expect(inspector.getByLabel('Select bbox region')).toBeVisible()

  await inspector.getByRole('button', { name: 'Generate image' }).click()
  await expect(inspector.getByRole('button', { name: 'Generate image' })).toHaveText('Retry')
  expect(state.requests).toHaveLength(1)
  assertProviderNeutralRequest(state.requests[0])

  await inspector.getByRole('button', { name: 'Generate image' }).click()
  await expect(inspector.getByAltText('Task15 generator result')).toBeVisible()
  expect(state.requests).toHaveLength(2)
  expect(state.requests[1]).toEqual(state.requests[0])

  await inspector.getByRole('button', { name: 'History' }).click()
  const history = page.getByLabel('Generation history')
  await expect(history.locator('[data-generation-run="run-failed"]')).toBeVisible()
  await expect(history.locator('[data-generation-run="run-succeeded"]')).toBeVisible()
  await expect(history.getByAltText('Generated output')).toBeVisible()

  await expect.poll(() => state.successfulResultPersisted).toBe(true)
  await page.reload({ waitUntil: 'commit' })
  await openFixtureProject(page)
  await expect(page.getByAltText('Task15 generator result').first()).toBeVisible()
  await page.locator('[data-image-generator-inspector]').getByRole('button', { name: 'History' }).click()
  await expect(page.getByLabel('Generation history').locator('[data-generation-run="run-failed"]')).toBeVisible()
  await expect(page.getByLabel('Generation history').locator('[data-generation-run="run-succeeded"]')).toBeVisible()

  await page.getByTitle('Back').click()
  await page.locator('[data-app-side-nav] nav button:has(svg.lucide-image)').click()
  await expect(page.getByText('Task15 generated result', { exact: true })).toBeVisible()
  await page.getByText('Task15 generated result', { exact: true }).click()
  await expect(page.locator('[data-place-capture-on-canvas]')).toBeEnabled()
  await expect(page.locator('[data-place-capture-as-reference]')).toBeVisible()
  await page.locator('[data-place-capture-as-reference]').click()
  await expect(page.locator('[data-free-canvas-screen]')).toBeVisible()
  await expect(page.locator('[data-image-node]')).toHaveCount(3)

  await page.getByTitle('Back').click()
  page.once('dialog', dialog => void dialog.accept())
  await page.getByLabel('Move to trash').click()
  await expect(page.getByText('Task15 image project', { exact: true })).toBeHidden()

  const historyAfterDelete = await page.evaluate(async ({ projectId, generatorId }) => {
    const response = await fetch(`/storage-api/image-generation-runs?projectId=${projectId}&nodeId=${generatorId}`)
    return response.json()
  }, { projectId, generatorId })
  expect(state.historyReadsAfterDelete).toBeGreaterThan(0)
  expect(historyAfterDelete.runs).toHaveLength(2)
})

function assertProviderNeutralRequest(request: Record<string, unknown>) {
  expect(request).toMatchObject({
    projectId,
    nodeId: generatorId,
    connectionId: 'ark-image-primary',
    modelId,
    mode: 'region-edit',
    resolution: '2K',
    aspectRatio: '16:9',
    inputs: [
      { referenceId: 'source-ref', assetId: 'source-asset', order: 0 },
      { referenceId: 'style-ref', assetId: 'style-asset', order: 1 }
    ],
    regions: [
      { type: 'point', referenceId: 'source-ref', x: 250, y: 350 },
      { type: 'bbox', referenceId: 'source-ref', x1: 100, y1: 200, x2: 400, y2: 600 }
    ],
    promptDocument: {
      version: 1,
      segments: [
        { type: 'text', text: 'Keep the subject and add cinematic rain' },
        { type: 'reference', referenceId: 'source-ref', label: 'Source image' },
        { type: 'reference', referenceId: 'style-ref', label: 'Style image' }
      ]
    }
  })
  expect(JSON.stringify(request)).not.toContain('task15-super-secret')
  expect(JSON.stringify(request)).not.toContain('apiBase')
  expect(JSON.stringify(request)).not.toContain('https://')
}

function createRouteState() {
  return {
    project: fixtureProject(),
    projectWrites: 0,
    successfulResultPersisted: false,
    deleted: false,
    requests: [] as Array<Record<string, unknown>>,
    runs: [] as Array<Record<string, unknown>>,
    captures: [] as Array<Record<string, unknown>>,
    historyReadsAfterDelete: 0
  }
}

type RouteState = ReturnType<typeof createRouteState>

async function routeGeneration(page: Page, state: RouteState) {
  await page.route('**/api/promptcard/runtime/image-generations', async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>
    state.requests.push(request)
    if (state.requests.length === 1) {
      state.runs.push(runSnapshot('run-failed', 'failed', request))
      await route.fulfill({
        status: 503,
        json: { detail: { code: 'provider_failed', message: 'Mock provider failed', retryable: true, runId: 'run-failed' } }
      })
      return
    }
    state.runs.push(runSnapshot('run-succeeded', 'succeeded', request))
    state.captures.push(generatedCapture())
    await route.fulfill({
      json: {
        runId: 'run-succeeded',
        state: 'succeeded',
        assetId: 'generated-asset',
        captureId: 'generated-capture',
        contentType: 'image/png',
        width: 2048,
        height: 1152
      }
    })
  })
}

async function routeStorage(page: Page, state: RouteState) {
  await page.route('**/storage-api/assets/*', route => route.fulfill({ body: onePixelPng, contentType: 'image/png' }))
  await page.route('**/storage-api/recent-captures/*', async route => {
    const capture = state.captures.find(item => item.id === route.request().url().split('/').pop())
    if (!capture) {
      await route.fulfill({ status: 404, json: { detail: { code: 'not_found' } } })
      return
    }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { updates: Record<string, unknown> }
      Object.assign(capture, body.updates, { revision: Number(capture.revision) + 1 })
    }
    await route.fulfill({ json: capture })
  })
  await page.route('**/storage-api/recent-captures', route => route.fulfill({ json: { captures: state.captures } }))
  await page.route('**/storage-api/image-generation-runs?*', async route => {
    if (state.deleted) state.historyReadsAfterDelete += 1
    await route.fulfill({ json: { runs: state.runs, nextCursor: null } })
  })
  await page.route('**/storage-api/projects/*', async route => {
    const body = route.request().postDataJSON() as { revision: number; updates: Record<string, unknown> }
    state.project = { ...state.project, ...body.updates, revision: body.revision + 1 }
    state.projectWrites += 1
    if (JSON.stringify(body.updates).includes('"primaryAssetId":"generated-asset"')) {
      state.successfulResultPersisted = true
    }
    await route.fulfill({ json: state.project })
  })
  await page.route('**/storage-api/projects/trash', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { items: [] } })
      return
    }
    state.deleted = true
    await route.fulfill({ json: { projects: [state.project] } })
  })
  await page.route('**/storage-api/projects', route => route.fulfill({
    json: { projects: state.deleted ? [] : [state.project] }
  }))
  await page.route('**/storage-api/health', route => route.fulfill({ json: { ok: true } }))
  await page.route('**/storage-api/presets', route => route.fulfill({ json: { presets: [] } }))
  await page.route('**/storage-api/presets/trash', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/storage-api/migrations/browser-cache', route => route.fulfill({ json: { projects: 0, presets: 0 } }))
}

async function routeAgent(page: Page) {
  await page.route('**/agent-api/**', route => route.fulfill({ status: 404, json: { detail: 'unmocked agent route' } }))
  await page.route('**/agent-api/promptcard/runtime/model-catalog', route => route.fulfill({ json: {
    providers: [{ id: 'ark', displayName: 'Ark', defaultApiBase: 'https://ark.example.test' }],
    models: [{ id: modelId, providerId: 'ark', displayName: 'Seedream 5 Pro', modality: 'image' }]
  } }))
  await page.route('**/agent-api/promptcard/runtime/model-assignments', route => route.fulfill({ json: {
    assignments: [{ slot: 'image.primary', connectionId: 'ark-image-primary', modelId }]
  } }))
}

async function routeExternalStyles(page: Page) {
  await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }))
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 204, body: '' }))
}

async function enableImageGenerationFeature(page: Page) {
  await page.goto('/', { waitUntil: 'commit' })
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('localforage')
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('keyvaluepairs')) {
          request.result.createObjectStore('keyvaluepairs')
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const transaction = request.result.transaction('keyvaluepairs', 'readwrite')
        transaction.objectStore('keyvaluepairs').put({
          theme: 'light',
          defaultMode: 'learn',
          autoSave: true,
          autoSaveIdleSeconds: 0.05,
          presetSort: 'usage',
          meta: { featureFlags: { imageGenerationNodeV1: true } }
        }, 'settings')
        transaction.oncomplete = () => {
          request.result.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  })
  await page.reload({ waitUntil: 'commit' })
}

async function openFixtureProject(page: Page) {
  await expect(page.getByText('Task15 image project', { exact: true })).toBeVisible({ timeout: 60_000 })
  const card = page.getByText('Task15 image project', { exact: true }).locator('xpath=ancestor::article')
  await card.getByRole('button', { name: 'Open project' }).click()
  await expect(page.locator('[data-free-canvas-screen]')).toBeVisible()
}

function runSnapshot(id: string, state: 'failed' | 'succeeded', request: Record<string, unknown>) {
  return {
    id,
    projectId,
    nodeId: generatorId,
    connectionId: 'ark-image-primary',
    providerId: 'ark',
    modelId,
    state,
    requestSnapshot: {
      mode: request.mode,
      promptDocument: request.promptDocument,
      inputAssets: request.inputs,
      regions: request.regions,
      resolution: request.resolution,
      aspectRatio: request.aspectRatio,
      outputFormat: request.outputFormat,
      watermark: request.watermark
    },
    outputAssetIds: state === 'succeeded' ? ['generated-asset'] : [],
    createdAt: 1,
    startedAt: 2,
    finishedAt: 3,
    ...(state === 'failed' ? { error: { code: 'provider_failed', message: 'Mock provider failed', retryable: true } } : {})
  }
}

function generatedCapture() {
  return {
    id: 'generated-capture',
    assetId: 'generated-asset',
    kind: 'screenshot',
    status: 'recent',
    purpose: 'generatedResult',
    role: 'other',
    title: 'Task15 generated result',
    prompt: 'Keep the subject and add cinematic rain',
    userNote: '',
    sourcePlatform: 'Image generation',
    sourceUrl: '',
    contentType: 'image/png',
    size: onePixelPng.length,
    width: 2048,
    height: 1152,
    capturedAt: 3,
    origin: { type: 'image-generation', runId: 'run-succeeded', projectId, nodeId: generatorId },
    createdAt: 3,
    updatedAt: 3,
    revision: 1
  }
}

function fixtureProject(): Record<string, unknown> {
  const base = { position: { x: 100, y: 100 }, width: 320, height: 220, meta: {} }
  return {
    id: projectId,
    title: 'Task15 image project',
    type: 'free-canvas',
    revision: 1,
    pages: [],
    currentPage: 0,
    createdAt: 1,
    updatedAt: 1,
    lastOpenedAt: 1,
    meta: {},
    freeCanvas: {
      nodes: [
        { ...base, id: 'source-image', kind: 'image', title: 'Source image', assetId: 'source-asset', annotations: [] },
        { ...base, id: 'style-image', kind: 'image', title: 'Style image', position: { x: 100, y: 380 }, assetId: 'style-asset', annotations: [] },
        {
          ...base,
          id: generatorId,
          kind: 'image-generator',
          title: 'Task15 generator',
          position: { x: 620, y: 180 },
          binding: { connectionId: 'ark-image-primary', modelId },
          mode: 'generate',
          settings: { resolution: '1K', aspectRatio: 'smart', outputFormat: 'png', watermark: false },
          promptDocument: { version: 1, segments: [] },
          regions: [
            { type: 'point', x: 250, y: 350 },
            { type: 'bbox', x: 100, y: 200, width: 300, height: 400 }
          ],
          meta: {
            imageRegionBindings: [
              { regionId: 'point-region', referenceId: 'source-ref' },
              { regionId: 'bbox-region', referenceId: 'source-ref' }
            ]
          }
        }
      ],
      edges: [
        { id: 'source-edge', source: 'source-image', target: generatorId, targetHandle: 'source-image', referenceId: 'source-ref', label: 'Source image', createdAt: 1 },
        { id: 'style-edge', source: 'style-image', target: generatorId, targetHandle: 'reference-image', referenceId: 'style-ref', label: 'Style image', inputOrder: 0, createdAt: 2 }
      ],
      selectedNodeId: generatorId,
      viewport: { x: 0, y: 0, zoom: 1 },
      meta: {}
    }
  }
}
