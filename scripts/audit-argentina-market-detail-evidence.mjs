const retailers = [
  ['cetrogar', 'Cetrogar', 'https://www.cetrogar.com.ar'],
  ['naldo', 'Naldo', 'https://www.naldo.com.ar'],
  ['oncity', 'OnCity', 'https://www.oncity.com'],
  ['pardo', 'Pardo', 'https://www.pardo.com.ar'],
  ['easy', 'Easy', 'https://www.easy.com.ar'],
  ['coppel', 'Coppel', 'https://www.coppel.com.ar'],
  ['carrefour', 'Carrefour', 'https://www.carrefour.com.ar'],
  ['sportline', 'Sportline', 'https://www.sportline.com.ar'],
]
const gaps = [
  {
    id: 'airfryer', query: 'freidora aire 6l 1700w',
    relevant: /freidora/i,
    exact: [/6\s*(?:l|lt|litro)/i, /1700\s*w/i],
  },
  {
    id: 'smartwatch', query: 'smartwatch 1.4inch',
    relevant: /smartwatch|reloj/i,
    exact: [/gps/i, /1[.,]4\s*(?:inch|pulg|\")/i],
  },
  {
    id: 'tennis', query: 'raqueta tenis 300g',
    relevant: /raqueta/i,
    exact: [/300\s*g/i, /grafito|graphite/i],
  },
  {
    id: 'dumbbell', query: 'mancuerna ajustable 20kg',
    relevant: /mancuerna|pesa/i,
    exact: [/20\s*kg/i, /ajustable|regulable|adjustable/i],
  },
]
const UA = 'ShippingAPP/2.1 (+public detail evidence audit; no checkout/login)'
const MAX_DETAILS_PER_GAP = 12

function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}
function flat(node, out = [], depth = 0) {
  if (node == null || depth > 10) return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { for (const item of node) flat(item, out, depth + 1); return out }
  if (typeof node === 'object') for (const value of Object.values(node)) flat(value, out, depth + 1)
  return out
}
function cleanHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
function permalink(base, product) {
  if (typeof product.link === 'string' && product.link.trim()) {
    try {
      const url = new URL(product.link, base)
      if (url.protocol === 'https:' && url.hostname.endsWith(new URL(base).hostname)) return url.toString()
    } catch {}
  }
  const text = typeof product.linkText === 'string' ? product.linkText.trim().replace(/^\/+|\/+$/g, '') : ''
  return text ? `${base}/${text}/p` : null
}
async function timedFetch(url, accept, timeoutMs = 7000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs)
  try { return await fetch(url, { headers: { accept, 'user-agent': UA }, signal: controller.signal }) }
  finally { clearTimeout(timer) }
}
async function searchRetailer([id, name, base], gap) {
  const url = `${base}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${new URLSearchParams({ query: gap.query, count: '30', page: '1' })}`
  try {
    const res = await timedFetch(url, 'application/json')
    if (!res.ok) return []
    const products = productsOf(await res.json())
    return products.map((product) => {
      const title = product.productName || product.name || ''
      const listingEvidence = flat({ title, brand: product.brand, properties: product.properties, specificationGroups: product.specificationGroups }).join(' ')
      return { retailerId: id, retailerName: name, base, title, listingEvidence, permalink: permalink(base, product) }
    }).filter((row) => row.permalink && gap.relevant.test(`${row.title} ${row.listingEvidence}`))
  } catch { return [] }
}
async function hydrate(row, gap) {
  try {
    const res = await timedFetch(row.permalink, 'text/html,application/xhtml+xml')
    if (!res.ok) return { ...row, httpStatus: res.status, exactFromDetail: false, stockState: 'unknown' }
    let html = await res.text()
    if (html.length > 2_500_000) html = html.slice(0, 2_500_000)
    const text = cleanHtml(html)
    const stockState = /(?:sin stock|agotado|producto no disponible|no disponible)/i.test(text)
      ? 'explicit_unavailable'
      : /(?:agregar al carrito|comprar ahora|en stock|disponible)/i.test(text)
        ? 'positive_signal'
        : 'unknown'
    return {
      ...row,
      httpStatus: res.status,
      exactFromListing: gap.exact.every((re) => re.test(row.listingEvidence)),
      exactFromDetail: gap.exact.every((re) => re.test(text)),
      stockState,
      evidenceSnippet: gap.exact.map((re) => {
        const match = text.match(re)
        if (!match?.index) return null
        return text.slice(Math.max(0, match.index - 120), Math.min(text.length, match.index + 260))
      }).filter(Boolean).slice(0, 2),
    }
  } catch (error) {
    return { ...row, error: error?.message || String(error), exactFromDetail: false, stockState: 'unknown' }
  }
}

const report = []
for (const gap of gaps) {
  const searched = (await Promise.all(retailers.map((retailer) => searchRetailer(retailer, gap)))).flat()
  const unique = []
  const seen = new Set()
  for (const row of searched) {
    if (seen.has(row.permalink)) continue
    seen.add(row.permalink)
    unique.push(row)
  }
  // Prioritize title/listing near-misses: at least one required spec already visible.
  unique.sort((a, b) => {
    const score = (row) => gap.exact.filter((re) => re.test(`${row.title} ${row.listingEvidence}`)).length
    return score(b) - score(a)
  })
  const selected = unique.slice(0, MAX_DETAILS_PER_GAP)
  const hydrated = []
  for (let i = 0; i < selected.length; i += 4) {
    hydrated.push(...await Promise.all(selected.slice(i, i + 4).map((row) => hydrate(row, gap))))
  }
  report.push({
    id: gap.id,
    searchedCandidates: unique.length,
    detailFetched: hydrated.length,
    newlyProvenExact: hydrated.filter((row) => !row.exactFromListing && row.exactFromDetail && row.stockState !== 'explicit_unavailable').map((row) => ({ retailer: row.retailerName, title: row.title, permalink: row.permalink, stockState: row.stockState, evidenceSnippet: row.evidenceSnippet })),
    explicitlyUnavailableExact: hydrated.filter((row) => row.exactFromDetail && row.stockState === 'explicit_unavailable').map((row) => ({ retailer: row.retailerName, title: row.title, permalink: row.permalink })),
    hydrated: hydrated.map((row) => ({ retailer: row.retailerName, title: row.title, httpStatus: row.httpStatus || null, exactFromListing: Boolean(row.exactFromListing), exactFromDetail: Boolean(row.exactFromDetail), stockState: row.stockState, error: row.error || null })),
  })
}
console.log(JSON.stringify({ status: 'detail_evidence_audit_complete', report }, null, 2))
