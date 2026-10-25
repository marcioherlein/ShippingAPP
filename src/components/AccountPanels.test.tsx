// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AnalysisHistory from './AnalysisHistory'
import Watchlist from './Watchlist'
import EmailPreferences from './EmailPreferences'
import { deleteAnalysisHistoryItem, getAnalysisHistoryItem, listAnalysisHistory } from '../lib/analysisHistory'
import { listWatchlist, removeWatchlistItem } from '../lib/watchlist'
import { loadEmailPreferences, saveEmailPreferences } from '../lib/emailPreferences'

vi.mock('../lib/analysisHistory', () => ({ listAnalysisHistory: vi.fn(), getAnalysisHistoryItem: vi.fn(), deleteAnalysisHistoryItem: vi.fn() }))
vi.mock('../lib/watchlist', () => ({ listWatchlist: vi.fn(), getWatchlistItem: vi.fn(), refreshWatchlistItem: vi.fn(), removeWatchlistItem: vi.fn(), addAnalysisToWatchlist: vi.fn() }))
vi.mock('../lib/emailPreferences', () => ({ loadEmailPreferences: vi.fn(), saveEmailPreferences: vi.fn() }))
let root: Root
let container: HTMLDivElement
const preferences = { digestEnabled: true, alertsEnabled: false, marketingEnabled: false, timezone: 'UTC', updatedAt: '', transactional: { configurable: false as const, note: 'Avisos operativos.' } }
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.resetAllMocks()
  vi.mocked(listAnalysisHistory).mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(listWatchlist).mockResolvedValue([])
  vi.mocked(loadEmailPreferences).mockResolvedValue(preferences)
  vi.mocked(saveEmailPreferences).mockImplementation(async patch => ({ ...preferences, ...patch }))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); this.querySelector('button')?.focus() } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove()
  for (const [name, original] of [['showModal', originalShowModal], ['close', originalClose]] as const) {
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
})
async function click(button: HTMLButtonElement) { await act(async () => { button.focus(); button.click() }) }
for (const [name, Component] of [['history', AnalysisHistory], ['watchlist', Watchlist]] as const) {
  it(`${name} opens at its close control and Escape returns focus without trapping a non-modal panel`, async () => {
    await act(async () => root.render(<Component />))
    const trigger = container.querySelector('button')!
    await click(trigger)
    const panel = container.querySelector('[role="dialog"]')!
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id)
    expect(document.activeElement).toBe(panel.querySelector('button'))
    expect(panel.getAttribute('aria-modal')).toBeNull()
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
  it(`${name} dismisses on outside interaction without returning focus from that control`, async () => {
    await act(async () => root.render(<><Component /><button>Outside</button></>))
    await click(container.querySelector('button')!)
    const outside = [...container.querySelectorAll('button')].find(button => button.textContent === 'Outside')!
    await act(async () => { outside.focus(); outside.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(outside)
  })
}
it('history announces load failure and retries without reopening the panel', async () => {
  vi.mocked(listAnalysisHistory).mockRejectedValueOnce(new Error('No pudimos cargar tu historial.'))
  await act(async () => root.render(<AnalysisHistory />))
  await click(container.querySelector('button')!)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('No pudimos')
  await click([...container.querySelectorAll('button')].find(button => button.textContent === 'Reintentar')!)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.textContent).toContain('Todavía no hay análisis guardados.')
  expect(document.activeElement).toBe(container.querySelector('.analysis-history-head button'))
})
it('email retries loading in the same modal, then returns focus when closed', async () => {
  vi.mocked(loadEmailPreferences).mockRejectedValueOnce(new Error('offline'))
  await act(async () => root.render(<EmailPreferences />))
  const trigger = container.querySelector('button')!
  await click(trigger)
  const dialog = container.querySelector('dialog')!
  expect(dialog.open).toBe(true)
  await click([...dialog.querySelectorAll('button')].find(button => button.textContent === 'Reintentar')!)
  expect(container.querySelector('dialog')).toBe(dialog)
  expect(document.activeElement).toBe(dialog.querySelector('button'))
  expect(container.textContent).toContain('Guardar preferencias')
  await click(dialog.querySelector('button')!)
  expect(container.querySelector('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
it('email explains invalid timezones before any request and focuses the field', async () => {
  await act(async () => root.render(<EmailPreferences />)); await click(container.querySelector('button')!)
  const field = container.querySelector<HTMLInputElement>('[aria-label="Zona horaria"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'Not/AZone')
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(saveEmailPreferences).not.toHaveBeenCalled()
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(field)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('zona válida')
})
it('email cannot lose edits while a save is in flight and keeps changes after a failed save', async () => {
  let reject!: (error: Error) => void
  vi.mocked(saveEmailPreferences).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
  await act(async () => root.render(<EmailPreferences />)); await click(container.querySelector('button')!)
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  await act(async () => checkbox.click())
  expect(checkbox.checked).toBe(false)
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(container.querySelector('fieldset')?.disabled).toBe(true)
  await act(async () => reject(new Error('offline')))
  expect(container.querySelector('fieldset')?.disabled).toBe(false)
  expect(checkbox.checked).toBe(false)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('No pudimos guardar')
})

it('history keeps keyboard focus in context when opening and leaving an analysis', async () => {
  vi.mocked(listAnalysisHistory).mockResolvedValue({ items: [{ id: 'saved', createdAt: '2026-10-23', productName: 'Termo', sourceUrl: null, ncmCode: null, selectedMode: null, unitCostUsd: 2, totalCostUsd: 200 }], nextCursor: null })
  vi.mocked(getAnalysisHistoryItem).mockResolvedValue({ id: 'saved', createdAt: '2026-10-23', updatedAt: '', input: {}, result: {} })
  await act(async () => root.render(<AnalysisHistory />)); await click(container.querySelector('button')!)
  await click([...container.querySelectorAll('button')].find(button => button.textContent === 'Abrir análisis')!)
  const back = container.querySelector<HTMLButtonElement>('.analysis-history-back')!
  expect(document.activeElement).toBe(back)
  await click(back)
  expect(document.activeElement).toBe(container.querySelector('.analysis-history-head button'))
})

for (const [name, Component, deletion] of [['history', AnalysisHistory, deleteAnalysisHistoryItem], ['watchlist', Watchlist, removeWatchlistItem]] as const) {
  for (const movesOutside of [false, true]) {
    it(`${name} deletion preserves ${movesOutside ? 'focus moved to another control' : 'keyboard context and Escape after removing the active row'}`, async () => {
      const summary = { id: 'saved', createdAt: '2026-10-25', productName: 'Audit product', sourceUrl: null, ncmCode: null, selectedMode: null, unitCostUsd: 2, totalCostUsd: 200 }
      const tracked = { id: 'tracked', analysisId: summary.id, title: summary.productName, sourceUrl: '', createdAt: summary.createdAt, updatedAt: summary.createdAt, ncmCode: null, latestSnapshot: null, previousSnapshot: null, changes: { marketPricePct: null, landedCostPct: null, grossMarginPoints: null }, snapshots: [] }
      vi.mocked(listAnalysisHistory).mockResolvedValueOnce({ items: [summary], nextCursor: null }).mockResolvedValue({ items: [], nextCursor: null })
      vi.mocked(listWatchlist).mockResolvedValueOnce([tracked]).mockResolvedValue([])
      let complete!: () => void
      vi.mocked(deletion).mockImplementation(() => new Promise<void>(resolve => { complete = resolve }))
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
      try {
        await act(async () => root.render(<><Component /><button>Outside action</button></>))
        const trigger = container.querySelector('button')!
        await click(trigger)
        const remove = [...container.querySelectorAll('button')].find(button => button.textContent === (name === 'history' ? 'Eliminar' : 'Quitar'))!
        await click(remove)
        const outside = [...container.querySelectorAll('button')].find(button => button.textContent === 'Outside action')!
        if (movesOutside) outside.focus()
        await act(async () => complete())
        expect(container.querySelector('article')).toBeNull()
        expect(container.querySelector('[role="alert"]')).toBeNull()
        if (movesOutside) expect(document.activeElement).toBe(outside)
        else {
          expect(document.activeElement).toBe(container.querySelector('[role="dialog"] button'))
          await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
          expect(container.querySelector('[role="dialog"]')).toBeNull()
          expect(document.activeElement).toBe(trigger)
        }
      } finally { confirm.mockRestore() }
    })
  }
}
