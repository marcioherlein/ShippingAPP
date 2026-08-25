import { readAlibabaSource, type BrowserRun } from './alibabaSource'
import { extractAlibabaWithParsebot, type ParsebotAlibabaResult } from './parsebotAlibaba'

type AI = { run: (model: string, input: unknown) => Promise<unknown> }
type Env = {
  AI: AI
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  BROWSER: BrowserRun
  PARSEBOT_API_KEY?: string
  PARSEBOT_ENDPOINT_URL?: string
  PARSEBOT_SCRAPER_ID?: string
  PARSEBOT_ENDPOINT_NAME?: string
}

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

function inferCategory(source: string) {
  const s = source.toLowerCase()
  if (/\b(padel|pádel)\b/.test(s) && /\b(racket|racquet|paddle|paleta)\b/.test(s)) return 'Padel racket'
  if (/\b(pickleball)\b/.test(s) && /\b(paddle|racket|racquet)\b/.test(s)) return 'Pickleball paddle'
  if (/\b(tennis|tenis)\b/.test(s) && /\b(racket|racquet|raqueta)\b/.test(s)) return 'Tennis racket'
  if (/\b(video\s*door\s*phone|door\s*phone|video\s*intercom|smart\s*intercom|wifi\s*intercom|doorbell\s*camera|video\s*doorbell)\b/.test(s)) return 'Smart video door phone'
  return null
}

