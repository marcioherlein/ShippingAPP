import { mergeSupplierEvidence } from '../src/lib/supplierEvidence'
import { extractAlibabaDirectHttp, type DirectAlibabaResult } from './alibabaDirectProvider'
import { extractAlibabaWithParsebot, parsebotConfigStatus, type ParsebotAlibabaFacts, type ParsebotAlibabaResult } from './parsebotAlibaba'
import { extractAlibabaNative, type NativeAlibabaResult } from './nativeAlibaba'
import type { BrowserRun } from './alibabaSource'
import { analyzeArgentinaMarket } from './catalogProvider'
import { resolveMercadoLibreAccessToken, type MercadoLibreAuthEnv } from './mercadoLibreAuth'
import { fetchBcraReferenceFx } from './bcraFx'
import { deriveNormalizedCategory, deriveSemanticConcepts } from './semanticConcepts'
import { createAlibabaReadBudget, type AlibabaReadOptions } from './alibabaReadBudget'

type Env = MercadoLibreAuthEnv & {
  BROWSER: BrowserRun
  PARSEBOT_API_KEY?: string
  PARSEBOT_ENDPOINT_URL?: string
  PARSEBOT_SCRAPER_ID?: string
  PARSEBOT_ENDPOINT_NAME?: string
}

type DirectReader = (url: URL, options?: AlibabaReadOptions) => Promise<DirectAlibabaResult>
type ParsebotReader = (url: URL, env: Env, options?: AlibabaReadOptions) => Promise<ParsebotAlibabaResult>
type NativeReader = (url: URL, browser: BrowserRun, options?: AlibabaReadOptions) => Promise<NativeAlibabaResult>

export type AlibabaSourceDeps = AlibabaReadOptions & {
  directReader?: DirectReader
  parsebotReader?: ParsebotReader
  nativeReader?: NativeReader
  /** Free intake returns published identity/offer promptly; logistics are confirmed next. */
  intakeOnly?: boolean
}

function usableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function usableText(value: unknown, rejected: string[] = []): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  const normalized = value.trim().toLowerCase()
  return !rejected.some((item) => normalized === item.toLowerCase())
}

export function hasVerifiedAlibabaIdentity(data: any) {
  if (!usableText(data?.product?.name, ['Producto Alibaba', 'Sin clasificar'])) return false
  const source = String(data?.confidence?.productSource || '')
  return data?.sourceRead?.mode !== 'blocked' && source !== 'url-only' && !source.includes('direct-provisional-url-title')
}

function hasPublishedOffer(data: any) {
  const evidence = data.product?.supplierEvidence
  return usableNumber(data.product?.moq) && (usableNumber(data.product?.unitPriceUsd)
    || (usableText(evidence?.currency) && usableText(evidence?.priceText) && /\d/.test(evidence.priceText)))
}

function productTitleFromUrl(url: URL) {
  const segment = url.pathname.split('/').filter(Boolean).at(-1) || ''
  const withoutId = segment.replace(/_\d{8,}\.html$/i, '').replace(/\.html$/i, '')
  let decoded = withoutId
  try { decoded = decodeURIComponent(withoutId) } catch { /* keep encoded slug */ }
  const title = decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title || /^(?:product|product detail|detail)$/i.test(title)) return ''
  return title.slice(0, 700)
}

