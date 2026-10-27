// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach,afterEach,expect,it,vi } from 'vitest'
import PurchaseQuoteResult from './PurchaseQuoteResult'
import { createManualProductAnalysis } from '../lib/productConfirmation'
import { initialSupplierQuote } from '../lib/supplierQuote'
import { buildPurchasePlan, type PurchaseCapacity } from '../lib/purchasePlan'
import { saveCompletedAnalysis } from '../lib/analysisHistory'
import { ApiAuthError, setSessionState } from '../lib/authSession'
import { usd } from '../lib/format'
import { writeCaseConversation } from '../lib/caseConversation'
vi.mock('../lib/format', async importOriginal => { const actual = await importOriginal<typeof import('../lib/format')>(); return { ...actual, usd: vi.fn(actual.usd) } })
vi.mock('../lib/analysisHistory',()=>({saveCompletedAnalysis:vi.fn()}))
const analysis=createManualProductAnalysis('manual://test')
analysis.product.name='Luz RGB'; analysis.product.supplierQuote=initialSupplierQuote(10,true)
const capacity:PurchaseCapacity={mode:'units',budgetUsd:0,min:3,max:3}
const plan=buildPurchasePlan({costs:{originCountry:'China',unitWeightKg:0.1,unitVolumeCbm:0.001,dutyRatePct:16,purpose:'resale',entityType:'company',hasImporterSignature:true,sensitiveCategory:'none'},quote:analysis.product.supplierQuote,moq:0,capacity})
const summary={baseQuantity:3,selectedMode:plan.selected!.mode,unitCostUsd:plan.selected!.cost.unitCostUsd,totalCostUsd:plan.selected!.cost.totalCostUsd,freightCostUsd:plan.selected!.cost.freightCostUsd}
let root:Root,container:HTMLDivElement
beforeEach(()=>{Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});sessionStorage.clear();vi.mocked(saveCompletedAnalysis).mockReset();setSessionState('ready');container=document.createElement('div');document.body.append(container);root=createRoot(container);writeCaseConversation(analysis.sourceUrl,[{role:'assistant',text:'¿Para qué se usa?'},{role:'user',text:'Para iluminar fotos.'}])})
afterEach(async()=>{await act(async()=>root.unmount());container.remove();sessionStorage.clear();setSessionState('unmanaged')})
async function render(){await act(async()=>root.render(<PurchaseQuoteResult analysis={analysis} capacity={capacity} plan={plan} summary={summary} input={{budgetMode:'units'}} onEdit={vi.fn()} onChoose={vi.fn()} />))}
function save(){return [...container.querySelectorAll('button')].find(b=>b.textContent==='Guardar presupuesto')!}
it('shows the decision metrics first and retains the transcript in collapsed history',async()=>{
 await render();expect(container.querySelectorAll('.simple-quote-card')).toHaveLength(2)
 expect(container.querySelector('details')?.open).toBe(false)
 expect(container.querySelector('.workspace-result-overview')?.textContent).toContain('Inversión total estimada');expect(container.querySelector('.workspace-result-overview')?.textContent).toContain('Costo puesto por unidad');expect(container.textContent).not.toContain('versión guardada del cálculo');expect(container.querySelector('.case-conversation')!.closest('details')?.open).toBe(false)
 expect(container.textContent).toContain('Para iluminar fotos.')
})
it('reports saved only after server confirmation and retains chat and scenarios in the payload',async()=>{
 let resolve!:(value:any)=>void;vi.mocked(saveCompletedAnalysis).mockImplementation(()=>new Promise(r=>{resolve=r}))
 await render();await act(async()=>save().click());expect(container.textContent).not.toContain('Presupuesto guardado')
 expect(vi.mocked(saveCompletedAnalysis).mock.calls[0][1]).toMatchObject({conversation:[{role:'assistant'},{role:'user',text:'Para iluminar fotos.'}],purchasePlan:plan,pipelineSummary:summary})
 await act(async()=>resolve({id:'saved-case'}));expect(container.textContent).toContain('Presupuesto guardado')
})
it('resumes the same pending save after a login reload without changing its snapshot',async()=>{
 setSessionState('signed_out');vi.mocked(saveCompletedAnalysis).mockRejectedValueOnce(new ApiAuthError('session_required','Ingresá para guardar'))
 await render();await act(async()=>save().click());const first=vi.mocked(saveCompletedAnalysis).mock.calls[0]
 expect(container.textContent).toContain('Conservamos el presupuesto')
 await act(async()=>root.unmount());root=createRoot(container)
 vi.mocked(saveCompletedAnalysis).mockResolvedValue({id:'saved-case'} as any)
 setSessionState('ready');await render()
 expect(vi.mocked(saveCompletedAnalysis).mock.calls[1]).toEqual(first)
 expect(container.textContent).toContain('Presupuesto guardado')
})

