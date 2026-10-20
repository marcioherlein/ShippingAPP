// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getSessionState, setSessionState } from '../lib/authSession'
import { apiFetch, setApiTokenProvider } from '../lib/apiClient'
import AccountControls from './AccountControls'
import Landing from '../components/Landing'
const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => 'signed-token'), openSignIn: vi.fn() }))
vi.mock('@clerk/react', () => ({
  useAuth: () => auth, useClerk: () => ({ openSignIn: auth.openSignIn }),
  SignIn: () => <form aria-label="Clerk access"><input aria-label="Email" /></form>, UserButton: () => null,
}))
import ClerkShell from './ClerkShell'
let root: Root
let container: HTMLDivElement
const dialogMethods = ['showModal', 'close'] as const
const originalDialogMethods = dialogMethods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name))
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear()
  setSessionState('loading')
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); setApiTokenProvider(null); setSessionState('unmanaged'); vi.unstubAllGlobals()
  dialogMethods.forEach((name, index) => {
    const original = originalDialogMethods[index]
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  })
})
it('does not announce login completion until /api/me accepts the session', async () => {
  let resolve!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { resolve = r })))
  const resumed = vi.fn()
  window.addEventListener('shippingapp:auth-resolved', resumed)
  try {
    await act(async () => root.render(<ClerkShell><div>App</div></ClerkShell>))
    expect(getSessionState()).toBe('verifying')
    expect(resumed).not.toHaveBeenCalled()
    await act(async () => resolve(new Response('{"authenticated":true,"accountId":"db-user"}')))
    expect(getSessionState()).toBe('ready')
    expect(resumed).toHaveBeenCalledTimes(1)
  } finally { window.removeEventListener('shippingapp:auth-resolved', resumed) }
})
it('does not treat an HTTP 200 without an authenticated account as verified identity', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
  await act(async () => root.render(<ClerkShell><div>App</div></ClerkShell>))
  expect(getSessionState()).toBe('error')
})
it('keeps a signed-in API failure technical and never reopens the sign-in modal', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"code":"auth_origin_rejected"}', { status: 401 })))
  const resumed = vi.fn()
  window.addEventListener('shippingapp:auth-resolved', resumed)
  try {
    await act(async () => root.render(<ClerkShell><div>App</div></ClerkShell>))
    expect(getSessionState()).toBe('error')
    expect(resumed).not.toHaveBeenCalled()
    await act(async () => window.dispatchEvent(new CustomEvent('shippingapp:auth-required')))
    expect(container.querySelector('dialog')).toBeNull()
  } finally { window.removeEventListener('shippingapp:auth-resolved', resumed) }
})
it('opens sign-in for a genuinely signed-out protected operation', async () => {
  auth.isSignedIn = false
  vi.stubGlobal('fetch', vi.fn())
  await act(async () => root.render(<ClerkShell><div>App</div></ClerkShell>))
  await act(async () => {
    await expect(apiFetch('/api/opportunity-search', { method: 'POST' })).rejects.toMatchObject({ code: 'session_required' })
  })
  await act(async () => { await vi.dynamicImportSettled() }); expect(container.querySelector('dialog[open]')).not.toBeNull()
  expect(container.querySelector('form[aria-label="Clerk access"]')).not.toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
it('keeps landing login visible and queues the form when the Clerk SDK is not loaded', async () => {
  auth.isLoaded = false; auth.isSignedIn = false
  await act(async () => root.render(<ClerkShell><Landing onStart={vi.fn()} /></ClerkShell>))
  const login = [...container.querySelectorAll('button')].find(button => button.textContent === 'Ingresar')!
  expect(login).toBeDefined()
  await act(async () => login.click())
  await act(async () => { await vi.dynamicImportSettled() }); expect(container.querySelector('dialog[open]')).not.toBeNull()
  expect(container.querySelector('form')).toBeNull()
  auth.isLoaded = true
  await act(async () => root.render(<ClerkShell><Landing onStart={vi.fn()} /></ClerkShell>))
  expect(container.querySelector('form[aria-label="Clerk access"]')).not.toBeNull()
})
it('offers account access at a protected-step message, not only in the top bar', async () => {
  auth.isSignedIn = false
  await act(async () => root.render(<ClerkShell><section aria-label="blocked step"><AccountControls /></section></ClerkShell>))
  await act(async () => container.querySelector('button')!.click())
  await act(async () => { await vi.dynamicImportSettled() }); expect(container.querySelector('dialog[open]')).not.toBeNull()
})
it('offers visible reconnection outside the closed account menu and resumes once identity verifies', async () => {
  const fetcher = vi.fn(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetcher)
  const resumed = vi.fn(); window.addEventListener('shippingapp:auth-resolved', resumed)
  try {
    await act(async () => root.render(<ClerkShell><AccountControls /></ClerkShell>))
    const retry = [...container.querySelectorAll('button')].find(button => button.textContent === 'Reintentar conectar cuenta')!
    expect(retry).toBeDefined(); expect(retry.closest('details')).toBeNull()
    fetcher.mockImplementation(async () => new Response('{"authenticated":true,"accountId":"db-user"}'))
    await act(async () => retry.click())
    expect(getSessionState()).toBe('ready'); expect(resumed).toHaveBeenCalledTimes(1)
    expect(container.querySelector('dialog')).toBeNull()
  } finally { window.removeEventListener('shippingapp:auth-resolved', resumed) }
})
