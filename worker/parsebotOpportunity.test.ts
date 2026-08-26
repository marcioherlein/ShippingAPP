import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchAlibabaOpportunities } from './parsebotOpportunity'

const sample = {
  data: {
    products: [
      {
        title: '7-Inch Ultra-Thin 1024x600 TFT LCD Car Capacitive Touch Screen',
        image_urls: ['https://sc04.alicdn.com/kf/H78d2e944cd984fafbcae555c783b645fG.jpg'],
        product_id: '1601144593280',
        product_url: 'https://www.alibaba.com/product-detail/_1601144593280.html',
        moq: 'Min. order: 1 sets',
        price_display: '$76-78',
        price_tiers: [
          { unit_price: '$78', price_value: 78, max_quantity: 99, min_quantity: 1 },
          { unit_price: '$77', price_value: 77, max_quantity: 199, min_quantity: 100 },
        ],
        shipping_info: { unit_weight: '3.0', unit_size: '36X25.5X6' },
        supplier_name: 'Shenzhen Outdoor Special Display Equipment Co., Ltd.',
        supplier_years: '5 yrs',
        supplier_badges: ['Trade Assurance', 'Gold Supplier', 'Verified Supplier'],
        review_count: 1,
        review_score: '4.8',
      },
      {
        title: 'Generic LCD screen without data',
        product_id: '1600000000000',
        product_url: 'https://www.alibaba.com/product-detail/_1600000000000.html',
      },
    ],
    total_count: 2,
    total_pages: 1,
    current_page: 1,
  },
  status: 'success',
}

describe('Parse.bot opportunity search', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes and ranks search_products results with commercial facts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(sample), { status: 200 })))

    const result = await searchAlibabaOpportunities('7 inch 1024x600 ips rgb', { PARSEBOT_API_KEY: 'test-key' })

    expect(result.status).toBe('live')
    expect(result.mode).toBe('parsebot')
    expect(result.creditsEstimated).toBe(2)
    expect(result.results).toHaveLength(2)
    expect(result.results[0].title).toContain('7-Inch Ultra-Thin')
    expect(result.results[0].unitPriceUsd).toBe(78)
    expect(result.results[0].moq).toBe(1)
    expect(result.results[0].packedWeightKg).toBe(3)
    expect(result.results[0].volumeCbm).toBeCloseTo(0.005508, 6)
    expect(result.results[0].imageUrl).toContain('alicdn.com')
    expect(result.results[0].supplierBadges).toContain('Verified Supplier')
    expect(result.results[0].opportunityScore).toBeGreaterThan(result.results[1].opportunityScore)
  })
})
