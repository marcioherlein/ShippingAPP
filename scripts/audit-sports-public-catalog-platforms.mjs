const stores = [
  ['Wilson Argentina', 'https://www.wilsonstore.com.ar'],
  ['Dunlop Argentina', 'https://dunlopdeporte.com.ar'],
  ['Padelife', 'https://www.padelife.com.ar'],
  ['Padel Center', 'https://padelcenter.store'],
  ['Tierra Batida', 'https://tierrabatida.com.ar'],
  ['ProPadel', 'https://propadel.com.ar'],
  ['Raqueton', 'https://raqueton.ar'],
  ['AeroSet', 'https://www.aeroset.com.ar'],
]

const probes = [
  {
    platform: 'vtex-intelligent',
    path: '/api/io/_v/api/intelligent-search/product_search/trade-policy/1?query=raqueta&count=8&page=1',
    products(value) {
      if (Array.isArray(value?.products)) return value.products
      if (Array.isArray(value?.productSearch?.products)) return value.productSearch.products
      return []
    },
  },
  {
    platform: 'vtex-legacy',
    path: '/api/catalog_system/pub/products/search/raqueta',
    products(value) { return Array.isArray(value) ? value : [] },
  },
  {
    platform: 'woocommerce-store-api',
    path: '/wp-json/wc/store/v1/products?search=raqueta&per_page=8',
    products(value) { return Array.isArray(value) ? value : [] },
  },
  {
    platform: 'shopify-products-json',
    path: '/products.json?limit=8',
    products(value) { return Array.isArray(value?.products) ? value.products : [] },
  },
]

function titleOf(product) {
  return String(product?.productName || product?.name || product?.title || '').trim().replace(/\s+/g, ' ')
}

function priceOf(product, platform) {
  if (platform.startsWith('vtex')) {
    for (const item of product?.items || []) {
      for (const seller of item?.sellers || []) {
        const offer = seller?.commertialOffer || seller?.commercialOffer || {}
        const price = Number(offer?.Price)
        if (Number.isFinite(price) && price > 0) return price
      }
    }
    return null
  }
  if (platform === 'woocommerce-store-api') {
    const raw = Number(product?.prices?.price)
    const minor = Number(product?.prices?.currency_minor_unit ?? 2)
    return Number.isFinite(raw) && raw > 0 ? raw / (10 ** minor) : null
  }
  if (platform === 'shopify-products-json') {
    for (const variant of product?.variants || []) {
      const price = Number(variant?.price)
      if (Number.isFinite(price) && price > 0 && variant?.available !== false) return price
    }
  }
  return null
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'ShippingAPP-public-catalog-audit/1.0' },
      signal: controller.signal,
      redirect: 'follow',
    })
    const contentType = response.headers.get('content-type') || ''
    if (!response.ok || !contentType.toLowerCase().includes('json')) {
      return { ok: false, status: response.status, contentType, data: null }
    }
    return { ok: true, status: response.status, contentType, data: await response.json() }
  } catch (error) {
    return { ok: false, status: 0, contentType: '', data: null, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

const results = []
for (const [store, baseUrl] of stores) {
  const storeRows = []
  for (const probe of probes) {
    const response = await fetchJson(`${baseUrl}${probe.path}`)
    const products = response.ok ? probe.products(response.data) : []
    storeRows.push({
      platform: probe.platform,
      ok: response.ok,
      status: response.status,
      contentType: response.contentType,
      productCount: products.length,
      pricedCount: products.filter((product) => priceOf(product, probe.platform)).length,
      examples: products.slice(0, 5).map((product) => ({ title: titleOf(product), priceArs: priceOf(product, probe.platform) })),
      error: response.error || null,
    })
  }
  const viable = storeRows.filter((row) => row.ok && row.productCount > 0 && row.pricedCount > 0)
  results.push({ store, baseUrl, viablePlatforms: viable.map((row) => row.platform), probes: storeRows })
}

console.log(JSON.stringify({
  status: 'sports_public_catalog_platform_audit',
  viableStores: results.filter((row) => row.viablePlatforms.length).map((row) => ({ store: row.store, platforms: row.viablePlatforms })),
  results,
}, null, 2))
