import { extractAlibabaDirectHttp, type DirectAlibabaResult } from './alibabaDirectProvider'
import type { AlibabaDirectFacts } from './alibabaDirectExtract'
import { extractAlibabaRenderedHtml, type RenderedAlibabaResult } from './alibabaRenderedProvider'
import { extractAlibabaWithParsebot, type ParsebotAlibabaFacts, type ParsebotAlibabaResult } from './parsebotAlibaba'
import { extractAlibabaNative, type NativeAlibabaResult } from './nativeAlibaba'
import type { BrowserRun } from './alibabaSource'
import { analyzeArgentinaMarket } from './catalogProvider'
import { resolveMercadoLibreAccessToken, type MercadoLibreAuthEnv } from './mercadoLibreAuth'
import { fetchBcraReferenceFx } from './bcraFx'

type Env = MercadoLibreAuthEnv & {
  BROWSER: BrowserRun
  PARSEBOT_API_KEY?: string
  PARSEBOT_ENDPOINT_URL?: string
  PARSEBOT_SCRAPER_ID?: string
  PARSEBOT_ENDPOINT_NAME?: string
}

type DirectReader = (url: URL) => Promise<DirectAlibabaResult>
type RenderedReader = (url: URL, browser: BrowserRun) => Promise<RenderedAlibabaResult>
type ParsebotReader = (url: URL, env: Env) => Promise<ParsebotAlibabaResult>
type NativeReader = (url: URL, browser: BrowserRun) => Promise<NativeAlibabaResult>

export type AlibabaSourceDeps = {
  directReader?: DirectReader
  renderedReader?: RenderedReader
  parsebotReader?: ParsebotReader
  nativeReader?: NativeReader
}

function usableNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function usableText(value: unknown, rejected: string[] = []): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  const normalized = value.trim().toLowerCase()
  return !rejected.some((item) => normalized === item.toLowerCase())
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
    assumptions: [
      'El título del URL se conserva sólo como identidad provisional; el usuario debe confirmar la ficha antes de NCM.',
    ],
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

function mergeCommonFacts(data: any, facts: ParsebotAlibabaFacts, options: {
  source: 'parsebot' | 'browser'
  reason: string
  browserAttempted: boolean
  browserMsUsed: number | null
}) {
  const product = data.product || {}
  const priorNameIsUrlOnly = data.confidence?.productSource === 'url-only'
  const finalMoq = usableNumber(product.moq) ? product.moq : usableNumber(facts.moq) ? Math.round(facts.moq) : null
  const merged = {
    ...product,
    name: (!usableText(product.name, ['Producto Alibaba']) || priorNameIsUrlOnly) && usableText(facts.name) ? facts.name : product.name,
    category: !usableText(product.category, ['Sin clasificar']) && usableText(facts.category) ? facts.category : product.category,
    unitPriceUsd: usableNumber(product.unitPriceUsd) ? product.unitPriceUsd : usableNumber(facts.unitPriceUsd) ? facts.unitPriceUsd : null,
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
  const productSource = previousSource && previousSource !== 'url-only'
    ? `${previousSource}+${options.source}`
    : options.source
  return {
    ...data,
    fetched: true,
    product: merged,
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
  const finalMoq = usableNumber(facts.moq) ? Math.round(facts.moq) : null
  const merged = {
    ...product,
    name: usableText(facts.name) ? facts.name : product.name,
    category: usableText(facts.category) ? facts.category : facts.categoryPath.at(-1) || product.category,
    unitPriceUsd: usableNumber(facts.unitPriceUsd) ? facts.unitPriceUsd : null,
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
    `ShippingAPP leyó Alibaba directamente por HTTPS/JSON embebido: ${facts.evidence.length} señales explícitas.`,
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
      reason: 'ShippingAPP intentó primero su extractor propio de Alibaba. Parse.bot todavía no fue consultado.',
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
      },
    },
  }
}

