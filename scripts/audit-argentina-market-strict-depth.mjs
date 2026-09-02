const retailers = [
  ['Cetrogar', 'https://www.cetrogar.com.ar'],
  ['Naldo', 'https://www.naldo.com.ar'],
  ['OnCity', 'https://www.oncity.com'],
  ['Pardo', 'https://www.pardo.com.ar'],
  ['Easy', 'https://www.easy.com.ar'],
  ['Coppel', 'https://www.coppel.com.ar'],
  ['Carrefour', 'https://www.carrefour.com.ar'],
  ['Sportline', 'https://www.sportline.com.ar'],
]
const probes = [
  ['airfryer', 'freidora aire 6l 1700w', /freidora/i, [/6\s*(?:l|lt|litro)/i, /1700\s*w/i]],
  ['smartwatch', 'smartwatch 1.4inch', /smartwatch|reloj/i, [/gps/i, /1[.,]4\s*(?:inch|pulg|\")/i]],
  ['tennis', 'raqueta tenis 300g', /raqueta/i, [/300\s*g/i, /grafito|graphite/i]],
  ['dumbbell', 'mancuerna ajustable 20kg', /mancuerna|pesas/i, [/20\s*kg/i, /ajustable|regulable|adjustable/i]],
]
const UA = 'ShippingAPP/2.1 (+strict-depth audit; public storefront only)'

function productsOf(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.products)) return value.products
  if (value.productSearch && Array.isArray(value.productSearch.products)) return value.productSearch.products
  if (value.data && Array.isArray(value.data.products)) return value.data.products
  return []
}
function flatten(node, out = [], depth = 0) {
  if (node == null || depth > 10) return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { for (const item of node) flatten(item, out, depth + 1); return out }
  if (typeof node === 'object') for (const value of Object.values(node)) flatten(value, out, depth + 1)
  return out
}
async function fetchJson(url) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA }, signal: controller.signal })
    if (!res.ok) return { status: res.status, products: [] }
    return { status: res.status, products: productsOf(await res.json()) }
  } catch (error) { return { error: error?.message || String(error), products: [] } }
  finally { clearTimeout(timer) }
}

const results = []
for (const [name, base] of retailers) {
  for (const [id, query, categoryRe, specs] of probes) {
    const url = `${base}/api/io/_v/api/intelligent-search/product_search/trade-policy/1?${new URLSearchParams({ query, count: '30', page: '1' })}`
    const result = await fetchJson(url)
    const rows = result.products.map((product) => {
      const title = product.productName || product.name || ''
      const evidence = flatten({ title, brand: product.brand, properties: product.properties, specificationGroups: product.specificationGroups, items: product.items }).join(' ')
      return { title, categoryMatch: categoryRe.test(evidence), specsMatch: specs.every((re) => re.test(evidence)) }
    })
    results.push({ retailer: name, id, status: result.status || null, error: result.error || null, productCount: result.products.length, matching: rows.filter((r) => r.categoryMatch && r.specsMatch).slice(0, 10), firstTitles: rows.slice(0, 5).map((r) => r.title) })
  }
}
console.log(JSON.stringify({ status: 'strict_depth_complete', results }, null, 2))
