import { expect, test } from '@playwright/test'

const project = {
  id: 'project-1',
  title: 'Instant Project',
  type: 'card',
  revision: 1,
  pages: [{ id: 'page-1', cards: [] }],
  currentPage: 0,
  createdAt: 1,
  updatedAt: 2,
  lastOpenedAt: 2,
  meta: {}
}

test('creates a project without refetching the full project list', async ({ page }) => {
  const projectListReads: number[] = []
  let releaseCreateRequest: () => void = () => undefined
  const createRequestCanFinish = new Promise<void>(resolve => {
    releaseCreateRequest = resolve
  })

  await page.route('**/storage-api/projects', async route => {
    if (route.request().method() === 'GET') {
      projectListReads.push(Date.now())
      await route.fulfill({ json: { projects: [] } })
      return
    }

    await createRequestCanFinish
    await fulfillProjectWrite(route)
  })
  await routeCommonStorage(page)

  await page.goto('/')
  await expect(page.getByText('Create your first project')).toBeVisible()

  const readsBeforeCreate = projectListReads.length
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()

  await expect(page.locator('[data-free-canvas-screen]')).toBeVisible({ timeout: 500 })
  expect(projectListReads).toHaveLength(readsBeforeCreate)

  releaseCreateRequest()
})

test('creates a text node from the free-canvas toolbar', async ({ page }) => {
  await page.route('**/storage-api/projects', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } })
      return
    }
    await fulfillProjectWrite(route)
  })
  await routeCommonStorage(page)

  await page.goto('/')
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()
  await page.getByTitle('Text').click()
  const editor = page.locator('[data-free-canvas-text-node] [contenteditable="true"]')
  await expect(editor).toBeVisible()
  await editor.fill('Toolbar-created text node')
  await editor.evaluate(element => (element as HTMLElement).blur())

  await expect(page.locator('[data-free-canvas-text-node]').filter({ hasText: 'Toolbar-created text node' })).toHaveCount(1)
})

test('keeps a deleted free-canvas node removed after a delayed stale save response', async ({ page }) => {
  let releaseUpdate: () => void = () => undefined
  const updateCanFinish = new Promise<void>(resolve => { releaseUpdate = resolve })
  let markUpdateStarted: () => void = () => undefined
  const updateStarted = new Promise<void>(resolve => { markUpdateStarted = resolve })
  let storedProject: typeof project | null = null

  await page.route('**/storage-api/projects', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } })
      return
    }
    storedProject = await projectFromWrite(route, storedProject)
    await route.fulfill({ json: storedProject })
  })
  await page.route('**/storage-api/projects/*', async route => {
    if (route.request().method() !== 'PUT') {
      await route.fallback()
      return
    }
    const requestBody = route.request().postDataJSON() as { revision: number; updates: typeof project }
    markUpdateStarted()
    await updateCanFinish
    storedProject = {
      ...(storedProject || requestBody.updates),
      ...requestBody.updates,
      id: route.request().url().split('/').pop() || requestBody.updates.id,
      revision: requestBody.revision + 1
    }
    await route.fulfill({ json: storedProject })
  })
  await routeCommonStorage(page)
  page.on('dialog', dialog => {
    void dialog.accept().catch(() => undefined)
  })

  await page.goto('/')
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()
  await page.getByTitle('Text').click()
  const editor = page.locator('[data-free-canvas-text-node] [contenteditable="true"]')
  await editor.fill('Delayed save text node')
  await editor.evaluate(element => (element as HTMLElement).blur())

  const textNode = page.locator('.react-flow__node').filter({ hasText: 'Delayed save text node' })
  await expect(textNode).toBeVisible()
  await updateStarted
  await textNode.click()
  await textNode.focus()
  await page.keyboard.press('Delete')
  await expect(textNode).toBeHidden({ timeout: 500 })

  releaseUpdate()
  await expect(textNode).toBeHidden()
})

test('removes a project from the list before the trash request resolves', async ({ page }) => {
  let releaseTrashRequest: () => void = () => undefined
  const trashRequestCanFinish = new Promise<void>(resolve => {
    releaseTrashRequest = resolve
  })

  await page.route('**/storage-api/projects', async route => {
    await route.fulfill({ json: { projects: [project] } })
  })
  await page.route('**/storage-api/projects/trash', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { items: [] } })
      return
    }

    await trashRequestCanFinish
    await route.fulfill({ json: { projects: [project] } })
  })
  await routeCommonStorage(page)

  page.on('dialog', dialog => {
    void dialog.accept().catch(() => undefined)
  })

  await page.goto('/')
  await expect(page.getByText(project.title)).toBeVisible()

  await page.getByLabel('Move to trash').click()
  await expect(page.getByText(project.title)).toBeHidden({ timeout: 500 })

  releaseTrashRequest()
  await expect(page.getByText(project.title)).toBeHidden()
})

test('retries a failed optimistic create as POST when the user saves', async ({ page }) => {
  let createAttempts = 0
  let updateAttempts = 0

  await page.route('**/storage-api/projects', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } })
      return
    }
    if (route.request().method() === 'POST') {
      createAttempts += 1
      if (createAttempts === 1) {
        await route.fulfill({ status: 503, json: { detail: 'storage unavailable' } })
        return
      }
      await fulfillProjectWrite(route)
      return
    }
    updateAttempts += 1
    await route.fulfill({ status: 404, json: { detail: 'not found' } })
  })
  await routeCommonStorage(page)
  page.on('dialog', dialog => {
    void dialog.accept().catch(() => undefined)
  })

  await page.goto('/')
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()
  await expect(page.getByText('保存失败')).toBeVisible()

  await page.getByTitle('Save').click()
  await expect(page.getByText('保存失败')).toBeHidden()

  expect(createAttempts).toBe(2)
  expect(updateAttempts).toBe(0)
})

async function routeCommonStorage(page: import('@playwright/test').Page) {
  await page.route('**/storage-api/projects/trash/restore', async route => {
    await route.fulfill({ json: { projects: [project] } })
  })
  await page.route('**/storage-api/presets', async route => {
    await route.fulfill({ json: { presets: [] } })
  })
  await page.route('**/storage-api/presets/trash', async route => {
    await route.fulfill({ json: { items: [] } })
  })
  await page.route('**/storage-api/migrations/browser-cache', async route => {
    await route.fulfill({ json: { projects: 0, presets: 0 } })
  })
}

async function fulfillProjectWrite(route: import('@playwright/test').Route) {
  await route.fulfill({ json: await projectFromWrite(route) })
}

async function projectFromWrite(
  route: import('@playwright/test').Route,
  currentProject: typeof project | null = null
): Promise<typeof project> {
  const request = route.request()
  if (request.method() === 'POST') {
    const createdProject = request.postDataJSON() as typeof project
    return { ...createdProject, revision: 1 }
  }

  const body = request.postDataJSON() as { revision: number; updates: typeof project }
  return {
    ...(currentProject || body.updates),
    ...body.updates,
    id: request.url().split('/').pop() || body.updates.id,
    revision: body.revision + 1
  }
}
