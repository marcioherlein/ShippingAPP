import { expect, test, type Page } from '@playwright/test'

async function persistedStep(page: Page) {
  return page.evaluate(() => {
    const encoded = new URL(window.location.href).searchParams.get('journey')
    if (!encoded) return 0
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
    return Number(JSON.parse(atob(padded)).step || 0)
  })
}

async function completeOperation(page: Page) {
  await page.getByRole('button', { name: /Ya tengo un producto/i }).click()
  await page.getByRole('radio', { name: 'Reventa', exact: true }).click()
  await page.getByRole('radio', { name: 'Empresa', exact: true }).click()
  await page.getByRole('radio', { name: 'Sí', exact: true }).click()
  // This field's user-facing copy can evolve. Persistence behavior should be
  // anchored to the stable form control contract instead of label wording.
  await page.locator('#journey-sensitive-category').selectOption('none')
  await page.getByRole('button', { name: /Seguir con presupuesto/i }).click()
  await expect(page.locator('.journey-question-card.active .journey-question-head > span')).toHaveText('02')
  await expect.poll(() => persistedStep(page)).toBe(2)
}

async function completeBudget(page: Page) {
  await page.getByRole('radio', { name: /Tengo rango de unidades/i }).click()
  const range = page.locator('.journey-range-fields input')
  await range.nth(0).fill('80')
  await range.nth(1).fill('160')
  await page.getByRole('button', { name: /Seguir con el producto/i }).click()
  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
  await expect.poll(() => persistedStep(page)).toBe(3)
}

function receipt(page: Page, number: '01' | '02') {
  return page.locator('.journey-question-card')
    .filter({ has: page.locator('.journey-question-head > span', { hasText: number }) })
    .locator('.journey-complete-row')
}

test('reload restores meaningful journey setup without restoring stale results', async ({ page }) => {
  await page.goto('/')
  await completeOperation(page)
  await completeBudget(page)

  await expect.poll(() => page.evaluate(() => localStorage.getItem('shippingapp:journey:v1'))).not.toBeNull()
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
  await expect(receipt(page, '01').getByText('Reventa', { exact: true })).toBeVisible()
  await expect(receipt(page, '01').getByText('Empresa', { exact: true })).toBeVisible()
  await expect(receipt(page, '02').getByText('80–160 unidades', { exact: true })).toBeVisible()
  await expect(page.locator('.journey-calculator-section')).toHaveCount(0)
})

test('journey URL is a deep link independent of local storage', async ({ page }) => {
  await page.goto('/')
  await completeOperation(page)
  await completeBudget(page)
  const deepLink = page.url()

  await page.evaluate(() => localStorage.clear())
  await page.goto('about:blank')
  await page.goto(deepLink)

  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
  await expect(receipt(page, '02').getByText('80–160 unidades', { exact: true })).toBeVisible()
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

  await page.goBack()
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(false)

  await page.goForward()
  await expect(page.locator('.journey-question-card.active .journey-question-head > span')).toHaveText('01')

  await page.goForward()
  await expect(page.locator('.journey-question-card.active .journey-question-head > span')).toHaveText('02')

  await page.goForward()
  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
})

test('new case and change intent clear persisted journey state', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Ya tengo un producto/i }).click()
  await expect.poll(() => persistedStep(page)).toBe(1)

  await page.getByRole('button', { name: 'Cambiar', exact: true }).click()
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(false)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('shippingapp:journey:v1'))).toBeNull()

  await page.getByRole('button', { name: /Quiero buscarlo/i }).click()
  await expect.poll(() => persistedStep(page)).toBe(1)
  await page.getByRole('button', { name: 'Nuevo caso', exact: true }).click()
  await expect(page.getByRole('button', { name: /Ya tengo un producto/i })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.has('journey')).toBe(false)
})
