import { analyzeArgentinaMarketHybrid } from './argentinaMarketOrchestrator'
import { resolveMercadoLibreAccessToken, type MercadoLibreAuthEnv, type MercadoLibreAuthResult } from './mercadoLibreAuth'
import type { ArgentinaMarketResult } from './marketTypes'

type HybridMarketEconomicsEnv = MercadoLibreAuthEnv & {
  SERPAPI_API_KEY?: string
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function staleMarketAssumption(value: unknown) {
  if (typeof value !== 'string') return false
  const normalized = value.toLowerCase()
  return normalized.includes('precio argentino inicial estimado')
    || normalized.includes('mercado local bloqueado')
    || normalized.includes('mercado local no confirmado')
    || normalized.includes('precio local de screening basado en')
    || normalized.includes('mercado local pendiente')
}

function authDiagnostic(auth: MercadoLibreAuthResult) {
  if (auth.status === 'ready') return null
  return `Mercado Libre auth ${auth.status}: ${auth.reason}`
}

export function applyHybridMarketToAnalysis(
  data: any,
  marketInput: ArgentinaMarketResult,
  auth: MercadoLibreAuthResult,
) {
  const authWarning = authDiagnostic(auth)
  const warnings = [...(marketInput.warnings || [])]
  if (authWarning && !warnings.includes(authWarning)) warnings.push(authWarning)
  const market = { ...marketInput, warnings }

  const priorAssumptions = Array.isArray(data?.assumptions)
    ? data.assumptions.filter((item: unknown) => !staleMarketAssumption(item))
    : []
  const estimatedMonthlyDemand = positiveNumber(data?.market?.estimatedMonthlyDemand)
    ? data.market.estimatedMonthlyDemand
    : 0

  if (market.status === 'live' && positiveNumber(market.suggestedPriceArs)) {
    const effectivePriceNote = market.effectivePriceCount > 0
      ? ` ${market.effectivePriceCount} precio(s) fueron resueltos mediante una fuente de precio efectivo cuando estuvo disponible.`
      : ''
    return {
      ...data,
      market: {
        ...(data?.market || {}),
        estimatedPriceArs: Math.round(market.suggestedPriceArs),
        estimatedMonthlyDemand,
        source: market.source,
        details: market,
      },
      confidence: {
        ...(data?.confidence || {}),
        market: `live-${market.confidence}`,
      },
      assumptions: [
        ...priorAssumptions,
        `Precio local de screening basado en ${market.comparableCount} comparables argentinos aceptados por el matcher; fuente: ${market.source}.${effectivePriceNote}`,
        'La demanda mensual sigue siendo un supuesto editable; no se infiere del stock público.',
      ],
    }
  }

  return {
    ...data,
    market: {
      ...(data?.market || {}),
      estimatedPriceArs: null,
      estimatedMonthlyDemand,
      source: `${market.source} · ${market.status}`,
      details: market,
    },
    confidence: {
      ...(data?.confidence || {}),
      market: market.status,
    },
    assumptions: [
      ...priorAssumptions,
      'Mercado local no confirmado por el benchmark híbrido: ShippingAPP no reutiliza un precio histórico ni fabrica un precio alternativo.',
    ],
  }
}

export async function overlayHybridMarketEconomics(data: any, env: HybridMarketEconomicsEnv) {
  const auth = await resolveMercadoLibreAccessToken(env)
  const googleShoppingApiKey = typeof env.SERPAPI_API_KEY === 'string' ? env.SERPAPI_API_KEY.trim() || null : null
  const market = await analyzeArgentinaMarketHybrid(
    data?.product?.name || '',
    data?.product?.category || '',
    {
      mercadoLibreAccessToken: auth.accessToken,
      googleShoppingApiKey,
    },
  )
  return applyHybridMarketToAnalysis(data, market, auth)
}
