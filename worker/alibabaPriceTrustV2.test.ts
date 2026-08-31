import { describe, expect, it } from 'vitest'
import { extractAlibabaDirectFacts } from './alibabaDirectExtract'

function page(body: string, head = '') {
  return `<!doctype html><html><head>${head}</head><body>${body}${' product detail supplier wholesale '.repeat(30)}</body></html>`
}

describe('Alibaba FOB price trust V2 adversaries', () => {
  it.each([
    'Coupon Price: USD 1',
    'New Buyer Coupon Price: US $1.00',
    'Sample Price: $1',
    'Promotional Price: USD 1',
    'Freight Price: USD 1',
    'Shipping Price: $1',
  ])('never promotes non-merchandise amount %s to unit FOB', (amount) => {
    const html = page(`<div>${amount}</div>`, '<meta property="og:title" content="Mechanical Wristwatch Wholesale">')
    expect(extractAlibabaDirectFacts(html).unitPriceUsd).toBeNull()
  })

  it('accepts an explicitly labelled FOB price', () => {
    const html = page('<div>FOB Price: USD 71.50</div>', '<meta property="og:title" content="Mechanical Wristwatch Wholesale">')
    expect(extractAlibabaDirectFacts(html).unitPriceUsd).toBe(71.5)
  })

  it('accepts an explicitly quantity-linked merchandise price', () => {
    const html = page('<div>US $22.40 / piece</div>', '<meta property="og:title" content="Carbon Fiber Tennis Racket">')
    expect(extractAlibabaDirectFacts(html).unitPriceUsd).toBe(22.4)
  })

  it('accepts JSON-LD Product offer price but ignores unrelated generic price objects', () => {
    const unrelated = `<script type="application/json">${JSON.stringify({ banner: { price: 1, label: 'new buyer coupon' } })}</script>`
    const product = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Carbon Fiber Tennis Racket', offers: { '@type': 'Offer', price: '22.40' } })}</script>`
    expect(extractAlibabaDirectFacts(page(unrelated + product)).unitPriceUsd).toBe(22.4)
  })

  it('accepts product-state price-specific keys but not a generic price field', () => {
    const trusted = page(`<script>window.__INITIAL_STATE__ = ${JSON.stringify({ product: { productId: '1601234567890', productTitle: 'USB C Charger', priceValue: '12.75' } })};</script>`)
    const generic = page(`<script>window.__INITIAL_STATE__ = ${JSON.stringify({ product: { productId: '1601234567890', productTitle: 'USB C Charger', price: '1' } })};</script>`)
    expect(extractAlibabaDirectFacts(trusted).unitPriceUsd).toBe(12.75)
    expect(extractAlibabaDirectFacts(generic).unitPriceUsd).toBeNull()
  })
})
