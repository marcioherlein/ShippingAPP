import enrichWorker from './enrich'
import { extractAlibabaNative } from './nativeAlibaba'
import { extractAlibabaDirectHttp, type DirectAlibabaResult } from './alibabaDirectProvider'
import type { BrowserRun } from './alibabaSource'

type Env = {
  BROWSER: BrowserRun
  [key: string]: any
}

type NativeReady = Extract<Awaited<ReturnType<typeof extractAlibabaNative>>, { status: 'ready' }>
type DirectReady = Extract<DirectAlibabaResult, { status: 'ready' | 'partial' }>
type DirectReader = (url: URL) => Promise<DirectAlibabaResult>
type NativeReader = (url: URL, browser: BrowserRun) => ReturnType<typeof extractAlibabaNative>

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

function usableText(value: unknown, rejected: string[] = []) {
  if (typeof value !== 'string' || !value.trim()) return false
  const normalized = value.trim().toLowerCase()
  return !rejected.some((item) => normalized === item.toLowerCase())
}

function quantitiesFromMoq(moq: number | null) {
  if (!moq || moq <= 0) return []
  const base = Math.max(1, Math.round(moq))
  return [...new Set([base, Math.ceil(base * 1.5 / 10) * 10, base * 2, base * 3])]
}

export function requiredAlibabaSignalCount(data: any) {
  const product = data?.product || {}
  return [
    usableText(product.name, ['Producto Alibaba']),
    usableText(product.category, ['Sin clasificar']),
    usableNumber(product.unitPriceUsd),
    usableNumber(product.moq),
    usableNumber(product.packedWeightKg),
    usableNumber(product.volumeCbm),
    usableText(product.originCountry),
  ].filter(Boolean).length
}

function hasTrustedAlibabaEvidence(data: any) {
  return data?.sourceRead?.mode === 'parsebot'
    || Boolean(data?.sourceEvidence?.directAlibaba)
    || Boolean(data?.sourceEvidence?.nativeAlibaba)
}

export function needsAlibabaSupplement(data: any) {
  if (!data || typeof data !== 'object') return false
  if (!hasTrustedAlibabaEvidence(data)) return true
  return requiredAlibabaSignalCount(data) < 7
}

function trustedPriorNumber(prior: any, key: string, trustPrior: boolean) {
  const value = prior?.[key]
  return trustPrior && usableNumber(value) ? value : null
}

function trustedPriorText(prior: any, key: string, trustPrior: boolean, rejected: string[] = []) {
  const value = prior?.[key]
  return trustPrior && usableText(value, rejected) ? String(value) : null
}

