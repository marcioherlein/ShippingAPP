import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { classifyFullNcm, type NcmSearchIndex } from '../../worker/ncmRetrieval'
import { createManualProductAnalysis } from '../../src/lib/productConfirmation'
import { initialSupplierQuote } from '../../src/lib/supplierQuote'
import { loadCanonicalSimParentLabels, reconcileNcmIndexLabels } from '../../scripts/ncm-label-reconciliation.mjs'
const canonical = loadCanonicalSimParentLabels('public/data/sim')
const index = reconcileNcmIndexLabels(JSON.parse(readFileSync('public/data/ncm-index.json', 'utf8')), canonical.labelsByCode, canonical.sourceDate) as NcmSearchIndex
const ai = { run: async () => { throw new Error('AI unavailable: deterministic real classifier path') } }
const source = 'https://www.alibaba.com/product-detail/Thermo_1600000001234.html'
const name = 'Termo Stanley'
async function enter(page: Page, mode: string, productName = name, use = 'Para mantener el agua caliente y tomar mate', material = 'Acero inoxidable') {
 await page.goto('/')
 await page.getByRole('button', { name: mode === 'search' ? /Quiero buscarlo/ : /Ya tengo un producto/ }).click()
 for (const option of ['Reventa', 'Empresa']) { await page.getByRole('radio', { name: option, exact: true }).click(); await page.getByRole('button', { name: 'Continuar', exact: true }).click() }
 await page.getByRole('radio', { name: 'Sí', exact: true }).click(); await page.getByRole('button', { name: /Seguir con presupuesto/ }).click()
 await page.getByRole('radio', { name: /Todavía no sé/ }).click(); await page.getByRole('button', { name: /Seguir con el producto/ }).click()
 if (mode === 'manual') {
  await page.getByRole('button', { name: /Completar ficha/ }).click()
  await page.getByLabel('Nombre y modelo del producto').fill(productName); await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByLabel('Función o uso principal').fill(use); await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByLabel('Material y características').fill(material); await page.getByRole('button', { name: 'Crear ficha de importación', exact: true }).click()
 } else if (mode === 'link') {
  await page.getByRole('button', { name: /Pegar link de Alibaba/ }).click(); await page.getByLabel('Enlace de Alibaba').fill(source); await page.getByRole('button', { name: /Leer producto/ }).click()
 } else {
  await page.getByRole('textbox', { name: 'Buscar productos en Alibaba' }).fill(name); await page.getByRole('button', { name: 'Buscar', exact: true }).click(); await page.getByRole('button', { name: 'Usar este producto', exact: true }).click()
 }
 await page.locator('.guided-case').waitFor()
}
async function completeQuote(page: Page, values: { price: string; moq: string; variant?: string; weight?: string; volume?: string } = { price: '17', moq: '1' }) {
 for (let step = 0; step < 25; step++) {
  if (await page.getByRole('button', { name: 'Confirmar y clasificar', exact: true }).isVisible()) return
  const q = page.locator('.case-question'); await q.waitFor()
  const prompt = await q.locator('h2').first().textContent() || ''
  if (/embalaje vas a medir/.test(await q.textContent() || '')) { await page.getByRole('button', { name: 'Ingresar un volumen conocido', exact: true }).click(); continue }
  if (await q.getByRole('combobox').count()) await q.getByRole('combobox').selectOption('USD')
  else if (/por unidad o por lote/.test(prompt)) await q.getByRole('button', { name: 'Por una unidad', exact: true }).click()
  else {
   const input = q.locator('input').first()
   if (/Hasta cuántas/.test(prompt)) await input.fill('')
   else if (/precio del proveedor/.test(prompt)) await input.fill(values.price)
   else if (/variante/.test(prompt)) await input.fill(values.variant || 'Acero inoxidable 1 litro')
   else if (/país de origen/.test(prompt)) await input.fill('China')
   else if (/pesa/.test(prompt)) await input.fill(values.weight || '0.6')
   else if (/volumen ocupa/.test(prompt)) await input.fill(values.volume || '0.002')
   else if (/Desde cuántas|mínimo del proveedor/.test(prompt)) await input.fill(values.moq)
   else throw new Error(`Unexpected question: ${prompt}`)
  }
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
 }
 throw new Error('Too many quote steps')
}
for (const width of [390, 1440]) for (const mode of ['manual', 'search', 'link']) for (const decision of (mode === 'manual' ? ['yes', 'no'] : ['yes'])) test(`real full catalog ${mode} ${decision} ${width}: precise question to confirmed quote`, async ({ page }, info) => {
 // Includes the complete form, real catalog and three screenshots on retina WebKit.
 test.setTimeout(60_000)
 await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
 const fixture = createManualProductAnalysis(source, name)
 Object.assign(fixture.product, { material: 'Acero inoxidable', functionText: 'Para mantener el agua caliente y tomar mate', originCountry: 'China', unitPriceUsd: 17, moq: 1, packedWeightKg: 0.6, volumeCbm: 0.002, supplierQuote: initialSupplierQuote(17, true) })
 const requests: Record<string, unknown>[] = []
 const codes: Array<string | null> = []
 await page.route('**/api/product-read', route => route.fulfill({ json: fixture }))
 await page.route('**/api/analyze', route => route.fulfill({ headers: { 'x-shippingapp-usage-reservation': 'real-ncm-case' }, json: { ...fixture, sourceUrl: route.request().postDataJSON().sourceUrl, product: route.request().postDataJSON().product } }))
 await page.route('**/api/opportunity-search', route => route.fulfill({ json: { status: 'live', mode: 'direct', query: name, results: [{ title: name, url: source, unitPriceUsd: 17, moq: 1 }] } }))
 await page.route('**/api/ncm-classify', async route => {
  const facts = route.request().postDataJSON(); requests.push(facts)
  const result = await classifyFullNcm(index, ai, facts); codes.push(result.code)
  await route.fulfill({ json: { ...result, refinement: { allowed: requests.length < 2, attempt: requests.length, maxAttempts: 2 } } })
 })
 await enter(page, mode); await completeQuote(page)
 await page.getByRole('button', { name: 'Confirmar y clasificar', exact: true }).click()
 const question = page.getByRole('group', { name: '¿La ficha del producto confirma aislamiento por vacío?' })
 await expect(question).toBeVisible(); await expect(question.getByRole('button', { name: 'Continuar', exact: true })).toBeInViewport(); await expect(page.locator('.case-question')).toHaveCount(0)
 await expect(page.locator('.ncm-disambiguation-candidate')).toHaveCount(0)
 expect(requests).toHaveLength(1)
 await page.screenshot({ path: info.outputPath(`ncm-question-${mode}-${width}.png`) })
 await question.getByRole('button', { name: decision === 'yes' ? /^Sí/ : /^No,/ }).click(); await page.screenshot({ path: info.outputPath(`ncm-answer-${mode}-${decision}-${width}.png`) }); await question.getByRole('button', { name: 'Continuar', exact: true }).click()
 await page.getByRole('button', { name: /Volver a clasificar con mis respuestas/ }).click()
 if (decision === 'no') {
  await expect.poll(() => requests.length).toBe(2); await expect.poll(() => codes.length).toBe(2)
  expect(codes[1]).not.toBe('9617.00.10'); expect(requests[1].description).toContain('Recipiente sin aislamiento por vacío.')
  await expect(page.locator('.guided-case')).toHaveAttribute('aria-busy', 'false')
  await expect(question).toHaveCount(0); await expect(page.locator('.case-question')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Buscar posición en el nomenclador', exact: true })).toBeVisible()
  await expect(page.locator('.guided-case')).not.toContainText('Elegí la descripción que más se parezca')
  await expect(page.locator('.guided-case')).not.toContainText('Validá un detalle del producto')
  await expect(page.locator('.ncm-disambiguation')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath(`ncm-no-${width}.png`) }); return
 }
 await expect(page.locator('.guided-case')).toContainText('NCM validada: 9617.00.10')
 expect(requests).toHaveLength(2); expect(requests[1].description).toContain('Recipiente aislado por vacío para bebidas.')
 expect(requests[1].material).toBe('Acero inoxidable'); expect(requests[1].functionText).toBe('Para mantener el agua caliente y tomar mate')
 await expect(page.getByRole('group', { name: '¿La ficha del producto confirma aislamiento por vacío?' })).toHaveCount(0)
 const result = page.getByRole('region', { name: 'Tu presupuesto de importación' })
 const calculate = page.getByRole('button', { name: 'Confirmar y calcular mis opciones', exact: true })
 await expect.poll(async () => await result.isVisible() || await calculate.isVisible()).toBe(true)
 if (await calculate.isVisible()) await calculate.click()
 await expect(page.getByRole('region', { name: 'Tu presupuesto de importación' })).toBeVisible()
 await expect(page.getByRole('region', { name: 'Tu presupuesto de importación' })).toContainText('9617.00.10')
 expect(requests).toHaveLength(2)
 await page.screenshot({ path: info.outputPath(`ncm-dashboard-${mode}-${width}.png`), fullPage: true })
})

