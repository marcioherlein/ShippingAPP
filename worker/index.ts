type AI = { run: (model: string, input: unknown) => Promise<unknown> }
type Env = { AI: AI; ASSETS: { fetch: (request: Request) => Promise<Response> } }

type Extracted = {
  name?: string | null
  category?: string | null
  unitPriceUsd?: number | null
  moq?: number | null
  weightKg?: number | null
  originCountry?: string | null
  imageUrl?: string | null
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

function normalizeAlibabaUrl(raw: string) {
  const url = new URL(raw)
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || !(host === 'alibaba.com' || host.endsWith('.alibaba.com'))) {
    throw new Error('Por ahora ShippingAPP acepta links de Alibaba.')
  }
  return url
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decodeHtml(match[1].trim())
  }
  return null
}

function visibleText(html: string) {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '))
    .trim()
    .slice(0, 14000)
}

function numberOrNull(value: unknown) {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function findProductJsonLd(html: string): Extracted {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1])
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed]
      while (queue.length) {
        const item = queue.shift()
        if (!item || typeof item !== 'object') continue
        if (item['@graph']) queue.push(...item['@graph'])
        if (String(item['@type']).toLowerCase() !== 'product') continue
        const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers
        const price = offer?.lowPrice ?? offer?.price ?? offer?.highPrice
        const image = Array.isArray(item.image) ? item.image[0] : item.image
        return {
          name: item.name ?? null,
          unitPriceUsd: numberOrNull(price),
          imageUrl: typeof image === 'string' ? image : null,
        }
      }
    } catch { /* malformed JSON-LD */ }
  }
  return {}
}

function slugFallback(url: URL) {
  const slug = url.pathname.split('/').filter(Boolean).find((part) => part !== 'product-detail') || ''
  return decodeURIComponent(slug).replace(/[-_]+/g, ' ').replace(/\b\d{8,}\b/g, '').trim()
}

async function aiExtract(ai: AI, source: string): Promise<Extracted> {
  try {
    const result: any = await ai.run('@cf/zai-org/glm-4.7-flash', {
      messages: [
        { role: 'system', content: 'Extract import-product facts. Never invent missing numbers. Return only JSON with keys name, category, unitPriceUsd, moq, weightKg, originCountry. category should be short and specific. Missing values must be null.' },
        { role: 'user', content: source },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_completion_tokens: 350,
    })
    const content = result?.response ?? result?.choices?.[0]?.message?.content
    if (!content) return {}
    const parsed = typeof content === 'string' ? JSON.parse(content) : content
    return {
      name: parsed.name ?? null,
      category: parsed.category ?? null,
      unitPriceUsd: numberOrNull(parsed.unitPriceUsd),
      moq: numberOrNull(parsed.moq),
      weightKg: numberOrNull(parsed.weightKg),
      originCountry: parsed.originCountry ?? null,
    }
  } catch {
    return {}
  }
}

function benchmark(category: string | null | undefined) {
  const c = (category || '').toLowerCase()
  if (c.includes('padel') || c.includes('paddle racket') || c.includes('pádel')) {
    return { key: 'padel_racket', packedWeightKg: 0.65, volumeCbm: 0.006, marketPriceArs: 220000, monthlyDemand: 40 }
  }
  return { key: 'generic', packedWeightKg: 0.5, volumeCbm: 0.004, marketPriceArs: 0, monthlyDemand: 20 }
}

function quantitiesFromMoq(moq: number | null) {
  const base = Math.max(1, Math.round(moq || 100))
  return [...new Set([base, Math.ceil(base * 1.5 / 10) * 10, base * 2, base * 3])]
}

async function analyze(rawUrl: string, env: Env) {
  const url = normalizeAlibabaUrl(rawUrl)
  let html = ''
  let fetched = false
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ShippingAPP/0.2; +https://shippingapp.workers.dev)',
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.8',
      },
      redirect: 'follow',
    })
    if (response.ok) {
      html = await response.text()
      fetched = html.length > 500
    }
  } catch { /* fallback below */ }

  const structured = fetched ? findProductJsonLd(html) : {}
  const title = fetched ? (meta(html, 'og:title') || meta(html, 'twitter:title')) : null
  const description = fetched ? (meta(html, 'og:description') || meta(html, 'description')) : null
  const imageUrl = structured.imageUrl || (fetched ? meta(html, 'og:image') : null)
  const sourceText = fetched
    ? `URL: ${url}\nTITLE: ${title || ''}\nDESCRIPTION: ${description || ''}\nPAGE TEXT: ${visibleText(html)}`
    : `Alibaba URL slug only: ${slugFallback(url)}. Extract only what can reasonably be identified; do not invent price, MOQ or weight.`
  const ai = await aiExtract(env.AI, sourceText)

  const name = structured.name || ai.name || title || slugFallback(url) || 'Producto Alibaba'
  const category = ai.category || null
  const unitPriceUsd = structured.unitPriceUsd || ai.unitPriceUsd || null
  const moq = ai.moq ? Math.round(ai.moq) : null
  const b = benchmark(category)
  const packedWeightKg = ai.weightKg || b.packedWeightKg
  const assumptions: string[] = []
  if (!fetched) assumptions.push('Alibaba no expuso el contenido completo; parte del perfil se estimó desde el link.')
  if (!ai.weightKg) assumptions.push(`Peso logístico estimado con benchmark de categoría: ${b.packedWeightKg} kg/unidad.`)
  assumptions.push(`Volumen logístico estimado con benchmark de categoría: ${b.volumeCbm} m³/unidad.`)
  if (!unitPriceUsd) assumptions.push('No se pudo verificar el precio automáticamente; el análisis económico requiere una estimación de precio.')
  if (!moq) assumptions.push('MOQ no verificado; se usa 100 unidades como base de escenarios.')
  if (!b.marketPriceArs) assumptions.push('Precio de mercado argentino aún no estimado para esta categoría.')

  const verifiedCount = [fetched, !!unitPriceUsd, !!moq, !!ai.weightKg, !!category].filter(Boolean).length
  const overallConfidence = Math.min(92, 38 + verifiedCount * 10)

  return {
    sourceUrl: url.toString(),
    fetched,
    product: {
      name,
      category: category || 'Sin clasificar',
      unitPriceUsd,
      moq,
      packedWeightKg,
      volumeCbm: b.volumeCbm,
      originCountry: ai.originCountry || 'China (estimado)',
      imageUrl,
    },
    market: {
      estimatedPriceArs: b.marketPriceArs || null,
      estimatedMonthlyDemand: b.monthlyDemand,
      source: b.key === 'generic' ? 'Sin benchmark específico' : 'ShippingAPP category benchmark',
    },
    suggestedQuantities: quantitiesFromMoq(moq),
    confidence: {
      overall: overallConfidence,
      productSource: fetched ? 'verified/estimated' : 'estimated',
      logistics: ai.weightKg ? 'medium' : 'low',
      market: b.marketPriceArs ? 'low' : 'missing',
    },
    assumptions,
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      try {
        const body = await request.json() as { url?: string }
        if (!body.url) return json({ error: 'Pegá un link de Alibaba.' }, 400)
        return json(await analyze(body.url, env))
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'No pudimos analizar el link.' }, 400)
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404)
    return env.ASSETS.fetch(request)
  },
}
