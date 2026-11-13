// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AccountSession } from './auth/AccountSession'
import type { AnalysisHistoryItem } from './lib/analysisHistory'
import { writeProductDraft } from './lib/productDraft'
import AppEntry from './AppEntry'

const harness = vi.hoisted(() => {
  let release!: () => void
  return {
    quoteImport: new Promise<void>(resolve => { release = resolve }),
    releaseQuote: () => release(),
    account: { signedIn: false, loaded: true, status: 'idle', userId: null, name: null, error: '', signIn: () => {}, retry: () => {} } as AccountSession,
    saved: {
      id: 'private-budget-A', createdAt: '2026-11-03T12:00:00Z', updatedAt: '2026-11-03T12:00:00Z',
      input: { intent: 'have_product', budgetMode: 'units' },
      result: { version: 1, quotedAt: '2026-11-03T12:00:00Z', analysis: { sourceUrl: 'manual://saved-A', product: { name: 'Private product A' }, customs: {} }, pipelineSummary: {}, purchasePlan: {}, conversation: [] },
    } as AnalysisHistoryItem,
  }
})

vi.mock('./auth/AccountSession', () => ({ useAccountSession: () => harness.account }))
vi.mock('./lib/motionPreference', () => ({ scrollWindowToTop: vi.fn() }))
vi.mock('./components/Landing', () => ({ default: ({ onStart }: { onStart: () => void }) => <main><h1>Inicio público</h1><button onClick={onStart}>Empezar</button></main> }))
vi.mock('./components/PersonalWorkspace', () => ({
  default: ({ onOpen, onContinue, onNewCalculation, hasDraft }: { onOpen: (item: AnalysisHistoryItem) => void; onContinue: () => void; onNewCalculation: () => void; hasDraft: boolean }) => <main className="personal-workspace"><h1>Mi panel</h1><div id="workspace-content">{hasDraft ? 'Hay un cálculo en curso' : 'Sin cálculo en curso'}</div><button onClick={() => onOpen(harness.saved)}>Consultar presupuesto anterior</button><button onClick={onContinue}>Retomar cálculo</button><button onClick={onNewCalculation}>Nuevo cálculo</button></main>,
}))
vi.mock('./App', async () => {
  await harness.quoteImport
  const React = await import('react')
  return { default: function Quote({ initialSavedQuote }: { active: boolean; initialSavedQuote: AnalysisHistoryItem | null }) {
    const [draft, setDraft] = React.useState('')
    return <section aria-label="Cotizador de prueba"><h1>Elegí cómo empezar</h1><output>{initialSavedQuote?.id ?? 'Compra nueva'}</output><label>Producto en curso<input value={draft} onChange={event => setDraft(event.target.value)} /></label></section>
  } }
})

