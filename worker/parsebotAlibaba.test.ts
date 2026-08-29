import { describe, expect, it, vi, afterEach } from 'vitest'
import { extractAlibabaWithParsebot } from './parsebotAlibaba'

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

// Schema-shaped regression fixture for the exact Alibaba watch that exposed the P0.
// Numeric logistics values are test fixtures for parser wiring, not assertions about the live listing.
const watchSample = {
  data: {
    moq: '5',
    title: 'Fully Automatic Mechanical Watches 42.5MM Green Dial Waterproof 100m Stainless Steel Wristwatch',
    hs_code: '910221',
    lead_time: [{ min_quantity: 5, max_quantity: 49, processing_days: 15 }],
    packaging: {
      package_dimensions: '12X8X4.7 cm',
      package_weight: '0.18 kg',
      selling_units: 'Single item',
    },
    unit_size: '12X8X4.7 cm',
    product_id: '1601666174891',
    price_tiers: [
      { min_quantity: 5, max_quantity: 49, unit_price: '$71.50', price_value: 71.5 },
    ],
    tariff_info: { tariff_tag: 'supplier-listed', tariff_details: 'HS 910221' },
    unit_volume: '0.000451',
    unit_weight: '0.18',
    category_path: ['Timepieces, Jewelry, Eyewear', 'Watches', 'Mechanical Watches'],
    quantity_unit: 'pieces',
    supplier_name: 'Watch Fixture Supplier Co., Ltd.',
    specifications: [
      { name: 'Place of Origin', value: 'Chongqing, China' },
      { name: 'Movement', value: 'Automatic Mechanical' },
      { name: 'Case Material', value: 'Stainless Steel' },
    ],
    supplier_badges: ['Trade Assurance', 'Verified Supplier'],
    supplier_country: 'CN',
    product_category_id: '100005062',
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

  it('consumes the new direct logistics/category schema for the exact mechanical-watch URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(watchSample), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await extractAlibabaWithParsebot(
      new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches-42-5MM_1601666174891.html?spm=test'),
      { PARSEBOT_API_KEY: 'test-key' },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('product_id=1601666174891')
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('expected ready')

    expect(result.facts.productId).toBe('1601666174891')
    expect(result.facts.name).toContain('Fully Automatic Mechanical Watches')
    expect(result.facts.category).toBe('Mechanical Watches')
    expect(result.facts.categoryPath).toEqual(['Timepieces, Jewelry, Eyewear', 'Watches', 'Mechanical Watches'])
    expect(result.facts.unitPriceUsd).toBe(71.5)
    expect(result.facts.moq).toBe(5)
    expect(result.facts.packedWeightKg).toBe(0.18)
    expect(result.facts.volumeCbm).toBe(0.000451)
    expect(result.facts.unitSize).toBe('12X8X4.7 cm')
    expect(result.facts.originCountry).toBe('Chongqing, China')
    expect(result.facts.supplierCountry).toBe('CN')
    expect(result.facts.hsCode).toBe('910221')
    expect(result.facts.quantityUnit).toBe('pieces')
    expect(result.facts.productCategoryId).toBe('100005062')
    expect(result.facts.description).toContain('Movement: Automatic Mechanical')
    expect(result.facts.description).toContain('Case Material: Stainless Steel')
  })

  it('does not substitute supplier registration country for product origin', async () => {
    const onlySupplierCountry = {
      data: {
        title: 'Mechanical wristwatch',
        product_id: '1601666174891',
        price_tiers: [{ min_quantity: 5, price_value: 71.5 }],
        supplier_country: 'CN',
      },
      status: 'success',
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(onlySupplierCountry), { status: 200 })))

    const result = await extractAlibabaWithParsebot(
      new URL('https://www.alibaba.com/product-detail/Fully-Automatic-Mechanical-Watches_1601666174891.html'),
      { PARSEBOT_API_KEY: 'test-key' },
    )

    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('expected ready')
    expect(result.facts.supplierCountry).toBe('CN')
    expect(result.facts.originCountry).toBeNull()
  })
})
