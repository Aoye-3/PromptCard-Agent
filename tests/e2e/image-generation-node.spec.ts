import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const storageUrl = 'http://127.0.0.1:38102'
const runtimeUrl = 'http://127.0.0.1:38101'

test('project image conversation uses real Runtime and SQLite while canvas continuation stays manual', async ({ page, request }) => {
  const projectId = `image-conversation-e2e-${Date.now()}`
  const projectTitle = `图片会话 E2E ${Date.now()}`
  await seedProject(request, projectId, projectTitle)
  await enableImageGenerationFeature(page)

  await page.goto('/', { waitUntil: 'networkidle' })
  await openProject(page, projectTitle)
  const panelSwitcher = page.locator('[data-free-canvas-panel-switcher]')
  await expect(panelSwitcher.getByRole('button')).toHaveCount(3)
  await expect(panelSwitcher.getByRole('button', { name: 'Agent' })).toBeVisible()
  await expect(panelSwitcher.getByRole('button', { name: '图片生成' })).toBeVisible()
  await expect(panelSwitcher.getByRole('button', { name: 'Prompt库' })).toBeVisible()

  await panelSwitcher.getByRole('button', { name: '图片生成' }).click()
  await expect(page.locator('[data-free-canvas-image-generation-panel]')).toBeVisible()
  await expect(page.getByText('默认图片模型已就绪')).toBeVisible()

  await page.getByRole('button', { name: '注入当前节点' }).click()
  const prompt = page.getByRole('textbox', { name: '图片描述' })
  await expect(prompt).toHaveValue('银色机械装置，干净产品摄影')
  await prompt.fill('第一轮：银色机械装置，电影感产品摄影')
  const firstGenerationResponse = page.waitForResponse(response => response.url().includes('/image-generations'))
  await page.getByRole('button', { name: '生成图片' }).click()
  const firstGeneration = await firstGenerationResponse
  expect(firstGeneration.ok(), await firstGeneration.text()).toBe(true)

  await expect(page.locator('[data-image-generation-turn]')).toHaveCount(1)
  await expect(page.locator('[data-image-generation-turn] img[src*="/storage-api/assets/"]')).toBeVisible()
  await expect.poll(async () => generatedCanvasNodes(request, projectId)).toBe(1)

  const firstConversationPage = await storageJson(request, `/api/image-generation-conversations?projectId=${projectId}&limit=20`)
  expect(firstConversationPage.conversations).toHaveLength(1)
  const conversationId = firstConversationPage.conversations[0].id as string
  const firstRuns = await storageJson(request, `/api/image-generation-conversations/${conversationId}/runs?projectId=${projectId}&limit=20`)
  expect(firstRuns.runs).toHaveLength(1)
  expect(firstRuns.runs[0]).toMatchObject({ projectId, conversationId, state: 'succeeded' })
  expect(firstRuns.runs[0]).not.toHaveProperty('nodeId')

  await page.getByRole('button', { name: '再次生成' }).click()
  await expect(prompt).toHaveValue('第一轮：银色机械装置，电影感产品摄影')
  await prompt.fill('第二轮：只生成蓝色玻璃装置')
  const secondGenerationResponse = page.waitForResponse(response => response.url().includes('/image-generations'))
  await page.getByRole('button', { name: '生成图片' }).click()
  const secondGeneration = await secondGenerationResponse
  expect(secondGeneration.ok(), await secondGeneration.text()).toBe(true)
  await expect(page.locator('[data-image-generation-turn]')).toHaveCount(2)
  await expect.poll(async () => generatedCanvasNodes(request, projectId)).toBe(2)

  const provider = await runtimeJson(request, '/__test__/provider-requests')
  expect(provider.requests).toHaveLength(2)
  expect(provider.requests[0].segments).toEqual([{ type: 'text', text: '第一轮：银色机械装置，电影感产品摄影' }])
  expect(provider.requests[1].segments).toEqual([{ type: 'text', text: '第二轮：只生成蓝色玻璃装置' }])
  expect(JSON.stringify(provider.requests[1])).not.toContain('第一轮')

  const historyButton = page.getByRole('button', { name: '打开图片生成历史' })
  await historyButton.click()
  const history = page.getByRole('dialog', { name: '项目生成历史' })
  await expect(history).toBeVisible()
  await expect(history.locator('[data-image-generation-turn]')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(history).toBeHidden()
  await expect(historyButton).toBeFocused()

  const requestCountBeforeContinuation = provider.requests.length
  await page.locator('[data-image-node]').last().evaluate(element => {
    element.closest('.react-flow__node')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await page.getByTitle('智能改图').click({ timeout: 5_000 })
  await expect(page.getByRole('combobox', { name: '生成方式' })).toHaveValue('smart-edit')
  await expect(page.getByLabel('本轮参考图')).toBeVisible()
  const afterContinuation = await runtimeJson(request, '/__test__/provider-requests')
  expect(afterContinuation.requests).toHaveLength(requestCountBeforeContinuation)
})

async function seedProject(request: APIRequestContext, projectId: string, title: string) {
  const response = await request.post(`${storageUrl}/api/projects`, {
    data: {
      id: projectId,
      title,
      type: 'free-canvas',
      revision: 1,
      pages: [],
      currentPage: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
      meta: {},
      freeCanvas: {
        nodes: [{
          id: 'prompt-text',
          kind: 'text',
          title: '创作提示',
          position: { x: 160, y: 180 },
          width: 420,
          height: 180,
          fontSize: 'large',
          segments: [{
            id: 'prompt-segment',
            source: 'user',
            text: '银色机械装置，干净产品摄影',
            color: '#111827',
            createdAt: 1,
            updatedAt: 1
          }],
          meta: {}
        }],
        edges: [],
        selectedNodeId: 'prompt-text',
        viewport: { x: 0, y: 0, zoom: 1 },
        meta: {}
      }
    }
  })
  expect(response.ok()).toBe(true)
}

async function enableImageGenerationFeature(page: Page) {
  await page.goto('/', { waitUntil: 'commit' })
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('PromptCard')
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('promptcard')) open.result.createObjectStore('promptcard')
      }
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const transaction = open.result.transaction('promptcard', 'readwrite')
        transaction.objectStore('promptcard').put({
          theme: 'light',
          defaultMode: 'learn',
          autoSave: true,
          autoSaveIdleSeconds: 0.05,
          presetSort: 'usage',
          meta: { featureFlags: { imageGenerationNodeV1: true } }
        }, 'settings')
        transaction.oncomplete = () => {
          open.result.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  })
}

async function openProject(page: Page, title: string) {
  const card = page.getByText(title, { exact: true }).locator('xpath=ancestor::article')
  await expect(card).toBeVisible({ timeout: 60_000 })
  await card.getByRole('button', { name: 'Open project' }).click()
  await expect(page.locator('[data-free-canvas-screen]')).toBeVisible()
}

async function generatedCanvasNodes(request: APIRequestContext, projectId: string) {
  const project = await storageJson(request, `/api/projects/${projectId}`)
  return project.freeCanvas.nodes.filter((node: { meta?: { source?: string } }) => (
    node.meta?.source === 'image-generation-conversation'
  )).length
}

async function storageJson(request: APIRequestContext, path: string) {
  const response = await request.get(`${storageUrl}${path}`)
  expect(response.ok()).toBe(true)
  return response.json()
}

async function runtimeJson(request: APIRequestContext, path: string) {
  const response = await request.get(`${runtimeUrl}${path}`)
  expect(response.ok()).toBe(true)
  return response.json()
}