it('does not render the immutable dashboard again for saving and saved feedback', async () => {
 let resolve!: (value: any) => void
 vi.mocked(saveCompletedAnalysis).mockImplementation(() => new Promise(r => { resolve = r }))
 await render()
 const formattingCalls = vi.mocked(usd).mock.calls.length
 expect(formattingCalls).toBeGreaterThan(0)
 await act(async () => save().click())
 expect(container.textContent).toContain('Guardando…')
 expect(vi.mocked(usd).mock.calls.length).toBe(formattingCalls)
 await act(async () => resolve({ id: 'saved-case' }))
 expect(container.textContent).toContain('Presupuesto guardado')
 expect(vi.mocked(usd).mock.calls.length).toBe(formattingCalls)
})

it('shows the calculable MOQ minimum and a visible optimization table instead of an unavailable one-unit purchase', async () => {
 const { PurchaseQuoteSummary } = await import('./PurchaseQuoteResult')
 const product = createManualProductAnalysis('manual://moq-two')
 product.product.name = 'Botellas'; product.product.moq = 2; product.product.supplierQuote = initialSupplierQuote(10, true)
 const moqPlan = buildPurchasePlan({ costs: { originCountry: 'China', unitWeightKg: 0.1, unitVolumeCbm: 0.001, dutyRatePct: 16, purpose: 'resale', entityType: 'company', hasImporterSignature: true, sensitiveCategory: 'none' }, quote: product.product.supplierQuote, moq: 2, capacity })
 const choose = vi.fn()
 await act(async () => root.render(<PurchaseQuoteSummary snapshot={{ version: 1, quotedAt: '2026-10-27T12:00:00Z', analysis: product, pipelineSummary: summary, purchasePlan: moqPlan, conversation: [] }} onChoose={choose} />))
 const comparison = container.querySelector('[aria-label="Compra mínima y cantidad elegida"]')!
 expect(comparison.textContent).toContain('Si traés lo mínimo: 2 unidades')
 expect(comparison.textContent).toContain(usd(moqPlan.minimum!.cost.totalCostUsd))
 expect(comparison.textContent).not.toContain('Si traés una unidad')
 const table = container.querySelector('.purchase-options-table')!
 expect(table.closest('details')).toBeNull()
 expect(table.textContent).toContain('Flete incluido · USD')
 expect(table.textContent).toContain('Costo puesto · USD/u.')
 expect(table.textContent).toContain('Cantidad elegida')
 const button = [...table.querySelectorAll('button')].find(button => button.textContent === 'Elegir 2 unidades')!
 await act(async () => button.click())
 expect(choose).toHaveBeenCalledWith(2)
 expect(container.querySelectorAll('.purchase-transport-card')).toHaveLength(3)
 expect(container.textContent).toContain('Tiempo de transporte orientativo')
 expect(container.textContent).toContain('no fechas de entrega')
})