function extractMoq(source: string) {
  const patterns = [
    /(?:min(?:imum)?\.?\s*(?:order|order quantity)|moq)\s*[:：-]?\s*(\d{1,6})/i,
    /(\d{1,6})\s*(?:pieces|piece|pcs|units|sets)\s*(?:min(?:imum)?\.?\s*order|minimum)/i,
    /(?:>=|≥)\s*(\d{1,6})\s*(?:pieces|piece|pcs|units|sets)/i,
  ]
  for (const pattern of patterns) {
    const match = source.match(pattern)
    const value = match ? numberOrNull(match[1]) : null
    if (value) return Math.round(value)
  }
  return null
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

export function benchmark(category: string | null | undefined) {
  const c = (category || '').toLowerCase()
  if (c.includes('padel') || c.includes('paddle racket') || c.includes('pádel')) {
    return {
      key: 'padel_racket',
      packedWeightKg: 0.65,
      volumeCbm: 0.006,
      marketPriceArs: 220000,
      monthlyDemand: 0,
      defaultMoq: 300,
    }
  }
  return {
    key: 'generic',
    packedWeightKg: 0,
    volumeCbm: 0,
    marketPriceArs: 0,
    monthlyDemand: 0,
    defaultMoq: null,
  }
}

export function quantitiesFromMoq(moq: number | null) {
  if (!moq || moq <= 0) return []
  const base = Math.max(1, Math.round(moq))
  return [...new Set([base, Math.ceil(base * 1.5 / 10) * 10, base * 2, base * 3])]
}

function analysisFromParsebot(url: URL, parsebot: Extract<ParsebotAlibabaResult, { status: 'ready' }>) {
  const facts = parsebot.facts
  const category = facts.category || inferCategory(`${facts.name || ''} ${facts.description || ''}`) || null
  const b = benchmark(category)
  const unitPriceUsd = facts.unitPriceUsd || null
  const detectedMoq = facts.moq ? Math.round(facts.moq) : null
  const moq = detectedMoq || b.defaultMoq
  const packedWeightKg = facts.packedWeightKg || b.packedWeightKg
  const volumeCbm = facts.volumeCbm || b.volumeCbm
  const originCountry = facts.originCountry || ''
  const assumptions: string[] = [
    'Producto estructurado con Parse.bot API; ShippingAPP usa Browser Run sólo como fallback cuando Parse.bot no entrega datos útiles.',
  ]

  if (!facts.category && category) assumptions.push(`Categoría detectada por reglas del título/descripción: ${category}.`)
  if (!facts.packedWeightKg && b.packedWeightKg > 0) assumptions.push(`Peso logístico estimado con benchmark de categoría: ${b.packedWeightKg} kg/unidad.`)
  if (!facts.packedWeightKg && b.packedWeightKg <= 0) assumptions.push('Peso embalado no verificado; no se aplica un fallback genérico.')
  if (facts.volumeCbm) assumptions.push(`Volumen embalado tomado de Parse.bot: ${facts.volumeCbm} m³/unidad.`)
  else if (b.volumeCbm > 0) assumptions.push(`Volumen logístico estimado con benchmark de categoría: ${b.volumeCbm} m³/unidad.`)
  else assumptions.push('Volumen embalado no verificado; no se aplica un fallback genérico.')
  if (!unitPriceUsd) assumptions.push('No se pudo verificar el precio automáticamente; el análisis económico requiere una estimación de precio.')
  if (!detectedMoq && moq) assumptions.push(`MOQ estimado con benchmark de categoría: ${moq} unidades.`)
  if (!moq) assumptions.push('MOQ no verificado; no se generan cantidades de escenario hasta contar con una hipótesis explícita.')
  if (b.marketPriceArs) assumptions.push(`Precio argentino inicial estimado con benchmark de categoría: ARS ${b.marketPriceArs.toLocaleString('es-AR')}.`)
  else assumptions.push('Precio de mercado argentino aún no estimado para esta categoría.')
  if (!originCountry) assumptions.push('País de origen no verificado; ShippingAPP no presume China ni aplica preferencias por origen.')
  assumptions.push('Demanda mensual no observada: debe ser informada explícitamente por el usuario antes de recomendar cantidad.')

  const verifiedCount = [!!facts.name, !!unitPriceUsd, !!detectedMoq, !!facts.packedWeightKg, !!facts.category, !!originCountry, !!facts.imageUrl].filter(Boolean).length
  const fallbackCount = [!!category && !facts.category, !!moq && !detectedMoq, b.key !== 'generic'].filter(Boolean).length
  const overallConfidence = Math.min(94, 42 + verifiedCount * 8 + fallbackCount * 4)

  return {
    sourceUrl: url.toString(),
    fetched: true,
    sourceRead: {
      mode: 'parsebot',
      quality: 8,
      directStatus: 200,
      browserAttempted: false,
      browserMsUsed: 0,
      reason: 'Parse.bot API returned structured Alibaba product facts.',
      executionTime: parsebot.executionTime,
    },
    product: {
      name: facts.name || slugFallback(url) || 'Producto Alibaba',
      category: category || 'Sin clasificar',
      unitPriceUsd,
      moq,
      packedWeightKg,
      volumeCbm,
      originCountry,
      imageUrl: facts.imageUrl || null,
      supplier: facts.supplier || null,
      description: facts.description || null,
    },
    market: {
      estimatedPriceArs: b.marketPriceArs || null,
      estimatedMonthlyDemand: 0,
      source: b.key === 'generic' ? 'Sin benchmark específico' : 'ShippingAPP category benchmark',
    },
    suggestedQuantities: quantitiesFromMoq(moq),
    confidence: {
      overall: overallConfidence,
      productSource: 'parsebot',
      logistics: facts.packedWeightKg ? 'medium' : b.key === 'generic' ? 'missing' : 'benchmark',
      market: b.marketPriceArs ? 'benchmark' : 'missing',
    },
    assumptions,
  }
}

async function analyze(rawUrl: string, env: Env) {
  const url = normalizeAlibabaUrl(rawUrl)
  const parsebot = await extractAlibabaWithParsebot(url, env)
  if (parsebot.status === 'ready') return analysisFromParsebot(url, parsebot)

  const sourceRead = await readAlibabaSource(url, env.BROWSER)
  const html = sourceRead.html
  const fetched = sourceRead.quality > 0

  const structured = fetched ? findProductJsonLd(html) : {}
  const title = fetched ? (meta(html, 'og:title') || meta(html, 'twitter:title')) : null
  const description = fetched ? (meta(html, 'og:description') || meta(html, 'description')) : null
  const pageText = fetched ? visibleText(html) : ''
  const imageUrl = structured.imageUrl || (fetched ? meta(html, 'og:image') : null)
  const sourceText = fetched
    ? `URL: ${url}\nTITLE: ${title || ''}\nDESCRIPTION: ${description || ''}\nPAGE TEXT: ${pageText}`
    : `Alibaba URL slug only: ${slugFallback(url)}. Extract only what can reasonably be identified; do not invent price, MOQ or weight.`
  const ai = await aiExtract(env.AI, sourceText)

  const name = structured.name || ai.name || title || slugFallback(url) || 'Producto Alibaba'
  const category = ai.category || inferCategory(`${name} ${title || ''} ${description || ''} ${pageText}`)
  const unitPriceUsd = structured.unitPriceUsd || ai.unitPriceUsd || null
  const detectedMoq = ai.moq ? Math.round(ai.moq) : extractMoq(`${description || ''} ${pageText}`)
  const b = benchmark(category)
  const moq = detectedMoq || b.defaultMoq
  const packedWeightKg = ai.weightKg || b.packedWeightKg
  const originCountry = ai.originCountry || ''
  const assumptions: string[] = []

  if (parsebot.status !== 'ready') assumptions.push(...parsebot.warnings)
  if (sourceRead.mode === 'browser') assumptions.push('Alibaba requirió Browser Run: el HTML renderizado mejoró la lectura directa.')
  if (sourceRead.mode === 'partial') assumptions.push('Alibaba sólo expuso contenido parcial; Browser Run no logró mejorar la lectura.')
  if (sourceRead.mode === 'blocked') assumptions.push('Alibaba bloqueó o no expuso contenido utilizable tanto al fetch directo como a Browser Run; el perfil se limita a lo identificable desde el link.')
  if (!ai.category && category) assumptions.push(`Categoría detectada por reglas del título/descripción: ${category}.`)
  if (!ai.weightKg && b.packedWeightKg > 0) assumptions.push(`Peso logístico estimado con benchmark de categoría: ${b.packedWeightKg} kg/unidad.`)
  if (!ai.weightKg && b.packedWeightKg <= 0) assumptions.push('Peso embalado no verificado; no se aplica un fallback genérico.')
  if (b.volumeCbm > 0) assumptions.push(`Volumen logístico estimado con benchmark de categoría: ${b.volumeCbm} m³/unidad.`)
  else assumptions.push('Volumen embalado no verificado; no se aplica un fallback genérico.')
  if (!unitPriceUsd) assumptions.push('No se pudo verificar el precio automáticamente; el análisis económico requiere una estimación de precio.')
  if (!detectedMoq && moq) assumptions.push(`MOQ estimado con benchmark de categoría: ${moq} unidades.`)
  if (!moq) assumptions.push('MOQ no verificado; no se generan cantidades de escenario hasta contar con una hipótesis explícita.')
  if (b.marketPriceArs) assumptions.push(`Precio argentino inicial estimado con benchmark de categoría: ARS ${b.marketPriceArs.toLocaleString('es-AR')}.`)
  else assumptions.push('Precio de mercado argentino aún no estimado para esta categoría.')
  if (!originCountry) assumptions.push('País de origen no verificado; ShippingAPP no presume China ni aplica preferencias por origen.')
  assumptions.push('Demanda mensual no observada: debe ser informada explícitamente por el usuario antes de recomendar cantidad.')

  const strongSourceRead = sourceRead.mode === 'direct' || sourceRead.mode === 'browser'
  const verifiedCount = [strongSourceRead, !!unitPriceUsd, !!detectedMoq, !!ai.weightKg, !!ai.category, !!originCountry].filter(Boolean).length
  const fallbackCount = [!!category && !ai.category, !!moq && !detectedMoq, b.key !== 'generic'].filter(Boolean).length
  const overallConfidence = Math.min(92, 38 + verifiedCount * 10 + fallbackCount * 4)

  return {
    sourceUrl: url.toString(),
    fetched,
    sourceRead: {
      mode: sourceRead.mode,
      quality: sourceRead.quality,
      directStatus: sourceRead.directStatus,
      browserAttempted: sourceRead.browserAttempted,
      browserMsUsed: sourceRead.browserMsUsed,
      reason: sourceRead.reason,
    },
    product: {
      name,
      category: category || 'Sin clasificar',
      unitPriceUsd,
      moq,
      packedWeightKg,
      volumeCbm: b.volumeCbm,
      originCountry,
      imageUrl,
    },
    market: {
      estimatedPriceArs: b.marketPriceArs || null,
      estimatedMonthlyDemand: 0,
      source: b.key === 'generic' ? 'Sin benchmark específico' : 'ShippingAPP category benchmark',
    },
    suggestedQuantities: quantitiesFromMoq(moq),
    confidence: {
      overall: overallConfidence,
      productSource: sourceRead.mode,
      logistics: ai.weightKg ? 'medium' : b.key === 'generic' ? 'missing' : 'benchmark',
      market: b.marketPriceArs ? 'benchmark' : 'missing',
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
