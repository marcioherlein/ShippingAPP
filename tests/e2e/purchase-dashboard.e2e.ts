import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

async function openDashboard(page: Page, query = '') {
  await page.route('**/__purchase-dashboard*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Presupuesto de importación</title></head><body><div id="root"></div><script type="module" src="/tests/e2e/support/purchase-dashboard.fixture.tsx"></script></body></html>' }))
  await page.goto(`/__purchase-dashboard${query}`)
  await expect(page.getByRole('heading', { name: 'Tabla de optimización de tu compra' })).toBeVisible()
}

for (const width of [320, 390, 1440]) {
  test(`dashboard compares minimum, quantity and three transport modes at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: width === 390 ? 'dark' : 'light', reducedMotion: 'reduce' })
    await openDashboard(page)
    await expect(page.getByRole('heading', { name: 'Si traés lo mínimo: 2 unidades' })).toBeVisible()
    const table = page.getByRole('table', { name: 'Tabla de optimización de tu compra' })
    await expect(table).toBeVisible()
    const tableBox = await table.boundingBox()
    const summaryBox = await page.getByRole('region', { name: 'Tu presupuesto de importación' }).boundingBox()
    expect(tableBox!.x).toBeGreaterThanOrEqual(summaryBox!.x)
    expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(summaryBox!.x + summaryBox!.width)
    expect(await table.locator('tbody td').evaluateAll(cells => cells.filter(cell => cell.scrollWidth > cell.clientWidth + 1).length)).toBe(0)
    expect(await table.evaluate(element => Boolean(element.closest('details')))).toBe(false)
    await expect(table.getByRole('columnheader', { name: 'Flete incluido · USD' })).toHaveCount(1)
    await expect(page.locator('.purchase-transport-card')).toHaveCount(3)
    await expect(page.locator('.purchase-transport-card[aria-label="Courier comercial"]')).toContainText('50 kg')
    await expect(page.locator('.purchase-transport-card[aria-label="Marítimo LCL"]')).toContainText('35–65 días corridos')
    await expect(page.locator('.purchase-transport-card[aria-label="Aéreo"]')).toContainText('7–15 días hábiles')
    const choose = table.getByRole('button', { name: 'Elegir 2 unidades', exact: true })
    await choose.scrollIntoViewIfNeeded()
    const box = await choose.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(44)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await choose.click()
    await expect(page.locator('.workspace-result-overview')).toContainText('2 u.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.filter(item => item.impact === 'serious' || item.impact === 'critical')
    expect(violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`purchase-dashboard-${width}.png`), fullPage: true })
  })
}

test('dashboard separates unavailable courier price and battery acceptance from planning times', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openDashboard(page, '?heavy=1&battery=1')
  const courier = page.locator('.purchase-transport-card[aria-label="Courier comercial"]')
  await expect(courier).toContainText('Sin tarifa calculable')
  await expect(courier.locator('.purchase-transport-price')).toHaveCount(0)
  const air = page.locator('.purchase-transport-card[aria-label="Aéreo"]')
  await expect(air).toContainText('Requiere cotización y aceptación')
  await expect(air.getByText('La carga menciona baterías: confirmá aceptación y recargos con el transportista.', { exact: true })).toBeVisible()
  await expect(air.getByText('Tarifa estándar de referencia: falta confirmar aceptación y recargos de esta carga.', { exact: true })).toBeVisible()
  await air.getByText('Ver límites y fuentes', { exact: true }).click()
  await expect(air.getByText(/UN 38\.3/)).toBeVisible()
  await expect(air.locator('.purchase-transport-price')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
