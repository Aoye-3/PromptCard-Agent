import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const storageUrl = 'http://127.0.0.1:38102'

test.use({ viewport: { width: 2048, height: 1195 } })

test('keeps the canvas primary while both right-panel modes remain compact', async ({ page, request }, testInfo) => {
  const suffix = Date.now()
  const projectId = `dense-panel-${suffix}`
  const title = `Dense panel ${suffix}`
  await seedProject(request, projectId, title)

  await page.goto('/', { waitUntil: 'networkidle' })
  await openProject(page, title)

  const panel = page.locator('aside').filter({ has: page.locator('[data-free-canvas-panel-switcher]') })
  await expect(panel).toBeVisible()
  await expect(panel).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect.poll(async () => Math.round((await panel.boundingBox())?.width || 0)).toBe(456)
  await expect(page.getByText('可以直接修改当前画布')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送给 Agent' })).toBeVisible()

  const agentScreenshotPath = testInfo.outputPath('free-canvas-dense-agent-panel.png')
  await page.screenshot({ path: agentScreenshotPath, fullPage: true })
  await testInfo.attach('free-canvas-dense-agent-panel', {
    path: agentScreenshotPath,
    contentType: 'image/png'
  })

  await panel.getByRole('button', { name: '图片生成', exact: true }).click()
  const imageComposer = page.locator('[aria-label="图片生成输入"]')
  await expect(imageComposer).toBeVisible()
  await expect(imageComposer).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.getByText('开始一次图片生成')).toBeVisible()
  await expect.poll(async () => Math.round((await imageComposer.boundingBox())?.height || 0)).toBeLessThan(190)

  const imageScreenshotPath = testInfo.outputPath('free-canvas-dense-image-panel.png')
  await page.screenshot({ path: imageScreenshotPath, fullPage: true })
  await testInfo.attach('free-canvas-dense-image-panel', {
    path: imageScreenshotPath,
    contentType: 'image/png'
  })

  await page.getByTitle('Collapse Agent panel').click()
  await expect(panel).toBeHidden()
  await expect(page.getByTitle('Open Agent panel')).toBeVisible()
})

async function seedProject(request: APIRequestContext, id: string, title: string) {
  const response = await request.post(`${storageUrl}/api/projects`, {
    data: {
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
    }
  })
  expect(response.ok(), await response.text()).toBe(true)
}

async function openProject(page: Page, title: string) {
  const card = page.getByText(title, { exact: true }).locator('xpath=ancestor::article')
  await expect(card).toBeVisible({ timeout: 60_000 })
  await card.getByRole('button', { name: 'Open project' }).click()
  await expect(page.locator('[data-free-canvas-screen]')).toBeVisible()
}
