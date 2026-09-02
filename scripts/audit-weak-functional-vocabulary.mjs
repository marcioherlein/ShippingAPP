const retailers = [
  ['Frávega', 'https://www.fravega.com'],
  ['Cetrogar', 'https://www.cetrogar.com.ar'],
  ['Naldo', 'https://www.naldo.com.ar'],
  ['OnCity', 'https://www.oncity.com'],
  ['Pardo', 'https://www.pardo.com.ar'],
]

const cases = [
  {
    id: 'airfryer',
    variants: ['freidora aire', 'freidora de aire', 'freidora sin aceite', 'air fryer', 'freidora'],
  },
  {
    id: 'smartwatch-gps',
    variants: ['smartwatch gps', 'reloj inteligente gps', 'smartwatch', 'reloj inteligente', 'reloj gps'],
  },
  {
    id: 'tennis-racket',
    variants: ['raqueta tenis grafito', 'raqueta de tenis grafito', 'raqueta tenis', 'raqueta de tenis', 'raqueta'],
  },
  {
    id: 'adjustable-dumbbell',
    variants: ['mancuerna ajustable', 'mancuernas ajustables', 'mancuerna 20kg', 'mancuerna', 'pesas ajustables'],
  },
]

function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}

function titleOf(product) {
  return String(product?.productName || product?.name || product?.productReference || '').trim().replace(/\s+/g, ' ')
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'ShippingAPP-vocabulary-audit/1.0',
      },
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, status: response.status, data: null }
    return { ok: true, status: response.status, data: await response.json() }
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

async function discover(name, baseUrl, query) {
  const count = 12
  const params = new URLSearchParams({ query, count: String(count), page: '1' })
  const intelligentUrl = `${baseUrl}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${params}`
  const intelligent = await fetchJson(intelligentUrl)
  if (intelligent.ok) {
    const products = productsOf(intelligent.data)
    if (products.length) return { retailer: name, mode: 'intelligent', status: intelligent.status, products }
  }

  const legacyUrl = `${baseUrl}/api/catalog_system/pub/products/search/${encodeURIComponent(query)}`
  const legacy = await fetchJson(legacyUrl)
  const products = legacy.ok ? productsOf(legacy.data) : []
  return {
    retailer: name,
    mode: legacy.ok ? 'legacy' : 'unavailable',
    status: legacy.status,
    products,
    intelligentStatus: intelligent.status,
    error: legacy.error || intelligent.error || null,
  }
}

const report = []
for (const testCase of cases) {
  for (const query of testCase.variants) {
    const discoveries = await Promise.all(retailers.map(([name, baseUrl]) => discover(name, baseUrl, query)))
    const titles = [...new Set(discoveries.flatMap((result) => result.products.map(titleOf)).filter(Boolean))]
    report.push({
      case: testCase.id,
      query,
      totalProducts: discoveries.reduce((sum, result) => sum + result.products.length, 0),
      retailersWithProducts: discoveries.filter((result) => result.products.length).map((result) => result.retailer),
      perRetailer: discoveries.map((result) => ({
        retailer: result.retailer,
        mode: result.mode,
        status: result.status,
        count: result.products.length,
        examples: result.products.map(titleOf).filter(Boolean).slice(0, 4),
      })),
      uniqueExamples: titles.slice(0, 12),
    })
  }
}

const ranked = Object.fromEntries(cases.map((testCase) => [
  testCase.id,
  report
    .filter((row) => row.case === testCase.id)
    .sort((a, b) => b.totalProducts - a.totalProducts)
    .map((row) => ({ query: row.query, totalProducts: row.totalProducts, retailersWithProducts: row.retailersWithProducts })),
]))

console.log(JSON.stringify({ status: 'weak_functional_vocabulary_audit', ranked, report }, null, 2))
