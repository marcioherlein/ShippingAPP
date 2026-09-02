const CANDIDATES = [
  { id: 'easy', name: 'Easy', baseUrl: 'https://www.easy.com.ar', queries: ['taladro', 'amoladora', 'aspiradora'] },
  { id: 'coppel', name: 'Coppel', baseUrl: 'https://www.coppel.com.ar', queries: ['smart tv', 'celular', 'licuadora'] },
  { id: 'carrefour', name: 'Carrefour', baseUrl: 'https://www.carrefour.com.ar', queries: ['smart tv', 'auriculares', 'microondas'] },
  { id: 'jumbo', name: 'Jumbo', baseUrl: 'https://www.jumbo.com.ar', queries: ['electrodomesticos', 'licuadora', 'pava electrica'] },
  { id: 'sportline', name: 'Sportline', baseUrl: 'https://www.sportline.com.ar', queries: ['paleta', 'raqueta', 'mancuerna'] },
]

const timeoutMs = Number(process.env.SOURCE_AUDIT_TIMEOUT_MS || 7000)

function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}

function offerOf(seller) {
  return seller?.commertialOffer || seller?.commercialOffer || null
}

function pricedProducts(products) {
  const rows = []
  for (const product of products) {
    for (const item of product?.items || []) {
      for (const seller of item?.sellers || []) {
        const offer = offerOf(seller)
        const price = Number(offer?.Price)
        if (!Number.isFinite(price) || price <= 0) continue
        if (typeof offer?.AvailableQuantity === 'number' && offer.AvailableQuantity <= 0) continue
        rows.push({
          title: product?.productName || item?.nameComplete || item?.name || null,
          itemId: item?.itemId || product?.productId || null,
          price,
        })
      }
    }
  }
  return rows
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'ShippingAPP source audit/1.0 (public storefront catalog only)',
      },
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') || ''
    let data = null
    if (contentType.includes('json')) {
      try { data = await response.json() } catch { data = null }
    }
    return { status: response.status, ok: response.ok, data, contentType }
  } catch (error) {
    return { status: null, ok: false, data: null, contentType: '', error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

async function probe(retailer, query) {
  const intelligentUrl = `${retailer.baseUrl}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${new URLSearchParams({ query, count: '8', page: '1' })}`
  const legacyUrl = `${retailer.baseUrl}/api/catalog_system/pub/products/search/${encodeURIComponent(query)}`

  const intelligent = await fetchJson(intelligentUrl)
  const intelligentProducts = productsOf(intelligent.data)
  const intelligentPriced = pricedProducts(intelligentProducts)
  if (intelligent.ok && (intelligentProducts.length || intelligentPriced.length)) {
    return {
      query,
      mode: 'intelligent-search',
      httpStatus: intelligent.status,
      products: intelligentProducts.length,
      priced: intelligentPriced.length,
      samples: intelligentPriced.slice(0, 3),
    }
  }

  const legacy = await fetchJson(legacyUrl)
  const legacyProducts = productsOf(legacy.data)
  const legacyPriced = pricedProducts(legacyProducts)
  return {
    query,
    mode: legacy.ok && (legacyProducts.length || legacyPriced.length) ? 'legacy-search' : 'unavailable',
    httpStatus: legacy.status,
    products: legacyProducts.length,
    priced: legacyPriced.length,
    samples: legacyPriced.slice(0, 3),
    diagnostics: {
      intelligentStatus: intelligent.status,
      intelligentContentType: intelligent.contentType,
      intelligentError: intelligent.error || null,
      legacyContentType: legacy.contentType,
      legacyError: legacy.error || null,
    },
  }
}

const report = []
for (const retailer of CANDIDATES) {
  const probes = []
  for (const query of retailer.queries) probes.push(await probe(retailer, query))
  const useful = probes.filter((row) => row.priced > 0)
  report.push({
    id: retailer.id,
    name: retailer.name,
    baseUrl: retailer.baseUrl,
    usefulQueries: useful.length,
    totalPriced: probes.reduce((sum, row) => sum + row.priced, 0),
    viable: useful.length > 0,
    probes,
  })
}

const viable = report.filter((row) => row.viable)
console.log(JSON.stringify({
  status: 'source_audit_complete',
  candidates: report.length,
  viable: viable.length,
  viableIds: viable.map((row) => row.id),
  report,
}, null, 2))

if (!viable.length) {
  console.error('No additional public VTEX source candidate exposed priced catalog evidence.')
}
