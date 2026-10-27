// @vitest-environment jsdom
import React,{act,useState} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import GuidedCaseReview from './GuidedCaseReview'
import {createManualProductAnalysis,productConfirmationFromAnalysis} from '../lib/productConfirmation'
import {initialSupplierQuote} from '../lib/supplierQuote'
import {readCaseConversation,recordCaseAnswer} from '../lib/caseConversation'
const analysis=createManualProductAnalysis('manual://guided')
analysis.product={...analysis.product,name:'Luz RGB',originCountry:'China',unitPriceUsd:10,packedWeightKg:0.2,volumeCbm:0.001,moq:1,functionText:null}
let root:Root,container:HTMLDivElement
const confirm=vi.fn()
function Harness({pack=false}:{pack?:boolean}={}){const[draft,setDraft]=useState(()=>({...productConfirmationFromAnalysis(analysis),...(pack?{functionText:'Iluminar fotos'}:{})}));const[quote,setQuote]=useState(()=>({...initialSupplierQuote(10,true),...(pack?{basis:'pack' as const}:{})}));return <GuidedCaseReview analysis={analysis} draft={draft} quote={quote} capacity={{mode:'budget',budgetUsd:5000,min:1,max:1}} classified={false} askedForMore={false} clarificationTarget="functionText" exhausted={false} status="confirm" authRequired={false} onDraft={setDraft} onQuote={setQuote} onConfirm={confirm} onManual={vi.fn()}/>}
beforeEach(()=>{Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});sessionStorage.clear();confirm.mockClear();container=document.createElement('div');document.body.append(container);root=createRoot(container)})
afterEach(async()=>{await act(async()=>root.unmount());container.remove();sessionStorage.clear()})
async function click(text:string){await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===text)!.click())}
it('asks missing function, preserves the budget, and waits for explicit structured confirmation',async()=>{
 await act(async()=>root.render(<Harness/>));expect(container.querySelector('.case-question h2')?.textContent).toContain('¿Para qué se usa principalmente?')
 expect(confirm).not.toHaveBeenCalled()
 const input=container.querySelector<HTMLInputElement>('.case-question input')!
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Iluminar fotografías con celular');input.dispatchEvent(new Event('input',{bubbles:true}))})
 await click('Continuar');expect(container.querySelector('.case-question h2')?.textContent).toContain('Desde cuántas unidades')
 await click('Continuar');expect(container.querySelector('.case-question h2')?.textContent).toContain('Hasta cuántas unidades');await click('Continuar');expect(container.textContent).toContain('Revisá y confirmá')
 expect(container.textContent).toContain('5,000')
 expect(container.querySelector('.case-question')).toBeNull()
 expect(readCaseConversation(analysis.sourceUrl).some(m=>m.text==='Iluminar fotografías con celular')).toBe(true)
 await click('Confirmar y clasificar');expect(confirm).toHaveBeenCalledTimes(1)
})

it('requires an explicit pack count instead of using the default one-unit pack',async()=>{
 await act(async()=>root.render(<Harness pack/>));expect(container.querySelector('.case-question h2')?.textContent).toContain('Cuántas unidades incluye ese lote')
 const input=container.querySelector<HTMLInputElement>('.case-question input')!
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'5');input.dispatchEvent(new Event('input',{bubbles:true}))})
 await click('Continuar');expect(container.querySelector('.case-question h2')?.textContent).toContain('Desde cuántas unidades')
 expect(readCaseConversation(analysis.sourceUrl).some(message=>message.role==='user'&&message.text==='5')).toBe(true)
})

it('opens one question by default, preserves spaces, and never confirms automatically',async()=>{
 await act(async()=>root.render(<Harness/>));expect(container.querySelector('.case-question')).not.toBeNull();expect(container.querySelector('.case-advanced')).toBeNull();expect(container.textContent).toContain('5,000');expect(confirm).not.toHaveBeenCalled();
 const field=container.querySelector<HTMLInputElement>('.case-question input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'Iluminar fotografías ');field.dispatchEvent(new Event('input',{bubbles:true}))});
 expect(field.value).toBe('Iluminar fotografías ');await click('Continuar');expect(confirm).not.toHaveBeenCalled();expect(readCaseConversation(analysis.sourceUrl).some(m=>m.text.includes('Iluminar fotografías'))).toBe(true);
 await click('Atrás');expect(container.querySelector('.case-question h2')?.textContent).toContain('¿Para qué se usa principalmente?');
})

it('does not read stored conversation again while typing a pack count',async()=>{
 await act(async()=>root.render(<Harness pack/>))
 const reads=vi.spyOn(Storage.prototype,'getItem');reads.mockClear()
 const field=container.querySelector<HTMLInputElement>('.case-question input')!
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,'5');field.dispatchEvent(new Event('input',{bubbles:true}))})
 expect(field.value).toBe('5');expect(reads).not.toHaveBeenCalled();reads.mockRestore()
})

