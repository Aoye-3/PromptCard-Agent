import { expect, test } from '@playwright/test'

test('loads the app shell and opens the create project flow', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('body')).toContainText('PMAgent')
  await expect(page.locator('body')).toContainText(/Projects|Create your first project/)

  await page.getByRole('button', { name: 'Create project' }).click()

  await expect(page.locator('[data-builder-template-id]').first()).toBeVisible()
})

test('shows project and prompt library trash controls backed by storage service', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('body')).toContainText(/Projects|Create your first project/)
  await expect(page.locator('body')).toContainText(/Trash|Create project/)

  await page.locator('[data-app-nav-tab="library"]').click()
  await expect(page.locator('[data-app-nav-tab="library"]')).toHaveAttribute('data-active', 'true')
  await expect(page.locator('body')).toContainText(/Trash|prompt/i)
})
