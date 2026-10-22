import { test, expect } from './fixtures'
for (const width of [390, 1280]) {
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
    await page.getByLabel('Nombre y modelo del producto').fill('Parrilla cerrada para cocinar a leña y carbón de acero')
    await page.getByRole('button', { name: 'Continuar', exact:true }).click()
    await page.getByLabel('Función o uso principal').fill('Para cocinar a la parrilla')
    await page.getByRole('button', { name: 'Continuar', exact:true }).click()
    await page.getByLabel('Material y características').fill('Acero')
    await page.getByRole('button', { name: 'Crear ficha de importación' }).click()
    await expect(page.locator('#case-confirmation')).toBeVisible()
    await page.getByText('Opciones de clasificación y oferta',{exact:true}).click()
    await page.getByRole('button',{name:'Buscar en el nomenclador',exact:true}).click()
    await page.getByLabel('Producto o código NCM').fill('7321')
    await expect(page.getByRole('radio').first()).toBeVisible()
    await expect(page.locator('.case-question')).toHaveCount(0)
    await page.getByRole('button',{name:'Volver al paso anterior',exact:true}).click()
    await expect(page.locator('.case-question')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