it('explains invalid numbers and rejects an upper price tier below its minimum',async()=>{
 await act(async()=>root.render(<Harness pack/>));
 const change=async(value:string)=>{const input=container.querySelector<HTMLInputElement>('.case-question input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
 await change('-1');expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull();expect(container.textContent).toContain('número entero mayor a cero')
 await change('5');await click('Continuar');await change('100');await click('Continuar');await change('50');expect(container.textContent).toContain('igual o mayor a 100');expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Continuar')?.disabled).toBe(true)
})
it('restores an already confirmed upper tier from the previous longer prompt',async()=>{
 recordCaseAnswer(analysis.sourceUrl,'¿Desde cuántas unidades es válido ese precio?','1')
 recordCaseAnswer(analysis.sourceUrl,'¿Hasta cuántas unidades vale ese precio? Dejá vacío sólo si confirmaste que no tiene límite.','Confirmo que no tiene límite')
 const draft={...productConfirmationFromAnalysis(analysis),functionText:'Iluminar fotografías'}
 await act(async()=>root.render(<GuidedCaseReview analysis={analysis} draft={draft} quote={initialSupplierQuote(10,true)} capacity={{mode:'unknown',budgetUsd:0,min:1,max:1}} classified={false} askedForMore={false} clarificationTarget="functionText" exhausted={false} status="confirm" authRequired={false} onDraft={vi.fn()} onQuote={vi.fn()} onConfirm={confirm} onManual={vi.fn()}/>))
 expect(container.querySelector('.case-question')).toBeNull();expect(container.textContent).toContain('Revisá y confirmá')
})

it('requests a new distinguishing detail and preserves facts already supplied after a generic failure',async()=>{
 const known={...analysis,classificationRefinement:{allowed:true,attempt:1,maxAttempts:2},product:{...analysis.product,functionText:'Transporte urbano personal',material:'Aluminio'}}
 const draft={...productConfirmationFromAnalysis(known),description:'Vehículo de dos ruedas'}
 const change=vi.fn()
 await act(async()=>root.render(<GuidedCaseReview analysis={known} draft={draft} quote={initialSupplierQuote(10,true)} capacity={{mode:'unknown',budgetUsd:0,min:1,max:1}} classified={false} askedForMore={true} classificationAttempted={true} clarificationTarget="description" exhausted={false} status="blocked" authRequired={false} onDraft={change} onQuote={vi.fn()} onConfirm={confirm} onManual={vi.fn()}/>))
 expect(container.querySelector('.case-question h2')?.textContent).toBe('¿Qué detalle técnico nuevo podemos sumar?')
 const input=container.querySelector<HTMLInputElement>('.case-question input')!
 expect(input.value).toBe('')
 expect([...container.querySelectorAll('button')].find(b=>b.textContent==='Continuar')?.disabled).toBe(true)
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Motor eléctrico de 350 W sin pedales');input.dispatchEvent(new Event('input',{bubbles:true}))})
 await click('Continuar')
 expect(change).toHaveBeenCalledWith(expect.objectContaining({functionText:'Transporte urbano personal',material:'Aluminio',description:'Vehículo de dos ruedas · Motor eléctrico de 350 W sin pedales'}))
 expect(confirm).not.toHaveBeenCalled()
})

it('does not announce a classification failure before the first classifier request',async()=>{
 await act(async()=>root.render(<Harness/>))
 expect(container.querySelector('.workspace-classification-status b')?.textContent).toBe('Completá tu ficha de producto')
 expect(container.querySelector('.workspace-classification-status')?.textContent).not.toContain('Clasificación pendiente')
})

it('describes exploration as the minimum valid purchase without mistaking supplier MOQ for a pack size',async()=>{
 recordCaseAnswer(analysis.sourceUrl,'¿Cuántas unidades incluye ese lote?','5')
 recordCaseAnswer(analysis.sourceUrl,'¿Desde cuántas unidades es válido ese precio?','5')
 recordCaseAnswer(analysis.sourceUrl,'¿Hasta cuántas unidades vale ese precio?','Confirmo que no tiene límite')
 const draft={...productConfirmationFromAnalysis(analysis),functionText:'Iluminar fotografías',moq:2}
 const quote={...initialSupplierQuote(10,true),basis:'pack' as const,unitsPerPack:5,minQuantity:5}
 await act(async()=>root.render(<GuidedCaseReview analysis={analysis} draft={draft} quote={quote} capacity={{mode:'unknown',budgetUsd:0,min:1,max:1}} classified={false} askedForMore={false} clarificationTarget="functionText" exhausted={false} status="confirm" authRequired={false} onDraft={vi.fn()} onQuote={vi.fn()} onConfirm={confirm} onManual={vi.fn()}/>))
 expect(container.querySelector('.workspace-capacity')?.textContent).toContain('explorar desde la compra mínima disponible')
 expect(container.querySelector('.case-review')?.textContent).toContain('explorar desde la compra mínima disponible')
 expect(container.textContent).not.toContain('explorar desde una unidad')
 expect(container.textContent).not.toContain('explorar desde 2')
})

it('keeps an unknown supplier minimum explicit in the sidebar and conversation',async()=>{
 const draft={...productConfirmationFromAnalysis(analysis),moq:0}
 await act(async()=>root.render(<GuidedCaseReview analysis={analysis} draft={draft} quote={initialSupplierQuote(10,true)} capacity={{mode:'unknown',budgetUsd:0,min:1,max:1}} classified={false} askedForMore={false} clarificationTarget="functionText" exhausted={false} status="confirm" authRequired={false} onDraft={vi.fn()} onQuote={vi.fn()} onConfirm={confirm} onManual={vi.fn()}/>))
 expect(container.querySelector('.workspace-capacity')?.textContent).toContain('mínimo del proveedor, por confirmar')
 expect(readCaseConversation(analysis.sourceUrl).some(message=>message.text==='Quiero conocer la compra mínima y comparar alternativas.')).toBe(true)
 expect(readCaseConversation(analysis.sourceUrl).some(message=>message.text.includes('costo de una unidad'))).toBe(false)
})
