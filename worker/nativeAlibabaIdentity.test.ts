import { expect, it, vi } from 'vitest'
import { productRead } from './entry'
import { resolveAlibabaSelfFirst } from './alibabaSelfFirst'
import { extractAlibabaNative } from './nativeAlibaba'

const source = 'https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html'
const emptyHtml = '<!doctype html><html><body>' + 'product supplier '.repeat(20) + '</body></html>'
const directOut = { status: 'unavailable' as const, source: 'GlobalShipping direct Alibaba' as const, facts: null, httpStatus: 403, warnings: [] }
const structuredOut = { status: 'unavailable' as const, source: 'Parse.bot' as const, facts: null, warnings: [] }

async function read(html: string, result: Record<string, unknown>, status = 200) {
  const quickAction = vi.fn(async (action: string) => action === 'content'
    ? new Response(html)
    : new Response(JSON.stringify({ result }), { status, headers: { 'content-type': 'application/json' } }))
  return productRead(new Request('https://shipping.test/api/product-read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: source }) }),
    { BROWSER: { quickAction } },
    (url, env, options) => resolveAlibabaSelfFirst(url, env, { ...options, directReader: async () => directOut, nativeReader: extractAlibabaNative, parsebotReader: async () => structuredOut }))
}

it('the customer route rejects native structured price/MOQ without an observed product title', async () => {
  const response = await read(emptyHtml, { moq: 1, unit_price: 2700, price_tiers: [{ min_quantity: 1, unit_price: 2700 }] })
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ code: 'supplier_read_unavailable' })
})

it('the customer route rejects rendered prices without a product title', async () => {
  const response = await read('<!doctype html><html><body>FOB Price: USD 2700 / set MOQ: 1 set ' + 'product supplier '.repeat(20) + '</body></html>', {}, 503)
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ code: 'supplier_read_unavailable' })
})

it('an actually observed title remains valid even if its words equal the URL slug', async () => {
  const title = 'Factory Manufacture Inner Bladder Basketball Making'
  const response = await read(emptyHtml, { title, moq: 1, unit_price: 2700, price_tiers: [{ min_quantity: 1, unit_price: 2700 }] })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ product: { name: title, moq: 1, unitPriceUsd: 2700 } })
})
