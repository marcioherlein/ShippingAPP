import baseWorker from './index'
import { analyzeArgentinaMarket } from './catalogProvider'
import { resolveMercadoLibreAccessToken, type MercadoLibreAuthEnv } from './mercadoLibreAuth'
import { loadNcmIndex, type NcmProductFacts } from './ncmRetrieval'
import { classifyFullNcmWithSemantic } from './ncmRetrievalSemantic'
import { buildNcmClarification } from './ncmClarification'
import { lookupNcmTariff, type D1DatabaseLike } from './ncmTariff'
import { resolveSimOpening } from './simHydration'
import { fetchBcraReferenceFx } from './bcraFx'
import { runImportAnalyst } from './importAnalyst'
import { runConversationalIntake } from './conversationalIntake'
import { discoverAlibabaProducts } from './productDiscovery'
import { rankDiscoveryResponse } from './discoveryRanking'
import type { BrowserRun } from './alibabaSource'

type Env = MercadoLibreAuthEnv & {
  AI: { run: (model: string, input: unknown) => Promise<unknown> }
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  BROWSER: BrowserRun
  NCM_DB?: D1DatabaseLike
}

type ClarificationAnswer = { question: string; answer: string; factKey?: string }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

function clarificationAnswers(body: any): ClarificationAnswer[] {
  if (!Array.isArray(body?.clarifications)) return []
  return body.clarifications
    .map((item: any) => ({
      question: typeof item?.question === 'string' ? item.question.trim().replace(/\s+/g, ' ').slice(0, 220) : '',
      answer: typeof item?.answer === 'string' ? item.answer.trim().replace(/\s+/g, ' ').slice(0, 320) : '',
      factKey: typeof item?.factKey === 'string' ? item.factKey.trim().slice(0, 40) : undefined,
    }))
    .filter((item: ClarificationAnswer) => item.question.length >= 2 && item.answer.length >= 2)
    .slice(0, 3)
}

export function validFacts(body: any, answers: ClarificationAnswer[] = []): NcmProductFacts | null {
  if (!body || typeof body !== 'object') return null
  const baseDescription = typeof body.description === 'string' ? body.description.slice(0, 1500) : ''
  const baseFunctionText = typeof body.functionText === 'string' ? body.functionText.slice(0, 700) : ''
  const clarificationContext = answers.length
    ? answers.map((item, index) => `Aclaración confirmada ${index + 1}: ${item.question} Respuesta del usuario: ${item.answer}`).join('\n')
    : ''
  const facts: NcmProductFacts = {
    name: typeof body.name === 'string' ? body.name.slice(0, 500) : null,
    category: typeof body.category === 'string' ? body.category.slice(0, 300) : null,
    material: typeof body.material === 'string' ? body.material.slice(0, 500) : null,
    // Clarification evidence is duplicated into functionText on purpose: the
    // deterministic retrieval fallback consumes this field even when Workers AI
    // expansion is unavailable. This keeps confirmed user facts useful offline.
    functionText: [baseFunctionText, clarificationContext].filter(Boolean).join('\n').slice(0, 1800) || null,
    description: [baseDescription, clarificationContext].filter(Boolean).join('\n').slice(0, 2800) || null,
  }
  return facts.name || facts.category || facts.description ? facts : null
}

function discoveryRequest(body: unknown) {
  const raw = body && typeof body === 'object' ? body as any : {}
  const query = typeof raw.query === 'string' ? raw.query.trim().replace(/\s+/g, ' ').slice(0, 220) : ''
  const userText = typeof raw.userText === 'string' ? raw.userText.trim().replace(/\s+/g, ' ').slice(0, 500) : query
  return query.length >= 2 ? { query, userText: userText || query } : null
}

