const UA = 'ShippingAPP/2.1 (+Argentina market source-depth audit; public storefront catalog only)'
const timeoutMs = 10000

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
    id: 'airfryer', query: 'freidora de aire',
    match(text) { const n = normalize(text); return /(6\s*(?:l|lt|litro)|6l)/.test(n) && /1700\s*w|1\.7\s*kw/.test(n) },
  },
  {
    id: 'smartwatch', query: 'smartwatch',
    match(text) { const n = normalize(text); return /gps/.test(n) && /(1[.,]4|1\.4|1,4)\s*(?:pulg|inch|\")/.test(n) },
  },
  {
    id: 'tennis', query: 'raqueta tenis',
    match(text) { const n = normalize(text); return /(300\s*g|300g)/.test(n) && /grafito|graphite/.test(n) },
  },
  {
    id: 'dumbbell', query: 'mancuerna',
    match(text) { const n = normalize(text); return /(20\s*kg|20kg)/.test(n) && /ajustable|regulable|adjustable/.test(n) },
  },
]

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}
function flatText(value, out = [], depth = 0) {
  if (value == null || depth > 10) return out
  if (typeof value === 'string' || typeof value === 'number') { out.push(String(value)); return out }
  if (Array.isArray(value)) { for (const item of value) flatText(item, out, depth + 1); return out }
  if (typeof value === 'object') for (const item of Object.values(value)) flatText(item, out, depth + 1)
  return out
}
function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}
async function get(url, accept = 'application/json') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { headers: { accept, 'user-agent': UA }, signal: controller.signal })
  } finally { clearTimeout(timer) }
}
async function probeVtex([id, name, baseUrl], gap, count) {
  const tradePolicy = '1'
  const intelligent = `${baseUrl}/api/io/_v/api/intelligent-search/product_search/trade-policy/${tradePolicy}?${new URLSearchParams({ query: gap.query, count: String(count), page: '1' })}`
  const legacy = `${baseUrl}/api/catalog_system/pub/products/search/${encodeURIComponent(gap.query)}`
  const attempts = []
  for (const [mode, url] of [['intelligent', intelligent], ['legacy', legacy]]) {
    try {
      const res = await get(url)
      if (!res.ok) { attempts.push({ mode, status: res.status, products: 0, matches: [] }); continue }
      const json = await res.json()
      const products = productsOf(json)
      const matches = products.map((p) => ({
        id: p.productId || p.productReference || null,
        title: p.productName || p.name || '',
        evidence: flatText({ title: p.productName, brand: p.brand, properties: p.properties, specificationGroups: p.specificationGroups, items: p.items }).join(' ').slice(0, 12000),
      })).filter((p) => gap.match(`${p.title} ${p.evidence}`)).slice(0, 12)
      attempts.push({ mode, status: res.status, products: products.length, matches: matches.map(({id,title}) => ({ id, title })) })
      if (products.length) break
    } catch (error) {
      attempts.push({ mode, error: error?.message || String(error), products: 0, matches: [] })
    }
  }
  return { retailer: id, name, gap: gap.id, count, attempts }
}

function visibleText(html) {
  return normalize(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
}
async function probeHtml(id, name, url, gap) {
  try {
    const res = await get(url, 'text/html,application/xhtml+xml')
    const html = await res.text()
    const text = visibleText(html)
    const snippets = []
    const needles = gap.id === 'airfryer' ? ['1700w', '1700 w'] : gap.id === 'smartwatch' ? ['1.4', '1,4'] : gap.id === 'tennis' ? ['300g', '300 g'] : ['20kg', '20 kg']
    for (const needle of needles) {
      let at = text.indexOf(needle)
      while (at >= 0 && snippets.length < 8) {
        const snippet = text.slice(Math.max(0, at - 220), Math.min(text.length, at + 360))
        if (gap.match(snippet)) snippets.push(snippet)
        at = text.indexOf(needle, at + needle.length)
      }
    }
    return { source: id, name, gap: gap.id, url, status: res.status, bytes: html.length, matches: [...new Set(snippets)].slice(0, 8) }
  } catch (error) {
    return { source: id, name, gap: gap.id, url, error: error?.message || String(error), matches: [] }
  }
}

const vtex = []
for (const retailer of retailers) {
  for (const gap of gaps) vtex.push(await probeVtex(retailer, gap, 30))
}

const specialtySpecs = [
  ['newsan', 'Tienda Newsan', 'https://tiendanewsan.com.ar/electrodomesticos/coccion/freidoras.html', gaps[0]],
  ['garmin', 'Garmin Argentina', 'https://garmin.com.ar/tienda/productos?fields=Name&getFilterData=True&order=Code&page=1&recsPerPage=24&sort=True&term=smartwatch', gaps[1]],
  ['dexter', 'Dexter', 'https://www.dexter.com.ar/categorias/tenis', gaps[2]],
  ['army', 'Army Fitness', 'https://www.army.com.ar/mancuernas-ajustables', gaps[3]],
  ['tiomusa', 'Tio Musa', 'https://tiomusa.com.ar/collections/mlc-39395047ad74?page=3', gaps[0]],
]
const specialty = []
for (const spec of specialtySpecs) specialty.push(await probeHtml(...spec))

const summary = {
  status: 'source_depth_audit_complete',
  generatedAt: new Date().toISOString(),
  vtexMatchSummary: Object.fromEntries(gaps.map((gap) => [gap.id, vtex.filter((x) => x.gap === gap.id).map((x) => ({
    retailer: x.name,
    products: Math.max(0, ...x.attempts.map((a) => a.products || 0)),
    matchCount: Math.max(0, ...x.attempts.map((a) => a.matches?.length || 0)),
    matches: x.attempts.flatMap((a) => a.matches || []).slice(0, 8),
    attempts: x.attempts.map((a) => ({ mode: a.mode, status: a.status || null, error: a.error || null })),
  }))])),
  specialty: specialty.map((x) => ({ source: x.name, gap: x.gap, status: x.status || null, bytes: x.bytes || 0, matchCount: x.matches.length, matches: x.matches })),
}
console.log(JSON.stringify(summary, null, 2))
