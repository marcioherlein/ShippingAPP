// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ManualNcmPicker from './ManualNcmPicker'
import { loadManualNcmIndex } from '../lib/loadManualNcmIndex'
import type { ManualNcmIndex } from '../lib/manualNcm'
import { createManualProductAnalysis } from '../lib/productConfirmation'
import { writeProductDraft } from '../lib/productDraft'
vi.mock('../lib/loadManualNcmIndex', () => ({ loadManualNcmIndex: vi.fn() }))
const catalog: ManualNcmIndex = { meta: { source: 'Catálogo de prueba', sourceDate: '2026-08-27' }, records: [
  ['0101.21.00', 'Caballos reproductores de raza pura', 0, 0, 3, 0, 21, 20, 6, 2.5, null, false],
  ['8711.60.00', 'Velocípedos propulsados con motor eléctrico', 20, 20, 3, 0, 21, 20, 6, 2.5, null, false],
] }
const customs = createManualProductAnalysis('manual://picker').customs
let root: Root, container: HTMLDivElement
const selected = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })
  sessionStorage.clear(); selected.mockClear()
  vi.mocked(loadManualNcmIndex).mockResolvedValue(catalog)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); sessionStorage.clear() })
async function render() { await act(async () => root.render(<ManualNcmPicker customs={customs} recoveryKey="test-product" onSelect={selected} />)) }
async function query(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
function useButton() { return [...container.querySelectorAll('button')].find(button => button.textContent === 'Usar esta posición')! }
it('shows search guidance instead of arbitrary catalog rows and still validates an explicit selection', async () => {
  await render()
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0)
  expect(container.textContent).not.toContain('Caballos reproductores')
  expect(container.textContent).not.toContain('No encontramos coincidencias')
  expect(container.textContent).toContain('Escribí al menos dos caracteres')
  expect(useButton().disabled).toBe(true)
  await query('e')
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0)
  await query('8711')
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(1)
  await act(async () => container.querySelector<HTMLInputElement>('input[type="radio"]')!.click())
  expect(useButton().disabled).toBe(true)
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  expect(useButton().disabled).toBe(false)
  await act(async () => useButton().click())
  expect(selected).toHaveBeenCalledWith(expect.objectContaining({ ncmCandidate: '8711.60.00', dutyRatePct: 20 }))
})
it('restores a previously chosen code without showing unrelated positions and clears confirmation on a new search', async () => {
  writeProductDraft('manual-ncm:test-product', { query: '', chapter: '', selected: '8711.60.00', confirmed: true })
  await render()
  expect(container.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('8711.60.00')
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(1)
  expect(useButton().disabled).toBe(false)
  await query('0101')
  expect(useButton().disabled).toBe(true)
  expect(container.querySelector('input[type="checkbox"]')).toBeNull()
  expect(selected).not.toHaveBeenCalled()
})
