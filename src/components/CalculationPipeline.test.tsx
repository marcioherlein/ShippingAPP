// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import CalculationPipeline from './CalculationPipeline'
import { createManualProductAnalysis } from '../lib/productConfirmation'
import type { ProductAnalysisV2 } from '../lib/productAnalysisV2'
import type { QuotePrefill } from '../lib/hotProducts'
vi.mock('./NcmDisambiguation', () => ({ default: ({ disambiguation, onAnswer }: { disambiguation: { candidates: Array<{ label: string }>; questions?: Array<{ prompt: string }> }; onAnswer: (note: string, previousOptions?: string[]) => void }) => <div>{disambiguation.candidates.map(c => c.label).join(' · ')}{disambiguation.questions?.map(q => <p key={q.prompt}>{q.prompt}</p>)}<button onClick={() => onAnswer('Recipiente aislado por vacío para bebidas.', ['Recipiente sin aislamiento por vacío.'])}>Enviar dato preciso</button></div> }))
let root: Root
let container: HTMLDivElement
const confirm = vi.fn()
const base = createManualProductAnalysis('https://www.alibaba.com/product-detail/Portable-Mini-RGB-Phone-Lighting-Adjustable_1601634663041.html')
function analysis(): ProductAnalysisV2 {
  return { ...base, product: { ...base.product, name: 'Portable Mini RGB Phone Lighting Adjustable LED', category: 'Sin clasificar', functionText: null }, usageReservationId: 'existing-case', classificationRefinement: { allowed: true, attempt: 1, maxAttempts: 3 }, customs: {
    ...base.customs, missingFacts: ['Función/uso principal'], provisional: true, provisionalDutyRatePct: 9, provisionalCode: '7102.10.00', provisionalLabel: 'DIAMANTES',
    disambiguation: { candidates: [{ code: '7102.10.00', label: 'DIAMANTES', plainLabel: 'DIAMANTES', score: 30 }, { code: '4707.90.00', label: 'PAPEL PARA RECICLAR', plainLabel: 'PAPEL PARA RECICLAR', score: 28 }], questions: [] },
  } }
}
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })
  sessionStorage.clear(); confirm.mockClear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); sessionStorage.clear() })
async function render(value = analysis()) {
  await act(async () => root.render(<CalculationPipeline analysis={value} prefill={{ budgetUsd: 0, sensitiveCategory: 'none' } as QuotePrefill} status="blocked" activeStage={0} blocker="Falta función principal" onConfirm={confirm} onManualNcm={vi.fn()} onEditProduct={vi.fn()} onReviewProduct={vi.fn()} />))
}
it('keeps function editable in a saved provisional case and never offers diamonds or an estimated tariff', async () => {
  await render()
  expect(container.textContent).not.toContain('DIAMANTES')
  expect(container.textContent).not.toContain('PAPEL PARA RECICLAR')
  expect(container.textContent).not.toContain('Derecho estimado')
  expect(container.textContent).toContain('¿Para qué se usa este producto?')
  const label = [...container.querySelectorAll('label')].find(el => el.querySelector('span')?.textContent === 'Función principal')!
  const input = label.querySelector('input')!
  expect(input.closest('details')).toBeNull()
  expect(confirm).not.toHaveBeenCalled()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Iluminar fotos y videos con el celular')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const button = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Responder y continuar'))!
  expect(button.disabled).toBe(false)
  await act(async () => button.click())
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ functionText: 'Iluminar fotos y videos con el celular' }))
})
it('shows the missing-fact question even when relevant candidates are present', async () => {
  const value = analysis()
  value.customs.disambiguation!.candidates = [{ code: '9405.42.00', label: 'APARATO DE ALUMBRADO LED', plainLabel: 'Alumbrado LED', score: 30 }]
  await render(value)
  expect(container.textContent).toContain('APARATO DE ALUMBRADO LED')
  expect(container.textContent).toContain('¿Para qué se usa este producto?')
  expect(container.querySelector('#classification-clarification')).not.toBeNull()
})

it('prioritizes the precise backend question and preserves user facts through refinement', async () => {
 const value = analysis()
 value.product = { ...value.product, name: 'Termo de acero', functionText: 'Transportar bebidas', material: 'Acero inoxidable', packedWeightKg: 0.6, volumeCbm: 0.002, unitPriceUsd: 17 }
 value.customs.missingFacts = ['Confirmar aislamiento']
 value.customs.disambiguation = { candidates: [], questions: [{ id: 'insulation', attribute: 'construccion', prompt: '¿La ficha confirma aislamiento por vacío?', options: [] }] }
 const props = { prefill: { budgetUsd: 5000, sensitiveCategory: 'none' } as QuotePrefill, status: 'blocked' as const, activeStage: 0, onConfirm: confirm, onManualNcm: vi.fn(), onEditProduct: vi.fn(), onReviewProduct: vi.fn(), capacity: { mode: 'budget' as const, budgetUsd: 5000, min: 1, max: 1 } }
 await act(async () => root.render(<CalculationPipeline {...props} analysis={value} />))
 expect(container.querySelector('.case-question')).toBeNull()
 expect(container.textContent).toContain('¿La ficha confirma aislamiento por vacío?')
 await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Enviar dato preciso')!.click())
 const submitted = confirm.mock.calls[0][0]
 expect(submitted.functionText).toBe('Transportar bebidas')
 expect(submitted.material).toBe('Acero inoxidable')
 expect(submitted.unitWeightKg).toBe(0.6)
 expect(submitted.description).toContain('Recipiente aislado por vacío para bebidas.')
 await act(async () => root.render(<CalculationPipeline {...props} analysis={{ ...value, product: { ...value.product, packedWeightKg: 0 } }} />))
 await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Enviar dato preciso')!.click())
 expect(confirm.mock.calls[1][0].unitWeightKg).toBe(0.6)
 expect(confirm.mock.calls[1][0].description.match(/Recipiente aislado por vacío para bebidas/g)).toHaveLength(1)
 await act(async () => root.render(<CalculationPipeline {...props} analysis={{ ...value, product: { ...value.product, packedWeightKg: 0 }, classificationRefinement: { allowed: true, attempt: 2, maxAttempts: 99 } }} />))
 await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Enviar dato preciso')!.click())
 expect(confirm).toHaveBeenCalledTimes(2)
 expect(container.textContent).toContain('No hay una clasificación validada')
})
