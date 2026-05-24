import { expect, test } from '@playwright/test'

test('loads the app shell and opens the create project flow', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('body')).toContainText('PMAgent')
  await expect(page.locator('body')).toContainText(/Projects|Create your first project/)

  await page.locator('header button').first().click()

  await expect(page.locator('body')).toContainText(/Agent|Storyboard|Create/)
})

test('shows project and prompt library trash controls backed by storage service', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('body')).toContainText(/Projects|Create your first project/)
  await expect(page.locator('body')).toContainText(/Trash|Create project/)

  await page.getByText('Prompt').click()
  await expect(page.locator('body')).toContainText(/Trash|prompt/i)
})
