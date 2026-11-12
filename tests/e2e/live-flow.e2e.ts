import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { createManualProductAnalysis } from '../../src/lib/productConfirmation'
import { initialSupplierQuote } from '../../src/lib/supplierQuote'

const flowErrors = new WeakMap<object, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /TypeError|ReferenceError|The above error occurred/.test(message.text())) errors.push(message.text()) })
  flowErrors.set(page, errors)
})
test.afterEach(async ({ page }) => {
  expect(flowErrors.get(page)).toEqual([])
})

async function setup(page: import('@playwright/test').Page, search = false, capacity: 'unknown' | 'budget' | 'units' = 'unknown') {
  await page.goto('/')
  await page.getByRole('button', { name: search ? /Quiero buscarlo/ : /Ya tengo un producto/ }).click()
  await page.getByRole('radio', { name: 'Reventa', exact: true }).click(); await page.getByRole('button',{name:'Continuar',exact:true}).click()
  await page.getByRole('radio', { name: 'Empresa', exact: true }).click(); await page.getByRole('button',{name:'Continuar',exact:true}).click()
  await page.getByRole('radio', { name: 'Sí', exact: true }).click()
  await page.getByRole('button', { name: /Seguir con presupuesto/ }).click()
  await page.getByRole('radio', { name: capacity === 'budget' ? /Tengo presupuesto/ : capacity === 'units' ? /Tengo rango de unidades/ : /Todavía no sé/ }).click()
  if (capacity !== 'unknown') await page.getByRole('button',{name:'Continuar',exact:true}).click()
  if (capacity === 'budget') await page.getByLabel('Presupuesto máximo total').fill('10000')
  if (capacity === 'units') {
    await page.getByLabel('Mínimo de unidades').fill('80')
    await page.getByLabel('Máximo de unidades').fill('160')
  }
  await page.getByRole('button', { name: /Seguir con el producto/ }).click()
}


