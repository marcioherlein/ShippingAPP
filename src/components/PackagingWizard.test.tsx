// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import PackagingWizard from './PackagingWizard'
let root:Root,container:HTMLDivElement
const complete=vi.fn(),cancel=vi.fn()
beforeEach(async()=>{Object.assign(globalThis,{React,IS_REACT_ACT_ENVIRONMENT:true});sessionStorage.clear();container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(<PackagingWizard onComplete={complete} onCancel={cancel}/>));complete.mockClear();cancel.mockClear()})
afterEach(async()=>{await act(async()=>root.unmount());container.remove()})
async function click(text:string){await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===text)!.click())}
async function answer(value:string){const field=container.querySelector('input')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}))});await click('Continuar con el embalaje')}
it('asks one dimension at a time and calculates cubic metres without requesting another volume',async()=>{
 await click('Una unidad embalada');expect(container.querySelectorAll('input')).toHaveLength(1);await answer('20');await answer('30');await answer('40');expect(complete).not.toHaveBeenCalled();expect(container.querySelector('input')).toBeNull();await click('Usar este volumen');expect(complete).toHaveBeenCalledWith(0.024)
})
it('divides carton volume by a confirmed integer number of units',async()=>{
 await click('Una caja con varias unidades');await answer('100');await answer('50');await answer('40');expect(container.textContent).toContain('Unidades dentro de esa caja');await answer('10');await click('Usar este volumen');expect(complete).toHaveBeenCalledWith(0.02)
})
it('rejects zero dimensions and preserves prior dimensions when going back',async()=>{
 await click('Una unidad embalada');await answer('0');expect(container.textContent).toContain('Largo del embalaje');await answer('25');await click('Volver al dato anterior');expect(container.querySelector('input')?.value).toBe('25');await click('Ingresar un volumen conocido');expect(cancel).toHaveBeenCalledOnce();expect(complete).not.toHaveBeenCalled()
})
it('restores the active measurement after remount without committing an unfinished volume',async()=>{
 await click('Una caja con varias unidades');await answer('60');
 await act(async()=>root.unmount());root=createRoot(container)
 await act(async()=>root.render(<PackagingWizard onComplete={complete} onCancel={cancel}/>))
 expect(container.textContent).toContain('Ancho del embalaje (cm)');expect(complete).not.toHaveBeenCalled()
 await click('Volver al dato anterior');expect(container.querySelector('input')?.value).toBe('60')
})
