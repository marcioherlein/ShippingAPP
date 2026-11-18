import { afterEach, expect, it, vi } from 'vitest'
import { extractAlibabaDirectHttp } from './alibabaDirectProvider'
import { extractAlibabaNative } from './nativeAlibaba'
import type { BrowserRun } from './alibabaSource'

const url = new URL('https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html')
const title = 'Factory Manufacture Inner Bladder Basketball Making Machine'
function html(extra: Record<string, unknown> = {}) {
  return `<!doctype html><html><head><meta property="og:title" content="${title}"></head><body><script type="application/json">${JSON.stringify({ productTitle: title, categoryName: 'Sports Ball Production Machinery', unitPrice: 12000, ...extra })}</script>${'product supplier '.repeat(10)}</body></html>`
}
afterEach(() => vi.useRealTimers())

it('does not spend more provider requests looking for unlisted logistics once the commercial ficha is read', async () => {
  const fetchImpl = vi.fn(async () => new Response(html({ moq: 1 })))
  const publicReader = vi.fn()
  const highReader = vi.fn()
  const result = await extractAlibabaDirectHttp(url, fetchImpl, publicReader, highReader)
  expect(result.status).toBe('partial')
  if (result.status === 'unavailable') throw new Error('Commercial ficha must be usable')
  expect(result.facts).toMatchObject({ name: title, unitPriceUsd: 12000, moq: 1, volumeCbm: null, packedWeightKg: null })
  expect(publicReader).not.toHaveBeenCalled()
  expect(highReader).not.toHaveBeenCalled()
})

it('bounds a stalled response body as well as its headers and aborts the transport', async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init!.signal!
    return new Response(new ReadableStream({ start() { /* source never finishes */ } }))
  })
  const request = extractAlibabaDirectHttp(url, fetchImpl)
  const assertion = expect(request).resolves.toMatchObject({ status: 'unavailable' })
  await vi.advanceTimersByTimeAsync(4000)
  await assertion
  expect(signal.aborted).toBe(true)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

it('keeps actual direct facts when corroboration never responds and does not start another stage after the deadline', async () => {
  vi.useFakeTimers()
  const publicReader = vi.fn(() => new Promise<never>(() => {}))
  const highReader = vi.fn()
  const request = extractAlibabaDirectHttp(url, async () => new Response(html()), publicReader, highReader)
  const assertion = expect(request).resolves.toMatchObject({ status: 'partial', facts: { name: title, unitPriceUsd: 12000, moq: null } })
  await vi.advanceTimersByTimeAsync(10_000)
  await assertion
  expect(highReader).not.toHaveBeenCalled()
})

it('returns the rendered commercial facts without a structured call merely to fill absent shipping facts', async () => {
  const quickAction = vi.fn(async (action: string, input: any) => {
    expect(action).toBe('content')
    expect(input.gotoOptions).toMatchObject({ waitUntil: 'domcontentloaded', timeout: 8000 })
    return new Response(html({ moq: 1 }))
  })
  const result = await extractAlibabaNative(url, { quickAction })
  expect(result).toMatchObject({ status: 'ready', facts: { name: title, unitPriceUsd: 12000, moq: 1, packedWeightKg: null, volumeCbm: null } })
  expect(quickAction).toHaveBeenCalledTimes(1)
})

it('preserves rendered facts when structured extraction hangs, even if the binding ignores abort', async () => {
  vi.useFakeTimers()
  const quickAction = vi.fn(async (action: string) => action === 'content' ? new Response(html()) : new Promise<Response>(() => {}))
  const request = extractAlibabaNative(url, { quickAction } as BrowserRun)
  const assertion = expect(request).resolves.toMatchObject({ status: 'ready', facts: { name: title, unitPriceUsd: 12000 } })
  await vi.advanceTimersByTimeAsync(12_000)
  await assertion
  expect(quickAction).toHaveBeenCalledTimes(2)
})

it('honors an external orchestration abort and starts no subsequent browser requests', async () => {
  const controller = new AbortController()
  const quickAction = vi.fn(async () => new Promise<Response>(() => {}))
  const request = extractAlibabaNative(url, { quickAction }, { signal: controller.signal, timeoutMs: 12_000 })
  const assertion = expect(request).resolves.toMatchObject({ status: 'unavailable' })
  await Promise.resolve()
  controller.abort(new DOMException('Caller cancelled', 'AbortError'))
  await assertion
  expect(quickAction).toHaveBeenCalledTimes(1)
})
