import { expect, test, type Page } from '@playwright/test'

async function completeOperation(page: Page) {
  await page.getByRole('button', { name: /Ya tengo un producto/i }).click()
  await page.getByRole('radio', { name: 'Reventa', exact: true }).click()
  await page.getByRole('radio', { name: 'Empresa', exact: true }).click()
  await page.getByRole('radio', { name: 'Sí', exact: true }).click()
  await page.getByRole('combobox', { name: /categoría sensible/i }).selectOption('none')
  await page.getByRole('button', { name: /Seguir con presupuesto/i }).click()
  await expect(page.locator('.journey-question-card.active .journey-question-head > span')).toHaveText('02')
}

async function completeBudget(page: Page) {
  await page.getByRole('radio', { name: /Tengo rango de unidades/i }).click()
  const range = page.locator('.journey-range-fields input')
  await range.nth(0).fill('80')
  await range.nth(1).fill('160')
  await page.getByRole('button', { name: /Seguir con el producto/i }).click()
  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
}

test('reload restores meaningful journey setup without restoring stale results', async ({ page }) => {
  await page.goto('/')
  await completeOperation(page)
  await completeBudget(page)

  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(true)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('shippingapp:journey:v1'))).not.toBeNull()

  await page.reload()

  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
  await expect(page.getByText('Reventa', { exact: true })).toBeVisible()
  await expect(page.getByText('Empresa', { exact: true })).toBeVisible()
  await expect(page.getByText('80–160 unidades', { exact: true })).toBeVisible()
  await expect(page.locator('.journey-calculator-section')).toHaveCount(0)
})

test('journey URL is a deep link independent of local storage', async ({ page }) => {
  await page.goto('/')
  await completeOperation(page)
  await completeBudget(page)
  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(true)
  const deepLink = page.url()

  await page.evaluate(() => localStorage.clear())
  await page.goto('about:blank')
  await page.goto(deepLink)

  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
  await expect(page.getByText('80–160 unidades', { exact: true })).toBeVisible()
})

test('browser back and forward restore journey stages', async ({ page }) => {
  await page.goto('/')
  await completeOperation(page)
  await completeBudget(page)

  await page.goBack()
  await expect(page.locator('.journey-question-card.active .journey-question-head > span')).toHaveText('02')
  await expect(page.getByRole('radio', { name: /Tengo rango de unidades/i })).toHaveAttribute('aria-checked', 'true')

  await page.goBack()
  await expect(page.locator('.journey-question-card.active .journey-question-head > span')).toHaveText('01')
  await expect(page.getByRole('radio', { name: 'Reventa', exact: true })).toHaveAttribute('aria-checked', 'true')

  await page.goForward()
  await expect(page.locator('.journey-question-card.active .journey-question-head > span')).toHaveText('02')

  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
})

test('new case and change intent clear persisted journey state', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Ya tengo un producto/i }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(true)

  await page.getByRole('button', { name: 'Cambiar', exact: true }).click()
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(false)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('shippingapp:journey:v1'))).toBeNull()

  await page.getByRole('button', { name: /Quiero buscarlo/i }).click()
  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(true)
  await page.getByRole('button', { name: 'Nuevo caso', exact: true }).click()
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(false)
})
