import { expect, browserTest as test } from './fixtures'

// The landing must render as its own screen (no app tool visible) and entering
// the tool must be an instant view switch — no anchor smooth-scroll "salto".
test('landing is a standalone screen and entering the app does not scroll-jump', async ({ page }) => {
  await page.goto('/')

  // Landing is shown; the tool's first question is not in the DOM yet.
  await expect(page.locator('.gs-landing')).toBeVisible()
  await expect(page.locator('.journey-brand-mark')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await page.getByRole('button', { name: 'Calculá ahora', exact: true }).first().click()

  // The tool is now mounted, the landing is gone, and the page is still at the
  // top (view switch, not a scroll).
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect(page.locator('.gs-landing')).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  // Entering persists: a reload lands straight back in the tool.
  await page.reload()
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect(page.locator('.gs-landing')).toHaveCount(0)
})
