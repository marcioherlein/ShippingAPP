const pages = [
  { id: 'technology', path: '/e/tecnologia/', needles: ['logitech m170', 'galaxy a16'] },
  { id: 'best-sellers', path: '/e/ofertas/mas-vendidos/', needles: ['logitech m170', 'galaxy a16'] },
  { id: 'home-sale', path: '/e/home-sale/', needles: ['aspiradora sin bolsa', 'microondas'] },
]

function extractNextData(html) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

function scalarSample(obj) {
  return Object.fromEntries(Object.entries(obj || {})
    .filter(([, value]) => ['string','number','boolean'].includes(typeof value))
    .slice(0, 30))
}

function findNeedles(node, needles, path = '$', out = [], depth = 0) {
  if (node == null || depth > 24 || out.length >= 30) return out
  if (typeof node === 'string') {
    const lower = node.toLowerCase()
    for (const needle of needles) if (lower.includes(needle)) out.push({ path, needle, value: node.slice(0, 240) })
    return out
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) findNeedles(node[i], needles, `${path}[${i}]`, out, depth + 1)
    return out
  }
  if (typeof node !== 'object') return out
  const scalar = JSON.stringify(scalarSample(node)).toLowerCase()
  for (const needle of needles) {
    if (scalar.includes(needle)) out.push({ path, needle, sample: scalarSample(node), keys: Object.keys(node).slice(0, 40) })
  }
  for (const [key, value] of Object.entries(node)) findNeedles(value, needles, `${path}.${key}`, out, depth + 1)
  return out
}

function collectProducts(node, out = new Map(), depth = 0) {
  if (!node || depth > 24) return out
  if (Array.isArray(node)) {
    for (const value of node) collectProducts(value, out, depth + 1)
    return out
  }
  if (typeof node !== 'object') return out
  if (node.__typename === 'Product' && typeof node.title === 'string' && node.title.trim()) {
    const key = String(node.code || node.slug || node.title)
    if (!out.has(key)) out.set(key, node)
  }
  for (const value of Object.values(node)) collectProducts(value, out, depth + 1)
  return out
}

function summarizeProduct(product) {
  return {
    title: product.title,
    code: product.code ?? null,
    slug: product.slug ?? null,
    brand: product.brand ?? null,
    pricingWithNetPrice: product.pricingWithNetPrice ?? null,
    stock: product.stock ?? null,
    seller: product.seller ?? null,
    categorization: product.categorization ?? null,
  }
}

async function fetchPage(page) {
  const response = await fetch(`https://tyc.fravega.com${page.path}`, {
    headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 ShippingAPP-next-data-audit' },
  })
  const html = await response.text()
  const next = extractNextData(html)
  const products = next ? [...collectProducts(next).values()] : []
  const needleProducts = products.filter((product) => {
    const title = String(product.title || '').toLowerCase()
    return page.needles.some((needle) => title.includes(needle))
  })
  return {
    id: page.id,
    path: page.path,
    pageStatus: response.status,
    pageBytes: html.length,
    buildId: next?.buildId || null,
    productCount: products.length,
    pricedProductCount: products.filter((product) => product.pricingWithNetPrice != null).length,
    stockedProductCount: products.filter((product) => product.stock != null).length,
    needleProducts: needleProducts.slice(0, 12).map(summarizeProduct),
    productSamples: products.slice(0, 8).map(summarizeProduct),
    needleHits: next ? findNeedles(next, page.needles).slice(0, 8) : [],
  }
}

const results = []
for (const page of pages) results.push(await fetchPage(page))
console.log(JSON.stringify({ status: 'fravega_next_data_pricing_complete', results }, null, 2))
if (!results.some((result) => result.productCount > 0 && result.pricedProductCount > 0)) {
  throw new Error('No usable Fravega structured product pricing found.')
}
