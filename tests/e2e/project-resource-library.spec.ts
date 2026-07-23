import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const storageUrl = 'http://127.0.0.1:38102'

test('project resources stay isolated and subject append remains an unsent Composer draft', async ({ page, request }) => {
  const suffix = Date.now()
  const projectA = `resource-a-${suffix}`
  const projectB = `resource-b-${suffix}`
  const titleA = `Resource A ${suffix}`
  const titleB = `Resource B ${suffix}`
  await seedProject(request, projectA, titleA)
  await seedProject(request, projectB, titleB)
  const asset = await seedAsset(request)
  const folder = await postJson(request, `/api/projects/${projectA}/resource-folders`, {
    id: `folder-${suffix}`,
    name: 'Mood'
  })
  await postJson(request, `/api/projects/${projectA}/resources`, {
    id: `subject-${suffix}`,
    kind: 'subject',
    name: 'Hero subject',
    sourceAssetId: asset.id,
    previewAssetId: asset.id,
    providerAssetId: asset.id,
    width: 640,
    height: 480,
    contentType: 'image/png'
  })

  await page.goto('/', { waitUntil: 'networkidle' })
  await openProject(page, titleA)

  const library = page.locator('[data-project-resource-library]')
  await expect(library).toHaveClass(/w-11/)
  await library.getByTitle('展开项目资源库').click()
  await expect(library).toHaveClass(/w-\[280px\]/)
  await expect(library.locator('.grid-cols-3')).toBeVisible()

  let generationRequests = 0
  page.on('request', outgoing => {
    if (outgoing.url().includes('/image-generations') && outgoing.method() === 'POST') generationRequests += 1
  })
  const subjectCard = library.locator('[title="Hero subject"]')
  await subjectCard.hover()
  await subjectCard.getByText('加入', { exact: true }).click()
  await expect(page.locator('[data-free-canvas-image-generation-panel]')).toBeVisible()
  expect(generationRequests).toBe(0)

  await library.getByTitle('素材').click()
  await expect(library.getByText('Mood', { exact: true })).toBeVisible()
  await page.getByTitle('Back').click()
  await openProject(page, titleB)
  const libraryB = page.locator('[data-project-resource-library]')
  await libraryB.getByTitle('展开项目资源库').click()
  await expect(libraryB.getByText('Hero subject', { exact: true })).toHaveCount(0)

  const isolated = await request.get(`${storageUrl}/api/projects/${projectB}/resources`)
  expect(isolated.ok()).toBe(true)
  expect(await isolated.json()).toEqual({ folders: [], resources: [] })
  expect(folder.parentId).toBeNull()
})

async function seedProject(request: APIRequestContext, id: string, title: string) {
  await postJson(request, '/api/projects', {
    id,
    title,
    type: 'free-canvas',
    pages: [],
    currentPage: 0,
    meta: {},
    freeCanvas: {
      nodes: [],
      edges: [],
      selectedNodeId: null,
      viewport: { x: 0, y: 0, zoom: 1 },
      meta: {}
    }
  })
}

async function seedAsset(request: APIRequestContext) {
  const response = await request.post(`${storageUrl}/api/assets`, {
    data: Buffer.from('\x89PNG\r\n\x1a\nproject-resource-e2e', 'binary'),
    headers: {
      'content-type': 'image/png',
      'x-file-name': 'project-resource.png'
    }
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

async function postJson(request: APIRequestContext, path: string, data: unknown) {
  const response = await request.post(`${storageUrl}${path}`, { data })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

async function openProject(page: Page, title: string) {
  const card = page.getByText(title, { exact: true }).locator('xpath=ancestor::article')
  await expect(card).toBeVisible({ timeout: 60_000 })
  await card.getByRole('button', { name: 'Open project' }).click()
  await expect(page.locator('[data-free-canvas-screen]')).toBeVisible()
}
