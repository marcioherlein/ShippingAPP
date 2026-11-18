import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readAlibabaProduct } from './productAnalysis'
import { createManualProductAnalysis } from './productConfirmation'
import { setApiTokenProvider } from './apiClient'
import { setSessionState } from './authSession'

const source = 'https://www.alibaba.com/product-detail/Equipment_1601389995797.html'
beforeEach(() => { setApiTokenProvider(null); setSessionState('unmanaged') })
afterEach(() => { vi.unstubAllGlobals(); setApiTokenProvider(null); setSessionState('unmanaged') })

it('does not expose a JSON parser exception when a provider/proxy returns HTML', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })))
  await expect(readAlibabaProduct(source)).rejects.toThrow('No recibimos una ficha válida de la publicación')
})

it.each([{}, null, { product: null }, { product: {} }, { product: { name: '' } }, { product: { name: '  ' } }])('rejects a malformed success response instead of preparing an unidentified product: %j', async body => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)))
  await expect(readAlibabaProduct(source)).rejects.toThrow('no devolvió una identidad verificable')
})

it('preserves the worker recovery message exactly once', async () => {
  const message = 'Alibaba no permitió verificar esta publicación. Conservamos tu enlace; reintentá la lectura.'
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: message, code: 'supplier_read_unavailable', retryable: true }, { status: 503 })))
  await expect(readAlibabaProduct(source)).rejects.toThrow(message)
})

it('accepts partial supplier evidence without requiring price, freight or a tariff position', async () => {
  const partial = createManualProductAnalysis(source, 'Supplier verified production equipment')
  partial.fetched = true
  partial.sourceRead = { mode: 'partial', quality: 30, directStatus: 200, browserAttempted: false, browserMsUsed: null, reason: 'Title verified; offer and packaging not available.' }
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(partial)))
  await expect(readAlibabaProduct(source)).resolves.toEqual(partial)
})
