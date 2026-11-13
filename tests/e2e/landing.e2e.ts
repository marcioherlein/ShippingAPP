import { expect, browserTest as test } from './fixtures'
import { createManualProductAnalysis } from '../../src/lib/productConfirmation'

test('product-first entry keeps a manual product through profile and reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.workspace-landing')).toBeVisible()
  await expect(page.getByLabel('Enlace de Alibaba')).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await page.getByRole('link', { name: 'Empezar cálculo' }).click()
  await expect(page.getByRole('heading', { name: '¿Qué querés importar?' })).toBeFocused()
  const link = page.getByRole('tab', { name: 'Pegar enlace' })
  await link.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Buscar producto' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Buscar productos en Alibaba' })).toBeVisible()
  await page.getByRole('tab', { name: 'Cargar manualmente' }).click()
  await page.getByLabel('Nombre y modelo del producto').fill('Termo de acero inoxidable')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByLabel('Función o uso principal').fill('Conservar bebidas calientes')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByLabel('Material y características').fill('Acero inoxidable con doble pared al vacío')
  await page.getByRole('button', { name: 'Crear ficha de importación' }).click()
  await expect(page.getByRole('progressbar', { name: /Datos del envío/ })).toBeVisible()
  await expect(page.getByText('Termo de acero inoxidable', { exact: true })).toBeVisible()
  await expect(page.locator('.workspace-landing')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Termo de acero inoxidable', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'Reventa', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('radio', { name: 'Empresa', exact: true }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('radio', { name: 'Sí', exact: true }).click()
  await page.getByRole('button', { name: 'Seguir con presupuesto' }).click()
  await page.getByRole('radio', { name: /Todavía no sé/ }).click()
  await page.getByRole('button', { name: 'Seguir con el producto elegido' }).click()
  await expect(page.locator('#case-confirmation')).toBeVisible()
  await expect(page.locator('.case-question h2')).toContainText('precio del proveedor')
})

test('product-first entry preserves the selected Alibaba product', async ({ page }) => {
  const source = 'https://www.alibaba.com/product-detail/Termo_1600000001234.html'
  const product = createManualProductAnalysis(source, 'Termo de acero inoxidable')
  await page.route('**/api/opportunity-search', route => route.fulfill({ json: {
    status: 'live', mode: 'direct', query: 'Termo acero', note: 'Proveedor de prueba',
    constraints: { maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: [], lowMoqPreference: false },
    constraintsNote: '', results: [{ title: 'Termo de acero inoxidable', url: source, unitPriceUsd: 4, priceDisplay: 'USD 4', moq: 50 }],
  } }))
  await page.route('**/api/product-read', route => route.fulfill({ json: product }))
  await page.goto('/')
  await page.getByRole('tab', { name: 'Buscar producto' }).click()
  await page.getByRole('textbox', { name: 'Buscar productos en Alibaba' }).fill('Termo acero')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: 'Usar este producto', exact: true }).click()
  await expect(page.getByRole('progressbar', { name: /Datos del envío/ })).toBeVisible()
  await expect(page.getByText('Termo de acero inoxidable', { exact: true })).toBeVisible()
})

test('product-first entry falls back to the manual form after a failed link read', async ({ page }) => {
  await page.route('**/api/product-read', route => route.fulfill({ status: 502, json: { error: 'La publicación no respondió.' } }))
  await page.goto('/')
  await page.getByLabel('Enlace de Alibaba').fill('https://www.alibaba.com/product-detail/Termo_1600000001234.html')
  await page.getByRole('button', { name: 'Leer producto' }).click()
  await expect(page.getByRole('alert')).toContainText('La publicación no respondió.')
  await page.getByRole('button', { name: 'Completar ficha manualmente', exact: true }).click()
  await expect(page.getByLabel('Nombre y modelo del producto')).toBeVisible()
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