async function hydrateMarketAndFx(data: any, env: Env) {
  const mlAuth = await resolveMercadoLibreAccessToken(env)
  const [market, fx] = await Promise.all([
    analyzeArgentinaMarket(data.product?.name || '', data.product?.category || '', { accessToken: mlAuth.accessToken }),
    fetchBcraReferenceFx(),
  ])
  if (mlAuth.status !== 'ready') {
    market.warnings.push(mlAuth.reason)
    if (mlAuth.status === 'unavailable') {
      market.status = 'unavailable'
      market.source = 'Mercado Libre Argentina API · OAuth unavailable'
    }
  }

  const prior = (data.assumptions || []).filter((item: string) => !item.includes('Precio argentino inicial estimado'))
  if (market.status !== 'live' || !market.suggestedPriceArs) {
    data.market = { ...data.market, estimatedPriceArs: null, source: `${market.source} · ${market.status}`, details: market }
    data.assumptions = [
      ...prior,
      market.status === 'configuration_required'
        ? 'Mercado local bloqueado: falta configurar la autenticación oficial de Mercado Libre; ShippingAPP no promueve un precio público no autenticado a economics.'
        : 'Mercado local no confirmado: no se reutiliza el benchmark histórico.',
    ]
  } else {
    data.market = { ...data.market, estimatedPriceArs: Math.round(market.suggestedPriceArs), source: market.source, details: market }
    data.assumptions = [
      ...prior,
      `Precio local de screening basado en ${market.comparableCount} comparables activos; ${market.effectivePriceCount} con sale_price efectivo.`,
      'La demanda mensual sigue siendo un supuesto editable; no se infiere del stock público.',
    ]
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

export function conversationalAnalysis(intake: Awaited<ReturnType<typeof runConversationalIntake>>) {
  const facts = intake.facts
  const benchmarked = Object.values(intake.factSources).filter((source) => source === 'benchmark').length
  const explicit = Object.values(intake.factSources).filter((source) => source === 'user').length
  const overall = Math.max(40, Math.min(65, 45 + explicit * 6 - benchmarked * 4 + (facts.originCountry ? 3 : 0)))
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
    market: { estimatedPriceArs: null, estimatedMonthlyDemand: 0, source: 'Conversational intake · market pending' },
    suggestedQuantities: intake.suggestedQuantities,
    confidence: {
      overall,
      productSource: 'user-supplied-unverified',
      logistics: benchmarked ? 'mixed-user-benchmark' : 'user-supplied-unverified',
      market: 'pending',
    },
    assumptions: [
      'Producto y datos comerciales estructurados desde una conversación del usuario; ShippingAPP no los verificó contra una publicación o proforma.',
      'La confidence del producto conversacional está limitada hasta corroborar los datos comerciales con una fuente de proveedor.',
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
        const analysis = await hydrateMarketAndFx(conversationalAnalysis(intake), env)
        return json({ ...intake, analysis })
      } catch {
        return json({ error: 'No pudimos procesar el intake conversacional.' }, 400)
      }
    }

    if (url.pathname === '/api/discover' && request.method === 'POST') {
      try {
        const parsed = discoveryRequest(await request.json())
        if (!parsed) return json({ error: 'Ingresá una búsqueda de producto válida.' }, 400)
        const source = await discoverAlibabaProducts(parsed.query, env.BROWSER)
        return json(rankDiscoveryResponse(source, parsed.userText))
      } catch {
        return json({ error: 'No pudimos ejecutar la búsqueda live de Alibaba.' }, 503)
      }
    }

    if (url.pathname === '/api/ncm-classify' && request.method === 'POST') {
      try {
        const body = await request.json() as any
        const answers = clarificationAnswers(body)
        const facts = validFacts(body, answers)
        if (!facts) return json({ error: 'Faltan datos del producto para clasificar.' }, 400)
        const index = await loadNcmIndex(request.url, env.ASSETS)
        // Base retrieval is reconciled with objective product semantics before
        // any clarification or tariff lookup. This prevents generic material
        // words from outranking product identity while staying bounded to ARCA.
        const classification = await classifyFullNcmWithSemantic(index, env.AI, facts)
        const clarification = await buildNcmClarification(
          env.AI,
          facts,
          classification,
          answers.length,
          answers.map((item) => item.factKey || '').filter(Boolean),
        )

        if (classification.status !== 'candidate' || !classification.code) {
          return json({ ...classification, clarification, tariff: null, sim: null })
        }

        // A useful clarification question always wins over premature economics.
        // LOW confidence also stays fail-closed even after the three-question cap.
        if (clarification || classification.confidence === 'low') {
          return json({ ...classification, clarification, tariff: null, sim: null })
        }

        const tariff = await lookupNcmTariff(env.NCM_DB, classification.code)
        try {
          const sim = await resolveSimOpening(request.url, env.ASSETS, env.AI, classification.code, facts)
          return json({ ...classification, clarification: null, tariff, sim })
        } catch (error) {
          return json({
            ...classification,
            clarification: null,
            tariff,
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
    return json(await hydrateMarketAndFx(data, env))
  },
}
