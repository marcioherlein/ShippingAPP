// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import OwnedProductIntake from './OwnedProductIntake'
import { writeProductDraft } from '../lib/productDraft'
import { readOperation } from '../lib/pendingOperation'
import { readAlibabaProduct, type ProductAnalysis } from '../lib/productAnalysis'
import { createManualProductAnalysis } from '../lib/productConfirmation'
import { setSessionState } from '../lib/authSession'
import { setApiTokenProvider } from '../lib/apiClient'
import { getProcessingState } from '../lib/processingScreen'

const source = 'https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html?spm=a2700.prosearch.normal_offer.d_image.771b67afVPP1xD&priceId=e74649aeab9c4359b570d52c7a348432&priceId=e74649aeab9c4359b570d52c7a348432'
let root: Root, container: HTMLDivElement
const receive = vi.fn<(analysis: ProductAnalysis) => void>()
beforeEach(() => {
  Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  sessionStorage.clear()
  setApiTokenProvider(null)
  setSessionState('unmanaged')
  receive.mockClear()
  writeProductDraft('inline-product', { mode: 'link', link: source })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  sessionStorage.clear()
  setSessionState('unmanaged')
  setApiTokenProvider(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  expect(getProcessingState()).toBeNull()
})
async function mount() {
  await act(async () => root.render(<OwnedProductIntake entryMode="link" onStructuredData={() => {}}
    onAlibabaLink={async (url, signal) => { const analysis = await readAlibabaProduct(url, signal); if (!signal?.aborted) receive(analysis) }} />))
}
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent?.trim() === label)
  expect(button).toBeTruthy()
  await act(async () => button!.click())
}

it('releases the 30-second deadline with one error, one retry and the complete pasted link preserved across remount', async () => {
  vi.useFakeTimers()
  const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  await click('Leer producto')
  expect(getProcessingState()).not.toBeNull()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).url).toBe(source)
  await act(async () => vi.advanceTimersByTimeAsync(30_001))
  const alerts = container.querySelectorAll('[role=alert]')
  expect(alerts).toHaveLength(1)
  expect(alerts[0].textContent?.match(/manualmente/g)).toHaveLength(1)
  expect(alerts[0].textContent).toContain('30 segundos')
  expect(container.querySelector<HTMLInputElement>('input[type=url]')?.value).toBe(source)
  expect([...container.querySelectorAll('button')].filter(button => button.textContent?.trim() === 'Reintentar lectura')).toHaveLength(1)
  expect(receive).not.toHaveBeenCalled()
  expect(readOperation('entry-link')?.status).toBe('failed')
  expect(getProcessingState()).toBeNull()
  await act(async () => root.unmount())
  root = createRoot(container)
  await mount()
  expect(container.querySelector<HTMLInputElement>('input[type=url]')?.value).toBe(source)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('retries the original link and advances with real returned identity without a paid analysis request', async () => {
  const product = createManualProductAnalysis(source, 'Supplier verified basketball bladder production equipment')
  product.fetched = true
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'La publicación no respondió. Podés reintentar o completar la ficha manualmente.' }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(product)))
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  await click('Leer producto')
  expect(container.querySelector('[role=alert]')?.textContent?.match(/manualmente/g)).toHaveLength(1)
  await click('Reintentar lectura')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  for (const [url, init] of fetchMock.mock.calls) {
    expect(url).toBe('/api/product-read')
    expect(JSON.parse(init.body).url).toBe(source)
  }
  expect(receive).toHaveBeenCalledTimes(1)
  expect(receive.mock.calls[0][0].product.name).toBe(product.product.name)
  expect(container.querySelector('[role=alert]')).toBeNull()
  expect(readOperation('entry-link')?.status).toBe('complete')
  expect(getProcessingState()).toBeNull()
})

it('keeps auth errors distinct and resumes the same URL only after the account is ready', async () => {
  const product = createManualProductAnalysis(source, 'Supplier verified equipment')
  product.fetched = true
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'session_required' }), { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(product)))
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  await click('Leer producto')
  expect(container.querySelector('[role=alert]')?.textContent).toContain('Ingresá a tu cuenta')
  expect(container.querySelector('[role=alert]')?.textContent).not.toContain('manualmente')
  expect(container.querySelector('[role=alert] .auth-account-control')).toBeTruthy()
  expect(readOperation('entry-link')?.status).toBe('waiting_auth')
  expect(getProcessingState()).toBeNull()
  await act(async () => setSessionState('ready'))
  expect(receive).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(container.querySelector('[role=alert]')).toBeNull()
  expect(readOperation('entry-link')?.status).toBe('complete')
})