for (const width of [320, 390, 1440]) test(`electric scooter uses canonical classification and MOQ 2 dashboard at ${width}px`, async ({ page }, info) => {
 test.setTimeout(60_000)
 await page.setViewportSize({ width, height: width > 400 ? 1000 : 844 })
 const fixture = createManualProductAnalysis('manual://scooter', 'Monopatín eléctrico')
 const requests: Array<Record<string, unknown>> = []
 const codes: Array<string | null> = []
 await page.route('**/api/analyze', route => route.fulfill({ headers: { 'x-shippingapp-usage-reservation': 'scooter-case' }, json: { ...fixture, sourceUrl: route.request().postDataJSON().sourceUrl, product: route.request().postDataJSON().product } }))
 await page.route('**/api/ncm-classify', async route => {
  const facts = route.request().postDataJSON(); requests.push(facts)
  const result = await classifyFullNcm(index, ai, facts); codes.push(result.code)
  await route.fulfill({ json: { ...result, refinement: { allowed: requests.length < 2, attempt: requests.length, maxAttempts: 2 } } })
 })
 await enter(page, 'manual', 'Monopatín eléctrico', 'Movilidad personal', 'Aluminio, batería de litio integrada')
 await completeQuote(page, { price: '150', moq: '2', variant: 'Monopatín adulto con batería', weight: '12', volume: '0.06' })
 await page.getByRole('button', { name: 'Confirmar y clasificar', exact: true }).click()
 const question = page.getByRole('group', { name: '¿Es para transporte personal o es un juguete infantil?' })
 await expect(question).toBeVisible()
 await expect(page.locator('.ncm-disambiguation-candidate')).toHaveCount(0)
 await expect(page.locator('.case-question')).toHaveCount(0)
 await question.getByRole('button', { name: 'Para transporte personal de adultos', exact: true }).click()
 await question.getByRole('button', { name: 'Continuar', exact: true }).click()
 await page.getByRole('button', { name: /Volver a clasificar con mis respuestas/ }).click()
 await expect(page.locator('.guided-case')).toContainText('NCM validada: 8711.60.00')
 const result = page.getByRole('region', { name: 'Tu presupuesto de importación' })
 const calculate = page.getByRole('button', { name: 'Confirmar y calcular mis opciones', exact: true })
 await expect.poll(async () => await result.isVisible() || await calculate.isVisible()).toBe(true)
 if (await calculate.isVisible()) await calculate.click()
 await expect(result).toContainText('Si traés lo mínimo: 2 unidades')
 await expect(result.getByRole('table', { name: 'Tabla de optimización de tu compra' })).toBeVisible()
 await expect(result.locator('.purchase-transport-card')).toHaveCount(3)
 await expect(result).toContainText('Tiempo de transporte orientativo')
 await expect(result.locator('.purchase-transport-status').filter({ hasText: 'Requiere cotización y aceptación' })).toHaveCount(3)
 expect(requests).toHaveLength(2)
 expect(codes).toEqual([null, '8711.60.00'])
 await page.screenshot({ path: info.outputPath(`scooter-moq2-dashboard-${width}.png`), fullPage: true })
})
