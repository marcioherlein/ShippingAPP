// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SavedCalculations from './SavedCalculations'
import { deleteAnalysisHistoryItem, getAnalysisHistoryItem, listAnalysisHistory, type AnalysisHistoryItem, type AnalysisHistorySummary } from '../lib/analysisHistory'
import { canRestoreSavedQuote } from '../lib/savedQuote'

vi.mock('../lib/analysisHistory', () => ({
  deleteAnalysisHistoryItem: vi.fn(),
  getAnalysisHistoryItem: vi.fn(),
  listAnalysisHistory: vi.fn(),
}))

const summary: AnalysisHistorySummary = { id: 'saved-1', createdAt: '2026-10-23T12:00:00Z', productName: 'Termo térmico', sourceUrl: null, ncmCode: '9617.00.10', selectedMode: 'lcl', unitCostUsd: 32, totalCostUsd: 3200 }
const modern: AnalysisHistoryItem = {
  id: summary.id, createdAt: summary.createdAt, updatedAt: summary.createdAt,
  input: { intent: 'have_product', budgetMode: 'units' },
  result: { version: 1, quotedAt: summary.createdAt, analysis: { sourceUrl: 'manual://thermo', product: { name: summary.productName }, customs: {} }, pipelineSummary: {}, purchasePlan: {}, conversation: [{ role: 'user', text: 'Mi termo.' }] },
}
let root: Root, container: HTMLDivElement, unmounted: boolean
const onOpen = vi.fn(), onNewCalculation = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  vi.mocked(listAnalysisHistory).mockResolvedValue({ items: [summary], nextCursor: null })
  vi.mocked(getAnalysisHistoryItem).mockResolvedValue(modern)
  vi.mocked(deleteAnalysisHistoryItem).mockResolvedValue()
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container); unmounted = false
})
afterEach(async () => {
  if (!unmounted) await act(async () => root.unmount())
  container.remove(); vi.restoreAllMocks()
})
async function render() { await act(async () => root.render(<SavedCalculations onOpen={onOpen} onNewCalculation={onNewCalculation} />)) }
function button(text: string) { return [...container.querySelectorAll('button')].find(element => element.textContent?.includes(text))! }

it('rejects incompatible history snapshots before opening the comparator', () => {
  expect(canRestoreSavedQuote(modern)).toBe(true)
  for (const item of [
    { ...modern, input: {} },
    { ...modern, input: { intent: 'have_product', budgetMode: 'invented' } },
    { ...modern, result: { ...modern.result as object, version: 2 } },
    { ...modern, result: { ...modern.result as object, conversation: [{ role: 'system', text: 'not a case message' }] } },
    { ...modern, result: { ...modern.result as object, purchasePlan: null } },
  ]) expect(canRestoreSavedQuote(item)).toBe(false)
})

it('loads real history, retries failures, and appends a cursor page without duplicates', async () => {
  vi.mocked(listAnalysisHistory).mockRejectedValueOnce(new Error('Historial temporalmente no disponible'))
    .mockResolvedValueOnce({ items: [summary], nextCursor: 'next-page' })
    .mockResolvedValueOnce({ items: [summary, { ...summary, id: 'saved-2', productName: 'Paleta de pádel' }], nextCursor: null })
  await render()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Historial temporalmente no disponible')
  await act(async () => button('Reintentar cargar').click())
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  await act(async () => button('Cargar más').click())
  expect(listAnalysisHistory).toHaveBeenLastCalledWith({ cursor: 'next-page', limit: 12 })
  expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  const search = container.querySelector<HTMLInputElement>('input[type="search"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'termico')
    search.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  expect(container.querySelector('tbody')?.textContent).toContain('Termo térmico')
})

it('opens the immutable complete snapshot and shows legacy records as historical details', async () => {
  await render()
  await act(async () => button('Abrir cálculo').click())
  expect(onOpen).toHaveBeenCalledWith(modern)
  onOpen.mockClear()
  vi.mocked(getAnalysisHistoryItem).mockResolvedValue({ ...modern, input: {}, result: { analysis: { product: { name: summary.productName } }, pipelineSummary: { totalCostUsd: 3200 } } })
  await act(async () => button('Abrir cálculo').click())
  expect(onOpen).not.toHaveBeenCalled()
  const detail = container.querySelector<HTMLElement>('[aria-label="Detalle de cálculo anterior"]')!
  expect(detail.textContent).toContain('Los importes son históricos')
  expect(detail.querySelector('h3')).toBe(document.activeElement)
  expect(button('Ver detalle')).toBeTruthy()
  await act(async () => button('Cerrar detalle').click())
  expect(button('Ver detalle')).toBe(document.activeElement)
})

it('ignores a previous account detail response after the dashboard unmounts', async () => {
  let resolve!: (item: AnalysisHistoryItem) => void
  vi.mocked(getAnalysisHistoryItem).mockImplementation(() => new Promise(done => { resolve = done }))
  await render()
  await act(async () => button('Abrir cálculo').click())
  await act(async () => root.unmount()); unmounted = true
  await act(async () => resolve(modern))
  expect(onOpen).not.toHaveBeenCalled()
})

it('keeps a cancelled deletion and removes only after server success while restoring focus', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await render()
  await act(async () => button('Eliminar').click())
  expect(deleteAnalysisHistoryItem).not.toHaveBeenCalled()
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  confirm.mockReturnValue(true)
  await act(async () => button('Eliminar').click())
  expect(deleteAnalysisHistoryItem).toHaveBeenCalledWith(summary.id)
  expect(container.querySelectorAll('tbody tr')).toHaveLength(0)
  expect(container.querySelector('input[type="search"]')).toBe(document.activeElement)
  expect(container.textContent).toContain('Todavía no guardaste ningún cálculo')
})
