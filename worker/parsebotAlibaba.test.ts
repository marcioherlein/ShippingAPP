import { describe, expect, it, vi, afterEach } from 'vitest'
import { extractAlibabaWithParsebot, normalizeParsebotAlibabaFacts } from './parsebotAlibaba'

const sample = {
  data: {
    moq: 'Min. order: 1 sets',
    title: '7-Inch Ultra-Thin 1024x600 TFT LCD Car Capacitive Touch Screen LED Backlight HD 1000Nits LCD Monitor Shopping Malls',
    image_urls: [
      'https://sc04.alicdn.com/kf/H78d2e944cd984fafbcae555c783b645fG.jpg',
    ],
    product_id: '1601144593280',
    price_tiers: [
      { unit_price: '$78', price_value: 78, max_quantity: 99, min_quantity: 1 },
      { unit_price: '$77', price_value: 77, max_quantity: 199, min_quantity: 100 },
      { unit_price: '$76', price_value: 76, max_quantity: -1, min_quantity: 200 },
    ],
    product_url: 'https://www.alibaba.com/product-detail/_1601144593280.html',
    review_count: 1,
    review_score: '',
    price_display: '$76-78',
    shipping_info: {
      lead_time: '',
      unit_size: '36X25.5X6',
      unit_weight: '3.0',
    },
    supplier_name: 'Shenzhen Outdoor Special Display Equipment Co., Ltd.',
    specifications: [
      { name: 'application', value: 'Indoor' },
      { name: 'aspect ratio', value: '9:16' },
      { name: 'Screen Type', value: 'Capacitive' },
      { name: 'Place of Origin', value: 'Guangdong, China' },
    ],
    supplier_years: '5 yrs',
    supplier_badges: ['Trade Assurance', 'Gold Supplier', 'Verified Supplier'],
  },
  status: 'success',
}

describe('Parse.bot Alibaba extraction', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes price tiers, MOQ, shipping size, weight, images, supplier and origin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })))

    const result = await extractAlibabaWithParsebot(
      new URL('https://www.alibaba.com/product-detail/_1601144593280.html'),
      { PARSEBOT_API_KEY: 'test-key' },
    )

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('expected ready')
    expect(result.facts.name).toContain('7-Inch Ultra-Thin')
    expect(result.facts.unitPriceUsd).toBe(78)
    expect(result.facts.moq).toBe(1)
    expect(result.facts.packedWeightKg).toBe(3)
    expect(result.facts.volumeCbm).toBeCloseTo(0.005508, 6)
    expect(result.facts.imageUrl).toBe('https://sc04.alicdn.com/kf/H78d2e944cd984fafbcae555c783b645fG.jpg')
    expect(result.facts.supplier).toBe('Shenzhen Outdoor Special Display Equipment Co., Ltd.')
    expect(result.facts.originCountry).toBe('Guangdong, China')
    expect(result.facts.description).toContain('Screen Type: Capacitive')
  })

  it('extracts product identity from alternate Alibaba title and category keys', () => {
    const facts = normalizeParsebotAlibabaFacts({
      data: {
        product: {
          product_title: '2026 OEM ODM 65W GaN PD3.0 USB C Fast Wall Charger EU Plug',
          category_name: 'Mobile Phone Chargers',
          short_description: 'Compact gallium nitride wall power adapter for smartphones and laptops.',
          attributes: [
            { name: 'Product Type', value: 'Wall Charger' },
            { name: 'Material', value: 'PC fireproof shell' },
          ],
        },
      },
    })
    expect(facts.name).toContain('65W GaN')
    expect(facts.category).toBe('Mobile Phone Chargers')
    expect(facts.description).toContain('wall power adapter')
    expect(facts.description).toContain('Product Type: Wall Charger')
  })

  it('uses taxonomy breadcrumbs as product type when a clean category field is absent', () => {
    const facts = normalizeParsebotAlibabaFacts({
      item_title: 'Factory Direct 18K Carbon Fiber EVA Padel Racquet Professional',
      breadcrumbs: [
        { name: 'Sports & Entertainment' },
        { name: 'Racquet Sports' },
        { name: 'Padel Rackets' },
      ],
      specifications: [
        { name: 'Frame Material', value: 'Carbon Fiber' },
        { name: 'Place of Origin', value: 'Zhejiang, China' },
      ],
    })
    expect(facts.name).toContain('18K Carbon Fiber')
    expect(facts.category).toBe('Padel Rackets')
    expect(facts.originCountry).toBe('Zhejiang, China')
    expect(facts.description).toContain('Frame Material: Carbon Fiber')
  })

  it('extracts item type from specifications when taxonomy is absent', () => {
    const facts = normalizeParsebotAlibabaFacts({
      subject: 'New Arrival Smart Android 5G Dual SIM Mobile Phone 8GB 256GB',
      specs: [
        { name: 'Product Type', value: 'Smartphone' },
        { name: 'Operating System', value: 'Android' },
      ],
    })
    expect(facts.name).toContain('Android 5G')
    expect(facts.category).toBe('Smartphone')
    expect(facts.description).toContain('Operating System: Android')
  })
})
