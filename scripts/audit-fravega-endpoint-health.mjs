const targets = [
  { id: 'fravega-www', baseUrl: 'https://www.fravega.com' },
  { id: 'fravega-tyc', baseUrl: 'https://tyc.fravega.com' },
  { id: 'cetrogar-control', baseUrl: 'https://www.cetrogar.com.ar' },
]

const queries = ['logitech m170', 'iphone 16', 'hp smart tank 580']

function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}

function sellableCount(products) {
  let count = 0
  for (const product of products) {
    for (const item of product?.items || []) {
      for (const seller of item?.sellers || []) {
        const offer = seller?.commertialOffer || seller?.commercialOffer || {}
        if (Number(offer.Price) > 0 && (offer.AvailableQuantity == null || Number(offer.AvailableQuantity) > 0)) count += 1
      }
    }
  }
  return count
}

async function probe(target, query, mode) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const url = mode === 'intelligent'
    ? `${target.baseUrl}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${new URLSearchParams({ query, count: '12', page: '1' })}`
    : `${target.baseUrl}/api/catalog_system/pub/products/search/${encodeURIComponent(query)}`
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'ShippingAPP/retailer-health-audit' },
      signal: controller.signal,
      redirect: 'follow',
    })
    const contentType = response.headers.get('content-type') || ''
    let products = []
    let parseError = null
    if (contentType.includes('json')) {
      try { products = productsOf(await response.json()) } catch (error) { parseError = error?.message || String(error) }
    }
    return {
      target: target.id,
      query,
      mode,
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      contentType,
      products: products.length,
      sellableOffers: sellableCount(products),
      parseError,
    }
  } catch (error) {
    return { target: target.id, query, mode, status: null, ok: false, error: error?.name === 'AbortError' ? 'timeout' : (error?.message || String(error)) }
  } finally {
    clearTimeout(timer)
  }
}

const probes = []
for (const target of targets) {
  for (const query of queries) {
    probes.push(probe(target, query, 'intelligent'))
    probes.push(probe(target, query, 'legacy'))
  }
}

const results = await Promise.all(probes)
console.log(JSON.stringify({ status: 'retailer_health_complete', at: new Date().toISOString(), results }, null, 2))

const controlHealthy = results.some((r) => r.target === 'cetrogar-control' && r.ok && r.sellableOffers > 0)
const fravegaWwwHealthy = results.some((r) => r.target === 'fravega-www' && r.ok && r.sellableOffers > 0)
const fravegaTycHealthy = results.some((r) => r.target === 'fravega-tyc' && r.ok && r.sellableOffers > 0)
if (!controlHealthy) throw new Error('Control retailer did not produce sellable evidence; audit environment is inconclusive.')
if (!fravegaWwwHealthy && !fravegaTycHealthy) throw new Error('Neither Fravega hostname produced sellable VTEX evidence.')
