import enrichWorker from './enrich'
import { extractAlibabaNative } from './nativeAlibaba'
import type { BrowserRun } from './alibabaSource'

type Env = {
  BROWSER: BrowserRun
  [key: string]: any
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

function parseAlibabaUrl(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw.trim())
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || !(host === 'alibaba.com' || host.endsWith('.alibaba.com'))) return null
    return url
  } catch {
    return null
  }
}

function usableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function needsNativeFallback(data: any) {
  if (!data || typeof data !== 'object') return false
  if (data.sourceRead?.mode === 'parsebot') return false
  const product = data.product || {}
  const coreSignals = [
    typeof product.name === 'string' && product.name.trim() && product.name !== 'Producto Alibaba',
    typeof product.category === 'string' && product.category.trim() && product.category !== 'Sin clasificar',
    usableNumber(product.unitPriceUsd),
    usableNumber(product.moq),
    usableNumber(product.packedWeightKg),
    usableNumber(product.volumeCbm),
  ].filter(Boolean).length
  return coreSignals < 6
}

function mergeNativeFacts(data: any, native: Extract<Awaited<ReturnType<typeof extractAlibabaNative>>, { status: 'ready' }>) {
  const facts = native.facts
  const prior = data.product || {}
  const product = {
    ...prior,
    name: facts.name || prior.name,
    category: facts.category || prior.category,
    unitPriceUsd: facts.unitPriceUsd || prior.unitPriceUsd || null,
    moq: facts.moq || prior.moq || null,
    packedWeightKg: facts.packedWeightKg || prior.packedWeightKg || 0,
    volumeCbm: facts.volumeCbm || prior.volumeCbm || 0,
    originCountry: facts.originCountry || prior.originCountry || '',
    imageUrl: facts.imageUrl || prior.imageUrl || null,
    supplier: facts.supplier || prior.supplier || null,
    description: facts.description || prior.description || null,
  }

  const explicitSignals = [facts.name, facts.category, facts.unitPriceUsd, facts.moq, facts.packedWeightKg, facts.volumeCbm, facts.originCountry, facts.hsCode].filter(Boolean).length
  const nativeNote = `Alibaba leído sin Parse.bot mediante Cloudflare Browser Run JSON; ${explicitSignals} señales explícitas recuperadas.`
  const evidenceNotes = [
    facts.categoryPath?.length ? `Alibaba category path: ${facts.categoryPath.join(' > ')}.` : null,
    facts.hsCode ? `HS informado en la publicación/proveedor: ${facts.hsCode}. Se conserva como evidencia, no como NCM argentina automática.` : null,
    facts.unitSize ? `Dimensiones logísticas extraídas: ${facts.unitSize}.` : null,
    ...native.warnings,
  ].filter((item): item is string => Boolean(item))

  return {
    ...data,
    fetched: true,
    sourceRead: {
      mode: 'browser',
      quality: Math.max(Number(data.sourceRead?.quality) || 0, Math.min(10, 2 + explicitSignals)),
      directStatus: data.sourceRead?.directStatus ?? null,
      browserAttempted: true,
      browserMsUsed: native.browserMsUsed,
      reason: 'Parse.bot no entregó una ficha estructurada utilizable; ShippingAPP recuperó evidencia directamente de Alibaba con Browser Run JSON.',
    },
    product,
    confidence: {
      ...(data.confidence || {}),
      overall: Math.min(94, Math.max(Number(data.confidence?.overall) || 0, 40 + explicitSignals * 7)),
      productSource: 'browser-json',
      logistics: facts.packedWeightKg && facts.volumeCbm ? 'medium' : data.confidence?.logistics || 'missing',
    },
    assumptions: [nativeNote, ...evidenceNotes, ...(Array.isArray(data.assumptions) ? data.assumptions : [])],
    sourceEvidence: {
      ...(data.sourceEvidence || {}),
      nativeAlibaba: {
        source: native.source,
        productId: facts.productId || null,
        productCategoryId: facts.productCategoryId || null,
        categoryPath: facts.categoryPath || [],
        hsCode: facts.hsCode || null,
        supplierCountry: facts.supplierCountry || null,
        quantityUnit: facts.quantityUnit || null,
        packaging: facts.packaging || null,
        leadTime: facts.leadTime || null,
        tariffInfo: facts.tariffInfo || null,
      },
    },
  }
}

async function nativeProbe(request: Request, env: Env) {
  let body: any = null
  try { body = await request.json() } catch { body = null }
  const url = parseAlibabaUrl(body?.url)
  if (!url) return json({ error: 'Ingresá un link HTTPS válido de Alibaba.' }, 400)
  const result = await extractAlibabaNative(url, env.BROWSER)
  return json({ url: url.toString(), ...result }, result.status === 'ready' ? 200 : 503)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url)

    // Diagnostic route: deliberately bypasses Parse.bot and exercises only
    // ShippingAPP-owned Cloudflare Browser Run extraction.
    if (requestUrl.pathname === '/api/alibaba-native-probe' && request.method === 'POST') {
      return nativeProbe(request, env)
    }

    if (requestUrl.pathname !== '/api/analyze' || request.method !== 'POST') {
      return enrichWorker.fetch(request, env as any)
    }

    const cloneForBody = request.clone()
    let body: any = null
    try { body = await cloneForBody.json() } catch { body = null }
    const alibabaUrl = parseAlibabaUrl(body?.url)

    // Explicit diagnostic mode uses no Parse.bot at all and returns the same
    // product-analysis envelope as the normal path where possible.
    if (body?.sourceMode === 'native') {
      if (!alibabaUrl) return json({ error: 'Ingresá un link HTTPS válido de Alibaba.' }, 400)
      const native = await extractAlibabaNative(alibabaUrl, env.BROWSER)
      if (native.status !== 'ready') return json({ url: alibabaUrl.toString(), ...native }, 503)
      return json(mergeNativeFacts({
        sourceUrl: alibabaUrl.toString(),
        fetched: true,
        sourceRead: { mode: 'blocked', quality: 0, directStatus: null, browserAttempted: false, browserMsUsed: null, reason: 'Native-only diagnostic.' },
        product: { name: '', category: 'Sin clasificar', unitPriceUsd: null, moq: null, packedWeightKg: 0, volumeCbm: 0, originCountry: '', imageUrl: null },
        market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'Native diagnostic · market not queried' },
        suggestedQuantities: [],
        confidence: { overall: 0, productSource: 'browser-json', logistics: 'missing', market: 'pending' },
        assumptions: [],
      }, native))
    }

    const response = await enrichWorker.fetch(request, env as any)
    if (!response.ok || !alibabaUrl) return response

    let data: any
    try { data = await response.clone().json() } catch { return response }
    if (!needsNativeFallback(data)) return response

    const native = await extractAlibabaNative(alibabaUrl, env.BROWSER)
    if (native.status !== 'ready') {
      data.assumptions = [
        ...(Array.isArray(data.assumptions) ? data.assumptions : []),
        ...native.warnings,
        'Fallback nativo de Alibaba no agregó evidencia suficiente; la ficha obligatoria solicitará al usuario los datos faltantes.',
      ]
      return json(data)
    }

    return json(mergeNativeFacts(data, native))
  },
}