export function mergeDirectFacts(data: any, direct: DirectReady) {
  const facts = direct.facts
  const prior = data.product || {}
  const trustPrior = data.sourceRead?.mode === 'parsebot'
  const finalMoq = facts.moq ?? trustedPriorNumber(prior, 'moq', trustPrior)
  const product = {
    ...prior,
    name: facts.name || trustedPriorText(prior, 'name', true, ['Producto Alibaba']) || 'Producto Alibaba',
    category: facts.category || facts.categoryPath.at(-1) || trustedPriorText(prior, 'category', true, ['Sin clasificar']) || 'Sin clasificar',
    unitPriceUsd: facts.unitPriceUsd ?? trustedPriorNumber(prior, 'unitPriceUsd', trustPrior),
    moq: finalMoq,
    packedWeightKg: facts.packedWeightKg ?? trustedPriorNumber(prior, 'packedWeightKg', trustPrior) ?? 0,
    volumeCbm: facts.volumeCbm ?? trustedPriorNumber(prior, 'volumeCbm', trustPrior) ?? 0,
    originCountry: facts.originCountry || trustedPriorText(prior, 'originCountry', trustPrior) || '',
    imageUrl: facts.imageUrl || prior.imageUrl || null,
    supplier: facts.supplier || prior.supplier || null,
    description: facts.description || prior.description || null,
    material: facts.material || prior.material || null,
    functionText: facts.functionText || prior.functionText || null,
  }

  const signalCount = requiredAlibabaSignalCount({ product })
  const evidenceNotes = [
    `ShippingAPP obtuvo ${facts.evidence.length} señales desde HTML/JSON de Alibaba mediante fetch HTTPS propio.`,
    facts.categoryPath.length ? `Alibaba category path: ${facts.categoryPath.join(' > ')}.` : null,
    facts.hsCode ? `HS informado por Alibaba/proveedor: ${facts.hsCode}. Se conserva como evidencia; no sustituye la NCM argentina.` : null,
    facts.unitSize ? `Dimensiones logísticas extraídas: ${facts.unitSize}.` : null,
    ...direct.warnings,
  ].filter((item): item is string => Boolean(item))

  return {
    ...data,
    fetched: true,
    sourceRead: {
      mode: trustPrior ? 'parsebot' : 'direct',
      quality: Math.max(Number(data.sourceRead?.quality) || 0, Math.min(10, 2 + signalCount)),
      directStatus: direct.httpStatus,
      browserAttempted: false,
      browserMsUsed: 0,
      reason: trustPrior
        ? 'Parse.bot fue complementado por el fetch HTTPS directo de ShippingAPP; Browser Run todavía no fue necesario.'
        : 'ShippingAPP recuperó evidencia directamente de Alibaba mediante fetch HTTPS y JSON/HTML embebido, sin Parse.bot ni Browser Run.',
    },
    product,
    suggestedQuantities: quantitiesFromMoq(finalMoq),
    confidence: {
      ...(data.confidence || {}),
      overall: Math.min(93, Math.max(Number(data.confidence?.overall) || 0, 35 + signalCount * 8)),
      productSource: trustPrior ? 'parsebot+direct' : 'direct-json',
      logistics: usableNumber(product.packedWeightKg) && usableNumber(product.volumeCbm) ? 'medium' : 'missing',
    },
    assumptions: [...evidenceNotes, ...(Array.isArray(data.assumptions) ? data.assumptions : [])],
    sourceEvidence: {
      ...(data.sourceEvidence || {}),
      directAlibaba: {
        source: direct.source,
        status: direct.status,
        productId: facts.productId,
        categoryPath: facts.categoryPath,
        hsCode: facts.hsCode,
        unitSize: facts.unitSize,
        evidence: facts.evidence,
      },
    },
  }
}

