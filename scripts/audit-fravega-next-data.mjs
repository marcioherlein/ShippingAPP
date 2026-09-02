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

async function fetchPage(page) {
  const response = await fetch(`https://tyc.fravega.com${page.path}`, {
    headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 ShippingAPP-next-data-audit' },
  })
  const html = await response.text()
  const next = extractNextData(html)
  const buildId = next?.buildId || null
  let nextJson = null
  if (buildId) {
    const normalizedPath = page.path.replace(/^\//, '').replace(/\/$/, '')
    const dataUrl = `https://tyc.fravega.com/_next/data/${encodeURIComponent(buildId)}/${normalizedPath}.json`
    const dataResponse = await fetch(dataUrl, { headers: { accept: 'application/json', 'user-agent': 'ShippingAPP-next-data-audit' } })
    const contentType = dataResponse.headers.get('content-type') || ''
    let json = null
    if (dataResponse.ok && contentType.includes('json')) {
      try { json = await dataResponse.json() } catch {}
    }
    nextJson = {
      url: dataUrl,
      status: dataResponse.status,
      contentType,
      bytes: Number(dataResponse.headers.get('content-length')) || null,
      hasJson: Boolean(json),
      jsonTopKeys: json ? Object.keys(json) : [],
      needleHits: json ? findNeedles(json, page.needles).slice(0, 12) : [],
    }
  }
  return {
    id: page.id,
    path: page.path,
    pageStatus: response.status,
    pageBytes: html.length,
    buildId,
    nextTopKeys: next ? Object.keys(next) : [],
    page: next?.page || null,
    query: next?.query || null,
    needleHits: next ? findNeedles(next, page.needles).slice(0, 12) : [],
    nextJson,
  }
}

const results = []
for (const page of pages) results.push(await fetchPage(page))
console.log(JSON.stringify({ status: 'fravega_next_data_complete', results }, null, 2))
if (!results.some((result) => result.buildId && result.needleHits.length > 0)) {
  throw new Error('No usable Fravega Next data product evidence found.')
}
