const timeoutMs = 6000

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'ShippingAPP structured-source audit/1.0' },
      redirect: 'follow',
      signal: controller.signal,
    })
    const type = response.headers.get('content-type') || ''
    let body = null
    if (type.includes('json')) {
      try { body = await response.json() } catch { body = null }
    }
    return { response, body, type, durationMs: Date.now() - started }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started }
  } finally {
    clearTimeout(timer)
  }
}

function vtexPriced(products) {
  let priced = 0
  for (const product of Array.isArray(products) ? products : []) {
    for (const item of product?.items || []) {
      for (const seller of item?.sellers || []) {
        const offer = seller?.commertialOffer || seller?.commercialOffer
        if (Number(offer?.Price) > 0 && !(typeof offer?.AvailableQuantity === 'number' && offer.AvailableQuantity <= 0)) priced += 1
      }
    }
  }
  return priced
}

async function probeSony(query) {
  const intelligentUrl = `https://store.sony.com.ar/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${new URLSearchParams({ query, count: '12', page: '1' })}`
  const intelligent = await fetchJson(intelligentUrl)
  const products = Array.isArray(intelligent.body?.products) ? intelligent.body.products : []
  if (vtexPriced(products) > 0) return {
    query, mode: 'vtex-intelligent', httpStatus: intelligent.response?.status, products: products.length, priced: vtexPriced(products), durationMs: intelligent.durationMs,
  }
  const legacy = await fetchJson(`https://store.sony.com.ar/api/catalog_system/pub/products/search/${encodeURIComponent(query)}`)
  const legacyProducts = Array.isArray(legacy.body) ? legacy.body : []
  return {
    query, mode: 'vtex-legacy', httpStatus: legacy.response?.status, products: legacyProducts.length, priced: vtexPriced(legacyProducts), durationMs: legacy.durationMs,
  }
}

function wooPrice(product) {
  const prices = product?.prices || {}
  const minor = Number(prices.currency_minor_unit ?? 2)
  const raw = Number(prices.price)
  return Number.isFinite(raw) && raw > 0 ? raw / (10 ** minor) : 0
}

async function probeWoo(host, query) {
  const url = `${host}/wp-json/wc/store/v1/products?${new URLSearchParams({ search: query, per_page: '20' })}`
  const result = await fetchJson(url)
  const products = Array.isArray(result.body) ? result.body : []
  return {
    host,
    query,
    httpStatus: result.response?.status,
    contentType: result.type,
    products: products.length,
    priced: products.filter((p) => wooPrice(p) > 0 && p?.is_in_stock !== false).length,
    sample: products.slice(0, 6).map((p) => ({ id: p.id, name: p.name, priceArs: wooPrice(p), inStock: p.is_in_stock, permalink: p.permalink })),
    durationMs: result.durationMs,
    error: result.error,
  }
}

const sony = []
for (const query of ['sony wh-1000xm5', 'sony wh-1000xm4']) sony.push(await probeSony(query))

const oneClick = []
for (const query of ['iphone 16 128gb', 'jbl go4', 'jbl go 4']) oneClick.push(await probeWoo('https://oneclickstore.com', query))

const maxim = []
for (const query of ['iphone 16 128gb']) maxim.push(await probeWoo('https://maximstore.com', query))

console.log(JSON.stringify({
  status: 'structured_brand_platform_audit_complete',
  methodology: 'Public structured APIs only (VTEX/WooCommerce Store API); no HTML scraping and no anti-bot bypass.',
  sony,
  oneClick,
  maxim,
}, null, 2))
