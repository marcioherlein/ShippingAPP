const hosts = ['https://www.fravega.com', 'https://tyc.fravega.com']
const queries = ['logitech m170', 'hp smart tank 580', 'iphone 16 128gb', 'jbl go 4']
const timeoutMs = 7000

function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}

function priced(products) {
  let count = 0
  for (const product of products) for (const item of product?.items || []) for (const seller of item?.sellers || []) {
    const offer = seller?.commertialOffer || seller?.commercialOffer
    if (Number(offer?.Price) > 0 && !(typeof offer?.AvailableQuantity === 'number' && offer.AvailableQuantity <= 0)) count += 1
  }
  return count
}

async function get(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'ShippingAPP Fravega host audit/1.0' },
      redirect: 'follow',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') || ''
    let data = null
    if (contentType.includes('json')) {
      try { data = await response.json() } catch { data = null }
    }
    const products = productsOf(data)
    return {
      status: response.status,
      finalUrl: response.url,
      contentType,
      products: products.length,
      priced: priced(products),
      durationMs: Date.now() - started,
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

const rows = []
for (const host of hosts) {
  for (const query of queries) {
    const params = new URLSearchParams({ query, count: '8', page: '1' })
    const intelligent = await get(`${host}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${params}`)
    const legacy = intelligent.priced > 0 ? null : await get(`${host}/api/catalog_system/pub/products/search/${encodeURIComponent(query)}`)
    rows.push({ host, query, intelligent, legacy })
  }
}

const summary = hosts.map((host) => {
  const own = rows.filter((row) => row.host === host)
  return {
    host,
    usefulQueries: own.filter((row) => (row.intelligent.priced || row.legacy?.priced || 0) > 0).length,
    totalPriced: own.reduce((sum, row) => sum + (row.intelligent.priced || row.legacy?.priced || 0), 0),
    meanDurationMs: Math.round(own.reduce((sum, row) => sum + row.intelligent.durationMs + (row.legacy?.durationMs || 0), 0) / own.length),
  }
})

console.log(JSON.stringify({ status: 'fravega_host_audit_complete', summary, rows }, null, 2))
