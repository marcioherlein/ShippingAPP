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
import { writeCaseConversation } from '../lib/caseConversation'
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
it('shows the transcript above two primary scenarios and keeps the breakdown collapsed',async()=>{
 await render();expect(container.querySelectorAll('.simple-quote-card')).toHaveLength(2)
 expect(container.querySelector('details')?.open).toBe(false)
 expect(container.querySelector('.case-conversation')!.compareDocumentPosition(container.querySelector('.simple-quote')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
