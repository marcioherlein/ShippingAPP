import { expect, browserTest as test } from './fixtures'
import { createManualProductAnalysis } from '../../src/lib/productConfirmation'

const selectedProduct = '[data-prepared-product="true"]'

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
  await expect(page.locator(selectedProduct)).toContainText('Termo de acero inoxidable')
  await expect(page.locator('.workspace-landing')).toHaveCount(0)

  await page.reload()
  await expect(page.locator(selectedProduct)).toContainText('Termo de acero inoxidable')
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
  await expect(page.locator(selectedProduct)).toContainText('Termo de acero inoxidable')
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

const reportedSupplierUrl = 'https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html?spm=a2700.prosearch.normal_offer.d_image.771b67afVPP1xD&priceId=e74649aeab9c4359b570d52c7a348432&priceId=e74649aeab9c4359b570d52c7a348432'

for (const width of [320, 1440]) test(`reported supplier link keeps one recoverable error and retries verified partial data at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /TypeError|ReferenceError|The above error occurred/.test(message.text())) errors.push(message.text()) })
  // This response is a controlled supplier-evidence fixture. It proves the UI
  // preserves a verified identity; it does not assert a live Alibaba read.
  const product = createManualProductAnalysis(reportedSupplierUrl, 'Equipo de fabricación de cámaras de balones · modelo del proveedor')
  product.fetched = true
  product.sourceRead = { mode: 'partial', quality: 35, directStatus: 200, browserAttempted: false, browserMsUsed: null, reason: 'Título verificado en la publicación; oferta y embalaje pendientes.' }
  const reads: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/product-read', async route => {
    reads.push(route.request().postDataJSON().url)
    if (reads.length === 1) {
      await gate
      await route.fulfill({ status: 503, json: { code: 'supplier_read_unavailable', retryable: true, error: 'Alibaba no permitió verificar esta publicación. Conservamos tu enlace; reintentá la lectura.' } })
    } else await route.fulfill({ json: product })
  })
  let paidRequests = 0
  await page.route('**/api/analyze', route => { paidRequests++; return route.fulfill({ status: 500, json: { error: 'El intake gratuito no debe iniciar un análisis pago.' } }) })
  await page.goto('/')
  const link = page.getByLabel('Enlace de Alibaba')
  await link.fill(reportedSupplierUrl)
  await page.getByRole('button', { name: 'Leer producto', exact: true }).click()
  const progress = page.getByRole('dialog', { name: 'Leyendo tu producto' })
  await expect(progress).toBeVisible()
  await expect.poll(() => progress.evaluate(element => element.matches(':modal'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(progress).toBeVisible()
  release()
  await expect(page.locator('.processing-screen')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(page.getByRole('alert')).toContainText('Alibaba no permitió verificar')
  await expect(link).toHaveValue(reportedSupplierUrl)
  await expect(page.locator(selectedProduct)).toHaveCount(0)
  const retry = page.getByRole('button', { name: 'Reintentar lectura', exact: true })
  await expect(retry).toBeEnabled()
  await retry.click()
  await expect(page.locator('.processing-screen')).toHaveCount(0)
  await expect(page.getByRole('progressbar', { name: /Datos del envío/ })).toBeVisible()
  await expect(page.locator(selectedProduct)).toContainText(product.product.name)
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shippingapp:product-draft:prepared-entry')!).data.analysis)
  expect(saved.sourceUrl).toBe(reportedSupplierUrl)
  expect(saved.sourceRead.mode).toBe('partial')
  expect(saved.product.unitPriceUsd).toBeNull()
  expect(saved.customs.ncmCandidate).toBeNull()
  expect(reads).toEqual([reportedSupplierUrl, reportedSupplierUrl])
  expect(paidRequests).toBe(0)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('landing exposes legal pages and a keyboard skip link', async ({ page }) => {
  await page.goto('/')
  const skipLink = page.getByRole('link', { name: 'Ir al contenido', exact: true })
  await expect(skipLink).toBeAttached()
  await page.keyboard.press('Tab')
  await expect(skipLink).toBeFocused()
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
