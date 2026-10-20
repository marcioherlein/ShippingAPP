// @vitest-environment jsdom
import React,{act,useState} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import GuidedCaseReview from './GuidedCaseReview'
import {createManualProductAnalysis,productConfirmationFromAnalysis} from '../lib/productConfirmation'
import {initialSupplierQuote} from '../lib/supplierQuote'
import {readCaseConversation} from '../lib/caseConversation'
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
