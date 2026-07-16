import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

test('dragging empty canvas creates a multi-selection box instead of panning', async ({ page }) => {
  await routeStorage(page)
  await openFreeCanvasProject(page)

  const firstNode = await createFilledTextNode(page, 'Selection node one')
  const secondNode = await createFilledTextNode(page, 'Selection node two')
  await expect(firstNode).toHaveCount(1)
  await expect(secondNode).toHaveCount(1)

  const beforeTransform = await viewportTransform(page)
  await dragSelectionAround(page, [firstNode, secondNode])
  const afterTransform = await viewportTransform(page)

  expect(afterTransform).toBe(beforeTransform)
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)

  await firstNode.click()
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(1)
})

test('holding space while dragging empty canvas pans the viewport', async ({ page }) => {
  await routeStorage(page)
  await openFreeCanvasProject(page)

  const beforeTransform = await viewportTransform(page)
  await page.keyboard.down('Space')
  await dragPane(page, 360, 260, 170, 90)
  await page.keyboard.up('Space')
  const afterTransform = await viewportTransform(page)

  expect(afterTransform).not.toBe(beforeTransform)
})

test('drags a filled text node from its text content while not editing', async ({ page }) => {
  await routeStorage(page)
  await openFreeCanvasProject(page)

  await page.getByTitle('Text').click()
  const editor = page.locator('[data-free-canvas-text-node] [contenteditable="true"]')
  await expect(editor).toBeVisible()
  await editor.fill('Filled text drag target')
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-free-canvas-text-node]')).toHaveCount(1)

  await editor.evaluate(element => (element as HTMLElement).blur())
  await expect(page.locator('[data-free-canvas-text-node] [contenteditable="true"]')).toHaveCount(0)
  const textNode = page.locator('[data-free-canvas-text-node]').filter({ hasText: 'Filled text drag target' })
  await expect(textNode).toHaveCount(1)

  const before = await requiredBox(textNode)
  await expect(textNode.locator('[data-free-canvas-text-content]')).not.toHaveClass(/nodrag/)
  await dragFromLocator(page, textNode.getByText('Filled text drag target'), 160, 80)
  const after = await requiredBox(textNode)

  expect(after.x).toBeGreaterThan(before.x + 80)
  expect(after.y).toBeGreaterThan(before.y + 35)
})

test('quick message text nodes start manageable and can be dragged and deleted', async ({ page }) => {
  await routeStorage(page)
  await openFreeCanvasProject(page)
  await createQuickMessage(page, 'Quick drag', 'Quick message body')

  await page.getByTitle('Quick messages').click()
  await page.getByText('Quick drag').click()

  const quickNode = page.locator('[data-free-canvas-text-node]').filter({ hasText: 'Quick message body' })
  await expect(quickNode).toHaveCount(1)
  await expect(page.locator('[data-free-canvas-text-node] [contenteditable="true"]')).toHaveCount(0)

  const before = await requiredBox(quickNode)
  await expect(quickNode.locator('[data-free-canvas-text-content]')).not.toHaveClass(/nodrag/)
  await dragFromLocator(page, quickNode.getByText('Quick message body'), 140, 70)
  const after = await requiredBox(quickNode)

  expect(after.x).toBeGreaterThan(before.x + 70)
  expect(after.y).toBeGreaterThan(before.y + 30)

  await quickNode.click()
  await page.keyboard.press('Delete')
  await expect(quickNode).toHaveCount(0)
})

test('quick message text nodes stay visible while the image generation panel tracks canvas selection', async ({ page }) => {
  await routeStorage(page, [{
    id: 'preset-visible-quick',
    type: 'custom',
    category: 'quick-message',
    label: 'Visible quick',
    content: 'Visible quick message body',
    usageCount: 0,
    meta: { quickMessage: { kind: 'quick-message' } }
  }])
  await openFreeCanvasProject(page)
  await page.getByRole('button', { name: '图片生成', exact: true }).click()

  await page.getByTitle('Quick messages').click()
  await page.getByText('Visible quick', { exact: true }).click()

  const quickNode = page.locator('[data-free-canvas-text-node]').filter({ hasText: 'Visible quick message body' })
  await expect(quickNode).toBeVisible()
})

