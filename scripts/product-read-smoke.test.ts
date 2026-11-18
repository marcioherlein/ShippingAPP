import { expect, it } from 'vitest'
import { verifyProductRead } from './smoke-production-product-read.mjs'

const fixture = () => ({ fetched: true, sourceUrl: 'https://www.alibaba.com/product-detail/Factory-Manufacture-Inner-Bladder-Basketball-Making_1601389995797.html',
  confidence: { productSource: 'parsebot' }, sourceRead: { mode: 'parsebot' }, sourceEvidence: { parsebotAlibaba: { productId: '1601389995797' } },
  product: { name: 'Factory Manufacture Inner Bladder Basketball Making Machine Single Grain Winding Machine', unitPriceUsd: 2700, moq: 1, volumeCbm: 0, packedWeightKg: 0 } })
const response = (body: unknown) => async () => Response.json(body)

it('accepts verified partial commerce without requiring absent freight measurements', async () => {
  expect(await verifyProductRead('https://shipping.test', response(fixture()))).toMatchObject({ status: 'passed', moq: 1, paidReservation: false })
})
it('accepts an original EUR offer without inventing a USD conversion', async () => {
  const data: any = fixture(); data.product.unitPriceUsd = null; data.product.supplierEvidence = { priceText: '€2,480.76', currency: 'EUR' }
  expect(await verifyProductRead('https://shipping.test', response(data))).toMatchObject({ status: 'passed', priceUsd: null, currency: 'EUR' })
})
it('rejects the former URL-only success and ambiguous volume', async () => {
  const data = fixture(); data.confidence.productSource = 'direct-provisional-url-title'; data.product.volumeCbm = 1015.3
  await expect(verifyProductRead('https://shipping.test', response(data))).rejects.toThrow('URL slug')
  data.confidence.productSource = 'parsebot'
  await expect(verifyProductRead('https://shipping.test', response(data))).rejects.toThrow('ambiguous-dimension')
})
it('rejects commerce accidentally recovered from a neighbouring product', async () => {
  const data = fixture(); data.sourceEvidence.parsebotAlibaba.productId = '1600000000001'
  await expect(verifyProductRead('https://shipping.test', response(data))).rejects.toThrow('exact requested product ID')
})
