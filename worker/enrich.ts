import baseWorker from './index'
import { analyzeArgentinaMarket } from './catalogProvider'

type Env = { AI: { run: (model: string, input: unknown) => Promise<unknown> }; ASSETS: { fetch: (request: Request) => Promise<Response> } }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/api/analyze' || request.method !== 'POST') return baseWorker.fetch(request, env)
    const response = await baseWorker.fetch(request.clone(), env)
    if (!response.ok) return response
    const data = await response.json() as any
    const market = await analyzeArgentinaMarket(data.product?.name || '', data.product?.category || '')
    const prior = (data.assumptions || []).filter((item: string) => !item.includes('Precio argentino inicial estimado'))

    if (market.status !== 'live' || !market.suggestedPriceArs) {
      data.market = { ...data.market, estimatedPriceArs: null, source: `${market.source} · ${market.status}`, details: market }
      data.assumptions = [...prior, 'Mercado local no confirmado: no se reutiliza el benchmark histórico.']
    } else {
      data.market = { ...data.market, estimatedPriceArs: Math.round(market.suggestedPriceArs), source: market.source, details: market }
      data.assumptions = [...prior, `Precio local de screening basado en ${market.comparableCount} comparables activos.`, 'La demanda mensual sigue siendo un supuesto editable; no se infiere del stock público.']
      data.confidence = { ...data.confidence, market: `live-${market.confidence}` }
    }

    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  },
}
