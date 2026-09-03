import { describe, expect, it, vi } from 'vitest'
import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'
import { resetFravegaLandingCacheForTests } from './fravegaLandingMarketProvider'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Exact-mode worst case: ML primary yields comparables but not a live benchmark, so the
// orchestrator walks the full fallback chain (ML predict+search+sale_price → 10 direct
// retailers → Google Shopping). This test PINS the total provider-fetch count so a future
// change (extra retailer, larger hydration limit) that inflates the per-request subrequest
// fan-out is caught. ShippingAPP runs on Workers Paid (Browser Rendering + Workers AI require
// it → 1000-subrequest ceiling), so this budget has ample headroom; the guard exists so the
// number can never silently drift back toward the free-tier 50 ceiling unnoticed.
describe('exact-mode Argentina market subrequest budget', () => {
  it('keeps the worst-case exact-mode provider fetch count bounded and well under the ceiling', async () => {
    resetFravegaLandingCacheForTests()
    const mlItems = Array.from({ length: 24 }, (_, i) => ({
      id: `MLA5${i + 1}`,
      title: `Apple iPhone 15 128GB ${i + 1}`,
      price: 1_000_000 + i * 1000,
      currency_id: 'ARS',
      condition: 'new',
      category_id: 'MLA1055',
      permalink: `https://articulo.mercadolibre.com.ar/MLA-5${i + 1}`,
      seller: { id: 3000 + i },
    }))
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('/domain_discovery/search')) return json([{ category_id: 'MLA1055', category_name: 'Celulares' }])
      // ML search returns many items so sale_price hydration runs at its cap...
      if (url.includes('/sites/MLA/search')) return json({ paging: { total: mlItems.length }, results: mlItems })
      // ...but every sale_price is unavailable, so ML never reaches the live floor and the
      // full retailer + Google fallback chain executes (true worst case).
      if (url.includes('/sale_price')) return json({ message: 'no sale price' }, 404)
      if (url.includes('api.mercadolibre.com')) return json({}, 404)
      // Every direct retailer and Google return nothing usable.
      if (url.includes('serpapi.com')) return json({ shopping_results: [] })
      return json({}, 404)
    })

    const result = await analyzeArgentinaMarketHybrid(
      'Apple iPhone 15 128GB',
      'Smartphone',
      { mercadoLibreAccessToken: 'tok', googleShoppingApiKey: 'serp', fetchImpl },
    )

    const total = fetchImpl.mock.calls.length
    // Exact mode must actually have been exercised (not functional).
    expect(result.matchMode).toBe('exact')
    // Bounded worst case with large headroom under the Workers Paid 1000-subrequest ceiling.
    expect(total).toBeLessThanOrEqual(80)
  })
})
