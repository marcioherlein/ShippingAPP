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
it('retries the selected publication after reload without repeating supplier search', async () => {
  seedResults()
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Alibaba no responde' }), { status: 502 }))
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => root.render(<UrlAnalyzer onAnalysis={() => {}} deferCalculation />))
  await clickButton('Usar este producto')
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
  expect(container.textContent).toContain('Moto eléctrica')
  expect(container.querySelector('input')?.value).toBe('motocicleta eléctrica')
})
it('stops a stalled extraction at the deadline while keeping the query and results', async () => {
  vi.useFakeTimers()
  seedResults()
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  await act(async () => root.render(<UrlAnalyzer onAnalysis={() => {}} deferCalculation />))
  await clickButton('Usar este producto')
  await act(async () => vi.advanceTimersByTimeAsync(30_001))
  expect(container.textContent).toContain('30 segundos')
  expect(container.textContent).toContain('Reintentar lectura')
  expect(container.textContent).toContain('Moto eléctrica')
  expect(container.querySelector('input')?.value).toBe('motocicleta eléctrica')
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