async function readFixture(page: import('@playwright/test').Page, capacity: 'unknown'|'budget'|'units') {
  const source='https://www.alibaba.com/product-detail/Tennis_1600000001234.html'
  const fixture=createManualProductAnalysis(source,'Raqueta de tenis de aluminio')
  Object.assign(fixture.product,{category:'Raqueta de tenis',material:'Aluminio',functionText:'Para jugar al tenis',originCountry:'China',unitPriceUsd:10,moq:1,packedWeightKg:0.1,volumeCbm:0.001,supplierQuote:initialSupplierQuote(10,true)})
  await page.route('**/api/product-read',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)}))
  await page.route('**/api/analyze',route=>route.fulfill({contentType:'application/json',headers:{'x-shippingapp-usage-reservation':'fixture-reservation'},body:JSON.stringify({...fixture,product:route.request().postDataJSON().product})}))
  await setup(page,false,capacity)
  await page.getByRole('button',{name:'Pegar link de Alibaba',exact:false}).click()
  await page.getByLabel('Enlace de Alibaba').fill(source)
  await page.getByRole('button',{name:/Leer producto/}).click()
  await expect(page.locator('.guided-case')).toBeVisible()
  await page.getByText('Opciones de clasificación y oferta',{exact:true}).click()
  await page.getByRole('button',{name:'Buscar en el nomenclador',exact:true}).click()
  await page.getByLabel('Producto o código NCM').fill('9506.51.00')
  await page.getByRole('radio',{name:/9506.51.00/}).check()
  await page.getByRole('checkbox',{name:/Revisé la descripción/}).check()
  await page.getByRole('button',{name:'Usar esta posición',exact:true}).click()
  await expect(page.locator('.case-question h2')).toContainText('Desde cuántas unidades')
  await page.getByRole('button',{name:'Continuar',exact:true}).click()
  await expect(page.locator('.case-question h2')).toContainText('Hasta cuántas unidades')
  await page.getByRole('button',{name:'Continuar',exact:true}).click()
  await expect(page.getByRole('button',{name:'Confirmar y calcular mis opciones',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Confirmar y calcular mis opciones',exact:true}).click()
  await expect(page.getByRole('region',{name:'Tu presupuesto de importación'})).toBeVisible()
}
for(const mode of ['budget','units','unknown'] as const) test(`${mode}: guided intake, concise cost and immutable saved chat`,async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844})
  let saved:any=null
  await page.route('**/api/history',async route=>{saved=route.request().postDataJSON();await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({item:{id:'saved-budget'}})})})
  await readFixture(page,mode)
  const result=page.getByRole('region',{name:'Tu presupuesto de importación'})
  const count=await result.locator('.simple-quote-card').count()
  expect(count).toBe(mode==='unknown'?1:2)
  await expect(result.locator('details').first()).not.toHaveAttribute('open','')
  await result.locator('summary').filter({hasText:'Ver historial de datos y cambios'}).click()
  await expect(page.locator('.case-conversation')).toContainText(mode==='budget'?'10,000':mode==='units'?'80–160':'una unidad')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.getByRole('button',{name:'Guardar presupuesto',exact:true}).click()
  await expect(page.getByRole('button',{name:'Presupuesto guardado',exact:true})).toBeVisible()
  expect(saved.result.conversation.length).toBeGreaterThan(3)
  const selected=saved.result.purchasePlan.selected
  if(mode==='budget')expect(selected.cost.totalCostUsd).toBeLessThanOrEqual(10000)
  if(mode==='units')expect(selected.quantity).toBe(80)
  if(mode==='unknown')expect(selected.quantity).toBe(1)
  const quotedAt=saved.result.quotedAt
  await page.reload()
  await expect(page.getByRole('button',{name:'Presupuesto guardado',exact:true})).toBeVisible()
  await expect(page.getByRole('region',{name:'Tu presupuesto de importación'})).toBeVisible()
  await page.evaluate(payload=>window.dispatchEvent(new CustomEvent('shippingapp:open-quote',{detail:{input:payload.input,result:payload.result}})),saved)
  await expect(page.getByRole('button',{name:'Recalcular con datos y tarifas actuales'})).toBeVisible()
  expect(saved.result.quotedAt).toBe(quotedAt)
  if(mode==='unknown'){
    const violations=(await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.filter(v=>v.impact==='serious'||v.impact==='critical')
    expect(violations).toEqual([])
  }
  await page.screenshot({path:testInfo.outputPath(`guided-${mode}-390.png`),fullPage:true})
})
test('selected product survives unavailable supplier details and reload without another search', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let searches = 0
  let reads = 0
  await page.route('**/api/opportunity-search', async route => {
    searches++
    await route.fulfill({ json: { status: 'live', mode: 'parsebot', query: 'motorcycle', note: 'Publicación de prueba', constraints: { maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: [], lowMoqPreference: false }, constraintsNote: '', results: [{ title: 'Electric motorcycle M5', url: 'https://www.alibaba.com/product-detail/M5_1600000001234.html', unitPriceUsd: 500, priceDisplay: '$500 / set', moq: 2 }] } })
  })
  let releaseRead!: () => void
  const readGate = new Promise<void>(resolve => { releaseRead = resolve })
  await page.route('**/api/product-read', async route => {
    reads++
    await readGate
    await route.fulfill({ status: 502, json: { error: 'No pude leer esta publicación de Alibaba.' } })
  })
  await setup(page, true)
  await page.getByRole('textbox', { name: 'Buscar productos en Alibaba' }).fill('Motocicleta eléctrica sin pedales modelo M5')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Electric motorcycle M5' })).toBeVisible()
  await page.getByRole('button', { name: 'Usar este producto' }).click()
  const progress = page.getByRole('dialog', { name: 'Preparando el producto que elegiste' })
  await expect(progress).toBeVisible()
  await expect.poll(() => progress.evaluate(element => element.matches(':modal'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(progress).toBeVisible()
  // A real pointer action on the navigation is intercepted by the native modal.
  await expect(page.locator('.app-new-case').click({ timeout: 600 })).rejects.toThrow()
  await expect(page.locator('.journey-reset-dialog')).not.toBeVisible()
  releaseRead()
  await expect(page.locator('.processing-screen')).toHaveCount(0)
  await expect(page.locator('.case-question')).toBeVisible()
  await expect(page.locator('.guided-case')).toContainText('Completá tu ficha de producto')
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shippingapp:product-draft:analysis')!).data.analysis)
  expect(saved.product.name).toBe('Electric motorcycle M5')
  expect(saved.sourceUrl).toBe('https://www.alibaba.com/product-detail/M5_1600000001234.html')
  expect(saved.product.moq).toBe(2)
  expect(saved.product.unitPriceUsd).toBeNull()
  expect(saved.product.supplierEvidence.priceText).toBe('$500 / set')
  expect(saved.fetched).toBe(false)
  expect(saved.sourceRead.mode).toBe('partial')
  expect(saved.customs.ncmCandidate).toBeNull()
  await page.reload()
  await expect(page.locator('.case-question')).toBeVisible()
  expect(searches).toBe(1)
  expect(reads).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('supplier-recovery-390.png'), fullPage: true })
})

