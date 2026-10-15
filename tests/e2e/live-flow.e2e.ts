import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'
import { createManualProductAnalysis } from '../../src/lib/productConfirmation'
import { initialSupplierQuote } from '../../src/lib/supplierQuote'
async function setup(page: import('@playwright/test').Page, search = false, capacity: 'unknown' | 'budget' | 'units' = 'unknown') {
  await page.goto('/')
  await page.getByRole('button', { name: search ? /Quiero buscarlo/ : /Ya tengo un producto/ }).click()
  await page.getByRole('radio', { name: 'Reventa', exact: true }).click()
  await page.getByRole('radio', { name: 'Empresa', exact: true }).click()
  await page.getByRole('radio', { name: 'Sí', exact: true }).click()
  await page.getByRole('button', { name: /Seguir con presupuesto/ }).click()
  await page.getByRole('radio', { name: capacity === 'budget' ? /Tengo presupuesto/ : capacity === 'units' ? /Tengo rango de unidades/ : /Todavía no sé/ }).click()
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
  await page.getByRole('button',{name:'Buscar en el nomenclador',exact:true}).click()
  await page.getByLabel('Producto o código NCM').fill('9506.51.00')
  await page.getByRole('radio',{name:/9506.51.00/}).check()
  await page.getByRole('checkbox',{name:/Revisé la descripción/}).check()
  await page.getByRole('button',{name:'Usar esta posición',exact:true}).click()
  await expect(page.locator('.case-question h2')).toContainText('Desde cuántas unidades')
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
  await expect(result.locator('details')).not.toHaveAttribute('open','')
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
test('supplier search retains successful results and query after Alibaba extraction and retry failures', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let searches = 0
  let reads = 0
  await page.route('**/api/opportunity-search', async route => {
    searches++
    if (searches > 1) return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Alibaba no respondió. Reintentá o continuá manualmente.' }) })
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'live', mode: 'parsebot', query: 'motorcycle', note: 'Publicación de prueba', constraints: { maxUnitPriceUsd: null, maxMoq: null, originCountry: null, excludedOriginCountries: [], lowMoqPreference: false }, constraintsNote: '', results: [{ title: 'Electric motorcycle M5', url: 'https://www.alibaba.com/product-detail/M5_1600000001234.html', unitPriceUsd: 500, priceDisplay: '$500 / set', moq: null }] }) })
  })
  await page.route('**/api/product-read', async route => {
    reads++
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'No pude leer esta publicación de Alibaba.' }) })
  })
  await setup(page, true)
  const input = page.getByRole('textbox', { name: 'Buscar productos en Alibaba' })
  const query = 'Motocicleta eléctrica sin pedales modelo M5'
  await input.fill(query)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Electric motorcycle M5' })).toBeVisible()
  await page.getByRole('button', { name: 'Usar este producto' }).click()
  await expect(page.getByRole('alert')).toContainText('No pude leer')
  await expect(page.getByRole('heading', { name: 'Electric motorcycle M5' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Reintentar lectura' }).click()
  await expect(page.getByRole('alert')).toContainText('No pude leer')
  await expect(input).toHaveValue(query)
  await expect(page.getByRole('button', { name: 'Buscar', exact: true })).toBeEnabled()
  await page.reload()
  await expect(input).toHaveValue(query)
  await expect(page.getByRole('heading', { name: 'Electric motorcycle M5' })).toBeVisible()
  expect(searches).toBe(1)
  expect(reads).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('supplier-recovery-390.png'), fullPage: true })
})

test('stalled supplier search allows immediate manual intake at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 })
  await page.route('**/api/opportunity-search', () => {})
  await setup(page, true)
  const query = 'Motocicleta eléctrica completa para circular'
  await page.getByRole('textbox', { name: 'Buscar productos en Alibaba' }).fill(query)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('1. Búsqueda de proveedor')
  await page.getByRole('button', { name: 'Completar la ficha manualmente', exact: true }).click()
  await expect(page.locator('#case-confirmation')).toBeVisible()
  await expect(page.getByLabel('¿Para qué se usa principalmente?', { exact: true })).toBeVisible()
  await expect(page.locator('.case-conversation')).toContainText(query)
  await expect(page.getByRole('progressbar', { name: 'Buscando productos' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
