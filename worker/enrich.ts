import baseWorker from './index'
import { analyzeArgentinaMarket } from './catalogProvider'
import { classifyFullNcm, loadNcmIndex, type NcmProductFacts } from './ncmRetrieval'
import { resolveSimOpening } from './simHydration'
import { fetchBcraReferenceFx } from './bcraFx'
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

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

    // Independent evidence layers are fetched in parallel. A failure in one
    // never fabricates data for the other.
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

    return json(data)
  },
}
