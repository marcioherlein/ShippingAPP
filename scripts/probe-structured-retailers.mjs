const probes = [
  {
    name: 'Sony Store Argentina',
    base: 'https://store.sony.com.ar',
    query: 'WH-1000XM5',
    types: ['vtex-intelligent', 'vtex-legacy'],
  },
  {
    name: 'Karcher Online Argentina',
    base: 'https://www.karcheronline.com.ar',
    query: 'Karcher K2',
    types: ['vtex-intelligent', 'vtex-legacy'],
  },
  {
    name: 'Logitech Store Argentina',
    base: 'https://www.logitechargentina.com.ar',
    query: 'MX Master 3S',
    types: ['shopify-suggest'],
  },
]

function timeoutSignal(ms = 12000) {
  return AbortSignal.timeout(ms)
}

async function requestJson(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: timeoutSignal(),
      headers: {
        accept: 'application/json',
        'user-agent': 'ShippingAPP-structured-provider-probe/1.0',
        ...(init.headers || {}),
      },
    })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      json,
      preview: text.slice(0, 300),
    }
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) }
  }
}

function summarizeVtexIntelligent(result) {
  const products = Array.isArray(result?.json?.products) ? result.json.products : []
  return {
    count: products.length,
    products: products.slice(0, 5).map((p) => ({
      id: p.productId || p.id || null,
      name: p.productName || p.name || null,
      price: p.items?.[0]?.sellers?.[0]?.commertialOffer?.Price ?? null,
      available: p.items?.[0]?.sellers?.[0]?.commertialOffer?.AvailableQuantity ?? null,
    })),
  }
}

function summarizeVtexLegacy(result) {
  const products = Array.isArray(result?.json) ? result.json : []
  return {
    count: products.length,
    products: products.slice(0, 5).map((p) => ({
      id: p.productId || null,
      name: p.productName || null,
      price: p.items?.[0]?.sellers?.[0]?.commertialOffer?.Price ?? null,
      available: p.items?.[0]?.sellers?.[0]?.commertialOffer?.AvailableQuantity ?? null,
    })),
  }
}

function summarizeShopify(result) {
  const products = result?.json?.resources?.results?.products
  const list = Array.isArray(products) ? products : []
  return {
    count: list.length,
    products: list.slice(0, 5).map((p) => ({
      id: p.id || null,
      title: p.title || null,
      price: p.price || p.price_min || null,
      available: p.available ?? null,
      url: p.url || null,
    })),
  }
}

const output = []
for (const probe of probes) {
  const row = { name: probe.name, base: probe.base, query: probe.query, attempts: [] }
  for (const type of probe.types) {
    if (type === 'vtex-intelligent') {
      const url = `${probe.base}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?query=${encodeURIComponent(probe.query)}&count=12&page=1`
      const result = await requestJson(url)
      row.attempts.push({ type, url, ok: result.ok, status: result.status, contentType: result.contentType, ...summarizeVtexIntelligent(result), error: result.error, preview: result.json ? undefined : result.preview })
    }
    if (type === 'vtex-legacy') {
      const url = `${probe.base}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(probe.query)}&_from=0&_to=11`
      const result = await requestJson(url)
      row.attempts.push({ type, url, ok: result.ok, status: result.status, contentType: result.contentType, ...summarizeVtexLegacy(result), error: result.error, preview: result.json ? undefined : result.preview })
    }
    if (type === 'shopify-suggest') {
      const url = `${probe.base}/search/suggest.json?q=${encodeURIComponent(probe.query)}&resources[type]=product&resources[limit]=12&resources[options][unavailable_products]=hide`
      const result = await requestJson(url)
      row.attempts.push({ type, url, ok: result.ok, status: result.status, contentType: result.contentType, ...summarizeShopify(result), error: result.error, preview: result.json ? undefined : result.preview })
    }
  }
  output.push(row)
}

console.log(JSON.stringify({ status: 'structured_retailer_probe', output }, null, 2))