async function openFreeCanvasProject(page: Page) {
  await page.goto('/')
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()
}

async function createQuickMessage(page: Page, name: string, body: string) {
  await page.getByTitle('Quick messages').click()
  await page.getByTitle('Add quick message').click()

  const dialog = page.locator('[data-quick-message-dialog]')
  await dialog.locator('input').fill(name)
  await dialog.locator('textarea').fill(body)
  await dialog.locator('button').last().click()
  await expect(dialog).toBeHidden()
}

async function createFilledTextNode(page: Page, text: string) {
  await page.getByTitle('Text').click()
  const editor = page.locator('[data-free-canvas-text-node] [contenteditable="true"]')
  await expect(editor).toBeVisible()
  await editor.fill(text)
  await editor.evaluate(element => (element as HTMLElement).blur())
  await expect(page.locator('[data-free-canvas-text-node] [contenteditable="true"]')).toHaveCount(0)
  return page.locator('[data-free-canvas-text-node]').filter({ hasText: text })
}

async function dragFromLocator(page: Page, locator: Locator, deltaX: number, deltaY: number) {
  const box = await requiredBox(locator)
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(startX + deltaX / 2, startY + deltaY / 2, { steps: 8 })
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 })
  await page.waitForTimeout(50)
  await page.mouse.up()
}

async function dragPane(page: Page, startX: number, startY: number, deltaX: number, deltaY: number) {
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(startX + deltaX / 2, startY + deltaY / 2, { steps: 8 })
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 })
  await page.waitForTimeout(50)
  await page.mouse.up()
}

async function dragSelectionAround(page: Page, locators: Locator[]) {
  const boxes = await Promise.all(locators.map(requiredBox))
  const left = Math.min(...boxes.map(box => box.x))
  const top = Math.min(...boxes.map(box => box.y))
  const right = Math.max(...boxes.map(box => box.x + box.width))
  const bottom = Math.max(...boxes.map(box => box.y + box.height))

  await dragPane(
    page,
    Math.max(80, left - 120),
    Math.max(180, top - 120),
    right - left + 240,
    bottom - top + 240
  )
}

async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected element to have a bounding box')
  return box
}

async function viewportTransform(page: Page) {
  return page.locator('.react-flow__viewport').evaluate(element => window.getComputedStyle(element).transform)
}

async function routeStorage(page: Page, initialPresets: Record<string, unknown>[] = []) {
  let currentProject: Record<string, unknown> | null = null
  let currentPresets = initialPresets
  await page.route('**/storage-api/projects', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } })
      return
    }
    currentProject = await projectFromWrite(route, currentProject)
    await route.fulfill({ json: currentProject })
  })
  await page.route('**/storage-api/projects/*', async route => {
    currentProject = await projectFromWrite(route, currentProject)
    await route.fulfill({ json: currentProject })
  })
  await page.route('**/storage-api/presets/reorder', route => route.fulfill({ json: { presets: currentPresets } }))
  await page.route('**/storage-api/presets', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { presets: currentPresets } })
      return
    }
    const preset = route.request().postDataJSON() as Record<string, unknown>
    currentPresets = [preset, ...currentPresets.filter(item => item.id !== preset.id)]
    await route.fulfill({ json: preset })
  })
  await page.route('**/storage-api/presets/trash', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/storage-api/projects/trash', route => route.fulfill({ json: { items: [] } }))
  await page.route('**/storage-api/migrations/browser-cache', route => route.fulfill({ json: { projects: 0, presets: 0 } }))
}

async function projectFromWrite(route: Route, currentProject: Record<string, unknown> | null) {
  if (route.request().method() === 'POST') {
    return { ...(route.request().postDataJSON() as Record<string, unknown>), revision: 1 }
  }
  const body = route.request().postDataJSON() as { revision: number; updates: Record<string, unknown> }
  return { ...(currentProject || body.updates), ...body.updates, revision: body.revision + 1 }
}