let root: Root, container: HTMLDivElement
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
const delayedOpenTest = 'delivers a saved snapshot when the calculator has not loaded yet'
beforeEach(({ task }) => {
  // Keep individually filtered tests independent of the import-delay test.
  if (task.name !== delayedOpenTest) harness.releaseQuote()
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear(); sessionStorage.clear()
  history.replaceState(null, '', '/')
  harness.account = { signedIn: false, loaded: true, status: 'idle', userId: null, name: null, error: '', signIn: vi.fn(), retry: vi.fn() }
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks()
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose)
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

async function render() { await act(async () => root.render(<AppEntry />)) }
function button(text: string) { return [...container.querySelectorAll('button')].find(element => element.textContent?.includes(text))! }
function account(userId: string | null, loaded = true) {
  harness.account = { ...harness.account, loaded, signedIn: !!userId, userId, status: userId ? 'ready' : 'idle' }
}
async function hashNavigation(hash: string) {
  await act(async () => { history.pushState(history.state, '', hash); window.dispatchEvent(new PopStateEvent('popstate')) })
}
async function openPanel() { await act(async () => window.dispatchEvent(new Event('shippingapp:open-workspace'))) }
async function fillDraft(value: string) {
  const input = container.querySelector<HTMLInputElement>('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
function seedPrivateRecovery() {
  for (const key of ['analysis', 'pipeline', 'case-conversation', 'quote-result', 'pending-quote-save', 'operation-confirmation']) writeProductDraft(key, { productName: 'Private product A' })
  sessionStorage.setItem('shippingapp:pending-confirm:v1', JSON.stringify({ data: { name: 'Private product A' }, ts: Date.now() }))
}
function expectPrivateRecoveryCleared() {
  expect([...Array(sessionStorage.length)].map((_, index) => sessionStorage.key(index)).filter(key => key?.startsWith('shippingapp:product-draft:'))).toEqual([])
  expect(sessionStorage.getItem('shippingapp:pending-confirm:v1')).toBeNull()
}

// First quote import deliberately waits until after the open action. This proves
// the saved snapshot survives code loading, rather than relying on an event listener.
it(delayedOpenTest, async () => {
  account('user-A'); history.replaceState(null, '', '#mi-panel')
  await render()
  expect(container.textContent).toContain('Mi panel')
  await act(async () => button('Consultar presupuesto').click())
  expect(container.textContent).toContain('Cargando cotizador')
  expect(container.querySelector('[aria-label="Cotizador de prueba"]')).toBeNull()
  await act(async () => { harness.releaseQuote(); await harness.quoteImport })
  expect(container.querySelector('output')?.textContent).toBe('private-budget-A')
  expect(location.hash).toBe('#cotizador')
})

it('opens a clean direct calculator URL without a blank page', async () => {
  history.replaceState(null, '', '#cotizador')
  await render()
  expect(container.querySelector('h1')?.textContent).toBe('Elegí cómo empezar')
  expect(container.querySelector('output')?.textContent).toBe('Compra nueva')
})

it('keeps workspace section and Clerk navigation hashes on the user page', async () => {
  history.replaceState(null, '', '#mi-panel')
  await render()
  for (const hash of ['#workspace-content', '#/sign-in', '#/sign-up', '#/sign-in/factor-one']) {
    await hashNavigation(hash)
    expect(container.querySelector('.personal-workspace')).not.toBeNull()
    expect(container.querySelector('[aria-label="Cotizador de prueba"]')).toBeNull()
  }
})

it('retains the same in-progress calculation when visiting the personal page and returning', async () => {
  history.replaceState(null, '', '#cotizador')
  await render(); await fillDraft('Un producto todavía sin guardar')
  await openPanel()
  expect(container.querySelector('.quote-view')?.hasAttribute('hidden')).toBe(true)
  await act(async () => button('Retomar cálculo').click())
  expect(container.querySelector('input')?.value).toBe('Un producto todavía sin guardar')
  expect(container.querySelector('.quote-view')?.hasAttribute('hidden')).toBe(false)
})

it('preserves an anonymous draft while the user signs in to continue it', async () => {
  history.replaceState(null, '', '#cotizador')
  writeProductDraft('analysis', { productName: 'Mi producto anónimo' })
  const recovery = sessionStorage.getItem('shippingapp:product-draft:analysis')
  await render(); await fillDraft('Mi producto anónimo')
  account('user-A'); await render()
  expect(container.querySelector('input')?.value).toBe('Mi producto anónimo')
  expect(sessionStorage.getItem('shippingapp:product-draft:analysis')).toBe(recovery)
  expect(sessionStorage.getItem('shippingapp:quote-owner')).toBe('user-A')
  expect(location.hash).toBe('#cotizador')
})

for (const nextUser of [null, 'user-B']) {
  it(`removes private quote state and recovery when user A changes to ${nextUser ?? 'signed out'}`, async () => {
    account('user-A'); history.replaceState(null, '', '#mi-panel')
    await render(); await act(async () => button('Consultar presupuesto').click())
    await fillDraft('Private local note A'); seedPrivateRecovery()
    expect(sessionStorage.getItem('shippingapp:quote-owner')).toBe('user-A')
    account(nextUser); await render()
    expectPrivateRecoveryCleared()
    expect(sessionStorage.getItem('shippingapp:quote-owner')).toBeNull()
    expect(container.querySelector('[aria-label="Cotizador de prueba"]')).toBeNull()
    expect(container.textContent).not.toContain('private-budget-A')
    await act(async () => button('Retomar cálculo').click())
    expect(container.querySelector('input')?.value).toBe('')
    expect(container.querySelector('output')?.textContent).toBe('Compra nueva')
  })
}

it('blocks old private recovery across reload until the matching account is verified', async () => {
  history.replaceState(null, '', '#cotizador')
  sessionStorage.setItem('shippingapp:quote-owner', 'user-A'); seedPrivateRecovery()
  account(null, false)
  await render()
  expect(container.querySelector('[aria-label="Cotizador de prueba"]')).toBeNull()
  expect(container.textContent).toContain('Verificando la cuenta')
  account('user-B'); await render()
  expectPrivateRecoveryCleared()
  expect(sessionStorage.getItem('shippingapp:quote-owner')).toBeNull()
  expect(container.querySelector('[aria-label="Cotizador de prueba"]')).toBeNull()
  expect(location.hash).toBe('#mi-panel')
})

it('allows the original account to recover its own draft after a reload', async () => {
  history.replaceState(null, '', '#cotizador')
  sessionStorage.setItem('shippingapp:quote-owner', 'user-A'); seedPrivateRecovery()
  const recovery = sessionStorage.getItem('shippingapp:product-draft:analysis')
  account('user-A', false)
  await render()
  expect(container.querySelector('[aria-label="Cotizador de prueba"]')).toBeNull()
  account('user-A'); await render()
  expect(container.querySelector('[aria-label="Cotizador de prueba"]')).not.toBeNull()
  expect(sessionStorage.getItem('shippingapp:product-draft:analysis')).toBe(recovery)
  expect(sessionStorage.getItem('shippingapp:quote-owner')).toBe('user-A')
})

it('requires confirmation before replacing the calculation in progress with a saved one', async () => {
  account('user-A'); history.replaceState(null, '', '#mi-panel'); writeProductDraft('analysis', { productName: 'Trabajo sin guardar' })
  await render(); await fillDraft('Trabajo sin guardar')
  await act(async () => button('Consultar presupuesto').click())
  expect(container.querySelector('dialog')?.open).toBe(true)
  expect(container.querySelector('output')?.textContent).toBe('Compra nueva')
  await act(async () => button('Conservar mi cálculo').click())
  expect(container.querySelector('dialog')).toBeNull()
  expect(container.querySelector('input')?.value).toBe('Trabajo sin guardar')
  expect(sessionStorage.getItem('shippingapp:product-draft:analysis')).toContain('Trabajo sin guardar')
  await act(async () => button('Consultar presupuesto').click())
  await act(async () => button('Abrir presupuesto guardado').click())
  expect(container.querySelector('dialog')).toBeNull()
  expect(container.querySelector('output')?.textContent).toBe('private-budget-A')
  expect(container.querySelector('.quote-view')?.hasAttribute('hidden')).toBe(false)
})

it('discards an outstanding private snapshot confirmation when the account changes', async () => {
  account('user-A'); history.replaceState(null, '', '#mi-panel'); writeProductDraft('analysis', { productName: 'Trabajo A' })
  await render()
  await act(async () => button('Consultar presupuesto').click())
  expect(container.querySelector('dialog')?.open).toBe(true)
  account('user-B'); await render()
  expect(container.querySelector('dialog')).toBeNull()
  expect(container.textContent).not.toContain('private-budget-A')
})
