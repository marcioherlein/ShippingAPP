// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getSessionState, setSessionState } from '../lib/authSession'
import { apiFetch, setApiTokenProvider } from '../lib/apiClient'
const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => 'signed-token'), openSignIn: vi.fn() }))
vi.mock('@clerk/react', () => ({
  useAuth: () => auth, useClerk: () => ({ openSignIn: auth.openSignIn }),
  Show: () => null, SignInButton: () => null, SignUpButton: () => null, UserButton: () => null,
}))
import ClerkShell from './ClerkShell'
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear()
  setSessionState('loading')
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); setApiTokenProvider(null); setSessionState('unmanaged'); vi.unstubAllGlobals()
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
    expect(auth.openSignIn).not.toHaveBeenCalled()
  } finally { window.removeEventListener('shippingapp:auth-resolved', resumed) }
})
it('opens sign-in for a genuinely signed-out protected operation', async () => {
  auth.isSignedIn = false
  vi.stubGlobal('fetch', vi.fn())
  await act(async () => root.render(<ClerkShell><div>App</div></ClerkShell>))
  await expect(apiFetch('/api/opportunity-search', { method: 'POST' })).rejects.toMatchObject({ code: 'session_required' })
  expect(auth.openSignIn).toHaveBeenCalledTimes(1)
  expect(fetch).not.toHaveBeenCalled()
})
