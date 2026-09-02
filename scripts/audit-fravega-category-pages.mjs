const pages = [
  { id: 'iphone', path: '/l/celulares/celulares-liberados/?marcas=apple', needles: ['iphone 16'] },
  { id: 'mouses', path: '/l/informatica/gaming-pc/mouses/', needles: ['logitech m170', 'mx master 3s'] },
  { id: 'multifunction-printers', path: '/l/informatica/impresoras/impresoras-multifuncion/', needles: ['smart tank 580', 'ecotank l3250'] },
]

function extractNextData(html) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

function collectProductish(node, out = [], path = '$', depth = 0) {
  if (!node || depth > 20 || out.length > 5000) return out
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) collectProductish(node[i], out, `${path}[${i}]`, depth + 1)
    return out
  }
  if (typeof node !== 'object') return out
  const entries = Object.entries(node)
  const stringValues = entries.filter(([, value]) => typeof value === 'string').map(([, value]) => value)
  const numberValues = entries.filter(([, value]) => typeof value === 'number').map(([, value]) => value)
  const text = stringValues.join(' ').toLowerCase()
  const keys = entries.map(([key]) => key.toLowerCase())
  const looksProductish = stringValues.some((value) => value.length >= 6)
    && (keys.some((key) => /name|title|product|sku/.test(key)) || numberValues.some((value) => value > 1000))
    && (keys.some((key) => /price|offer|selling/.test(key)) || /\$/.test(text))
  if (looksProductish) {
    out.push({ path, keys: entries.map(([key]) => key).slice(0, 30), sample: Object.fromEntries(entries.filter(([, value]) => ['string','number','boolean'].includes(typeof value)).slice(0, 20)) })
  }
  for (const [key, value] of entries) collectProductish(value, out, `${path}.${key}`, depth + 1)
  return out
}

async function inspect(page) {
  const url = `https://tyc.fravega.com${page.path}`
  const response = await fetch(url, {
    headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 ShippingAPP-category-audit' },
    redirect: 'follow',
  })
  const html = await response.text()
  const lower = html.toLowerCase()
  const next = extractNextData(html)
  const productish = next ? collectProductish(next) : []
  return {
    id: page.id,
    url,
    status: response.status,
    bytes: html.length,
    hasNextData: Boolean(next),
    buildId: next?.buildId || null,
    needles: Object.fromEntries(page.needles.map((needle) => [needle, lower.includes(needle)])),
    priceLikeCount: (html.match(/\$\s*[\d.]+(?:,\d{1,2})?/g) || []).length,
    productishCount: productish.length,
    productishSamples: productish.slice(0, 8),
  }
}

const results = []
for (const page of pages) results.push(await inspect(page))
console.log(JSON.stringify({ status: 'fravega_category_pages_complete', results }, null, 2))
if (!results.every((result) => result.status === 200 && result.hasNextData && result.priceLikeCount > 0)) {
  throw new Error('One or more Fravega category pages did not expose usable HTML/Next data.')
}
