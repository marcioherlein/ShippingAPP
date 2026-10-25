import { expect, browserTest as test } from './fixtures'

// The landing must render as its own screen (no app tool visible) and entering
// the tool must be an instant view switch — no anchor smooth-scroll "salto".
test('landing is a standalone screen and entering the app does not scroll-jump', async ({ page }) => {
  await page.goto('/')

  // Landing is shown; the tool's first question is not in the DOM yet.
  await expect(page.locator('.workspace-landing')).toBeVisible()
  await expect(page.locator('.journey-brand-mark')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await page.getByRole('button', { name: 'Planificar mi importación →', exact: true }).click()

  // The tool is now mounted, the landing is gone, and the page is still at the
  // top (view switch, not a scroll).
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect(page.locator('.workspace-landing')).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.getByRole('heading', { name: 'Planificá tu importación' })).toBeFocused()

  // Entering persists: a reload lands straight back in the tool.
  await page.reload()
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect(page.locator('.workspace-landing')).toHaveCount(0)
})

 test('landing exposes legal pages and a keyboard skip link', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Ir al contenido', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#landing-content')).toBeFocused()
  const legal = page.getByRole('navigation', { name: 'Páginas legales' })
  for (const name of ['Política de Privacidad', 'Términos de Uso']) {
    const href = await legal.getByRole('link', { name, exact: true }).getAttribute('href')
    const response = await page.request.get(href!)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`<h1>${name}</h1>`)
    expect(html).toContain('Documento pendiente de publicación.')
    expect(html).not.toContain('id="root"')
  }
 })
