import { afterEach, expect, it, vi } from 'vitest'
import { readPublicAuthKey } from './publicAuthConfig'
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('uses the backend instance key even when the frontend build has no key', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"publishableKey":"pk_test_runtime"}')))
  expect(await readPublicAuthKey()).toBe('pk_test_runtime')
  expect(await readPublicAuthKey('pk_test_stale')).toBe('pk_test_runtime')
})
it('never treats a secret key as public configuration', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"publishableKey":"sk_test_private"}')))
  expect(await readPublicAuthKey()).toBeNull()
})
it('bounds a stalled response body and falls back to a valid build key', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })))
  const result = readPublicAuthKey('pk_test_build')
  await vi.advanceTimersByTimeAsync(8_000)
  expect(await result).toBe('pk_test_build')
})
