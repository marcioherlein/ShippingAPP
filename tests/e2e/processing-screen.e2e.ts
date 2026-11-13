import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'

const fixture = '<html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Progreso de importación</title></head><body><div id="root"></div><script type="module" src="/tests/e2e/support/processing-screen.fixture.tsx"></script></body></html>'
for (const width of [320, 1440]) {
  test(`processing blocks every other action and releases on success at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/product-read', async route => { await gate; await route.fulfill({ json: {} }) })
    await page.route('**/processing-fixture', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto('/processing-fixture')
    const newCase = await page.getByRole('button', { name: 'Nuevo caso' }).boundingBox()
    await page.getByRole('button', { name: 'Procesar producto' }).click()
    const dialog = page.getByRole('dialog', { name: 'Leyendo tu producto' })
    await expect(dialog).toBeVisible()
    const box = (await dialog.boundingBox())!
    expect(box.width).toBe(width); expect(box.height).toBe(900)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await page.mouse.click(newCase!.x + 10, newCase!.y + 10)
    await expect(page.getByLabel('Interrupciones')).toHaveText('0')
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('dialog'))).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    release()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('p[role=status]')).toHaveText('Producto listo para confirmar')
    await page.getByRole('button', { name: 'Nuevo caso' }).click()
    await expect(page.getByLabel('Interrupciones')).toHaveText('1')
  })
}

test('failed processing releases the modal and preserves editable inputs', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/product-read', async route => { await gate; await route.fulfill({ status: 502, json: { error: 'Unavailable' } }) })
  await page.route('**/processing-fixture', route => route.fulfill({ contentType: 'text/html', body: fixture }))
  await page.goto('/processing-fixture')
  await page.getByRole('button', { name: 'Procesar producto' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  release()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('p[role=status]')).toContainText('Tus datos siguen disponibles')
  await page.getByLabel('Nombre del producto').fill('Termo de acero 1 litro')
  await expect(page.getByLabel('Nombre del producto')).toHaveValue('Termo de acero 1 litro')
})
