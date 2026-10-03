import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// Step cards fade in via the `step-enter` keyframe (opacity 0 → 1, 0.28s). axe
// computes contrast against the *current* frame, so sampling mid-fade blends
// every foreground toward the background and reports false contrast failures
// (e.g. #62626d muted text appears as #7d7d87). Wait for all running
// animations/transitions to finish so axe sees the settled, user-visible state.
async function waitForAnimationsToSettle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    ).then(() => undefined),
  )
}

async function expectNoSeriousAxeViolations(page: Page) {
  await waitForAnimationsToSettle(page)
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
  await expect(page.getByRole('heading', { name: /Tu cotización/i })).toBeVisible()
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
  await expect(page.getByText('Tu operación', { exact: true })).toBeVisible()

  // journeySemantics.ts applies role="radio"/radiogroup to chip rows at runtime.
  // Only the first (or selected) radio in each group has tabIndex=0 and is Tab-reachable.
  await chooseByKeyboard(page, page.getByRole('radio', { name: 'Reventa', exact: true }))
  await chooseByKeyboard(page, page.getByRole('radio', { name: 'Empresa', exact: true }))
  // Firma group index-0 is "Sí" (tabIndex=0); choose it to keep Tab navigation simple
  await chooseByKeyboard(page, page.getByRole('radio', { name: 'Sí', exact: true }))
  // Sensitive category uses a DsSelect combobox: open it, then confirm the first option
  await tabUntil(page, page.getByRole('combobox', { name: '¿Qué tipo de producto es?' }))
  await page.keyboard.press('Enter') // opens the listbox
  await page.keyboard.press('Enter') // selects "Ninguna de estas categorías" (first/focused option)

  await chooseByKeyboard(page, page.getByRole('button', { name: /Seguir con presupuesto/i }))
  await expect(page.getByText('Presupuesto o rango', { exact: true })).toBeVisible()

  // Budget grid is also a radiogroup; "Todavía no sé" is index 2 — reach via ArrowDown from index 0
  await tabUntil(page, page.getByRole('radio', { name: /Tengo presupuesto/i }))
  await page.keyboard.press('ArrowDown') // → "Tengo rango de unidades" (focused + clicked by journeySemantics)
  await page.keyboard.press('ArrowDown') // → "Todavía no sé" (focused + clicked, budgetMode='unknown')
  await chooseByKeyboard(page, page.getByRole('button', { name: /Seguir con el producto/i }))

  await expect(page.getByRole('heading', { name: 'Elegí la forma más fácil.' })).toBeVisible()
  await expect(page.getByText('Tu operación', { exact: true })).toBeVisible()
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
  if (await page.getByRole('dialog').isVisible()) await page.getByRole('button', { name: 'Empezar de nuevo', exact: true }).click()
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

  await expect(page.getByText('Tu operación', { exact: true })).toBeVisible()
  await expect(page.locator('.journey-question-card.active')).toBeVisible()

  const chipBox = await page.getByRole('radio', { name: 'Reventa', exact: true }).boundingBox()
  const newCaseBox = await page.getByRole('button', { name: 'Nuevo caso', exact: true }).boundingBox()
  expect(chipBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(newCaseBox?.height ?? 0).toBeGreaterThanOrEqual(44)

  await expectNoSeriousAxeViolations(page)
})
