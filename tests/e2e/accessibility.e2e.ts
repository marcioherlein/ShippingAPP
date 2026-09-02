import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function expectNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
  expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([])
}

async function tabUntil(page: Page, target: Locator, maxTabs = 30) {
  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => document.activeElement === element).catch(() => false)) return
  }
  throw new Error(`Keyboard focus did not reach target: ${await target.textContent()}`)
}

async function chooseByKeyboard(page: Page, target: Locator) {
  await tabUntil(page, target)
  await page.keyboard.press('Enter')
}

test('initial journey has no serious or critical axe violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Contame qué querés importar/i })).toBeVisible()
  await expectNoSeriousAxeViolations(page)
})

test('primary journey is operable keyboard-only and keeps visible focus', async ({ page }) => {
  await page.goto('/')

  const ownProduct = page.getByRole('button', { name: /Ya tengo un producto/i })
  await tabUntil(page, ownProduct)

  const focusStyle = await ownProduct.evaluate((element) => {
    const style = getComputedStyle(element)
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
  })
  expect(focusStyle.outlineStyle).not.toBe('none')
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2)

  await page.keyboard.press('Enter')
  await expect(page.getByText('Perfil de la operación', { exact: true })).toBeVisible()

  await chooseByKeyboard(page, page.getByRole('radio', { name: 'Reventa', exact: true }))
  await chooseByKeyboard(page, page.getByRole('radio', { name: 'Empresa', exact: true }))
  await chooseByKeyboard(page, page.getByRole('radio', { name: 'Sí', exact: true }))

  const sensitiveCategory = page.getByRole('combobox')
  await tabUntil(page, sensitiveCategory)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await chooseByKeyboard(page, page.getByRole('button', { name: /Seguir con presupuesto/i }))
  await expect(page.getByText('Presupuesto o rango', { exact: true })).toBeVisible()

  const budgetGroup = page.getByRole('radiogroup', { name: 'Presupuesto o rango' })
  const firstBudgetOption = budgetGroup.getByRole('radio', { name: /Tengo presupuesto/i })
  const unknownBudgetOption = budgetGroup.getByRole('radio', { name: /Todavía no sé/i })
  await tabUntil(page, firstBudgetOption)
  await page.keyboard.press('End')
  await expect(unknownBudgetOption).toBeFocused()
  await expect(unknownBudgetOption).toHaveAttribute('aria-checked', 'true')

  await chooseByKeyboard(page, page.getByRole('button', { name: /Seguir con el producto/i }))

  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
  await expect(page.getByText('Perfil de la operación', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar', exact: true }).first()).toBeVisible()

  await expectNoSeriousAxeViolations(page)
})

test('reduced motion preference suppresses transitions and JS smooth scrolling', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

  const target = page.getByRole('button', { name: /Ya tengo un producto/i })
  const durations = await target.evaluate((element) => {
    const style = getComputedStyle(element)
    return { transitionDuration: style.transitionDuration, animationDuration: style.animationDuration }
  })

  const seconds = (value: string) => value.split(',').map((part) => Number.parseFloat(part)).filter(Number.isFinite)
  expect(seconds(durations.transitionDuration).every((duration) => duration <= 0.01)).toBe(true)
  expect(seconds(durations.animationDuration).every((duration) => duration <= 0.01)).toBe(true)

  await page.evaluate(() => {
    const calls: ScrollToOptions[] = []
    Object.assign(window, { __shippingAppScrollCalls: calls })
    window.scrollTo = ((options: ScrollToOptions) => {
      calls.push(options)
    }) as typeof window.scrollTo
  })
  await page.getByRole('button', { name: 'Nuevo caso', exact: true }).click()
  const behavior = await page.evaluate(() => {
    const calls = (window as Window & { __shippingAppScrollCalls?: ScrollToOptions[] }).__shippingAppScrollCalls || []
    return calls.at(-1)?.behavior
  })
  expect(behavior).toBe('auto')
})

test('mobile journey prioritizes current work and keeps compact controls touch-friendly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: /Ya tengo un producto/i }).click()

  await expect(page.getByText('Perfil de la operación', { exact: true })).toBeVisible()
  await expect(page.locator('.journey-hero > p')).toBeHidden()
  await expect(page.locator('.journey-question-card.active')).toBeVisible()

  const chipBox = await page.getByRole('radio', { name: 'Reventa', exact: true }).boundingBox()
  const newCaseBox = await page.getByRole('button', { name: 'Nuevo caso', exact: true }).boundingBox()
  expect(chipBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(newCaseBox?.height ?? 0).toBeGreaterThanOrEqual(44)

  await expectNoSeriousAxeViolations(page)
})