function mergeRendered(data: any, rendered: Exclude<RenderedAlibabaResult, { status: 'unavailable' }>) {
  const facts: AlibabaDirectFacts = rendered.facts
  const prior = data.product || {}
  const priorSource = String(data.confidence?.productSource || '')
  const priorNameProvisional = priorSource === 'url-only' || priorSource.includes('provisional')
  const renderedNameProvisional = facts.evidence.includes('url_slug_title')
  const finalMoq = usableNumber(prior.moq) ? prior.moq : usableNumber(facts.moq) ? Math.round(facts.moq) : null
  const product = {
    ...prior,
    name: priorNameProvisional && usableText(facts.name) && !renderedNameProvisional
      ? facts.name
      : usableText(prior.name, ['Producto Alibaba']) ? prior.name : facts.name || prior.name,
    category: usableText(prior.category, ['Sin clasificar']) ? prior.category : facts.category || facts.categoryPath.at(-1) || prior.category,
    unitPriceUsd: usableNumber(prior.unitPriceUsd) ? prior.unitPriceUsd : usableNumber(facts.unitPriceUsd) ? facts.unitPriceUsd : null,
    moq: finalMoq,
    packedWeightKg: usableNumber(prior.packedWeightKg) ? prior.packedWeightKg : usableNumber(facts.packedWeightKg) ? facts.packedWeightKg : 0,
    volumeCbm: usableNumber(prior.volumeCbm) ? prior.volumeCbm : usableNumber(facts.volumeCbm) ? facts.volumeCbm : 0,
    originCountry: usableText(prior.originCountry) ? prior.originCountry : usableText(facts.originCountry) ? facts.originCountry : '',
    imageUrl: prior.imageUrl || facts.imageUrl || null,
    supplier: prior.supplier || facts.supplier || null,
    description: prior.description || facts.description || null,
    material: prior.material || facts.material || null,
    functionText: prior.functionText || facts.functionText || null,
  }
  const signals = requiredSelfFirstSignals({ product })
  const notes = [
    `ShippingAPP pasó el HTML ya renderizado por Chromium por su parser determinístico: ${facts.evidence.length} señales explícitas.`,
    facts.categoryPath.length ? `Alibaba category path renderizado: ${facts.categoryPath.join(' > ')}.` : null,
    facts.hsCode ? `HS visible/embebido recuperado del HTML renderizado: ${facts.hsCode}; no sustituye la NCM argentina.` : null,
    facts.unitSize ? `Dimensiones logísticas renderizadas: ${facts.unitSize}.` : null,
    ...rendered.warnings,
  ].filter((item): item is string => Boolean(item))
  return {
    ...data,
    fetched: true,
    product,
    sourceRead: {
      mode: 'browser' as const,
      quality: Math.max(Number(data.sourceRead?.quality) || 0, Math.min(10, 2 + signals)),
      directStatus: data.sourceRead?.directStatus ?? rendered.httpStatus,
      browserAttempted: true,
      browserMsUsed: rendered.browserMsUsed,
      reason: 'El fetch directo fue incompleto; ShippingAPP renderizó Alibaba y volvió a aplicar su extractor propio antes de consultar Parse.bot.',
    },
    suggestedQuantities: quantitiesFromMoq(finalMoq),
    confidence: {
      ...data.confidence,
      overall: Math.min(94, Math.max(Number(data.confidence?.overall) || 0, 35 + signals * 8)),
      productSource: priorSource && priorSource !== 'url-only' ? `${priorSource}+rendered-html` : 'rendered-html',
      logistics: usableNumber(product.packedWeightKg) && usableNumber(product.volumeCbm) ? 'medium' : 'missing',
    },
    assumptions: [...notes, ...(data.assumptions || [])],
    sourceEvidence: {
      ...(data.sourceEvidence || {}),
      renderedAlibaba: {
        status: rendered.status,
        productId: facts.productId,
        categoryPath: facts.categoryPath,
        hsCode: facts.hsCode,
        unitSize: facts.unitSize,
        evidence: facts.evidence,
      },
    },
  }
}

function mergeParsebot(data: any, parsebot: Extract<ParsebotAlibabaResult, { status: 'ready' }>) {
  const merged = mergeCommonFacts(data, parsebot.facts, {
    source: 'parsebot',
    reason: 'Los extractores propios dejaron datos faltantes; Parse.bot se usó sólo como suplemento estructurado.',
    browserAttempted: Boolean(data.sourceRead?.browserAttempted),
    browserMsUsed: data.sourceRead?.browserMsUsed ?? null,
  })
  return {
    ...merged,
    assumptions: [
      `Parse.bot se consultó sólo después de fetch directo + HTML renderizado; quedaban ${7 - requiredSelfFirstSignals(data)} señales obligatorias por resolver.`,
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
    reason: 'Fetch, HTML renderizado y suplemento estructurado no completaron la ficha; ShippingAPP usó Browser Run JSON para un último intento automático.',
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
  const directReader = deps.directReader || extractAlibabaDirectHttp
  const renderedReader = deps.renderedReader || extractAlibabaRenderedHtml
  const parsebotReader = deps.parsebotReader || extractAlibabaWithParsebot
  const nativeReader = deps.nativeReader || extractAlibabaNative

  let data: any = emptyAnalysis(url)
  const direct = await directReader(url)
  if (direct.status !== 'unavailable') data = mergeDirect(data, direct)
  else data.assumptions = [...direct.warnings, ...(data.assumptions || [])]

  // Before spending any Parse.bot credits, render the page and run the same
  // deterministic parser over the post-JS HTML/embedded data.
  if (requiredSelfFirstSignals(data) < 7) {
    const rendered = await renderedReader(url, env.BROWSER)
    if (rendered.status !== 'unavailable') data = mergeRendered(data, rendered)
    else data.assumptions = [...rendered.warnings, ...(data.assumptions || [])]
  }

  // Parse.bot is an optional enrichment provider, never a prerequisite.
  if (requiredSelfFirstSignals(data) < 7) {
    const parsebot = await parsebotReader(url, env)
    if (parsebot.status === 'ready') data = mergeParsebot(data, parsebot)
    else data.assumptions = [...parsebot.warnings, ...(data.assumptions || [])]
  }

  if (requiredSelfFirstSignals(data) < 7) {
    const native = await nativeReader(url, env.BROWSER)
    if (native.status === 'ready') data = mergeNative(data, native)
    else {
      data.sourceRead = {
        ...data.sourceRead,
        browserAttempted: true,
        browserMsUsed: native.browserMsUsed ?? data.sourceRead?.browserMsUsed ?? null,
        reason: 'Los proveedores automáticos no completaron la ficha; ShippingAPP solicita al usuario sólo los datos faltantes.',
      }
      data.assumptions = [
        ...native.warnings,
        'No se inventan precio, MOQ, peso, volumen ni origen. La ficha obligatoria queda abierta hasta que el usuario complete los faltantes.',
        ...(data.assumptions || []),
      ]
    }
  }

  const signals = requiredSelfFirstSignals(data)
  data.confidence = {
    ...data.confidence,
    overall: Math.min(94, Math.max(Number(data.confidence?.overall) || 0, 20 + signals * 10)),
  }
  return data
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
