import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('journey choices expose grouped radio semantics and arrow-key selection', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Ya tengo un producto/i }).click()

  const purposeGroup = page.getByRole('radiogroup', { name: '¿Para qué lo traés?' })
  const resale = purposeGroup.getByRole('radio', { name: 'Reventa', exact: true })
  const ownUse = purposeGroup.getByRole('radio', { name: 'Uso propio', exact: true })

  await expect(purposeGroup).toBeVisible()
  await expect(resale).toHaveAttribute('aria-checked', 'false')
  await resale.focus()
  await page.keyboard.press('ArrowRight')
  await expect(ownUse).toBeFocused()
  await expect(ownUse).toHaveAttribute('aria-checked', 'true')

  const entityGroup = page.getByRole('radiogroup', { name: '¿Quién importa?' })
  await expect(entityGroup.getByRole('radio')).toHaveCount(3)

  const signatureGroup = page.getByRole('radiogroup', { name: '¿Tenés firma/importador para operar?' })
  await expect(signatureGroup.getByRole('radio')).toHaveCount(3)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
  expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([])
})

test('disabled primary actions explain what is missing', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Ya tengo un producto/i }).click()

  const operationAction = page.locator('.journey-question-card.active .journey-primary-action')
  await expect(operationAction).toBeDisabled()
  await expect(operationAction).toHaveAttribute('data-disabled-reason', /Completá las cuatro respuestas/)
  await expect(operationAction).toHaveAttribute('aria-label', /Completá las cuatro respuestas/)

  const visibleReason = await operationAction.evaluate((element) => getComputedStyle(element, '::after').content)
  expect(visibleReason).toContain('Completá las cuatro respuestas')
})

test('budget mode is an accessible radio group with a contextual disabled reason', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Ya tengo un producto/i }).click()

  await page.getByRole('radiogroup', { name: '¿Para qué lo traés?' }).getByRole('radio', { name: 'Reventa' }).click()
  await page.getByRole('radiogroup', { name: '¿Quién importa?' }).getByRole('radio', { name: 'Empresa' }).click()
  await page.getByRole('radiogroup', { name: '¿Tenés firma/importador para operar?' }).getByRole('radio', { name: 'Sí' }).click()
  await page.getByRole('combobox').selectOption('none')
  await page.getByRole('button', { name: /Seguir con presupuesto/i }).click()

  const budgetGroup = page.getByRole('radiogroup', { name: 'Presupuesto o rango' })
  await expect(budgetGroup.getByRole('radio')).toHaveCount(3)

  const budgetAction = page.locator('.journey-question-card.active .journey-primary-action')
  await expect(budgetAction).toBeDisabled()
  await expect(budgetAction).toHaveAttribute('data-disabled-reason', /Elegí una modalidad válida/)

  await budgetGroup.getByRole('radio', { name: /Todavía no sé/i }).click()
  await expect(budgetAction).toBeEnabled()
  await expect(budgetAction).not.toHaveAttribute('data-disabled-reason', /.+/)
})

test('core explanatory copy renders at readable body size', async ({ page }) => {
  await page.goto('/')

  const assistantCopy = page.locator('.journey-bubble.assistant p').first()
  const entryDescription = page.locator('.journey-choice-grid.three button small').first()

  expect(Number.parseFloat(await assistantCopy.evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16)
  expect(Number.parseFloat(await entryDescription.evaluate((element) => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16)
})
