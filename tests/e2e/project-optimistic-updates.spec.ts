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

  await page.route('**/storage-api/projects', async route => {
    if (route.request().method() === 'GET') {
      projectListReads.push(Date.now())
      await route.fulfill({ json: { projects: [] } })
      return
    }

    await route.fulfill({ json: project })
  })
  await routeCommonStorage(page)

  await page.goto('/')
  await expect(page.getByText('Create your first project')).toBeVisible()

  const readsBeforeCreate = projectListReads.length
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()

  await expect(page.getByRole('heading', { name: project.title })).toBeVisible()
  expect(projectListReads).toHaveLength(readsBeforeCreate)
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

  page.on('dialog', dialog => dialog.accept())

  await page.goto('/')
  await expect(page.getByText(project.title)).toBeVisible()

  await page.getByLabel('Move to trash').click()
  await expect(page.getByText(project.title)).toBeHidden({ timeout: 500 })

  releaseTrashRequest()
  await expect(page.getByText(project.title)).toBeHidden()
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