test('supplier search failure releases the progress screen and permits manual intake at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 })
  let releaseSearch!: () => void
  const searchGate = new Promise<void>(resolve => { releaseSearch = resolve })
  await page.route('**/api/opportunity-search', async route => {
    await searchGate
    await route.fulfill({ status: 503, json: { error: 'La búsqueda no está disponible ahora.' } })
  })
  await setup(page, true)
  const query = 'Motocicleta eléctrica completa para circular'
  await page.getByRole('textbox', { name: 'Buscar productos en Alibaba' }).fill(query)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  const progress = page.getByRole('dialog', { name: 'Buscando tu producto' })
  await expect(progress).toBeVisible()
  await expect.poll(() => progress.evaluate(element => element.matches(':modal'))).toBe(true)
  releaseSearch()
  await expect(page.locator('.processing-screen')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('La búsqueda no está disponible')
  await page.getByRole('button', { name: 'Completar la ficha manualmente', exact: true }).click()
  await expect(page.locator('#case-confirmation')).toBeVisible()
  await expect(page.locator('.case-question')).toBeVisible()
  const price = page.locator('.case-question').getByLabel('¿Cuál es el precio del proveedor en su moneda original?', { exact: true })
  await expect(price).toBeVisible()
  await price.fill('500')
  await expect(price).toHaveValue('500')
  await expect(page.locator('.processing-screen')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('authentication failure closes product progress and preserves the selected publication for sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const source = 'https://www.alibaba.com/product-detail/Tennis_1600000001234.html'
  await page.route('**/api/opportunity-search', route => route.fulfill({ json: { status: 'live', mode: 'direct', query: 'tennis racket', note: '', constraints: {}, constraintsNote: '', results: [{ title: 'Tennis racket T', url: source }] } }))
  let releaseRead!: () => void
  const gate = new Promise<void>(resolve => { releaseRead = resolve })
  await page.route('**/api/product-read', async route => { await gate; await route.fulfill({ status: 401, json: { code: 'session_required' } }) })
  await setup(page, true)
  await page.getByRole('textbox', { name: 'Buscar productos en Alibaba' }).fill('Raqueta de tenis')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: 'Usar este producto' }).click()
  await expect(page.getByRole('dialog', { name: 'Preparando el producto que elegiste' })).toBeVisible()
  releaseRead()
  await expect(page.locator('.processing-screen')).toHaveCount(0)
  await expect(page.locator('.analyzer-error')).toContainText('Ingresá a tu cuenta')
  await expect(page.locator('.analyzer-error').getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tennis racket T' })).toBeVisible()
  expect(await page.locator('.guided-case').count()).toBe(0)
  const operation = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shippingapp:product-draft:operation-search')!).data)
  expect(operation.status).toBe('waiting_auth')
  expect(operation.payload.selectedUrl).toBe(source)
})

for (const width of [320, 1440]) test(`successful product selection closes progress and retains detailed supplier evidence at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  const source = 'https://www.alibaba.com/product-detail/Tennis_1600000001234.html'
  const detail = createManualProductAnalysis(source, 'Raqueta de tenis de aluminio Modelo T')
  Object.assign(detail, { fetched: true })
  Object.assign(detail.product, { material: 'Aluminio', functionText: 'Para jugar al tenis', supplierEvidence: { priceText: 'USD 12 por pieza', currency: 'USD', quantityUnit: 'unit', variant: 'Modelo T' }, unitPriceUsd: 12, moq: 2 })
  let reads = 0
  await page.route('**/api/opportunity-search', route => route.fulfill({ json: { status: 'live', mode: 'direct', query: 'tennis racket', note: '', constraints: {}, constraintsNote: '', results: [{ title: 'Tennis racket T', url: source, moq: 2 }] } }))
  let releaseRead!: () => void
  const gate = new Promise<void>(resolve => { releaseRead = resolve })
  await page.route('**/api/product-read', async route => { reads++; await gate; await route.fulfill({ json: detail }) })
  await setup(page, true)
  await page.getByRole('textbox', { name: 'Buscar productos en Alibaba' }).fill('Raqueta de tenis')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: 'Usar este producto' }).click()
  const progress = page.getByRole('dialog', { name: 'Preparando el producto que elegiste' })
  await expect(progress).toBeVisible()
  // Keyboard input cannot activate another result or submit a second extraction.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  expect(reads).toBe(1)
  releaseRead()
  await expect(page.locator('.processing-screen')).toHaveCount(0)
  await expect(page.locator('.case-question')).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('shippingapp:product-draft:analysis')!).data.analysis)
  expect(saved.product.name).toBe('Raqueta de tenis de aluminio Modelo T')
  expect(saved.product.supplierEvidence.priceText).toBe('USD 12 por pieza')
  expect(saved.product.unitPriceUsd).toBe(12)
  expect(saved.fetched).toBe(true)
  expect(reads).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
