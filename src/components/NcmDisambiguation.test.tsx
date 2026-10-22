// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import NcmDisambiguation from './NcmDisambiguation'
import { createManualProductAnalysis } from '../lib/productConfirmation'
import type { NcmDisambiguationQuestion } from '../lib/customsClassification'
vi.mock('../lib/loadManualNcmIndex', () => ({ loadManualNcmIndex: vi.fn(() => new Promise(() => {})) }))
const insulation: NcmDisambiguationQuestion = { id: 'insulation', prompt: '¿La ficha del producto confirma aislamiento por vacío?', attribute: 'construccion', options: [{ label: 'Sí', value: 'si', note: 'Recipiente aislado por vacío para bebidas.' }, { label: 'No', value: 'no', note: 'Recipiente sin aislamiento por vacío.' }, { label: 'No sé', value: 'no-se' }] }
const material: NcmDisambiguationQuestion = { ...insulation, id: 'material', prompt: '¿Es de acero?', options: [{ label: 'Sí', value: 'si', note: 'Es de acero.' }, { label: 'No sé', value: 'no-se' }] }
let root: Root, container: HTMLDivElement
const answer = vi.fn()
beforeEach(() => { Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true }); sessionStorage.clear(); answer.mockClear(); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); sessionStorage.clear() })
async function render(questions = [insulation], exhausted = false) { await act(async () => root.render(<NcmDisambiguation disambiguation={{ candidates: [], questions }} customs={createManualProductAnalysis('manual://ncm').customs} recoveryKey="same-product" refinementExhausted={exhausted} onAnswer={answer} onPickCandidate={vi.fn()} />)) }
async function click(text: string) { await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === text)!.click()) }
it('asks precise backend questions one at a time and submits only explicit facts', async () => {
  await render([insulation, material]); expect(container.querySelectorAll('fieldset')).toHaveLength(1); expect(container.querySelector('legend')?.textContent).toBe(insulation.prompt)
  await click('No'); await click('Continuar'); expect(container.querySelector('legend')?.textContent).toBe(material.prompt); expect(answer).not.toHaveBeenCalled()
  await click('No sé'); await click('Continuar'); await click('Volver a clasificar con mis respuestas'); expect(answer).toHaveBeenCalledExactlyOnceWith('Recipiente sin aislamiento por vacío.', expect.arrayContaining(['Recipiente aislado por vacío para bebidas.', 'Recipiente sin aislamiento por vacío.']))
  await render([insulation, material]); expect(container.querySelector('fieldset')).toBeNull(); expect(container.textContent).toContain('ya están respondidas'); expect(answer).toHaveBeenCalledTimes(1)
})
it('restores an unfinished selection without inventing a fact or submitting it', async () => {
  await render(); await click('Sí'); await act(async () => root.unmount()); root = createRoot(container); await render()
  expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe('Sí'); expect(answer).not.toHaveBeenCalled()
})
it('does not transfer an answer when a backend reuses the id for a different question', async () => {
  await render(); await click('Sí'); await click('Continuar'); await click('Volver a clasificar con mis respuestas')
  await render([{ ...insulation, prompt: '¿La ficha confirma un producto diferente?' }]); expect(container.querySelector('legend')?.textContent).toContain('producto diferente'); expect(container.querySelector('[aria-pressed="true"]')).toBeNull()
})
it('keeps unknown answers out of classification and stops at the round limit', async () => {
  await render(); await click('No sé'); await click('Continuar'); expect(container.textContent).toContain('No agregaste un dato confirmado'); expect(answer).not.toHaveBeenCalled()
  await render([insulation], true); expect(container.querySelector('fieldset')).toBeNull(); expect(container.textContent).toContain('dos rondas'); expect(answer).not.toHaveBeenCalled()
})

it('lets the user correct a submitted answer and supplies the old fact for replacement', async () => {
 await render(); await click('No'); await click('Continuar'); await click('Volver a clasificar con mis respuestas')
 await click('Cambiar respuesta'); await click('Sí'); await click('Continuar'); await click('Volver a clasificar con mis respuestas')
 expect(answer.mock.calls[1][0]).toBe('Recipiente aislado por vacío para bebidas.')
 expect(answer.mock.calls[1][1]).toContain('Recipiente sin aislamiento por vacío.')
})

it('persists submitted facts before the parent unmounts it in the same batch', async () => {
 const replacePanel = vi.fn(() => root.render(<p>Procesando</p>))
 await act(async () => root.render(<NcmDisambiguation disambiguation={{ candidates: [], questions: [insulation] }} customs={createManualProductAnalysis('manual://ncm').customs} recoveryKey="same-product" onAnswer={replacePanel} onPickCandidate={vi.fn()} />))
 await click('No'); await click('Continuar'); await click('Volver a clasificar con mis respuestas')
 expect(container.textContent).toBe('Procesando')
 expect(replacePanel).toHaveBeenCalledTimes(1)
 const facts = JSON.parse(sessionStorage.getItem('shippingapp:product-draft:ncm-answers:same-product:facts') || 'null')
 expect(facts.data.construccion).toBe('Recipiente sin aislamiento por vacío.')
 await render()
 expect(container.querySelector('fieldset')).toBeNull()
 expect(container.textContent).toContain('ya están respondidas')
 expect(answer).not.toHaveBeenCalled()
})
