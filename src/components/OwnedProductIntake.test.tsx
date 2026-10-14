// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import OwnedProductIntake from './OwnedProductIntake'
import { writeProductDraft } from '../lib/productDraft'
let root: Root
let container: HTMLDivElement
const receive = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, React })
  sessionStorage.clear(); receive.mockClear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  writeProductDraft('entry', { mode: 'describe', chatStep: 'volume', volumeMode: 'cbm', chatInput: '0.06', chatAnswers: { name: 'Paleta de pádel', use: 'Jugar al pádel', material: 'Carbono', price: '25', origin: 'China', weight: '0.5', moq: '' } })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); sessionStorage.clear() })
async function mount() { await act(async () => root.render(<OwnedProductIntake onAlibabaLink={vi.fn()} onStructuredData={receive} />)) }
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(text))!
  expect(button).toBeDefined(); await act(async () => button.click())
}
async function choose(basis: 'unit' | 'carton') {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
  await act(async () => inputs[basis === 'unit' ? 0 : 1].click())
}
async function finishCategory() { if (!receive.mock.calls.length) await click('Ninguna de estas') }
it('requires the packaging basis and keeps per-unit volume without asking units per carton', async () => {
  await mount()
  expect([...container.querySelectorAll('button')].find(b => b.textContent?.startsWith('Continuar'))?.disabled).toBe(true)
  await choose('unit'); await click('Continuar'); await finishCategory()
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({ volumeCbm: 0.06 }))
  expect(container.textContent).not.toContain('¿Cuántas unidades van en esa caja?')
})
it('divides a confirmed carton volume exactly once by its confirmed unit count', async () => {
  await mount(); await choose('carton'); await click('Continuar')
  expect(container.textContent).toContain('¿Cuántas unidades van en esa caja?')
  const input = container.querySelector<HTMLInputElement>('input[type="number"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '10')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('Continuar'); await finishCategory()
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({ volumeCbm: 0.006 }))
})
it('leaves unit volume unknown when carton quantity is omitted and preserves the basis across remount', async () => {
  await mount(); await choose('carton')
  await act(async () => root.unmount()); root = createRoot(container); await mount()
  expect(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].checked).toBe(true)
  await click('Continuar'); await click('No sé: dejar volumen'); await finishCategory()
  expect(receive).toHaveBeenCalledWith(expect.objectContaining({ volumeCbm: null }))
})
