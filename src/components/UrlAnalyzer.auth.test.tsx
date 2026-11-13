// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import UrlAnalyzer from './UrlAnalyzer'
import { setApiTokenProvider } from '../lib/apiClient'
import { setSessionState } from '../lib/authSession'
import { readOperation, saveOperation } from '../lib/pendingOperation'
import { clearProductDraft, readProductDraft, writeProductDraft } from '../lib/productDraft'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  sessionStorage.clear()
  setSessionState('unmanaged')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  setSessionState('unmanaged')
  setApiTokenProvider(null)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const supplierUrl = 'https://www.alibaba.com/product-detail/Moto_1600000000001.html'
function seedResults() {
  writeProductDraft('search', { draft: 'motocicleta eléctrica', lastSearch: 'motocicleta eléctrica', discovery: {
    status: 'live', query: 'moto', note: '', constraints: {}, results: [{ title: 'Moto eléctrica', url: supplierUrl }],
  } })
}
async function clickButton(label: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === label)
  expect(button).toBeTruthy()
  await act(async () => button!.click())
}
it('exits a stalled extraction immediately and ignores its late response after manual fallback', async () => {
  seedResults()
  let resolve!: (response: Response) => void
  let signal!: AbortSignal
  vi.stubGlobal('fetch', vi.fn((_url, init) => {
    signal = init.signal
    return new Promise<Response>(r => { resolve = r })
  }))
  const onAnalysis = vi.fn()
  const onManualFallback = vi.fn()
  await act(async () => root.render(<UrlAnalyzer onAnalysis={onAnalysis} onManualFallback={onManualFallback} deferCalculation />))
  await clickButton('Usar este producto')
  expect(container.textContent).toContain('2. Extracción del producto')
  await clickButton('Completar la ficha manualmente')
  expect(signal.aborted).toBe(true)
  expect(onManualFallback).toHaveBeenCalledWith(supplierUrl)
  expect(readOperation('search')?.status).toBe('failed')
  await act(async () => resolve(new Response(JSON.stringify({ sourceUrl: supplierUrl, product: { name: 'Moto', originCountry: 'China' } }))))
  expect(onAnalysis).not.toHaveBeenCalled()
  expect(container.textContent).not.toContain('límite de 30 segundos')
})
it('retries a direct publication after reload without repeating supplier search', async () => {
  writeProductDraft('search', { draft: supplierUrl, lastSearch: supplierUrl })
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Alibaba no responde' }), { status: 502 }))
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => root.render(<UrlAnalyzer onAnalysis={() => {}} deferCalculation />))
  await clickButton('Buscar')
  expect(readProductDraft<{ failedSourceUrl: string }>('search')?.failedSourceUrl).toBe(supplierUrl)
  await act(async () => root.unmount())
  root = createRoot(container)
  await act(async () => root.render(<UrlAnalyzer onAnalysis={() => {}} deferCalculation />))
  await clickButton('Reintentar lectura')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  for (const call of fetchMock.mock.calls) {
    expect(call[0]).toBe('/api/product-read')
    expect(JSON.parse(String(call[1]?.body)).url).toBe(supplierUrl)
  }
  expect(container.querySelector('input')?.value).toBe(supplierUrl)
})
it('continues with the selected listing at a bounded detail-read deadline', async () => {
  vi.useFakeTimers()
  seedResults()
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  const onAnalysis = vi.fn()
  await act(async () => root.render(<UrlAnalyzer onAnalysis={onAnalysis} deferCalculation />))
  await clickButton('Usar este producto')
  await act(async () => vi.advanceTimersByTimeAsync(12_001))
  expect(onAnalysis).toHaveBeenCalledTimes(1)
  expect(onAnalysis.mock.calls[0][0]).toMatchObject({ sourceUrl: supplierUrl, fetched: false, product: { name: 'Moto eléctrica', unitPriceUsd: null }, sourceRead: { mode: 'partial' } })
  expect(readOperation('search')?.status).toBe('complete')
  expect(container.textContent).not.toContain('Reintentar lectura')
})
it('recovers a failed selected-product detail read using the listing without repeating search or charging analysis', async () => {
  seedResults()
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Alibaba no responde' }), { status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
  const onAnalysis = vi.fn()
  await act(async () => root.render(<UrlAnalyzer onAnalysis={onAnalysis} deferCalculation />))
  await clickButton('Usar este producto')
  expect(onAnalysis).toHaveBeenCalledTimes(1)
  expect(onAnalysis.mock.calls[0][0]).toMatchObject({ sourceUrl: supplierUrl, fetched: false, product: { name: 'Moto eléctrica' } })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/product-read')
  expect(container.querySelector('[role=alert]')).toBeNull()
  expect(readOperation('search')?.status).toBe('complete')
})
it('preserves authentication failures instead of silently treating them as supplier failures', async () => {
  seedResults()
  setSessionState('signed_out')
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const onAnalysis = vi.fn()
  await act(async () => root.render(<UrlAnalyzer onAnalysis={onAnalysis} deferCalculation />))
  await clickButton('Usar este producto')
  expect(onAnalysis).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(readOperation('search')?.status).toBe('waiting_auth')
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Ingresá a tu cuenta')
  expect(container.querySelector('[role=alert] .auth-account-control')?.textContent).toContain('Ingresar')
})
it('does not treat a slow session verification as a supplier failure when the selected-read deadline expires', async () => {
  vi.useFakeTimers()
  seedResults()
  setSessionState('verifying')
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const onAnalysis = vi.fn()
  await act(async () => root.render(<UrlAnalyzer onAnalysis={onAnalysis} deferCalculation />))
  await clickButton('Usar este producto')
  await act(async () => vi.advanceTimersByTimeAsync(12_001))
  expect(onAnalysis).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(readOperation('search')?.status).toBe('waiting_auth')
  expect(container.querySelector('[role=alert]')?.textContent).toContain('verificando tu cuenta')
})
it('resumes the exact selected listing after authentication and still recovers unavailable details', async () => {
  seedResults()
  setSessionState('signed_out')
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Temporary supplier failure' }), { status: 503 }))
  vi.stubGlobal('fetch', fetchMock)
  const onAnalysis = vi.fn()
  await act(async () => root.render(<UrlAnalyzer onAnalysis={onAnalysis} deferCalculation />))
  await clickButton('Usar este producto')
  expect(readOperation<{ selectedItem: { title: string } }>('search')?.payload.selectedItem.title).toBe('Moto eléctrica')
  await act(async () => setSessionState('ready'))
  expect(onAnalysis).toHaveBeenCalledTimes(1)
  expect(onAnalysis.mock.calls[0][0].product.name).toBe('Moto eléctrica')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/product-read')
  expect(readOperation('search')?.status).toBe('complete')
})
const response = () => new Response(JSON.stringify({ status: 'live', results: [], constraints: {}, query: 'motorcycle', note: '' }))
it('recovers a pending search when server authentication finished before component mount', async () => {
  saveOperation('search', { id: 'op-reload-same-key', payload: { value: 'motocicleta eléctrica' }, status: 'waiting_auth' })
  setApiTokenProvider(async () => 'token')
  setSessionState('ready')
  const fetchMock = vi.fn(async () => response())
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => root.render(<UrlAnalyzer onAnalysis={() => {}} />))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('idempotency-key')).toBe('op-reload-same-key')
  expect(readOperation('search')?.status).toBe('complete')
  await act(async () => window.dispatchEvent(new CustomEvent('shippingapp:auth-resolved')))
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it('keeps the search pending while the server verifies identity, then resumes exactly once', async () => {
  saveOperation('search', { id: 'op-delayed-verification', payload: { value: 'paleta de pádel' }, status: 'waiting_auth' })
  setApiTokenProvider(async () => 'token')
  setSessionState('verifying')
  const fetchMock = vi.fn(async () => response())
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => root.render(<UrlAnalyzer onAnalysis={() => {}} />))
  expect(fetchMock).not.toHaveBeenCalled()
  await act(async () => setSessionState('ready'))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(readOperation('search')?.id).toBe('op-delayed-verification')
})
it('recovers the selected supplier URL instead of rerunning product discovery', async () => {
  const url = 'https://www.alibaba.com/product-detail/Electric-motorcycle_1600000000001.html'
  saveOperation('search', { id: 'op-selected-url', payload: { value: 'motocicleta eléctrica', selectedUrl: url, constraints: null }, status: 'waiting_auth' })
  setApiTokenProvider(async () => 'token')
  setSessionState('ready')
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sourceUrl: url, product: { name: 'Moto', category: '', originCountry: 'China' }, fetched: true })))
  vi.stubGlobal('fetch', fetchMock)
  const onAnalysis = vi.fn()
  await act(async () => root.render(<UrlAnalyzer onAnalysis={onAnalysis} />))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/product-read')
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).url).toBe(url)
  expect(onAnalysis).toHaveBeenCalledTimes(1)
})
it('does not restore a pending operation or product after the user resets the case', async () => {
  const url = 'https://www.alibaba.com/product-detail/Moto_1600000000001.html'
  saveOperation('search', { id: 'op-reset-late-response', payload: { value: url }, status: 'waiting_auth' })
  setApiTokenProvider(async () => 'token')
  setSessionState('ready')
  let resolve!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => { resolve = r })))
  const onAnalysis = vi.fn()
  await act(async () => root.render(<UrlAnalyzer onAnalysis={onAnalysis} />))
  clearProductDraft()
  await act(async () => resolve(new Response(JSON.stringify({ sourceUrl: url, product: { name: 'Moto', category: '', originCountry: 'China' } }))))
  expect(onAnalysis).not.toHaveBeenCalled()
  expect(readOperation('search')).toBeNull()
})
