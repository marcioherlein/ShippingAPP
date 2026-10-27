import { test, expect } from './fixtures'
for (const width of [320, 390, 1440]) {
  test(`manual nomenclature and editable supplier data at ${width}px`, async ({ page }) => {
    // Eight chat steps plus operation setup need enough time for WebKit's
    // actionability checks. Keep every click and the final confirmation check.
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.getByRole('button', { name: /Ya tengo un producto/i }).click()
    await page.getByRole('radio', { name: 'Reventa', exact: true }).click(); await page.getByRole('button',{name:'Continuar',exact:true}).click()
    await page.getByRole('radio', { name: 'Empresa', exact: true }).click(); await page.getByRole('button',{name:'Continuar',exact:true}).click()
    await page.getByRole('radio', { name: 'Sí', exact: true }).click()
    await page.getByRole('button', { name: /Seguir con presupuesto/i }).click()
    await page.getByRole('radio', { name: /Tengo rango de unidades/i }).click(); await page.getByRole('button',{name:'Continuar',exact:true}).click()
    await page.getByRole('button', { name: /Seguir con el producto/i }).click()
    await page.getByRole('button', { name: /Completar ficha/ }).click()
    const expectClearActions = async () => {
      const actions = page.locator('.workspace-product-actions')
      const primary = actions.locator('.journey-primary-action')
      await expect(primary).toBeInViewport({ ratio: 1 })
      const buttons = await actions.locator('button').all()
      const bounds = await Promise.all(buttons.map(button => button.boundingBox()))
      const switchBounds = await page.getByRole('button', { name: 'Cambiar forma de carga', exact: true }).boundingBox()
      const formBounds = await actions.boundingBox()
      for (const box of bounds) {
        expect(box!.height).toBeGreaterThanOrEqual(44)
        expect(Math.abs(box!.width - formBounds!.width)).toBeLessThan(1)
      }
      if (bounds.length > 1) expect(bounds[1]!.y - bounds[0]!.y - bounds[0]!.height).toBeGreaterThanOrEqual(12)
      const last = bounds[bounds.length - 1]!
      expect(switchBounds!.y - last.y - last.height).toBeGreaterThanOrEqual(12)
    }
    await expectClearActions()
    await page.getByLabel('Nombre y modelo del producto').fill('Parrilla cerrada para cocinar a leña y carbón de acero')
    await page.getByRole('button', { name: 'Continuar', exact:true }).click()
    await expectClearActions()
    await page.getByLabel('Función o uso principal').fill('Para cocinar a la parrilla')
    await page.getByRole('button', { name: 'Continuar', exact:true }).click()
    await expectClearActions()
    await page.getByLabel('Material y características').fill('Acero')
    await page.getByRole('button', { name: 'Crear ficha de importación' }).click()
    await expect(page.locator('#case-confirmation')).toBeVisible()
    await page.getByText('Opciones de clasificación y oferta',{exact:true}).click()
    await page.getByRole('button',{name:'Buscar en el nomenclador',exact:true}).click()
    await expect(page.getByLabel('Producto o código NCM')).toBeVisible()
    await expect(page.locator('.manual-ncm-results input[type=radio]')).toHaveCount(0)
    await expect(page.getByText('Escribí al menos dos caracteres del producto o código, o elegí un capítulo para buscar.', { exact: true })).toBeVisible()
    await page.getByLabel('Producto o código NCM').fill('7321')
    await expect(page.getByRole('radio').first()).toBeVisible()
    await expect(page.locator('.case-question')).toHaveCount(0)
    await page.getByRole('button',{name:'Volver al paso anterior',exact:true}).click()
    await expect(page.locator('.case-question')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
