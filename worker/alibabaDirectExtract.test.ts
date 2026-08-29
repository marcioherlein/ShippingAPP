import { describe, expect, it } from 'vitest'
import { extractAlibabaDirectFacts } from './alibabaDirectExtract'

const watchUrl = new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html')

function page(body: string, head = '') {
  return `<!doctype html><html><head>${head}</head><body>${body}${' product detail supplier wholesale '.repeat(30)}</body></html>`
}

describe('Alibaba deterministic direct extractor', () => {
  it('extracts the mechanical-watch identity and logistics from embedded product JSON', () => {
    const html = page(`<script>window.__INITIAL_STATE__ = ${JSON.stringify({
      product: {
        productId: '1601666174891',
        productTitle: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
        categoryPath: ['Timepieces, Jewelry, Eyewear', 'Watches', 'Mechanical Watches'],
        productType: 'Mechanical Watches',
        priceValue: '71.50',
        moq: 5,
        unitWeight: '0.18 kg',
        unitSize: '12 x 10 x 8 cm',
        hsCode: '910221',
        supplierName: 'Chongqing Watch Co., Ltd.',
        specifications: [
          { name: 'Place of Origin', value: 'China' },
          { name: 'Material', value: 'Stainless Steel' },
          { name: 'Movement', value: 'Automatic Mechanical' },
          { name: 'Product Type', value: 'Wristwatch' },
        ],
      },
    })};</script>`)
    const facts = extractAlibabaDirectFacts(html, watchUrl)
    expect(facts.name).toContain('Fully Automatic Mechanical Watches')
    expect(facts.category).toBe('Mechanical Watches')
    expect(facts.categoryPath.at(-1)).toBe('Mechanical Watches')
    expect(facts.unitPriceUsd).toBe(71.5)
    expect(facts.moq).toBe(5)
    expect(facts.packedWeightKg).toBe(0.18)
    expect(facts.volumeCbm).toBe(0.00096)
    expect(facts.originCountry).toBe('China')
    expect(facts.material).toBe('Stainless Steel')
    expect(facts.functionText).toBe('Wristwatch')
    expect(facts.hsCode).toBe('910221')
    expect(facts.productId).toBe('1601666174891')
  })

  it('uses JSON-LD for name, price and image without AI', () => {
    const html = page('', `<meta property="og:title" content="Backup title"><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Carbon Fiber Tennis Racket', image: ['https://img.test/racket.jpg'], offers: { price: '22.40' },
    })}</script>`)
    const facts = extractAlibabaDirectFacts(html)
    expect(facts.name).toBe('Carbon Fiber Tennis Racket')
    expect(facts.unitPriceUsd).toBe(22.4)
    expect(facts.imageUrl).toBe('https://img.test/racket.jpg')
  })

  it('extracts MOQ from anchored visible text when structured MOQ is absent', () => {
    const html = page('<div>Minimum Order Quantity: 120 pieces</div>', '<meta property="og:title" content="USB C Charger 65W">')
    expect(extractAlibabaDirectFacts(html).moq).toBe(120)
  })

  it('converts grams to kilograms', () => {
    const html = page(`<script type="application/json">${JSON.stringify({ productId: '12345678', productTitle: 'Wireless Earbuds', unitWeight: '265 g' })}</script>`)
    expect(extractAlibabaDirectFacts(html).packedWeightKg).toBe(0.265)
  })

  it('converts pounds to kilograms', () => {
    const html = page(`<script type="application/json">${JSON.stringify({ productId: '12345679', productTitle: 'Power Tool', packageWeight: '2.2 lbs' })}</script>`)
    expect(extractAlibabaDirectFacts(html).packedWeightKg).toBeCloseTo(0.997903, 6)
  })

  it('computes CBM from millimetre dimensions', () => {
    const html = page(`<script type="application/json">${JSON.stringify({ productId: '12345680', productTitle: 'LED Lamp', packageDimensions: '300 x 200 x 100 mm' })}</script>`)
    expect(extractAlibabaDirectFacts(html).volumeCbm).toBe(0.006)
  })

  it('reads explicit CBM before dimensions', () => {
    const html = page(`<script type="application/json">${JSON.stringify({ productId: '12345681', productTitle: 'Office Chair', unitVolume: '0.14 m3', packageDimensions: '1 x 1 x 1 m' })}</script>`)
    expect(extractAlibabaDirectFacts(html).volumeCbm).toBe(0.14)
  })

  it('extracts origin and material only from labelled product specs', () => {
    const html = page(`<script>window.detailData = ${JSON.stringify({
      productId: '12345682', productTitle: 'Stainless Steel Bottle', attributes: [
        { attrName: 'Place of Origin', attrValue: 'Zhejiang, China' },
        { attrName: 'Material', attrValue: '304 Stainless Steel' },
      ],
    })};</script>`)
    const facts = extractAlibabaDirectFacts(html)
    expect(facts.originCountry).toBe('Zhejiang, China')
    expect(facts.material).toBe('304 Stainless Steel')
  })

  it('does not confuse supplier country or unrelated numbers with product origin, price or MOQ', () => {
    const html = page(`<script type="application/json">${JSON.stringify({
      productId: '12345683', productTitle: 'Generic Industrial Component', supplierCountry: 'CN', supplierYears: 15, responseRate: 98,
    })}</script>`)
    const facts = extractAlibabaDirectFacts(html)
    expect(facts.originCountry).toBeNull()
    expect(facts.unitPriceUsd).toBeNull()
    expect(facts.moq).toBeNull()
  })

  it('falls back to the URL for product id but never invents commercial facts', () => {
    const html = page('', '<meta property="og:title" content="Mechanical Wristwatch Wholesale">')
    const facts = extractAlibabaDirectFacts(html, watchUrl)
    expect(facts.name).toBe('Mechanical Wristwatch Wholesale')
    expect(facts.productId).toBe('1601666174891')
    expect(facts.unitPriceUsd).toBeNull()
    expect(facts.packedWeightKg).toBeNull()
    expect(facts.volumeCbm).toBeNull()
  })
})
