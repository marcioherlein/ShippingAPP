import { beforeEach, describe, expect, it, vi } from 'vitest'
import enrichWorker from './enrich'
import baseWorker, { benchmark, quantitiesFromMoq } from './index'
import { resetNcmIndexCacheForTests, type NcmSearchIndex } from './ncmRetrieval'
import { resetSimCacheForTests } from './simHydration'

const padelJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Carbon fiber padel racket EVA core',
  image: 'https://example.test/padel.jpg',
  offers: { price: '5.25', priceCurrency: 'USD' },
})

const padelAlibabaHtml = `<!doctype html>
<html>
  <head>
    <title>Carbon fiber padel racket</title>
    <meta property="og:title" content="Carbon fiber padel racket EVA core">
    <meta name="description" content="Professional padel racket, carbon fiber face, EVA foam core, 100 pieces minimum order, US $5.25 per piece.">
    <script type="application/ld+json">${padelJsonLd}</script>
  </head>
  <body>
    <main>
      Product detail page for carbon fiber padel racket. MOQ 100 pieces min order. Price US $5.25 per piece.
    </main>
  </body>
</html>`

function padelIndex(): NcmSearchIndex {
  const filler: Array<[string, string]> = Array.from({ length: 10000 }, (_, i) => {
    const chapter = String((i % 96) + 1).padStart(2, '0')
    return [`${chapter}99.${String(i % 99).padStart(2, '0')}.${String((i * 11) % 99).padStart(2, '0')}`, `Mercadería oficial de control ${i}`]
  })
  return {
    meta: {
      source: 'ARCA Arancel Integrado',
      sourceFile: 'nomenclador_14082026.txt',
      sourceDate: '2026-08-14',
      parserSchema: 2,
      indexSchema: 3,
      recordCount: 10001,
      tariffDataIncluded: false,
      simOpeningsIncluded: false,
      recordShape: '[ncmCode,label]',
    },
    records: [
      ['9506.59.00', 'Artículos y material para cultura física, gimnasia o demás deportes > Raquetas y similares > Las demás'],
      ...filler,
    ],
  }
}

const sim95 = {
  meta: {
    source: 'ARCA Arancel Integrado',
    sourceDate: '2026-08-14',
    simIndexSchema: 1,
    tariffDataIncluded: false,
    chapter: '95',
    recordCount: 1,
  },
  records: [[
    '9506.59.00',
    'Raquetas y similares > Las demás',
    [
      ['9506.59.00.100F', 'Raquetas de badminton, incluso sin cordaje'],
      ['9506.59.00.200L', 'Raquetas de squash, incluso sin cordaje'],
      ['9506.59.00.900Z', 'Las demás'],
    ],
  ]],
}

function envForNcm(aiOutputs: unknown[]) {
  let call = 0
  return {
    AI: { run: async () => ({ response: JSON.stringify(aiOutputs[call++] ?? {}) }) },
    ASSETS: {
      fetch: async (request: Request) => {
        const path = new URL(request.url).pathname
        if (path === '/data/ncm-index.json') {
          return new Response(JSON.stringify(padelIndex()), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (path === '/data/sim/95.json') {
          return new Response(JSON.stringify(sim95), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        return new Response('not found', { status: 404 })
      },
    },
  }
}

beforeEach(() => {
  resetNcmIndexCacheForTests()
  resetSimCacheForTests()
  vi.restoreAllMocks()
})

describe('business assignment golden cases', () => {
  it('assigns padel racket to official NCM/SIM without inventing a badminton or squash opening', async () => {
    const request = new Request('https://shippingapp.test/api/ncm-classify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Paleta de pádel de fibra de carbono',
        category: 'Padel racket',
        material: 'fibra de carbono / EVA',
        functionText: 'raqueta para jugar pádel',
        description: 'Padel racket for sports use, carbon fiber face, EVA foam core.',
      }),
    })

    const response = await enrichWorker.fetch(request, envForNcm([
      { searchTerms: ['raqueta pádel', 'raquetas y similares', 'artículos deportivos'], missingFacts: [] },
      { ranking: [{ code: '9506.59.00', reason: 'Raqueta deportiva no tenis de mesa.' }], confidence: 'high' },
      { ranking: [{ code: '9506.59.00.900Z', reason: 'Pádel no coincide con badminton ni squash.' }], confidence: 'high', missingFacts: [] },
    ]) as any)

    expect(response.status).toBe(200)
    const body: any = await response.json()
    expect(body.status).toBe('candidate')
    expect(body.code).toBe('9506.59.00')
    expect(body.sim.status).toBe('candidate')
    expect(body.sim.candidate.code).toBe('9506.59.00.900Z')
    expect(body.sim.confidence).toBe('low')
    expect(body.sim.alternatives.map((item: any) => item.code)).toContain('9506.59.00.100F')
    expect(body.sim.candidate.code).not.toBe('9506.59.00.100F')
    expect(body.sim.candidate.code).not.toBe('9506.59.00.200L')
  })

  it('keeps padel value assignment specific instead of falling back to a generic empty benchmark', () => {
    const value = benchmark('Padel racket')
    expect(value.key).toBe('padel_racket')
    expect(value.packedWeightKg).toBeGreaterThan(0)
    expect(value.volumeCbm).toBeGreaterThan(0)
    expect(value.marketPriceArs).toBeGreaterThan(0)
    expect(value.defaultMoq).toBeGreaterThan(0)
    expect(quantitiesFromMoq(value.defaultMoq)).toEqual([300, 450, 600, 900])
  })

  it('extracts and values a readable Alibaba padel listing without leaving economics empty', async () => {
    vi.stubGlobal('fetch', async () => new Response(padelAlibabaHtml, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }))

    let calls = 0
    const env = {
      AI: {
        run: async () => ({ response: JSON.stringify({
          name: 'Carbon fiber padel racket EVA core',
          category: 'Padel racket',
          unitPriceUsd: 5.25,
          moq: 100,
          weightKg: 0.58,
          originCountry: 'China',
        }) }),
      },
      ASSETS: { fetch: async () => new Response('not used') },
      BROWSER: { quickAction: async () => { calls += 1; return new Response('', { status: 204 }) } },
    }

    const response = await baseWorker.fetch(new Request('https://shippingapp.test/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.alibaba.com/product-detail/carbon-fiber-padel-racket.html' }),
    }), env as any)

    expect(response.status).toBe(200)
    const body: any = await response.json()
    expect(calls).toBe(0)
    expect(body.product.category).toBe('Padel racket')
    expect(body.product.unitPriceUsd).toBe(5.25)
    expect(body.product.moq).toBe(100)
    expect(body.product.packedWeightKg).toBe(0.58)
    expect(body.product.volumeCbm).toBe(0.006)
    expect(body.market.estimatedPriceArs).toBe(220000)
    expect(body.market.source).toBe('ShippingAPP category benchmark')
    expect(body.suggestedQuantities).toEqual([100, 150, 200, 300])
    expect(body.confidence.market).toBe('benchmark')
  })
})
