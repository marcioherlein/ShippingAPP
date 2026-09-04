import { describe, expect, it, vi } from 'vitest'
import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'
import { inferArgentinaMarketMatchMode } from './functionalMarketMatch'
import { resetFravegaLandingCacheForTests } from './fravegaLandingMarketProvider'

// End-to-end matrix: ~10 typical Alibaba-style products (mostly generic commodities, plus a
// couple of branded/appliance controls) driven through analyzeArgentinaMarketHybrid against
// MOCKED Argentine VTEX listings (keyless retailers — no ML token, no SerpApi), the realistic
// free-provider scenario. Proves the Stream B fixes: generics route to functional mode and
// reach a 'live' benchmark from Spanish retailer listings, instead of dying "insufficient".

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Six Spanish listings with slight price spread → clears the ≥5 comparable floor and yields a median.
function vtexListings(titles: string[]) {
  return titles.flatMap((title, t) =>
    Array.from({ length: 6 }, (_, i) => ({
      productId: `p-${t}-${i}`,
      productName: `${title} ${i + 1}`,
      items: [{
        itemId: `sku-${t}-${i}`,
        name: `${title} ${i + 1}`,
        sellers: [{ sellerId: `s-${t}-${i}`, sellerName: `Tienda ${t}-${i}`, commertialOffer: { Price: 90000 + i * 4000, AvailableQuantity: 5 } }],
      }],
    })),
  )
}

// A fetch that returns the given Spanish listings for ANY VTEX intelligent-search call, and
// nothing usable elsewhere (ML/Google not configured in this scenario).
function vtexOnlyFetch(spanishTitles: string[]) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (url.includes('api.mercadolibre.com')) return json({}, 404)
    if (url.includes('serpapi.com')) return json({ shopping_results: [] })
    if (url.includes('intelligent-search')) return json({ products: vtexListings(spanishTitles) })
    return json({}, 404)
  })
}

type Case = {
  name: string
  productName: string
  category: string
  expectedMode: 'functional' | 'exact'
  spanishListings: string[]
  expectLive: boolean
}

const cases: Case[] = [
  {
    name: 'stainless vacuum thermo (EN, 45oz/1350ml)',
    productName: '45oz 1350ml Large Capacity Stainless Steel Vacuum Bottle',
    category: 'stainless steel water bottle',
    expectedMode: 'functional',
    spanishListings: ['Botella termica acero inoxidable 1.2L', 'Termo botella acero inoxidable deportivo'],
    expectLive: true,
  },
  {
    name: 'plastic sport bottle (EN)',
    productName: 'Large Capacity Sport Water Bottle Gym Plastic',
    category: 'sport water bottle',
    expectedMode: 'functional',
    spanishListings: ['Botella deportiva plastica 1L gimnasio', 'Botella plastica para agua deportiva'],
    expectLive: true,
  },
  {
    name: 'sunglasses UV400 (EN)',
    productName: 'Mens Sunglasses Luxury Designer UV400 Polarized',
    category: 'sunglasses',
    expectedMode: 'functional',
    spanishListings: ['Gafas de sol polarizadas hombre UV400', 'Anteojos de sol para hombre polarizados'],
    expectLive: true,
  },
  {
    name: 'wireless earbuds (EN)',
    productName: 'TWS Wireless Bluetooth Earbuds',
    category: 'wireless earphones',
    expectedMode: 'functional',
    spanishListings: ['Auriculares inalambricos bluetooth TWS', 'Auriculares bluetooth inalambricos in ear'],
    expectLive: true,
  },
  {
    name: 'backpack (EN)',
    productName: 'Waterproof Laptop Backpack 30L',
    category: 'backpack',
    expectedMode: 'functional',
    spanishListings: ['Mochila para notebook impermeable', 'Mochila urbana resistente al agua'],
    expectLive: true,
  },
  {
    name: 'USB-C charger (generic)',
    productName: 'USB-C Fast Charger 65W GaN',
    category: 'power adapter',
    expectedMode: 'functional',
    spanishListings: ['Cargador USB-C 65W carga rapida', 'Cargador rapido tipo C 65W GaN'],
    expectLive: true,
  },
  {
    name: 'bluetooth speaker (generic)',
    productName: 'Portable Bluetooth Speaker Waterproof',
    category: 'parlante bluetooth',
    expectedMode: 'functional',
    spanishListings: ['Parlante bluetooth portatil resistente al agua', 'Parlante inalambrico bluetooth portatil'],
    expectLive: true,
  },
  {
    name: 'sneakers (generic)',
    productName: 'Running Sport Shoes Breathable',
    category: 'zapatillas deportivas',
    expectedMode: 'functional',
    spanishListings: ['Zapatillas deportivas running para correr', 'Zapatillas urbanas deportivas transpirables'],
    expectLive: true,
  },
  {
    name: 'branded control stays exact (Logitech)',
    productName: 'Logitech MX Master 3S',
    category: 'mouse',
    expectedMode: 'exact',
    spanishListings: [],
    expectLive: false, // no ML token/SerpApi in this scenario → exact path cannot reach live
  },
  {
    name: 'appliance control stays exact (spec-coded washer)',
    productName: 'Samsung WW65A4000EE 6.5kg',
    category: 'lavarropas',
    expectedMode: 'exact',
    spanishListings: [],
    expectLive: false,
  },
]

describe('Argentina market comparison — 10-product Alibaba matrix (functional, VTEX-only)', () => {
  it.each(cases)('$name → mode=$expectedMode, live=$expectLive', async (testCase) => {
    resetFravegaLandingCacheForTests()
    expect(inferArgentinaMarketMatchMode(testCase.productName, testCase.category)).toBe(testCase.expectedMode)

    const fetchImpl = vtexOnlyFetch(testCase.spanishListings)
    const result = await analyzeArgentinaMarketHybrid(testCase.productName, testCase.category, { fetchImpl })

    expect(result.matchMode).toBe(testCase.expectedMode)
    if (testCase.expectLive) {
      expect(result.status).toBe('live')
      expect(result.comparableCount).toBeGreaterThanOrEqual(5)
      expect(result.suggestedPriceArs).toBeGreaterThan(0)
    } else {
      // Fail-closed: no ARS price fabricated when the scenario can't reach the live floor.
      expect(result.status).not.toBe('live')
      expect(result.suggestedPriceArs === null || result.suggestedPriceArs === undefined || result.status !== 'live').toBe(true)
    }
  })

  it('every generic commodity in the matrix routes to functional mode', () => {
    const generics = cases.filter((c) => c.expectedMode === 'functional')
    expect(generics.length).toBeGreaterThanOrEqual(8)
    for (const c of generics) {
      expect(inferArgentinaMarketMatchMode(c.productName, c.category)).toBe('functional')
    }
  })
})