it('does not display an unavailable courier merchandise subtotal as a landed price', async () => {
 const { PurchaseQuoteSummary } = await import('./PurchaseQuoteResult')
 const quote = initialSupplierQuote(10, true)
 const heavyPlan = buildPurchasePlan({ costs: { originCountry: 'China', unitWeightKg: 1, unitVolumeCbm: 0.001, dutyRatePct: 16, purpose: 'resale', entityType: 'company', hasImporterSignature: true, sensitiveCategory: 'none' }, quote, moq: 2, capacity: { mode: 'units', min: 100, max: 100, budgetUsd: 0 } })
 await act(async () => root.render(<PurchaseQuoteSummary snapshot={{ version: 1, quotedAt: '2026-10-27T12:00:00Z', analysis, pipelineSummary: summary, purchasePlan: heavyPlan, conversation: [] }} />))
 const courier = container.querySelector('article[aria-label="Courier comercial"]')!
 expect(courier.textContent).toContain('Sin tarifa calculable')
 expect(courier.querySelector('.purchase-transport-price')).toBeNull()
 expect(courier.textContent).toContain('50 kg')
 expect(container.querySelector('article[aria-label="Aéreo"] .purchase-transport-price')).not.toBeNull()
})

it('keeps a missing MOQ explicit and never invents transport comparisons for an older saved plan', async () => {
 const { PurchaseQuoteSummary } = await import('./PurchaseQuoteResult')
 const legacyPlan = { single: plan.single, singleReason: plan.singleReason, selected: plan.selected, improvement: plan.improvement, note: plan.note, error: plan.error }
 const product = createManualProductAnalysis('manual://legacy-missing-moq'); product.product.moq = 0
 await act(async () => root.render(<PurchaseQuoteSummary snapshot={{ version: 1, quotedAt: '2026-10-27T12:00:00Z', analysis: product, pipelineSummary: summary, purchasePlan: legacyPlan, conversation: [] }} />))
 expect(container.textContent).toContain('MOQ pendiente de confirmar')
 expect(container.textContent).toContain('Compra mínima modelada')
 expect(container.textContent).toContain('Este presupuesto guardado no incluye el detalle por modalidad')
 expect(container.querySelectorAll('.purchase-transport-card')).toHaveLength(0)
})

it('labels an over-budget minimum without offering to select it', async () => {
 const { PurchaseQuoteSummary } = await import('./PurchaseQuoteResult')
 const compared = { ...plan, minimum: { ...plan.minimum!, withinBudget: false }, selected: plan.selected }
 const choose = vi.fn()
 await act(async () => root.render(<PurchaseQuoteSummary snapshot={{ version: 1, quotedAt: '2026-10-27T12:00:00Z', analysis, pipelineSummary: summary, purchasePlan: compared, conversation: [] }} onChoose={choose} />))
 const row = [...container.querySelectorAll('.purchase-options-table tbody tr')].find(row => row.querySelector('th')?.textContent?.startsWith(`${compared.minimum.quantity} u.`))!
 expect(row.textContent).toContain('Supera tu presupuesto')
 expect(row.querySelector('button')).toBeNull()
})

it('marks a battery shipment total as conditional before the transport details', async () => {
 const { PurchaseQuoteSummary } = await import('./PurchaseQuoteResult')
 const conditional = buildPurchasePlan({ costs: { originCountry: 'China', unitWeightKg: 0.1, unitVolumeCbm: 0.001, dutyRatePct: 16, purpose: 'resale', entityType: 'company', hasImporterSignature: true, sensitiveCategory: 'none' }, quote: initialSupplierQuote(10, true), moq: 2, capacity, cargoText: 'Batería de litio integrada' })
 await act(async () => root.render(<PurchaseQuoteSummary snapshot={{ version: 1, quotedAt: '2026-10-27T12:00:00Z', analysis, pipelineSummary: summary, purchasePlan: conditional, conversation: [] }} />))
 const upfront = container.querySelector('.purchase-dashboard-summary > .purchase-conditional-price')!
 expect(upfront.textContent).toContain('no incluyen recargos especiales pendientes')
 expect(upfront.closest('details')).toBeNull()
 expect(container.querySelectorAll('.purchase-transport-card .purchase-conditional-price')).toHaveLength(3)
 expect(container.querySelectorAll('.purchase-transport-card .purchase-cargo-warning')).toHaveLength(3)
 for (const warning of container.querySelectorAll('.purchase-cargo-warning')) {
  expect(warning.textContent).toContain('baterías')
  expect(warning.closest('details')).toBeNull()
 }
 expect(container.querySelectorAll('.purchase-transport-details')).toHaveLength(3)
})
