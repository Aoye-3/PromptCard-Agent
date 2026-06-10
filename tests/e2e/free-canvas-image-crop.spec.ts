import { expect, test, type Page, type Route } from '@playwright/test'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64'
)

test('drops an image and creates cropped nodes from manual grid lines', async ({ page }) => {
  await routeStorage(page)
  await page.route('**/storage-api/assets', async route => {
    await route.fulfill({ json: { id: 'asset-1.png', filename: 'board.png', contentType: 'image/png', size: onePixelPng.length } })
  })
  await page.route('**/storage-api/assets/asset-1.png', async route => {
    await route.fulfill({ body: onePixelPng, contentType: 'image/png' })
  })

  await page.goto('/')
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()

  await expect(page.getByTitle('图片节点')).toHaveCount(0)
  await page.locator('.react-flow__pane').click({ button: 'right' })
  await expect(page.getByRole('button', { name: '新建图片节点' })).toHaveCount(0)
  await page.locator('.react-flow__pane').click()

  const acceptsSystemFileDrag = await page.locator('.react-flow__pane').evaluate(target => {
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { items: [], files: [], types: ['Files'], dropEffect: 'none' }
    })
    target.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(acceptsSystemFileDrag).toBe(true)

  await page.locator('[data-free-canvas-screen]').evaluate(target => {
    const event = new Event('dragenter', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { items: [], files: [], types: ['Files'], dropEffect: 'none' }
    })
    target.dispatchEvent(event)
  })
  await expect(page.getByText('松开以添加图片')).toBeVisible()

  await page.locator('[data-free-canvas-screen] .react-flow').evaluate((target, bytes) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([new Uint8Array(bytes)], 'board.png'))
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: 700, clientY: 420 }))
  }, [...onePixelPng])

  const imageNodes = page.locator('[data-image-node]')
  await expect(imageNodes).toHaveCount(1)
  await expect(imageNodes.first().locator('img')).toBeVisible()
  await expect(imageNodes.first()).not.toContainText('imageAsset')

  await imageNodes.first().dblclick()
  const editor = page.locator('[data-image-crop-editor]')
  await expect(editor).toBeVisible()

  await dragRulerToImageCenter(page, '垂直裁切标尺', 0.5, 0.2)
  await dragRulerToImageCenter(page, '水平裁切标尺', 0.2, 0.5)
  await expect(page.getByText('将生成 4 个图片节点')).toBeVisible()

  await page.getByRole('button', { name: '垂直裁切线 1' }).dblclick()
  await expect(page.getByText('将生成 2 个图片节点')).toBeVisible()
  await dragRulerToImageCenter(page, '垂直裁切标尺', 0.5, 0.2)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(imageNodes).toHaveCount(1)

  await imageNodes.first().dblclick()
  await dragRulerToImageCenter(page, '垂直裁切标尺', 0.5, 0.2)
  await dragRulerToImageCenter(page, '水平裁切标尺', 0.2, 0.5)
  await page.getByRole('button', { name: '确认裁切' }).click()

  await expect(editor).toBeHidden()
  await expect(imageNodes).toHaveCount(5)
})

test('copies and pastes a selected image node with keyboard shortcuts', async ({ page }) => {
  await routeStorage(page)
  await page.route('**/storage-api/assets', route => route.fulfill({ json: { id: 'asset-1.png', filename: 'board.png', contentType: 'image/png', size: onePixelPng.length } }))
  await page.route('**/storage-api/assets/asset-1.png', route => route.fulfill({ body: onePixelPng, contentType: 'image/png' }))

  await page.goto('/')
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()
  await dropImage(page)

  const imageNodes = page.locator('[data-image-node]')
  await expect(imageNodes).toHaveCount(1)
  await imageNodes.first().click()
  await page.keyboard.press('Control+c')
  await expect(page.getByText('已复制图片节点')).toBeVisible()
  await page.keyboard.press('Control+v')

  await expect(imageNodes).toHaveCount(2)
})

test('pastes an image copied from another application into the canvas', async ({ page }) => {
  await routeStorage(page)
  await page.route('**/storage-api/assets', route => route.fulfill({ json: { id: 'clipboard.png', filename: 'clipboard.png', contentType: 'image/png', size: onePixelPng.length } }))
  await page.route('**/storage-api/assets/clipboard.png', route => route.fulfill({ body: onePixelPng, contentType: 'image/png' }))

  await page.goto('/')
  await page.getByText('Create project').click()
  await page.locator('[data-builder-template-id]').first().click()

  await page.evaluate(bytes => {
    const clipboard = new DataTransfer()
    clipboard.items.add(new File([new Uint8Array(bytes)], 'clipboard.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }))
  }, [...onePixelPng])

  await expect(page.locator('[data-image-node]')).toHaveCount(1)
})

async function dragRulerToImageCenter(page: Page, rulerLabel: string, xRatio: number, yRatio: number) {
  const ruler = page.getByLabel(rulerLabel).first()
  const image = page.getByAltText('待裁切图片')
  const rulerBox = await ruler.boundingBox()
  const imageBox = await image.boundingBox()
  if (!rulerBox || !imageBox) throw new Error('Crop editor geometry unavailable')
  await page.mouse.move(rulerBox.x + rulerBox.width / 2, rulerBox.y + rulerBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(imageBox.x + imageBox.width * xRatio, imageBox.y + imageBox.height * yRatio)
  await page.mouse.up()
}

async function dropImage(page: Page) {
  await page.locator('[data-free-canvas-screen] .react-flow').evaluate((target, bytes) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([new Uint8Array(bytes)], 'board.png'))
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: 700, clientY: 420 }))
  }, [...onePixelPng])
}

async function routeStorage(page: Page) {
  let currentProject: Record<string, unknown> | null = null
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
  await page.route('**/storage-api/presets', route => route.fulfill({ json: { presets: [] } }))
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