export function mergeNativeFacts(data: any, native: NativeReady) {
  const facts = native.facts
  const prior = data.product || {}
  const product = {
    ...prior,
    name: usableText(prior.name, ['Producto Alibaba']) ? prior.name : facts.name || prior.name,
    category: usableText(prior.category, ['Sin clasificar']) ? prior.category : facts.category || prior.category,
    unitPriceUsd: usableNumber(prior.unitPriceUsd) ? prior.unitPriceUsd : facts.unitPriceUsd || null,
    moq: usableNumber(prior.moq) ? prior.moq : facts.moq || null,
    packedWeightKg: usableNumber(prior.packedWeightKg) ? prior.packedWeightKg : facts.packedWeightKg || 0,
    volumeCbm: usableNumber(prior.volumeCbm) ? prior.volumeCbm : facts.volumeCbm || 0,
    originCountry: usableText(prior.originCountry) ? prior.originCountry : facts.originCountry || '',
    imageUrl: prior.imageUrl || facts.imageUrl || null,
    supplier: prior.supplier || facts.supplier || null,
    description: prior.description || facts.description || null,
  }

  const explicitSignals = [facts.name, facts.category, facts.unitPriceUsd, facts.moq, facts.packedWeightKg, facts.volumeCbm, facts.originCountry, facts.hsCode].filter(Boolean).length
  const nativeNote = `Alibaba leído mediante un único Cloudflare Browser Run JSON; ${explicitSignals} señales explícitas recuperadas.`
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
      quality: Math.max(Number(data.sourceRead?.quality) || 0, Math.min(10, 2 + requiredAlibabaSignalCount({ product }))),
      directStatus: data.sourceRead?.directStatus ?? null,
      browserAttempted: true,
      browserMsUsed: native.browserMsUsed,
      reason: 'El fetch directo no completó la ficha; ShippingAPP usó un único Browser Run JSON para recuperar la evidencia faltante.',
    },
    product,
    suggestedQuantities: quantitiesFromMoq(usableNumber(product.moq) ? product.moq : null),
    confidence: {
      ...(data.confidence || {}),
      overall: Math.min(94, Math.max(Number(data.confidence?.overall) || 0, 40 + requiredAlibabaSignalCount({ product }) * 7)),
      productSource: 'browser-json',
      logistics: usableNumber(product.packedWeightKg) && usableNumber(product.volumeCbm) ? 'medium' : 'missing',
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

export async function resolveAlibabaFallback(
  data: any,
  url: URL,
  browser: BrowserRun,
  directReader: DirectReader = extractAlibabaDirectHttp,
  nativeReader: NativeReader = extractAlibabaNative,
) {
  if (!needsAlibabaSupplement(data)) return data

  const direct = await directReader(url)
  if (direct.status !== 'unavailable') data = mergeDirectFacts(data, direct)
  else {
    data.assumptions = [
      ...(Array.isArray(data.assumptions) ? data.assumptions : []),
      ...direct.warnings,
    ]
  }

  if (!needsAlibabaSupplement(data)) return data

  const native = await nativeReader(url, browser)
  if (native.status === 'ready') return mergeNativeFacts(data, native)

  return {
    ...data,
    assumptions: [
      ...(Array.isArray(data.assumptions) ? data.assumptions : []),
      ...native.warnings,
      'Alibaba no expuso todos los datos requeridos ni por fetch directo ni por Browser Run; la ficha obligatoria solicitará al usuario únicamente los campos faltantes.',
    ],
  }
}

function emptyAnalysis(url: URL, source = 'diagnostic') {
  return {
    sourceUrl: url.toString(),
    fetched: true,
    sourceRead: { mode: 'blocked', quality: 0, directStatus: null, browserAttempted: false, browserMsUsed: null, reason: `${source} diagnostic.` },
    product: { name: '', category: 'Sin clasificar', unitPriceUsd: null, moq: null, packedWeightKg: 0, volumeCbm: 0, originCountry: '', imageUrl: null },
    market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: `${source} diagnostic · market not queried` },
    suggestedQuantities: [],
    confidence: { overall: 0, productSource: source, logistics: 'missing', market: 'pending' },
    assumptions: [],
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

async function directProbe(request: Request) {
  let body: any = null
  try { body = await request.json() } catch { body = null }
  const url = parseAlibabaUrl(body?.url)
  if (!url) return json({ error: 'Ingresá un link HTTPS válido de Alibaba.' }, 400)
  const result = await extractAlibabaDirectHttp(url)
  return json({ url: url.toString(), ...result }, result.status === 'unavailable' ? 503 : 200)
}

const noBrowserDuringBaseAnalysis: BrowserRun = {
  async quickAction() {
    return new Response('', { status: 204 })
  },
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url)

    if (requestUrl.pathname === '/api/alibaba-direct-probe' && request.method === 'POST') return directProbe(request)
    if (requestUrl.pathname === '/api/alibaba-native-probe' && request.method === 'POST') return nativeProbe(request, env)

    if (requestUrl.pathname !== '/api/analyze' || request.method !== 'POST') {
      return enrichWorker.fetch(request, env as any)
    }

    const cloneForBody = request.clone()
    let body: any = null
    try { body = await cloneForBody.json() } catch { body = null }
    const alibabaUrl = parseAlibabaUrl(body?.url)

    if (body?.sourceMode === 'direct') {
      if (!alibabaUrl) return json({ error: 'Ingresá un link HTTPS válido de Alibaba.' }, 400)
      const direct = await extractAlibabaDirectHttp(alibabaUrl)
      if (direct.status === 'unavailable') return json({ url: alibabaUrl.toString(), ...direct }, 503)
      return json(mergeDirectFacts(emptyAnalysis(alibabaUrl, 'direct-only'), direct))
    }

    if (body?.sourceMode === 'native') {
      if (!alibabaUrl) return json({ error: 'Ingresá un link HTTPS válido de Alibaba.' }, 400)
      const native = await extractAlibabaNative(alibabaUrl, env.BROWSER)
      if (native.status !== 'ready') return json({ url: alibabaUrl.toString(), ...native }, 503)
      return json(mergeNativeFacts(emptyAnalysis(alibabaUrl, 'native-only'), native))
    }

    // The legacy analyzer still performs the Parse.bot call and direct HTTP read,
    // but its Browser binding is deliberately suppressed here. Browser credits are
    // spent only once, below, after ShippingAPP's deterministic direct extractor has
    // had a chance to complete the product ficha.
    const baseEnv = alibabaUrl ? { ...env, BROWSER: noBrowserDuringBaseAnalysis } : env
    const response = await enrichWorker.fetch(request, baseEnv as any)
    if (!response.ok || !alibabaUrl) return response

    let data: any
    try { data = await response.clone().json() } catch { return response }
    if (!needsAlibabaSupplement(data)) return response

    data = await resolveAlibabaFallback(data, alibabaUrl, env.BROWSER)
    return json(data)
  },
}
