import baseWorker from './index'
import { analyzeArgentinaMarket } from './catalogProvider'
import { classifyFullNcm, loadNcmIndex, type NcmProductFacts } from './ncmRetrieval'
import { resolveSimOpening } from './simHydration'
import { fetchBcraReferenceFx } from './bcraFx'
import { runImportAnalyst } from './importAnalyst'
import { runConversationalIntake } from './conversationalIntake'
import type { BrowserRun } from './alibabaSource'

type Env = {
  AI: { run: (model: string, input: unknown) => Promise<unknown> }
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  BROWSER: BrowserRun
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

function validFacts(body: any): NcmProductFacts | null {
  if (!body || typeof body !== 'object') return null
  const facts: NcmProductFacts = {
    name: typeof body.name === 'string' ? body.name.slice(0, 500) : null,
    category: typeof body.category === 'string' ? body.category.slice(0, 300) : null,
    material: typeof body.material === 'string' ? body.material.slice(0, 500) : null,
    functionText: typeof body.functionText === 'string' ? body.functionText.slice(0, 700) : null,
    description: typeof body.description === 'string' ? body.description.slice(0, 1500) : null,
  }
  return facts.name || facts.category || facts.description ? facts : null
}

async function hydrateMarketAndFx(data: any) {
  const [market, fx] = await Promise.all([
    analyzeArgentinaMarket(data.product?.name || '', data.product?.category || ''),
    fetchBcraReferenceFx(),
  ])
  const prior = (data.assumptions || []).filter((item: string) => !item.includes('Precio argentino inicial estimado'))

  if (market.status !== 'live' || !market.suggestedPriceArs) {
    data.market = { ...data.market, estimatedPriceArs: null, source: `${market.source} · ${market.status}`, details: market }
    data.assumptions = [...prior, 'Mercado local no confirmado: no se reutiliza el benchmark histórico.']
  } else {
    data.market = { ...data.market, estimatedPriceArs: Math.round(market.suggestedPriceArs), source: market.source, details: market }
    data.assumptions = [...prior, `Precio local de screening basado en ${market.comparableCount} comparables activos.`, 'La demanda mensual sigue siendo un supuesto editable; no se infiere del stock público.']
    data.confidence = { ...data.confidence, market: `live-${market.confidence}` }
  }

  data.fx = fx
  data.assumptions = [
    ...data.assumptions,
    fx.status === 'live' && fx.arsPerUsd
      ? `FX de screening: ARS ${fx.arsPerUsd.toFixed(4)}/USD · BCRA REF Comunicación A 3500 · ${fx.sourceDate}.`
      : 'FX BCRA REF no disponible: economics bloqueado; no se reutiliza una tasa anterior.',
  ]
  return data
}

function conversationalAnalysis(intake: Awaited<ReturnType<typeof runConversationalIntake>>) {
  const facts = intake.facts
  const benchmarked = Object.values(intake.factSources).filter((source) => source === 'benchmark').length
  const explicit = Object.values(intake.factSources).filter((source) => source === 'user').length
  const overall = Math.max(45, Math.min(85, 58 + explicit * 7 - benchmarked * 3 + (facts.originCountry ? 5 : 0)))

  return {
    sourceUrl: `chat://product-intake/${Date.now()}`,
    fetched: false,
    product: {
      name: facts.name || facts.category || 'Producto descrito por el usuario',
      category: facts.category || 'Sin clasificar',
      unitPriceUsd: facts.unitPriceUsd,
      moq: facts.moq,
      packedWeightKg: facts.packedWeightKg || 0,
      volumeCbm: facts.volumeCbm || 0,
      originCountry: facts.originCountry || '',
      imageUrl: null,
      material: facts.material,
      functionText: facts.functionText,
      description: facts.description,
    },
    market: {
      estimatedPriceArs: null,
      estimatedMonthlyDemand: 0,
      source: 'Conversational intake · market pending',
    },
    suggestedQuantities: intake.suggestedQuantities,
    confidence: {
      overall,
      productSource: 'user-conversation',
      logistics: benchmarked ? 'mixed-user-benchmark' : 'user-provided',
      market: 'pending',
    },
    assumptions: [
      'Producto y datos comerciales estructurados desde una conversación del usuario; ShippingAPP no los verificó contra una publicación o proforma.',
      ...intake.assumptions,
      ...(facts.originCountry ? [] : ['País de origen no verificado; no se presume China ni tratamiento preferencial.']),
      'Demanda mensual no observada: debe ser informada explícitamente antes de recomendar cantidad.',
    ],
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const result = await runImportAnalyst(env.AI, await request.json())
        return json(result.body, result.status)
      } catch {
        return json({ error: 'La solicitud del AI Import Analyst no es válida.' }, 400)
      }
    }

    if (url.pathname === '/api/intake' && request.method === 'POST') {
      try {
        const intake = await runConversationalIntake(env.AI, await request.json())
        if (intake.status !== 'ready') return json(intake)
        const analysis = await hydrateMarketAndFx(conversationalAnalysis(intake))
        return json({ ...intake, analysis })
      } catch {
        return json({ error: 'No pudimos procesar el intake conversacional.' }, 400)
      }
    }

    if (url.pathname === '/api/ncm-classify' && request.method === 'POST') {
      try {
        const facts = validFacts(await request.json())
        if (!facts) return json({ error: 'Faltan datos del producto para clasificar.' }, 400)
        const index = await loadNcmIndex(request.url, env.ASSETS)
        const classification = await classifyFullNcm(index, env.AI, facts)
        if (classification.status !== 'candidate' || !classification.code) return json({ ...classification, sim: null })

        try {
          const sim = await resolveSimOpening(request.url, env.ASSETS, env.AI, classification.code, facts)
          return json({ ...classification, sim })
        } catch (error) {
          return json({
            ...classification,
            sim: {
              status: 'unavailable', ncmCode: classification.code, ncmLabel: classification.label,
              candidate: null, alternatives: [], confidence: 'missing', missingFacts: [], sourceDate: classification.sourceDate,
              rationale: [`No se pudo hidratar la apertura SIM: ${error instanceof Error ? error.message : 'unknown error'}. La NCM candidata se conserva; no se inventa un sufijo.`],
            },
          })
        }
      } catch (error) {
        return json({
          error: 'No pudimos consultar el índice NCM completo. ShippingAPP debe degradar al clasificador local sin inventar una posición.',
          detail: error instanceof Error ? error.message : 'unknown error',
        }, 503)
      }
    }

    if (url.pathname !== '/api/analyze' || request.method !== 'POST') return baseWorker.fetch(request, env)
    const response = await baseWorker.fetch(request.clone(), env)
    if (!response.ok) return response
    const data = await response.json() as any
    return json(await hydrateMarketAndFx(data))
  },
}
