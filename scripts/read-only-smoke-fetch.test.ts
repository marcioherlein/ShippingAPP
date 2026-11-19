import { afterEach, expect, it, vi } from 'vitest'
import { readOnlySmokeFetch } from './read-only-smoke-fetch.mjs'

const url = 'https://shipping.test/api/ncm-classify'
const init = { method: 'POST', body: JSON.stringify({ name: 'Notebook' }) }
const reset = (code = 'ECONNRESET') => new TypeError('fetch failed', { cause: Object.assign(new Error('connection lost'), { code }) })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('replays a read-only JSON request exactly once after a connection reset', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fetcher = vi.fn().mockRejectedValueOnce(reset()).mockResolvedValueOnce(Response.json({ code: '8471.30.12' }))
  const result = await readOnlySmokeFetch(fetcher, url, init)
  expect(JSON.parse(result.text)).toEqual({ code: '8471.30.12' })
  expect(fetcher).toHaveBeenCalledTimes(2)
  for (const call of fetcher.mock.calls) expect(call).toEqual([url, expect.objectContaining(init)])
  expect(console.warn).toHaveBeenCalledTimes(1)
})

it('does not keep retrying repeated socket failures', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fetcher = vi.fn().mockRejectedValue(reset('UND_ERR_SOCKET'))
  await expect(readOnlySmokeFetch(fetcher, url, init)).rejects.toThrow('fetch failed')
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it.each([429, 500, 503])('returns HTTP %s directly for the original gate to reject', async status => {
  const fetcher = vi.fn(async () => Response.json({ error: 'must fail the gate' }, { status }))
  expect((await readOnlySmokeFetch(fetcher, url, init)).response.status).toBe(status)
  expect(fetcher).toHaveBeenCalledTimes(1)
})

it('does not retry malformed JSON or unclassified programming errors', async () => {
  const fetcher = vi.fn(async () => new Response('not JSON'))
  expect((await readOnlySmokeFetch(fetcher, url, init)).text).toBe('not JSON')
  expect(fetcher).toHaveBeenCalledTimes(1)
  const broken = vi.fn().mockRejectedValue(new TypeError('invalid request input'))
  await expect(readOnlySmokeFetch(broken, url, init)).rejects.toThrow('invalid request input')
  expect(broken).toHaveBeenCalledTimes(1)
})

it('includes both attempts and their body reads in the original deadline', async () => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fetcher = vi.fn()
    .mockImplementationOnce(() => new Promise((_resolve, reject) => setTimeout(() => reject(reset()), 10)))
    .mockImplementationOnce(async (_input, options) => ({ text: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })) }))
  const result = readOnlySmokeFetch(fetcher, url, init, 25)
  const assertion = expect(result).rejects.toMatchObject({ name: 'TimeoutError' })
  await vi.advanceTimersByTimeAsync(25)
  await assertion
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('preserves caller cancellation without retrying', async () => {
  const controller = new AbortController()
  controller.abort()
  const fetcher = vi.fn()
  await expect(readOnlySmokeFetch(fetcher, url, { ...init, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetcher).not.toHaveBeenCalled()
})

it('recovers a reset during response-body consumption', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fetcher = vi.fn()
    .mockResolvedValueOnce({ text: async () => { throw reset('EPIPE') } })
    .mockResolvedValueOnce(Response.json({ status: 'candidate' }))
  expect(JSON.parse((await readOnlySmokeFetch(fetcher, url, init)).text).status).toBe('candidate')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
