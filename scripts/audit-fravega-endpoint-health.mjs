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

async function probeApi(target, query, mode) {
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

function htmlSignals(html) {
  const lower = html.toLowerCase()
  const titles = ['logitech m170', 'iphone 16', 'smart tank 580']
  return {
    bytes: html.length,
    hasNextData: lower.includes('__next_data__'),
    hasLdJson: lower.includes('application/ld+json'),
    hasProductSchema: lower.includes('schema.org/product') || lower.includes('"@type":"product"') || lower.includes('"@type": "product"'),
    productHits: Object.fromEntries(titles.map((title) => [title, lower.includes(title)])),
    priceLikeCount: (html.match(/\$\s*[\d.]+(?:,\d{1,2})?/g) || []).length,
  }
}

async function probeHtml(path) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  const url = `https://tyc.fravega.com${path}`
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 ShippingAPP-retailer-health-audit' },
      signal: controller.signal,
      redirect: 'follow',
    })
    const text = await response.text()
    return {
      path,
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      contentType: response.headers.get('content-type') || '',
      ...htmlSignals(text),
    }
  } catch (error) {
    return { path, status: null, ok: false, error: error?.name === 'AbortError' ? 'timeout' : (error?.message || String(error)) }
  } finally {
    clearTimeout(timer)
  }
}

const apiProbes = []
for (const target of targets) {
  for (const query of queries) {
    apiProbes.push(probeApi(target, query, 'intelligent'))
    apiProbes.push(probeApi(target, query, 'legacy'))
  }
}

const htmlPaths = [
  '/e/ofertas/mas-vendidos/',
  '/e/tecnologia/',
  '/e/home-sale/',
]

const [apiResults, htmlResults] = await Promise.all([
  Promise.all(apiProbes),
  Promise.all(htmlPaths.map(probeHtml)),
])

const report = {
  status: 'retailer_health_complete_v2',
  at: new Date().toISOString(),
  apiResults,
  htmlResults,
}
console.log(JSON.stringify(report, null, 2))

const controlHealthy = apiResults.some((r) => r.target === 'cetrogar-control' && r.ok && r.sellableOffers > 0)
const fravegaApiHealthy = apiResults.some((r) => r.target.startsWith('fravega-') && r.ok && r.sellableOffers > 0)
const fravegaHtmlHealthy = htmlResults.some((r) => r.ok && r.bytes > 10000 && (r.priceLikeCount || 0) > 5)
if (!controlHealthy) throw new Error('Control retailer did not produce sellable evidence; audit environment is inconclusive.')
if (!fravegaApiHealthy && !fravegaHtmlHealthy) throw new Error('Fravega has neither usable VTEX API nor sufficiently populated public HTML catalog evidence.')
