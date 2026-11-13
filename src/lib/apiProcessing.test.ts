import { afterEach, expect, it, vi } from 'vitest'
import { apiFetch, setApiTokenProvider } from './apiClient'
import { setSessionState } from './authSession'
import { getProcessingState } from './processingScreen'

afterEach(() => {
  setSessionState('unmanaged'); setApiTokenProvider(null)
  vi.useRealTimers(); vi.unstubAllGlobals()
  expect(getProcessingState()).toBeNull()
})

it('releases the processing screen after a request deadline even if fetch ignores abort', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
  const request = apiFetch('/api/product-read', { method: 'POST' })
  const rejected = expect(request).rejects.toThrow('30 segundos')
  expect(getProcessingState()?.title).toBe('Leyendo tu producto')
  await vi.advanceTimersByTimeAsync(30_000)
  await rejected
  expect(getProcessingState()).toBeNull()
})

it('releases the screen on authentication rejection and permits sign-in recovery', async () => {
  setSessionState('signed_out')
  await expect(apiFetch('/api/opportunity-search', { method: 'POST' })).rejects.toMatchObject({ code: 'session_required' })
  expect(getProcessingState()).toBeNull()
})

it('releases the screen after cancellation without waiting for the transport', async () => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
  const controller = new AbortController()
  const request = apiFetch('/api/ncm-classify', { method: 'POST', signal: controller.signal })
  const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' })
  expect(getProcessingState()).not.toBeNull()
  controller.abort()
  await rejected
})

it('does not block the UI for background usage reads', async () => {
  let release!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
  const request = apiFetch('/api/usage')
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  expect(getProcessingState()).toBeNull()
  release(new Response('{}'))
  await request
})