export function parseAlibabaSelfFirstUrl(raw: unknown) {
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

function quantitiesFromMoq(moq: number | null) {
  if (!moq || moq <= 0) return []
  const base = Math.max(1, Math.round(moq))
  return [...new Set([base, Math.ceil(base * 1.5 / 10) * 10, base * 2, base * 3])]
}

function emptyAnalysis(url: URL) {
  return {
    sourceUrl: url.toString(),
    fetched: false,
    sourceRead: {
      mode: 'blocked' as const,
      quality: 0,
      directStatus: null as number | null,
      browserAttempted: false,
      browserMsUsed: null as number | null,
      reason: 'La ficha todavía no tiene evidencia suficiente de Alibaba.',
    },
    product: {
      name: productTitleFromUrl(url),
      category: 'Sin clasificar',
      unitPriceUsd: null as number | null,
      moq: null as number | null,
      packedWeightKg: 0,
      volumeCbm: 0,
      originCountry: '',
      imageUrl: null as string | null,
      supplier: null as string | null,
      description: null as string | null,
      material: null as string | null,
      functionText: null as string | null,
    },
    market: { estimatedPriceArs: null as number | null, estimatedMonthlyDemand: 0, source: 'Mercado local pendiente' },
    suggestedQuantities: [] as number[],
    confidence: { overall: 10, productSource: 'url-only', logistics: 'missing', market: 'pending' },
    assumptions: [] as string[],
    sourceEvidence: {} as Record<string, unknown>,
  }
}

export function requiredSelfFirstSignals(data: any) {
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

// Derive a safe normalized category from the evidence already gathered when the supplier did
// not expose one. This avoids asking the user a silly "¿qué categoría?" question about a
// product whose material/function are already clear. It is explicitly a GlobalShipping-DERIVED
// normalization (categorySource='derived'), never presented as a supplier assertion, and it
// fails closed (leaves 'Sin clasificar') when the evidence does not clearly describe a
// product. Supplier-provided categories are tagged categorySource='supplier'.
function applyDerivedCategory(data: any) {
  if (!hasVerifiedAlibabaIdentity(data)) return data
  const product = data.product || {}
  if (usableText(product.category, ['Sin clasificar'])) {
    product.categorySource = product.categorySource || 'supplier'
    data.product = product
    return data
  }
  const facts = {
    name: usableText(product.name, ['Producto Alibaba', 'Sin clasificar']) ? product.name : null,
    material: product.material || null,
    functionText: product.functionText || null,
    description: product.description || null,
  }
  const concepts = deriveSemanticConcepts(facts)
  const derived = deriveNormalizedCategory(facts, {
    concepts: concepts.concepts,
    material: concepts.material,
    construction: concepts.construction,
  })
  if (!derived) {
    data.product = product
    return data
  }
  product.category = derived
  product.categorySource = 'derived'
  data.product = product
  data.sourceEvidence = {
    ...(data.sourceEvidence || {}),
    derivedCategory: {
      value: derived,
      basis: concepts.concepts,
      note: 'Categoría normalizada derivada por GlobalShipping a partir de la evidencia; NO es una afirmación del proveedor.',
    },
  }
  data.assumptions = [
    `Categoría normalizada "${derived}" derivada por GlobalShipping desde la evidencia del producto (material/función); no es un dato declarado por el proveedor y puede corregirse.`,
    ...(data.assumptions || []),
  ]
  return data
}

function mergeCommonFacts(data: any, facts: ParsebotAlibabaFacts, options: {
  source: 'parsebot' | 'browser'
  reason: string
  browserAttempted: boolean
  browserMsUsed: number | null
}) {
  const product = data.product || {}
  const priorNameIsUrlOnly = data.confidence?.productSource === 'url-only' || String(data.confidence?.productSource).includes('direct-provisional-url-title')
  const finalMoq = usableNumber(product.moq) ? product.moq : usableNumber(facts.moq) ? Math.round(facts.moq) : null
  const merged = {
    ...product,
    name: (!usableText(product.name, ['Producto Alibaba']) || priorNameIsUrlOnly) && usableText(facts.name) ? facts.name : product.name,
    category: (!usableText(product.category, ['Sin clasificar']) || product.categorySource === 'derived') && usableText(facts.category) ? facts.category : product.category,
    ...(usableText(facts.category) && (!usableText(product.category, ['Sin clasificar']) || product.categorySource === 'derived') ? { categorySource: 'supplier' } : {}),
    unitPriceUsd: usableNumber(product.unitPriceUsd) ? product.unitPriceUsd : usableNumber(facts.unitPriceUsd) ? facts.unitPriceUsd : null,
    supplierEvidence: mergeSupplierEvidence(product.supplierEvidence, facts.supplierEvidence, {
      price: !usableNumber(product.unitPriceUsd), weight: !usableNumber(product.packedWeightKg),
      moq: !usableNumber(product.moq), volume: !usableNumber(product.volumeCbm),
    }, options.source === 'browser' ? 'Lectura en navegador' : 'Datos estructurados del proveedor'),
    moq: finalMoq,
    packedWeightKg: usableNumber(product.packedWeightKg) ? product.packedWeightKg : usableNumber(facts.packedWeightKg) ? facts.packedWeightKg : 0,
    volumeCbm: usableNumber(product.volumeCbm) ? product.volumeCbm : usableNumber(facts.volumeCbm) ? facts.volumeCbm : 0,
    originCountry: usableText(product.originCountry) ? product.originCountry : usableText(facts.originCountry) ? facts.originCountry : '',
    imageUrl: product.imageUrl || facts.imageUrl || null,
    supplier: product.supplier || facts.supplier || null,
    description: product.description || facts.description || null,
  }
  const signals = requiredSelfFirstSignals({ product: merged })
  const previousSource = String(data.confidence?.productSource || '')
  const productSource = priorNameIsUrlOnly
    ? usableText(facts.name) ? options.source : previousSource
    : previousSource ? `${previousSource}+${options.source}` : options.source
  return {
    ...data,
    fetched: true,
    product: merged,
    assumptions: priorNameIsUrlOnly && usableText(facts.name)
      ? (data.assumptions || []).filter((note: string) => !/identidad provisional|t[ií]tulo del URL/i.test(note))
      : data.assumptions,
    sourceRead: {
      mode: options.source,
      quality: Math.min(10, 2 + signals),
      directStatus: data.sourceRead?.directStatus ?? null,
      browserAttempted: options.browserAttempted,
      browserMsUsed: options.browserMsUsed,
      reason: options.reason,
    },
    suggestedQuantities: quantitiesFromMoq(finalMoq),
    confidence: {
      ...data.confidence,
      overall: Math.min(94, Math.max(Number(data.confidence?.overall) || 0, 30 + signals * 9)),
      productSource,
      logistics: usableNumber(merged.packedWeightKg) && usableNumber(merged.volumeCbm) ? 'medium' : 'missing',
    },
  }
}

function mergeDirect(data: any, direct: Exclude<DirectAlibabaResult, { status: 'unavailable' }>) {
  const facts = direct.facts
  const product = data.product || {}
  const directTitleIsProvisional = facts.evidence.includes('url_slug_title')
  const listingContextOnly = facts.evidence.includes('public_listing:listing_page_category') && !facts.evidence.includes('category') && !facts.categoryPath.length
  const finalMoq = usableNumber(facts.moq) ? Math.round(facts.moq) : null
  const merged = {
    ...product,
    name: usableText(facts.name) ? facts.name : product.name,
    // A showroom/search heading describes the results page, not the supplier's
    // product type. Keep it as source context, not a confirmed classification.
    category: listingContextOnly ? 'Sin clasificar' : usableText(facts.category) ? facts.category : facts.categoryPath.at(-1) || product.category,
    unitPriceUsd: usableNumber(facts.unitPriceUsd) ? facts.unitPriceUsd : null,
    supplierEvidence: mergeSupplierEvidence(undefined, facts.supplierEvidence, { price: true, weight: true, moq: true, volume: true }, 'Lectura directa'),
    moq: finalMoq,
    packedWeightKg: usableNumber(facts.packedWeightKg) ? facts.packedWeightKg : 0,
    volumeCbm: usableNumber(facts.volumeCbm) ? facts.volumeCbm : 0,
    originCountry: usableText(facts.originCountry) ? facts.originCountry : '',
    imageUrl: facts.imageUrl || null,
    supplier: facts.supplier || null,
    description: facts.description || null,
    material: facts.material || null,
    functionText: facts.functionText || null,
  }
  const signals = requiredSelfFirstSignals({ product: merged })
  const notes = [
    `GlobalShipping leyó Alibaba directamente por HTTPS/JSON embebido: ${facts.evidence.length} señales explícitas.`,
    facts.categoryPath.length ? `Alibaba category path: ${facts.categoryPath.join(' > ')}.` : null,
    facts.hsCode ? `HS informado por Alibaba/proveedor: ${facts.hsCode}; se conserva como evidencia y no sustituye la NCM argentina.` : null,
    facts.unitSize ? `Dimensiones logísticas extraídas: ${facts.unitSize}.` : null,
    ...direct.warnings,
  ].filter((item): item is string => Boolean(item))
  return {
    ...data,
    fetched: true,
    product: merged,
    sourceRead: {
      mode: 'direct' as const,
      quality: Math.min(10, 2 + signals),
      directStatus: direct.httpStatus,
      browserAttempted: false,
      browserMsUsed: null,
      reason: 'GlobalShipping intentó primero su extractor propio de Alibaba. No se consumieron créditos de Parse.bot.',
    },
    suggestedQuantities: quantitiesFromMoq(finalMoq),
    confidence: {
      ...data.confidence,
      overall: Math.min(93, 30 + signals * 9),
      productSource: directTitleIsProvisional ? 'direct-provisional-url-title' : 'direct-json',
      logistics: usableNumber(merged.packedWeightKg) && usableNumber(merged.volumeCbm) ? 'medium' : 'missing',
    },
    assumptions: [...notes, ...(data.assumptions || [])],
    sourceEvidence: {
      ...(data.sourceEvidence || {}),
      directAlibaba: {
        status: direct.status,
        productId: facts.productId,
        categoryPath: facts.categoryPath,
        hsCode: facts.hsCode,
        evidence: facts.evidence,
        provisionalTitle: directTitleIsProvisional,
        ...(listingContextOnly ? { listingContextCategory: facts.category } : {}),
      },
    },
  }
}

function mergeParsebot(data: any, parsebot: Extract<ParsebotAlibabaResult, { status: 'ready' }>) {
  const merged = mergeCommonFacts(data, parsebot.facts, {
    source: 'parsebot',
    reason: 'La lectura directa y Browser Run propio dejaron datos faltantes; Parse.bot se usó sólo como último suplemento opcional.',
    browserAttempted: Boolean(data.sourceRead?.browserAttempted),
    browserMsUsed: data.sourceRead?.browserMsUsed ?? null,
  })
  return {
    ...merged,
    assumptions: [
      `Parse.bot se consultó como último rescate porque los scrapers propios todavía tenían ${requiredSelfFirstSignals(data)}/7 señales obligatorias.`,
      ...parsebot.warnings,
      ...(merged.assumptions || []),
    ],
    sourceEvidence: {
      ...(merged.sourceEvidence || {}),
      parsebotAlibaba: {
        source: parsebot.source,
        productId: parsebot.facts.productId || null,
        productCategoryId: parsebot.facts.productCategoryId || null,
        categoryPath: parsebot.facts.categoryPath || [],
        hsCode: parsebot.facts.hsCode || null,
        unitSize: parsebot.facts.unitSize || null,
      },
    },
  }
}

function mergeNative(data: any, native: Extract<NativeAlibabaResult, { status: 'ready' }>) {
  const merged = mergeCommonFacts(data, native.facts, {
    source: 'browser',
    reason: 'La lectura HTTPS propia no completó la ficha; GlobalShipping usó Browser Run propio antes de considerar Parse.bot.',
    browserAttempted: true,
    browserMsUsed: native.browserMsUsed,
  })
  return {
    ...merged,
    assumptions: [...native.warnings, ...(merged.assumptions || [])],
    sourceEvidence: {
      ...(merged.sourceEvidence || {}),
      nativeAlibaba: {
        source: native.source,
        productId: native.facts.productId || null,
        productCategoryId: native.facts.productCategoryId || null,
        categoryPath: native.facts.categoryPath || [],
        hsCode: native.facts.hsCode || null,
        unitSize: native.facts.unitSize || null,
        supplierCountry: native.facts.supplierCountry || null,
      },
    },
  }
}

export async function resolveAlibabaSelfFirst(
  url: URL,
  env: Env,
  deps: AlibabaSourceDeps = {},
) {
  const directReader: DirectReader = deps.directReader || ((target, options) => extractAlibabaDirectHttp(target, fetch, undefined, undefined, options))
  const parsebotReader = deps.parsebotReader || extractAlibabaWithParsebot
  const nativeReader = deps.nativeReader || extractAlibabaNative

  let data: any = emptyAnalysis(url)
  const started = Date.now()
  const budget = createAlibabaReadBudget(deps, 20_000)
  const timedOutStages: string[] = []
  const supplementNeeded = () => requiredSelfFirstSignals(data) < 7 && !(deps.intakeOnly && hasVerifiedAlibabaIdentity(data) && hasPublishedOffer(data))
  const stage = async <T>(name: string, limit: number, read: (options: AlibabaReadOptions) => Promise<T>): Promise<T | null> => {
    const timeoutMs = Math.min(limit, budget.remainingMs())
    if (timeoutMs <= 0) { timedOutStages.push(name); return null }
    // Let a provider return its accumulated evidence before the outer safety
    // timer fires; equal deadlines otherwise discard valid partial HTML.
    try { return await budget.run(signal => read({ signal, timeoutMs: Math.max(0, timeoutMs - 100) }), timeoutMs) }
    catch (error) {
      if (deps.signal?.aborted) throw error
      if (error instanceof Error && error.name === 'TimeoutError') timedOutStages.push(name)
      data.assumptions = [...data.assumptions, `La etapa ${name} no respondió dentro del presupuesto disponible; se conservan únicamente los datos recuperados.`]
      return null
    }
  }
  try {
    const direct = await stage('direct', 8_000, options => directReader(url, options))
    if (direct && direct.status !== 'unavailable') data = mergeDirect(data, direct)
    else if (direct) data.assumptions = [...direct.warnings, ...(data.assumptions || [])]

    // Fill a safe derived category from evidence already gathered. Category is the only one of
    // the seven signals GlobalShipping can supply without a provider call, so deriving it here
    // avoids spending Browser Run / Parse.bot merely to obtain a generic category label when
    // every other signal is already present. Genuinely-missing numeric facts still gate below.
    data = applyDerivedCategory(data)

    // First-party path: direct HTTPS/embedded JSON first, then our own rendered
    // browser extraction. A complete product ficha must consume zero Parse.bot credits.
    if (supplementNeeded()) {
      // Reserve time for the configured rescue instead of exhausting the entire
      // customer deadline on repeated browser calls after a challenge/rate limit.
      const reserve = deps.parsebotReader || parsebotConfigStatus(env).ready ? 8_000 : 0
      const native = await stage('browser', Math.max(0, budget.remainingMs() - reserve), options => nativeReader(url, env.BROWSER, options))
      if (native?.status === 'ready') data = mergeNative(data, native)
      else if (native) {
        data.sourceRead = {
          ...data.sourceRead,
          browserAttempted: true,
          browserMsUsed: native.browserMsUsed,
          reason: 'La lectura directa y Browser Run propio no completaron la ficha; se evaluará el suplemento opcional de Parse.bot.',
        }
        data.assumptions = [...native.warnings, ...(data.assumptions || [])]
      }
      data = applyDerivedCategory(data)
    }

    // Parse.bot is a last-resort supplement only. GlobalShipping remains operational
    // without a key, without credits, or while Parse.bot is unavailable.
    if (supplementNeeded()) {
      const parsebot = await stage('structured', budget.remainingMs(), options => parsebotReader(url, env, options))
      if (parsebot?.status === 'ready') data = mergeParsebot(data, parsebot)
      else if (parsebot) data.assumptions = [...parsebot.warnings, ...(data.assumptions || [])]
      data = applyDerivedCategory(data)
    }

    if (requiredSelfFirstSignals(data) < 7) {
      data.sourceRead = {
        ...data.sourceRead,
        reason: 'Los scrapers propios y cualquier suplemento opcional no completaron la ficha; GlobalShipping solicita al usuario sólo los datos faltantes.',
      }
      data.assumptions = [
        'No se inventan precio, MOQ, peso, volumen ni origen. La ficha obligatoria queda abierta hasta que el usuario complete los faltantes.',
        ...(data.assumptions || []),
      ]
    }

    const signals = requiredSelfFirstSignals(data)
    data.confidence = {
      ...data.confidence,
      overall: Math.min(94, Math.max(Number(data.confidence?.overall) || 0, 20 + signals * 10)),
    }
    data.sourceEvidence = { ...data.sourceEvidence, readBudget: { durationMs: Date.now() - started, timedOutStages } }
    if (timedOutStages.length && hasVerifiedAlibabaIdentity(data)) {
      data.sourceRead = { ...data.sourceRead, mode: 'partial', reason: 'Conservamos los datos publicados que se pudieron verificar. Los campos que faltan se confirman en la ficha.' }
    }
    return data
  } finally { budget.dispose() }
}

async function hydrateMarketAndFx(data: any, env: Env) {
  const auth = await resolveMercadoLibreAccessToken(env)
  const [market, fx] = await Promise.all([
    analyzeArgentinaMarket(data.product?.name || '', data.product?.category || '', { accessToken: auth.accessToken }),
    fetchBcraReferenceFx(),
  ])

  if (auth.status !== 'ready') market.warnings.push(auth.reason)
  data.market = market.status === 'live' && market.suggestedPriceArs
    ? {
        estimatedPriceArs: Math.round(market.suggestedPriceArs),
        estimatedMonthlyDemand: 0,
        source: market.source,
        details: market,
      }
    : {
        estimatedPriceArs: null,
        estimatedMonthlyDemand: 0,
        source: `${market.source} · ${market.status}`,
        details: market,
      }
  data.fx = fx
  data.confidence = {
    ...data.confidence,
    market: market.status === 'live' ? `live-${market.confidence}` : market.status,
  }
  data.assumptions = [
    ...(data.assumptions || []),
    ...(market.warnings || []).slice(0, 5),
    market.status === 'live'
      ? `Precio local de screening basado en ${market.comparableCount} comparables activos de Mercado Libre.`
      : 'Mercado local no confirmado; no se fabrica un benchmark alternativo.',
  ]
  return data
}

export async function analyzeAlibabaSelfFirst(url: URL, env: Env) {
  return hydrateMarketAndFx(await resolveAlibabaSelfFirst(url, env), env)
}
